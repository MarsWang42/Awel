import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import type { SelectedElement } from './types.js';

const inspectorBus = new EventEmitter();
let bufferedSelection: SelectedElement | null = null;
let sseClientConnected = false;

// Track active SSE connection so we can close old ones when a new client connects.
// This prevents connection exhaustion when the browser refreshes the page repeatedly.
let activeAbortController: AbortController | null = null;

/**
 * Enrich a selection with server-side context:
 * - Source code snippet around the target line
 * - Props type definition near the component
 * - Whether the file has uncommitted changes
 */
function enrichSelection(selection: SelectedElement, projectCwd: string): SelectedElement {
    if (!selection.source || !selection.line) return selection;

    const filePath = isAbsolute(selection.source)
        ? selection.source
        : resolve(projectCwd, selection.source);

    // Read source snippet
    try {
        const content = readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const targetLine = selection.line;
        const start = Math.max(0, targetLine - 10);
        const end = Math.min(lines.length, targetLine + 10);
        const snippetLines: string[] = [];
        for (let i = start; i < end; i++) {
            const lineNum = i + 1;
            const marker = lineNum === targetLine ? ' > ' : '   ';
            snippetLines.push(`${marker}${String(lineNum).padStart(4)}  ${lines[i]}`);
        }
        selection.sourceSnippet = snippetLines.join('\n');

        // Look for props type definition near the component
        const componentName = selection.component;
        if (componentName) {
            const escapedName = componentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const propsPattern = new RegExp(
                `(?:interface|type)\\s+${escapedName}Props[\\s{<]`,
            );
            for (let i = 0; i < lines.length; i++) {
                if (propsPattern.test(lines[i])) {
                    const defStart = i;
                    let defEnd = i;
                    // Grab lines until closing brace or 20 lines max
                    let braceDepth = 0;
                    for (let j = i; j < Math.min(lines.length, i + 20); j++) {
                        for (const ch of lines[j]) {
                            if (ch === '{') braceDepth++;
                            if (ch === '}') braceDepth--;
                        }
                        defEnd = j;
                        if (braceDepth <= 0 && j > i) break;
                    }
                    selection.propsTypeDefinition = lines.slice(defStart, defEnd + 1).join('\n');
                    break;
                }
            }
        }
    } catch {
        // File not readable, skip enrichment
    }

    return selection;
}

export function createInspectorRoute(projectCwd: string) {
    const inspector = new Hono();

    // Host script POSTs the selected element here
    inspector.post('/api/inspector/select', async (c) => {
        let selection: SelectedElement = await c.req.json();
        selection = enrichSelection(selection, projectCwd);

        if (sseClientConnected) {
            inspectorBus.emit('selection', selection);
        } else {
            bufferedSelection = selection;
        }

        return c.json({ ok: true });
    });

    // Dashboard connects here to receive selections in real time
    inspector.get('/api/inspector/events', (c) => {
        // Close any existing SSE connection before opening a new one.
        // This prevents connection exhaustion on page refresh.
        if (activeAbortController) {
            activeAbortController.abort();
            activeAbortController = null;
        }

        const abortController = new AbortController();
        activeAbortController = abortController;

        return streamSSE(c, async (stream) => {
            sseClientConnected = true;

            // Flush any buffered selection that arrived before we connected
            if (bufferedSelection) {
                await stream.writeSSE({
                    event: 'selection',
                    data: JSON.stringify(bufferedSelection),
                });
                bufferedSelection = null;
            }

            const onSelection = async (sel: SelectedElement) => {
                try {
                    await stream.writeSSE({
                        event: 'selection',
                        data: JSON.stringify(sel),
                    });
                } catch {
                    // Stream closed, ignore
                }
            };

            const cleanup = () => {
                sseClientConnected = false;
                inspectorBus.removeListener('selection', onSelection);
                if (activeAbortController === abortController) {
                    activeAbortController = null;
                }
            };

            inspectorBus.on('selection', onSelection);

            // Listen for abort from both client disconnect and server-side abort
            abortController.signal.addEventListener('abort', cleanup);

            // Keep the stream open until the client disconnects or we abort
            await new Promise<void>((resolve) => {
                stream.onAbort(() => {
                    cleanup();
                    resolve();
                });
                abortController.signal.addEventListener('abort', () => resolve());
            });
        });
    });

    return inspector;
}
