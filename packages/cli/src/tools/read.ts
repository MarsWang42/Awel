import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export function createReadTool(cwd: string) {
    return tool({
        description: 'Read the contents of a file at the given path. Returns the file content as a string.',
        inputSchema: z.object({
            file_path: z.string().describe('The path to the file to read (absolute or relative to project root)'),
        }),
        execute: async ({ file_path }) => {
            const fullPath = file_path.startsWith('/') ? file_path : resolve(cwd, file_path);
            if (!existsSync(fullPath)) {
                return `Error: File not found: ${fullPath}`;
            }
            try {
                return readFileSync(fullPath, 'utf-8');
            } catch (err) {
                return `Error reading file: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}
