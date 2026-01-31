import { Hono } from 'hono';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { relative } from 'path';

interface FileSnapshot {
    filePath: string;
    content: string;
    timestamp: number;
    existed: boolean;
}

/**
 * Session-based undo groups.
 * Each session ID maps to a list of file snapshots made during that session.
 */
const undoGroups: Map<string, FileSnapshot[]> = new Map();

/**
 * Stack of session IDs in LIFO order for undo operations.
 */
const sessionStack: string[] = [];

/**
 * The currently active session ID. Snapshots are only captured when a session is active.
 */
let currentSessionId: string | null = null;

/**
 * Generates a unique session ID.
 */
function generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Starts a new undo session. All file snapshots captured after this call
 * (and before endUndoSession) will be grouped together.
 * @returns The new session ID
 */
export function startUndoSession(): string {
    const sessionId = generateSessionId();
    currentSessionId = sessionId;
    undoGroups.set(sessionId, []);
    return sessionId;
}

/**
 * Ends the current undo session. If snapshots were captured, the session
 * is added to the session stack for later undo. Otherwise, the empty session is discarded.
 */
export function endUndoSession(): void {
    if (currentSessionId) {
        const snapshots = undoGroups.get(currentSessionId);
        if (snapshots && snapshots.length > 0) {
            sessionStack.push(currentSessionId);
        } else {
            // No snapshots captured, discard empty session
            undoGroups.delete(currentSessionId);
        }
    }
    currentSessionId = null;
}

/**
 * Captures the current content of a file before it's modified.
 * For new files (that don't exist yet), stores empty string so undo can delete them.
 * Only captures if there's an active session.
 */
export function pushSnapshot(filePath: string) {
    if (!currentSessionId) {
        // No active session, skip snapshot
        return;
    }

    const snapshots = undoGroups.get(currentSessionId);
    if (!snapshots) {
        return;
    }

    // Check if we already have a snapshot for this file in this session
    // (we only want to capture the original state, not intermediate states)
    const alreadySnapshotted = snapshots.some(s => s.filePath === filePath);
    if (alreadySnapshotted) {
        return;
    }

    const existed = existsSync(filePath);
    const content = existed ? readFileSync(filePath, 'utf-8') : '';
    snapshots.push({ filePath, content, timestamp: Date.now(), existed });
}

/**
 * Pops the most recent session and restores all files to their previous states.
 * If a snapshot content is empty and the file was newly created, deletes it.
 * @returns Array of restored file paths, or null if nothing to undo
 */
export function popAndRestoreSession(): string[] | null {
    const sessionId = sessionStack.pop();
    if (!sessionId) return null;

    const snapshots = undoGroups.get(sessionId);
    if (!snapshots || snapshots.length === 0) {
        undoGroups.delete(sessionId);
        return null;
    }

    const restoredPaths: string[] = [];

    // Restore in reverse order (last modified first)
    for (let i = snapshots.length - 1; i >= 0; i--) {
        const snapshot = snapshots[i];
        try {
            if (!snapshot.existed && existsSync(snapshot.filePath)) {
                // File was newly created — undo means delete it
                unlinkSync(snapshot.filePath);
            } else {
                writeFileSync(snapshot.filePath, snapshot.content, 'utf-8');
            }
            restoredPaths.push(snapshot.filePath);
        } catch (err) {
            console.error(`Failed to restore ${snapshot.filePath}:`, err);
        }
    }

    undoGroups.delete(sessionId);
    return restoredPaths;
}

/**
 * Reads the most recent session from the stack (without popping it) and pairs
 * each snapshot's original content with the current file content on disk.
 */
export function getLatestSessionDiffs(projectCwd: string) {
    if (sessionStack.length === 0) return null;

    const sessionId = sessionStack[sessionStack.length - 1];
    const snapshots = undoGroups.get(sessionId);
    if (!snapshots || snapshots.length === 0) return null;

    return snapshots.map((snapshot) => {
        const relativePath = relative(projectCwd, snapshot.filePath);
        const existsNow = existsSync(snapshot.filePath);
        const currentContent = existsNow ? readFileSync(snapshot.filePath, 'utf-8') : '';

        return {
            relativePath,
            originalContent: snapshot.content,
            currentContent,
            existed: snapshot.existed,
            existsNow,
        };
    });
}

/**
 * Computes +/- line stats for two strings using bag-based line matching.
 */
function countLineStats(original: string, current: string): { additions: number; deletions: number } {
    const oldLines = original.split('\n');
    const newLines = current.split('\n');

    const oldBag = new Map<string, number>();
    for (const line of oldLines) {
        oldBag.set(line, (oldBag.get(line) || 0) + 1);
    }

    let matched = 0;
    for (const line of newLines) {
        const count = oldBag.get(line);
        if (count && count > 0) {
            oldBag.set(line, count - 1);
            matched++;
        }
    }

    return {
        additions: newLines.length - matched,
        deletions: oldLines.length - matched,
    };
}

/**
 * Returns lightweight stats for the currently active (not yet ended) session.
 * Call this before endUndoSession() to include stats in the result event.
 */
export function getCurrentSessionStats(projectCwd: string) {
    if (!currentSessionId) return null;

    const snapshots = undoGroups.get(currentSessionId);
    if (!snapshots || snapshots.length === 0) return null;

    return snapshots.map((snapshot) => {
        const relativePath = relative(projectCwd, snapshot.filePath);
        const existsNow = existsSync(snapshot.filePath);
        const currentContent = existsNow ? readFileSync(snapshot.filePath, 'utf-8') : '';
        const isNew = !snapshot.existed && existsNow;
        const { additions, deletions } = countLineStats(snapshot.content, currentContent);

        return { relativePath, additions, deletions, isNew };
    });
}

/**
 * Creates Hono routes for the undo API.
 */
export function createUndoRoute(projectCwd: string) {
    const undo = new Hono();

    undo.post('/api/undo', async (c) => {
        const restoredPaths = popAndRestoreSession();
        if (restoredPaths && restoredPaths.length > 0) {
            return c.json({
                success: true,
                restored: restoredPaths.map(p => relative(projectCwd, p)),
            });
        }
        return c.json({ success: false, error: 'Nothing to undo' }, 400);
    });

    undo.get('/api/undo/diff', async (c) => {
        const diffs = getLatestSessionDiffs(projectCwd);
        if (!diffs) {
            return c.json({ success: false, error: 'No session to diff' }, 400);
        }
        return c.json({ success: true, diffs });
    });

    undo.get('/api/undo/stack', async (c) => {
        const sessions = sessionStack.map(sessionId => {
            const snapshots = undoGroups.get(sessionId) || [];
            return {
                sessionId,
                files: snapshots.map(s => ({
                    file: relative(projectCwd, s.filePath),
                    timestamp: s.timestamp,
                })),
            };
        });
        return c.json(sessions);
    });

    return undo;
}
