import { tool } from 'ai';
import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { requestConfirmation, isAutoApproved } from '../confirm-store.js';
import type { ToolContext } from './index.js';

export function createWriteTool(ctx: ToolContext) {
    const { cwd, emitSSE, confirmFileWrites } = ctx;
    return tool({
        description: 'Write content to a file. Creates the file and any parent directories if they do not exist. Overwrites existing files.',
        inputSchema: z.object({
            file_path: z.string().describe('The path to the file to write (absolute or relative to project root)'),
            content: z.string().describe('The content to write to the file'),
        }),
        execute: async ({ file_path, content }) => {
            if (confirmFileWrites && !isAutoApproved('fileWrites')) {
                const confirmId = crypto.randomUUID();
                const preview = content.length > 2000 ? content.slice(0, 2000) + '\n... (truncated)' : content;
                const confirmData = JSON.stringify({
                    type: 'confirm',
                    confirmId,
                    toolName: 'Write',
                    summary: file_path,
                    details: preview,
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
                    return 'Error: Write was rejected by the user. Try a different approach or ask the user for guidance.';
                }

                const resolvedData = JSON.stringify({
                    type: 'confirm_resolved',
                    confirmId,
                    approved: true,
                });
                emitSSE('confirm_resolved', resolvedData);
            }

            const fullPath = file_path.startsWith('/') ? file_path : resolve(cwd, file_path);
            try {
                mkdirSync(dirname(fullPath), { recursive: true });
                writeFileSync(fullPath, content, 'utf-8');
                return `Successfully wrote to ${file_path}`;
            } catch (err) {
                return `Error writing file: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}
