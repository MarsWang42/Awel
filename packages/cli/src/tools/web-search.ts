import { tool } from 'ai';
import { z } from 'zod';

const API_CONFIG = {
    BASE_URL: 'https://mcp.exa.ai',
    ENDPOINT: '/mcp',
    DEFAULT_NUM_RESULTS: 8,
    TIMEOUT_MS: 25_000,
} as const;

interface McpSearchResponse {
    jsonrpc: string;
    result: {
        content: Array<{
            type: string;
            text: string;
        }>;
    };
}

export function createWebSearchTool() {
    const today = new Date().toISOString().slice(0, 10);

    return tool({
        description:
            `Search the web for real-time information. Use this to find current documentation, ` +
            `look up error messages, find API references, or research libraries and tools. ` +
            `Today's date is ${today}. Returns search results with page content.`,
        inputSchema: z.object({
            query: z.string().describe('The search query'),
            numResults: z.number().optional().default(8).describe('Number of results to return (default: 8)'),
            type: z.enum(['auto', 'fast', 'deep']).optional().default('auto')
                .describe('Search type: "auto" (balanced), "fast" (quick), or "deep" (comprehensive)'),
        }),
        execute: async ({ query, numResults, type }) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT_MS);

            try {
                const response = await fetch(`${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINT}`, {
                    method: 'POST',
                    headers: {
                        'accept': 'application/json, text/event-stream',
                        'content-type': 'application/json',
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'tools/call',
                        params: {
                            name: 'web_search_exa',
                            arguments: {
                                query,
                                type: type || 'auto',
                                numResults: numResults || API_CONFIG.DEFAULT_NUM_RESULTS,
                                livecrawl: 'fallback',
                            },
                        },
                    }),
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    const errorText = await response.text();
                    return `Search error (${response.status}): ${errorText}`;
                }

                const responseText = await response.text();

                // Parse SSE response — Exa returns data as Server-Sent Events
                const lines = responseText.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data: McpSearchResponse = JSON.parse(line.substring(6));
                        if (data.result?.content?.length > 0) {
                            return data.result.content[0].text;
                        }
                    }
                }

                return 'No search results found. Try a different query.';
            } catch (err) {
                clearTimeout(timeoutId);
                if (err instanceof Error && err.name === 'AbortError') {
                    return 'Error: Search request timed out after 25 seconds.';
                }
                return `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}
