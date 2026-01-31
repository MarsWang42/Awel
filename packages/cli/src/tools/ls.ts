import { tool } from 'ai';
import { z } from 'zod';
import { readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

export function createLsTool(cwd: string) {
    return tool({
        description: 'List the contents of a directory. Returns file and directory names with type indicators.',
        inputSchema: z.object({
            path: z.string().optional().default('.').describe('Directory path to list (default: project root)'),
        }),
        execute: async ({ path }) => {
            const fullPath = path.startsWith('/') ? path : resolve(cwd, path);
            try {
                const entries = readdirSync(fullPath);
                const results = entries.map(name => {
                    try {
                        const stat = statSync(join(fullPath, name));
                        return stat.isDirectory() ? `${name}/` : name;
                    } catch {
                        return name;
                    }
                });
                return results.join('\n') || '(empty directory)';
            } catch (err) {
                return `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}
