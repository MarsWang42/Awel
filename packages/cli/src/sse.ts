import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { SSEStreamingApi } from 'hono/streaming';

// ─── Chat History Storage ────────────────────────────────────

export interface ChatMessage {
    id: string;
    eventType: string;
    data: string;
    timestamp: number;
}

// In-memory chat history, optionally backed by disk
const chatHistory: ChatMessage[] = [];
const MAX_HISTORY = 500; // Limit to prevent memory bloat

// Event types that should not be persisted in history
const TRANSIENT_EVENTS = new Set(['status', 'done']);

// ─── Disk Persistence ────────────────────────────────────────

let _projectCwd: string | null = null;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

function historyPath(): string | null {
    if (!_projectCwd) return null;
    return join(_projectCwd, '.awel', 'history.json');
}

function flushToDisk(): void {
    const filePath = historyPath();
    if (!filePath) return;
    try {
        const dir = join(_projectCwd!, '.awel');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(filePath, JSON.stringify(chatHistory) + '\n', 'utf-8');
    } catch {
        // Non-critical — history will be lost on restart but nothing breaks
    }
}

function scheduleFlush(): void {
    if (_flushTimer) clearTimeout(_flushTimer);
    _flushTimer = setTimeout(flushToDisk, 500);
}

/**
 * Initialize history persistence. Loads existing history from disk.
 * Must be called before the server starts.
 */
export function initHistory(projectCwd: string): void {
    _projectCwd = projectCwd;
    const filePath = historyPath();
    if (!filePath || !existsSync(filePath)) return;
    try {
        const raw = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            chatHistory.push(...parsed.slice(-MAX_HISTORY));
        }
    } catch {
        // Corrupt file — start fresh
    }
}

export function addToHistory(eventType: string, data: string): void {
    if (TRANSIENT_EVENTS.has(eventType)) return;

    // Merge consecutive text events into a single history entry
    if (eventType === 'text') {
        const last = chatHistory[chatHistory.length - 1];
        if (last && last.eventType === 'text') {
            try {
                const lastParsed = JSON.parse(last.data);
                const newParsed = JSON.parse(data);
                if (lastParsed.type === 'text' && newParsed.type === 'text') {
                    lastParsed.text = (lastParsed.text || '') + (newParsed.text || '');
                    last.data = JSON.stringify(lastParsed);
                    scheduleFlush();
                    return;
                }
            } catch {
                // Fall through to push as new entry
            }
        }
    }

    chatHistory.push({
        id: crypto.randomUUID(),
        eventType,
        data,
        timestamp: Date.now(),
    });
    // Trim old messages if we exceed the limit
    if (chatHistory.length > MAX_HISTORY) {
        chatHistory.splice(0, chatHistory.length - MAX_HISTORY);
    }

    // Flush immediately on stream-ending events, debounce otherwise
    if (eventType === 'result' || eventType === 'error') {
        if (_flushTimer) clearTimeout(_flushTimer);
        flushToDisk();
    } else {
        scheduleFlush();
    }
}

export function getHistory(): ChatMessage[] {
    return [...chatHistory];
}

export function clearHistory(): void {
    chatHistory.length = 0;
    if (_flushTimer) clearTimeout(_flushTimer);
    const filePath = historyPath();
    if (filePath && existsSync(filePath)) {
        try { unlinkSync(filePath); } catch { /* ignore */ }
    }
}

/**
 * Helper to write an SSE event with a typed payload
 */
export async function writeSSEEvent(
    stream: SSEStreamingApi,
    event: string,
    payload: { type: string; message: string }
) {
    const data = JSON.stringify(payload);
    addToHistory(event, data);
    await stream.writeSSE({ event, data });
}
