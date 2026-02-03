import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { requestConfirmation, isAutoApproved } from '../confirm-store.js';
import type { ToolContext } from './index.js';

export function createEditTool(ctx: ToolContext) {
    const { cwd, emitSSE, confirmFileWrites } = ctx;
    return tool({
        description: 'Perform a find-and-replace edit on a file. Replaces the first occurrence of old_string with new_string. Use replace_all to replace every occurrence.',
        inputSchema: z.object({
            file_path: z.string().describe('The path to the file to edit (absolute or relative to project root)'),
            old_string: z.string().describe('The exact string to find in the file'),
            new_string: z.string().describe('The replacement string'),
            replace_all: z.boolean().optional().default(false).describe('Replace all occurrences instead of just the first'),
        }),
        execute: async ({ file_path, old_string, new_string, replace_all }) => {
            if (confirmFileWrites && !isAutoApproved('fileWrites')) {
                const confirmId = crypto.randomUUID();
                const confirmData = JSON.stringify({
                    type: 'confirm',
                    confirmId,
                    toolName: 'Edit',
                    summary: file_path,
                    details: JSON.stringify({ old_string, new_string }),
                });
                emitSSE('confirm', confirmData);

                const approved = await requestConfirmation(confirmId);
                if (!approved) {
                    const resolvedData = JSON.stringify({
                        type: 'confirm_resolved',
                        confirmId,
                        approved: false,
                    });
                    emitSSE('confirm_resolved', resolvedData);
                    return 'Error: Edit was rejected by the user. Try a different approach or ask the user for guidance.';
                }

                const resolvedData = JSON.stringify({
                    type: 'confirm_resolved',
                    confirmId,
                    approved: true,
                });
                emitSSE('confirm_resolved', resolvedData);
            }

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
