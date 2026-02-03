import { tool } from 'ai';
import { z } from 'zod';
import { readMemories, addMemory, searchMemories, touchMemories } from '../memory.js';

export function createMemoryTool(cwd: string) {
    return tool({
        description: 'Read, write, or search project memories. Memories persist across sessions. Actions: "read" (list all), "write" (save new entry), "search" (find contextual memories by keyword).',
        inputSchema: z.object({
            action: z.enum(['read', 'write', 'search']),
            content: z.string().optional().describe('The memory content to save (required for "write")'),
            tags: z.array(z.string()).optional().describe('Keywords for retrieval (required for "write")'),
            scope: z.enum(['always', 'contextual']).optional().describe('Memory scope: "always" for project-wide rules injected every request, "contextual" for specific facts retrieved on demand. Defaults to "contextual".'),
            query: z.string().optional().describe('Search query to find contextual memories (required for "search")'),
        }),
        execute: async ({ action, content, tags, scope, query }) => {
            if (action === 'read') {
                const entries = readMemories(cwd);
                if (entries.length === 0) return 'No memories stored yet.';
                const lines = entries.map(e =>
                    `[${e.scope}] (${e.id.slice(0, 8)}) ${e.content} [tags: ${e.tags.join(', ')}]`
                );
                return `${entries.length} memories:\n` + lines.join('\n');
            }

            if (action === 'write') {
                if (!content) return 'Error: "content" is required for write action.';
                if (!tags || tags.length === 0) return 'Error: "tags" is required for write action.';
                const entry = addMemory(cwd, {
                    content,
                    tags,
                    scope: scope ?? 'contextual',
                    source: 'agent',
                });
                return `Memory saved (id: ${entry.id}, scope: ${entry.scope}).`;
            }

            if (action === 'search') {
                if (!query) return 'Error: "query" is required for search action.';
                const results = searchMemories(cwd, query);
                if (results.length === 0) return 'No matching memories found.';
                touchMemories(cwd, results.map(r => r.id));
                const lines = results.map(e =>
                    `[${e.id.slice(0, 8)}] ${e.content} [tags: ${e.tags.join(', ')}]`
                );
                return `${results.length} matching memories:\n` + lines.join('\n');
            }

            return 'Error: Unknown action.';
        },
    });
}
