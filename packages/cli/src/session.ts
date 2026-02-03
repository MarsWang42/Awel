// ─── Chat Session ────────────────────────────────────────────
// Module-level singleton managing multi-turn conversation state.
// The provider is cached and reused across requests; a model switch
// swaps the provider while preserving message history (unless switching
// to or from the self-contained claude-code provider).
//
// Session messages are persisted to .awel/session.json so the LLM
// retains full conversation context across `awel dev` restarts.

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { resolveProvider } from './providers/registry.js';
import type { StreamProvider, ResponseMessage } from './providers/types.js';
import type { ModelMessage, UserContent } from 'ai';

interface ChatSession {
    modelId: string;
    modelProvider: string;
    provider: StreamProvider;
    messages: ModelMessage[];
}

interface PersistedSession {
    modelId: string;
    modelProvider: string;
    messages: ModelMessage[];
}

let session: ChatSession | null = null;
let _projectCwd: string | null = null;

// ─── Disk Persistence ────────────────────────────────────────

function sessionPath(): string | null {
    if (!_projectCwd) return null;
    return join(_projectCwd, '.awel', 'session.json');
}

function saveToDisk(): void {
    if (!session) return;
    const filePath = sessionPath();
    if (!filePath) return;
    try {
        const dir = join(_projectCwd!, '.awel');
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const data: PersistedSession = {
            modelId: session.modelId,
            modelProvider: session.modelProvider,
            messages: session.messages,
        };
        writeFileSync(filePath, JSON.stringify(data) + '\n', 'utf-8');
    } catch {
        // Non-critical
    }
}

/**
 * Initialize session persistence. Restores the previous session from disk.
 * Must be called before the server starts.
 */
export function initSession(projectCwd: string): void {
    _projectCwd = projectCwd;
    const filePath = sessionPath();
    if (!filePath || !existsSync(filePath)) return;
    try {
        const raw = readFileSync(filePath, 'utf-8');
        const persisted: PersistedSession = JSON.parse(raw);
        if (persisted.modelId && persisted.modelProvider && Array.isArray(persisted.messages)) {
            const { provider } = resolveProvider(persisted.modelId, persisted.modelProvider);
            session = {
                modelId: persisted.modelId,
                modelProvider: persisted.modelProvider,
                provider,
                messages: persisted.messages,
            };
        }
    } catch {
        // Corrupt file — start fresh
    }
}

/**
 * Returns the existing session if the model matches, otherwise creates a new
 * provider while preserving message history. Messages are only reset when
 * switching to or from the claude-code provider, whose self-contained tool
 * set is incompatible with messages produced by other providers.
 */
export function getOrCreateSession(modelId: string, modelProvider: string): { provider: StreamProvider } {
    const cacheKey = `${modelId}:${modelProvider}`;
    const currentKey = session ? `${session.modelId}:${session.modelProvider}` : null;

    if (session && currentKey === cacheKey) {
        return { provider: session.provider };
    }

    const { provider } = resolveProvider(modelId, modelProvider);

    const canPreserveMessages =
        session !== null &&
        session.modelProvider !== 'claude-code' &&
        modelProvider !== 'claude-code';

    session = {
        modelId,
        modelProvider,
        provider,
        messages: canPreserveMessages ? session!.messages : [],
    };
    saveToDisk();
    return { provider: session.provider };
}

/**
 * Builds the messages array to send to the provider.
 * Returns the full accumulated history plus the new user message.
 *
 * Includes a safety net: if the session ends with an orphan user message
 * (e.g. from an aborted stream that didn't clean up), it's removed to
 * avoid consecutive user messages that cause API 400 errors.
 */
export function getSessionMessages(prompt: string | UserContent): ModelMessage[] {
    const userMessage: ModelMessage = { role: 'user', content: prompt };

    if (!session) {
        return [userMessage];
    }

    // Safety net: strip trailing orphan user messages to maintain alternation.
    // This can happen if a stream was aborted between appendUserMessage and
    // appendResponseMessages in a previous request.
    const messages = [...session.messages];
    while (messages.length > 0 && messages[messages.length - 1].role === 'user') {
        messages.pop();
    }

    // Also fix the actual session to prevent accumulation
    if (messages.length !== session.messages.length) {
        session.messages = messages;
        saveToDisk();
    }

    return [...messages, userMessage];
}

/**
 * Appends a user message to the session history.
 */
export function appendUserMessage(content: string | UserContent): void {
    if (!session) return;
    session.messages.push({ role: 'user', content });
    saveToDisk();
}

/**
 * Appends LLM response messages to the session history.
 */
export function appendResponseMessages(msgs: ResponseMessage[]): void {
    if (!session) return;
    session.messages.push(...msgs);
    saveToDisk();
}

/**
 * Resets the session entirely (called on history clear).
 */
export function resetSession(): void {
    session = null;
    const filePath = sessionPath();
    if (filePath && existsSync(filePath)) {
        try { unlinkSync(filePath); } catch { /* ignore */ }
    }
}
