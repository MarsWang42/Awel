import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { requestConfirmation, isAutoApproved } from '../confirm-store.js';
import type { ToolContext } from './index.js';

export function createMultiEditTool(ctx: ToolContext) {
    const { cwd, emitSSE, confirmFileWrites } = ctx;
    return tool({
        description:
            'Perform multiple find-and-replace edits on a single file in one operation. ' +
            'Edits are applied sequentially — each edit sees the result of previous ones. ' +
            'Use this instead of multiple Edit calls when making several changes to the same file.',
        inputSchema: z.object({
            file_path: z.string().describe('Path to the file to edit (absolute or relative to project root)'),
            edits: z.array(z.object({
                old_string: z.string().describe('The exact string to find'),
                new_string: z.string().describe('The replacement string'),
                replace_all: z.boolean().optional().default(false).describe('Replace all occurrences'),
            })).min(1).describe('List of edits to apply sequentially'),
        }),
        execute: async ({ file_path, edits }) => {
            if (confirmFileWrites && !isAutoApproved('fileWrites')) {
                const confirmId = crypto.randomUUID();
                const confirmData = JSON.stringify({
                    type: 'confirm',
                    confirmId,
                    toolName: 'MultiEdit',
                    summary: `${file_path} (${edits.length} edits)`,
                    details: JSON.stringify(edits.map(e => ({ old_string: e.old_string, new_string: e.new_string }))),
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
                    return 'Error: MultiEdit was rejected by the user. Try a different approach or ask the user for guidance.';
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
                let content = readFileSync(fullPath, 'utf-8');
                const results: string[] = [];

                for (let i = 0; i < edits.length; i++) {
                    const { old_string, new_string, replace_all } = edits[i];

                    if (!content.includes(old_string)) {
                        results.push(`Edit ${i + 1}: old_string not found`);
                        continue;
                    }

                    content = replace_all
                        ? content.replaceAll(old_string, new_string)
                        : content.replace(old_string, new_string);

                    results.push(`Edit ${i + 1}: applied`);
                }

                writeFileSync(fullPath, content, 'utf-8');

                const applied = results.filter(r => r.endsWith('applied')).length;
                const failed = results.filter(r => r.endsWith('not found')).length;

                let summary = `Applied ${applied}/${edits.length} edits to ${file_path}`;
                if (failed > 0) {
                    summary += `\n${results.filter(r => r.endsWith('not found')).join('\n')}`;
                }
                return summary;
            } catch (err) {
                return `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}
