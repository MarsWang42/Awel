import { tool } from 'ai';
import { z } from 'zod';
import { restartDevServer } from '../subprocess.js';

export function createRestartDevServerTool() {
    return tool({
        description: 'Restart the user\'s dev server (Next.js). Use when the dev server has crashed, is unresponsive, or needs a restart after config changes.',
        inputSchema: z.object({
            reason: z.string().optional().describe('Why the restart is needed (for logging)'),
        }),
        execute: async ({ reason }) => {
            if (reason) {
                console.error(`[awel] RestartDevServer: ${reason}`);
            }
            const result = await restartDevServer();
            return result.message;
        },
    });
}
