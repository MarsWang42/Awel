import { tool } from 'ai';
import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { pushSnapshot } from '../undo.js';

export function createWriteTool(cwd: string) {
    return tool({
        description: 'Write content to a file. Creates the file and any parent directories if they do not exist. Overwrites existing files.',
        inputSchema: z.object({
            file_path: z.string().describe('The path to the file to write (absolute or relative to project root)'),
            content: z.string().describe('The content to write to the file'),
        }),
        execute: async ({ file_path, content }) => {
            const fullPath = file_path.startsWith('/') ? file_path : resolve(cwd, file_path);
            try {
                pushSnapshot(fullPath);
                mkdirSync(dirname(fullPath), { recursive: true });
                writeFileSync(fullPath, content, 'utf-8');
                return `Successfully wrote to ${file_path}`;
            } catch (err) {
                return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}
