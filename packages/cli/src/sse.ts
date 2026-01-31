import type { SSEStreamingApi } from 'hono/streaming';

// ─── Chat History Storage ────────────────────────────────────

export interface ChatMessage {
    id: string;
    eventType: string;
    data: string;
    timestamp: number;
}

// In-memory chat history (persists for the lifetime of the CLI process)
const chatHistory: ChatMessage[] = [];
const MAX_HISTORY = 500; // Limit to prevent memory bloat

// Event types that should not be persisted in history
const TRANSIENT_EVENTS = new Set(['status', 'done']);

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
}

export function getHistory(): ChatMessage[] {
    return [...chatHistory];
}

export function clearHistory(): void {
    chatHistory.length = 0;
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
