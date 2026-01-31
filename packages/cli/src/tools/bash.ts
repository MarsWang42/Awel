import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';

export function createBashTool(cwd: string) {
    return tool({
        description: 'Execute a shell command and return stdout/stderr. Runs in the project directory.',
        inputSchema: z.object({
            command: z.string().describe('The shell command to execute'),
            timeout: z.number().optional().default(30000).describe('Timeout in milliseconds (default 30s)'),
        }),
        execute: async ({ command, timeout }) => {
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
