import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';
import { requestConfirmation, isAutoApproved } from '../confirm-store.js';
import type { ToolContext } from './index.js';

export function createBashTool(ctx: ToolContext) {
    const { cwd, emitSSE, confirmBash } = ctx;
    return tool({
        description: 'Execute a shell command and return stdout/stderr. Runs in the project directory.',
        inputSchema: z.object({
            command: z.string().describe('The shell command to execute'),
            timeout: z.number().optional().default(30000).describe('Timeout in milliseconds (default 30s)'),
        }),
        execute: async ({ command, timeout }) => {
            if (confirmBash && !isAutoApproved('bash')) {
                const confirmId = crypto.randomUUID();
                const confirmData = JSON.stringify({
                    type: 'confirm',
                    confirmId,
                    toolName: 'Bash',
                    summary: command,
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
                    return 'Error: Command was rejected by the user. Try a different approach or ask the user for guidance.';
                }

                const resolvedData = JSON.stringify({
                    type: 'confirm_resolved',
                    confirmId,
                    approved: true,
                });
                emitSSE('confirm_resolved', resolvedData);
            }

            try {
                const output = execSync(command, {
                    cwd,
                    encoding: 'utf-8',
                    timeout,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    maxBuffer: 1024 * 1024, // 1MB
                });
                return output || '(no output)';
            } catch (err: unknown) {
                const execErr = err as { stdout?: string; stderr?: string; message?: string };
                const stderr = execErr.stderr || '';
                const stdout = execErr.stdout || '';
                return `Error: ${execErr.message || 'Command failed'}\n${stderr}\n${stdout}`.trim();
            }
        },
    });
}
