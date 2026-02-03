import { Hono } from 'hono';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { relative, join } from 'path';

interface UndoSession {
    projectCwd: string;
    gitBaseline: string;
    /** Relative paths of untracked files at session start */
    untrackedAtStart: Set<string>;
    /** Relative paths of files changed during session (populated at endUndoSession) */
    changedFiles: string[] | null;
}

/**
 * Session-based undo groups.
 * Each session ID maps to a session with a git baseline.
 */
const undoGroups: Map<string, UndoSession> = new Map();

/**
 * Stack of session IDs in LIFO order for undo operations.
 */
const sessionStack: string[] = [];

/**
 * The currently active session ID.
 */
let currentSessionId: string | null = null;

/**
 * Generates a unique session ID.
 */
function generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Captures a git baseline ref for the current working tree state.
 * Uses `git stash create` which creates a commit object without actually
 * stashing — the working tree is unchanged. Falls back to HEAD if clean.
 */
function captureGitBaseline(projectCwd: string): string | null {
    try {
        // Verify this is a git repo
        execSync('git rev-parse --git-dir', { cwd: projectCwd, stdio: 'pipe' });
        // git stash create returns a ref to the current working tree state
        // (empty string if working tree is clean)
        const stashRef = execSync('git stash create', { cwd: projectCwd, stdio: 'pipe' }).toString().trim();
        if (stashRef) return stashRef;
        // Clean working tree — HEAD is the baseline
        return execSync('git rev-parse HEAD', { cwd: projectCwd, stdio: 'pipe' }).toString().trim();
    } catch {
        return null; // Not a git repo or git not available
    }
}

/**
 * Returns the set of untracked file paths (relative to repo) at the given cwd.
 */
function getUntrackedFiles(projectCwd: string): Set<string> {
    try {
        const output = execSync('git ls-files --others --exclude-standard', {
            cwd: projectCwd,
            stdio: 'pipe',
        }).toString().trim();
        return new Set(output ? output.split('\n') : []);
    } catch {
        return new Set();
    }
}

/**
 * Gets the content of a file at a given git ref.
 * Returns null if the file doesn't exist at that ref.
 */
function getFileAtRef(projectCwd: string, gitRef: string, relPath: string): string | null {
    try {
        return execSync(`git show ${gitRef}:${relPath}`, {
            cwd: projectCwd,
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 10 * 1024 * 1024, // 10MB
        }).toString();
    } catch {
        return null; // File didn't exist at that ref
    }
}

/**
 * Discovers files that changed since the session baseline by combining
 * tracked file diffs and newly created untracked files.
 */
function getChangedFiles(session: UndoSession): string[] {
    const { projectCwd, gitBaseline, untrackedAtStart } = session;

    // Tracked files that differ between baseline and current working tree
    let trackedChanges: string[] = [];
    try {
        const output = execSync(`git diff --name-only ${gitBaseline}`, {
            cwd: projectCwd,
            stdio: 'pipe',
        }).toString().trim();
        trackedChanges = output ? output.split('\n') : [];
    } catch {
        // ignore
    }

    // New untracked files (created since session start)
    const currentUntracked = getUntrackedFiles(projectCwd);
    const newFiles: string[] = [];
    for (const f of currentUntracked) {
        if (!untrackedAtStart.has(f)) {
            newFiles.push(f);
        }
    }

    // Combine and deduplicate
    const all = new Set([...trackedChanges, ...newFiles]);
    return [...all];
}

/**
 * Starts a new undo session. Captures a git baseline ref and the current
 * set of untracked files for later diffing.
 * @param projectCwd - Project directory (must be a git repo for undo to work)
 * @returns The new session ID
 */
export function startUndoSession(projectCwd?: string): string {
    const sessionId = generateSessionId();
    currentSessionId = sessionId;

    if (!projectCwd) return sessionId;

    const gitBaseline = captureGitBaseline(projectCwd);
    if (!gitBaseline) return sessionId; // Not a git repo

    undoGroups.set(sessionId, {
        projectCwd,
        gitBaseline,
        untrackedAtStart: getUntrackedFiles(projectCwd),
        changedFiles: null,
    });

    return sessionId;
}

/**
 * Ends the current undo session. Discovers changed files via git and
 * pushes the session to the stack if any files were modified.
 */
export function endUndoSession(): void {
    if (currentSessionId) {
        const session = undoGroups.get(currentSessionId);
        if (session) {
            const changed = getChangedFiles(session);
            if (changed.length > 0) {
                session.changedFiles = changed;
                sessionStack.push(currentSessionId);
            } else {
                undoGroups.delete(currentSessionId);
            }
        }
    }
    currentSessionId = null;
}

/**
 * Pops the most recent session and restores all files to their baseline state.
 * Files that existed at baseline are restored; files created during the session are deleted.
 * @returns Array of restored file paths, or null if nothing to undo
 */
export function popAndRestoreSession(): string[] | null {
    const sessionId = sessionStack.pop();
    if (!sessionId) return null;

    const session = undoGroups.get(sessionId);
    if (!session || !session.changedFiles || session.changedFiles.length === 0) {
        undoGroups.delete(sessionId);
        return null;
    }

    const restoredPaths: string[] = [];

    for (const relPath of session.changedFiles) {
        const fullPath = join(session.projectCwd, relPath);
        try {
            const originalContent = getFileAtRef(session.projectCwd, session.gitBaseline, relPath);
            if (originalContent === null) {
                // File didn't exist at baseline — delete it
                if (existsSync(fullPath)) {
                    unlinkSync(fullPath);
                }
            } else {
                writeFileSync(fullPath, originalContent, 'utf-8');
            }
            restoredPaths.push(fullPath);
        } catch (err) {
            console.error(`Failed to restore ${relPath}:`, err);
        }
    }

    undoGroups.delete(sessionId);
    return restoredPaths;
}

/**
 * Reads the most recent session from the stack (without popping it) and pairs
 * each file's baseline content with its current content on disk.
 */
export function getLatestSessionDiffs(projectCwd: string) {
    if (sessionStack.length === 0) return null;

    const sessionId = sessionStack[sessionStack.length - 1];
    const session = undoGroups.get(sessionId);
    if (!session) return null;

    const files = session.changedFiles ?? getChangedFiles(session);
    if (files.length === 0) return null;

    return files.map((relPath) => {
        const fullPath = join(session.projectCwd, relPath);
        const originalContent = getFileAtRef(session.projectCwd, session.gitBaseline, relPath);
        const existsNow = existsSync(fullPath);
        const currentContent = existsNow ? readFileSync(fullPath, 'utf-8') : '';

        return {
            relativePath: relPath,
            originalContent: originalContent ?? '',
            currentContent,
            existed: originalContent !== null,
            existsNow,
        };
    });
}

/**
 * Computes +/- line stats for two strings using bag-based line matching.
 */
export function countLineStats(original: string, current: string): { additions: number; deletions: number } {
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
 * Discovers changed files via git diff on the fly.
 */
export function getCurrentSessionStats(projectCwd: string) {
    if (!currentSessionId) return null;

    const session = undoGroups.get(currentSessionId);
    if (!session) return null;

    const files = getChangedFiles(session);
    if (files.length === 0) return null;

    return files.map((relPath) => {
        const fullPath = join(session.projectCwd, relPath);
        const originalContent = getFileAtRef(session.projectCwd, session.gitBaseline, relPath);
        const existsNow = existsSync(fullPath);
        const currentContent = existsNow ? readFileSync(fullPath, 'utf-8') : '';
        const isNew = originalContent === null && existsNow;
        const { additions, deletions } = countLineStats(originalContent ?? '', currentContent);

        return { relativePath: relPath, additions, deletions, isNew };
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
            const session = undoGroups.get(sessionId);
            return {
                sessionId,
                files: (session?.changedFiles || []).map(f => ({
                    file: f,
                })),
            };
        });
        return c.json(sessions);
    });

    return undo;
}
