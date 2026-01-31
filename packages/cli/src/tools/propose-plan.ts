import { tool } from 'ai';
import { z } from 'zod';

export function createProposePlanTool() {
    return tool({
        description:
            'Propose a structured implementation plan before executing a complex task. ' +
            'Use this tool when the user\'s request involves changes to 2 or more files, ' +
            'or any non-trivial multi-step work. The content should be a detailed markdown plan ' +
            '(up to 600-700 words for complex projects) covering an overview, step-by-step ' +
            'implementation details, files to modify/create, and critical considerations. ' +
            'After proposing a plan, STOP and wait for the user to approve or provide feedback.',
        inputSchema: z.object({
            title: z.string().describe('A concise title for the plan'),
            content: z.string().describe('The full markdown plan content'),
        }),
        execute: async (input) => {
            // The actual interception happens in the streaming loop (vercel.ts).
            // This execute just returns the input so the tool call completes.
            return JSON.stringify(input);
        },
    });
}
