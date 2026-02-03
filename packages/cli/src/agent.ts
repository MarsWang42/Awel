import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventEmitter } from 'node:events';
import { z } from 'zod';
import { addToHistory, getHistory, clearHistory } from './sse.js';
import { getProviderCatalog } from './providers/registry.js';
import { getOrCreateSession, getSessionMessages, appendUserMessage, appendResponseMessages, resetSession } from './session.js';
import { getActivePlan, approvePlan } from './plan-store.js';
import { restartDevServer, getDevServerStatus } from './subprocess.js';
import { readMemories, deleteMemory } from './memory.js';
import type { Context } from 'hono';
import type { SSEStreamingApi } from 'hono/streaming';

const DEFAULT_MODEL = 'sonnet';

// ─── Shared SSE Event Bus ────────────────────────────────────
// Events flow: POST /api/chat → provider → bus → GET /api/stream → client
const streamBus = new EventEmitter();
streamBus.setMaxListeners(0);

// Tracks the active stream so a new request cancels any in-flight LLM call.
let activeStreamAbort: AbortController | null = null;

// ─── Request Schemas ─────────────────────────────────────────

const ConsoleEntrySchema = z.object({
    level: z.string(),
    message: z.string(),
    source: z.string().optional(),
    line: z.number().optional(),
    column: z.number().optional(),
    sourceTrace: z.array(z.object({
        source: z.string(),
        line: z.number().optional(),
    })).optional(),
    stack: z.string().optional(),
    count: z.number(),
});

const PageContextSchema = z.object({
    url: z.string(),
    title: z.string(),
    routeComponent: z.string().optional(),
});

const ChatRequestSchema = z.object({
    prompt: z.string().min(1),
    model: z.string().optional(),
    modelProvider: z.string(),
    consoleEntries: z.array(ConsoleEntrySchema).optional(),
    images: z.array(z.string()).optional(),
    pageContext: PageContextSchema.optional(),
});

type ConsoleEntryInput = z.infer<typeof ConsoleEntrySchema>;
type PageContextInput = z.infer<typeof PageContextSchema>;

/**
 * Formats console entries into a context block for the LLM prompt.
 */
function formatConsoleContext(entries: ConsoleEntryInput[]): string | null {
    if (entries.length === 0) return null;

    const parts = entries.map(entry => {
        const lines = [`[${entry.level}] ${entry.message}`];
        if (entry.sourceTrace && entry.sourceTrace.length > 0) {
            lines.push('Trace:');
            for (const f of entry.sourceTrace) {
                lines.push(`  ${f.source}${f.line ? `:${f.line}` : ''}`);
            }
        } else if (entry.source) {
            let loc = entry.source;
            if (entry.line) loc += `:${entry.line}`;
            if (entry.column) loc += `:${entry.column}`;
            lines.push(`Source: ${loc}`);
        }
        if (entry.stack) {
            lines.push(`Stack: ${entry.stack}`);
        }
        if (entry.count > 1) {
            lines.push(`Occurred ${entry.count} times`);
        }
        return lines.join('\n');
    });

    return '[Browser Console Errors]\n\n' + parts.join('\n\n') + '\n\n';
}

/**
 * Formats page context into a context block for the LLM prompt.
 */
function formatPageContext(ctx: PageContextInput): string {
    const lines = ['[Page Context]'];
    lines.push(`URL: ${ctx.url}`);
    if (ctx.title) lines.push(`Title: ${ctx.title}`);
    if (ctx.routeComponent) lines.push(`Route component: ${ctx.routeComponent}`);
    return lines.join('\n') + '\n\n';
}

/**
 * Sets standard SSE headers on the response
 */
function setSSEHeaders(c: Context) {
    c.header('Content-Type', 'text/event-stream');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');
}

/**
 * Creates the agent API routes with SSE streaming.
 * @param projectCwd - The user's project directory (where they ran `awel dev`)
 * @param isFresh - Getter for whether the project is in creation mode
 */
export function createAgentRoute(projectCwd: string, targetPort: number, isFresh?: () => boolean) {
    const agent = new Hono();

    // ─── Model Catalog ───────────────────────────────────────

    agent.get('/api/models', (c) => {
        return c.json({ providers: getProviderCatalog() });
    });

    // ─── Chat (trigger LLM) ─────────────────────────────────

    agent.post('/api/chat', async (c) => {
        let body: unknown;
        try {
            body = await c.req.json();
        } catch {
            return c.json({ success: false, error: 'Invalid request body' }, 400);
        }

        const parsed = ChatRequestSchema.safeParse(body);
        if (!parsed.success) {
            const message = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ');
            return c.json({ success: false, error: message }, 400);
        }

        const { prompt, model, modelProvider, consoleEntries, images, pageContext } = parsed.data;
        const modelId = model ?? DEFAULT_MODEL;

        // Prepend context blocks to the prompt
        let augmentedPrompt = prompt;
        if (pageContext) {
            augmentedPrompt = formatPageContext(pageContext) + augmentedPrompt;
        }
        if (consoleEntries && consoleEntries.length > 0) {
            const context = formatConsoleContext(consoleEntries);
            if (context) {
                augmentedPrompt = context + augmentedPrompt;
            }
        }

        // Build user content — multipart if images are present
        const hasImages = images && images.length > 0;
        const userContent = hasImages
            ? [
                { type: 'text' as const, text: augmentedPrompt },
                ...images.map(dataUrl => ({ type: 'image' as const, image: dataUrl })),
            ]
            : augmentedPrompt;

        // Cancel any in-flight stream before starting a new one
        activeStreamAbort?.abort();
        const abortController = new AbortController();
        activeStreamAbort = abortController;
        const { signal } = abortController;

        // Adapter stream that emits events through the bus
        const adapter = {
            writeSSE: async (msg: { event?: string; data: string; id?: string }) => {
                if (!signal.aborted) {
                    streamBus.emit('sse', { event: msg.event || 'message', data: msg.data });
                }
            },
        } as unknown as SSEStreamingApi;

        try {
            const { provider } = getOrCreateSession(modelId, modelProvider);
            const messages = getSessionMessages(userContent);

            // Fire and forget — events flow through the bus to connected SSE clients.
            // NOTE: appendUserMessage is deferred until we have response messages.
            // Appending eagerly would leave orphan user messages in the session when
            // the stream is aborted or paused for user input, causing consecutive
            // user messages that trigger API 400 errors (especially with Anthropic).
            provider.streamResponse(adapter, messages, { projectCwd, targetPort, signal, creationMode: isFresh?.() })
                .then((responseMessages) => {
                    if (responseMessages.length > 0) {
                        appendUserMessage(userContent);
                        appendResponseMessages(responseMessages);
                    }
                })
                .catch((err) => {
                    // Swallow provider-level rejections (e.g. API 400 from tool-use
                    // concurrency in Claude Code). The error has already been surfaced
                    // as an SSE error event inside streamResponse.
                    const msg = err instanceof Error ? err.message : String(err);
                    console.error(`[awel] streamResponse rejected: ${msg}`);
                })
                .finally(() => {
                    if (activeStreamAbort === abortController) {
                        activeStreamAbort = null;
                    }
                    if (!signal.aborted) {
                        streamBus.emit('end');
                    }
                });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            return c.json({ success: false, error: errorMessage }, 500);
        }

        return c.json({ success: true });
    });

    // ─── Abort Stream ────────────────────────────────────────

    agent.post('/api/stream/abort', (c) => {
        activeStreamAbort?.abort();
        activeStreamAbort = null;
        return c.json({ ok: true });
    });

    // ─── Stream Status ────────────────────────────────────────

    agent.get('/api/stream/status', (c) => {
        const active = activeStreamAbort !== null && !activeStreamAbort.signal.aborted;
        return c.json({ active });
    });

    // ─── SSE Stream (listener only) ──────────────────────────

    agent.get('/api/stream', async (c) => {
        setSSEHeaders(c);

        const isReconnect = c.req.query('reconnect') === '1';

        return streamSSE(c, async (stream) => {
            // If reconnecting but the stream already finished, close immediately.
            if (isReconnect && (activeStreamAbort === null || activeStreamAbort.signal.aborted)) {
                await stream.writeSSE({ event: 'done', data: '{}' });
                return;
            }

            await new Promise<void>((resolve) => {
                const onSSE = async (entry: { event: string; data: string }) => {
                    try {
                        await stream.writeSSE(entry);
                    } catch {
                        cleanup();
                    }
                };
                const cleanup = () => {
                    streamBus.off('sse', onSSE);
                    streamBus.off('end', onEnd);
                    resolve();
                };
                const onEnd = () => cleanup();
                stream.onAbort(() => cleanup());
                streamBus.on('sse', onSSE);
                streamBus.once('end', onEnd);
            });
        });
    });

    // ─── Chat History API ────────────────────────────────────

    // Get chat history
    agent.get('/api/chat/history', (c) => {
        return c.json({ history: getHistory() });
    });

    // Add a user message to history (called when user sends a prompt)
    agent.post('/api/chat/history', async (c) => {
        try {
            const body = await c.req.json();
            if (body.eventType && body.data) {
                addToHistory(body.eventType, body.data);
                return c.json({ success: true });
            }
            return c.json({ success: false, error: 'Missing eventType or data' }, 400);
        } catch {
            return c.json({ success: false, error: 'Invalid JSON' }, 400);
        }
    });

    // Clear chat history
    agent.delete('/api/chat/history', (c) => {
        clearHistory();
        resetSession();
        return c.json({ success: true });
    });

    // ─── Plan API ────────────────────────────────────────────

    agent.get('/api/plan/active', (c) => {
        const plan = getActivePlan();
        return c.json({ plan });
    });

    agent.post('/api/plan/approve', (c) => {
        const success = approvePlan();
        return c.json({ success });
    });

    agent.post('/api/plan/comment', async (c) => {
        try {
            const body = await c.req.json();
            if (!body.comment || typeof body.comment !== 'string') {
                return c.json({ success: false, error: 'Missing comment' }, 400);
            }
            return c.json({ success: true });
        } catch {
            return c.json({ success: false, error: 'Invalid JSON' }, 400);
        }
    });

    // ─── Dev Server Management ──────────────────────────────

    agent.post('/api/dev-server/restart', async (c) => {
        const result = await restartDevServer();
        return c.json(result);
    });

    agent.get('/api/dev-server/status', (c) => {
        return c.json(getDevServerStatus());
    });

    // ─── Project Info ───────────────────────────────────────

    agent.get('/api/project-info', (c) => {
        return c.json({ projectCwd });
    });

    // ─── Memories API ───────────────────────────────────────

    agent.get('/api/memories', (c) => {
        return c.json({ memories: readMemories(projectCwd) });
    });

    agent.delete('/api/memories/:id', (c) => {
        const id = c.req.param('id');
        const deleted = deleteMemory(projectCwd, id);
        if (!deleted) {
            return c.json({ success: false, error: 'Memory not found' }, 404);
        }
        return c.json({ success: true });
    });

    return agent;
}
