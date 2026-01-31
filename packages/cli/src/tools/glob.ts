import { tool } from 'ai';
import { z } from 'zod';
import fg from 'fast-glob';

export function createGlobTool(cwd: string) {
    return tool({
        description: 'Find files matching a glob pattern. Returns a list of matching file paths relative to the project root.',
        inputSchema: z.object({
            pattern: z.string().describe('Glob pattern (e.g. "**/*.ts", "src/**/*.tsx")'),
            path: z.string().optional().describe('Directory to search in (default: project root)'),
        }),
        execute: async ({ pattern, path }) => {
            try {
                const searchDir = path || cwd;
                const files = await fg(pattern, {
                    cwd: searchDir,
                    dot: false,
                    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
                });
                if (files.length === 0) {
                    return 'No files matched the pattern.';
                }
                return files.join('\n');
            } catch (err) {
                return `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}
