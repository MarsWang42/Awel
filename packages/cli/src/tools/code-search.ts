import { tool } from 'ai';
import { z } from 'zod';

const API_CONFIG = {
    BASE_URL: 'https://mcp.exa.ai',
    ENDPOINT: '/mcp',
    TIMEOUT_MS: 30_000,
    DEFAULT_TOKENS: 5_000,
} as const;

interface McpResponse {
    jsonrpc: string;
    result: {
        content: Array<{
            type: string;
            text: string;
        }>;
    };
}

export function createCodeSearchTool() {
    return tool({
        description:
            'Search the web for code examples, API documentation, and SDK references. ' +
            'Use this when you need to look up how to use a library, find code patterns, ' +
            'or check API usage. Returns code-focused results from documentation and repositories.',
        inputSchema: z.object({
            query: z.string().describe('Search query for code examples or documentation (e.g. "Next.js App Router middleware example", "zod union type validation")'),
            tokensNum: z.number().optional().default(5000)
                .describe('Response length control: 1000-50000 tokens (default: 5000). Use higher values for detailed API docs.'),
        }),
        execute: async ({ query, tokensNum }) => {
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
                            name: 'codedocs',
                            arguments: {
                                query,
                                tokensNum: Math.min(Math.max(tokensNum || API_CONFIG.DEFAULT_TOKENS, 1000), 50000),
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

                // Parse SSE response
                const lines = responseText.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data: McpResponse = JSON.parse(line.substring(6));
                        if (data.result?.content?.length > 0) {
                            return data.result.content[0].text;
                        }
                    }
                }

                return 'No code examples found. Try a more specific query.';
            } catch (err) {
                clearTimeout(timeoutId);
                if (err instanceof Error && err.name === 'AbortError') {
                    return 'Error: Code search request timed out after 30 seconds.';
                }
                return `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}
