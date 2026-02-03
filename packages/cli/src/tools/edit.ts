import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export function createEditTool(cwd: string) {
    return tool({
        description: 'Perform a find-and-replace edit on a file. Replaces the first occurrence of old_string with new_string. Use replace_all to replace every occurrence.',
        inputSchema: z.object({
            file_path: z.string().describe('The path to the file to edit (absolute or relative to project root)'),
            old_string: z.string().describe('The exact string to find in the file'),
            new_string: z.string().describe('The replacement string'),
            replace_all: z.boolean().optional().default(false).describe('Replace all occurrences instead of just the first'),
        }),
        execute: async ({ file_path, old_string, new_string, replace_all }) => {
            const fullPath = file_path.startsWith('/') ? file_path : resolve(cwd, file_path);
            if (!existsSync(fullPath)) {
                return `Error: File not found: ${fullPath}`;
            }
            try {
                const content = readFileSync(fullPath, 'utf-8');
                if (!content.includes(old_string)) {
                    return `Error: old_string not found in ${file_path}`;
                }
                const updated = replace_all
                    ? content.replaceAll(old_string, new_string)
                    : content.replace(old_string, new_string);
                writeFileSync(fullPath, updated, 'utf-8');
                return `Successfully edited ${file_path}`;
            } catch (err) {
                return `Error editing file: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}
