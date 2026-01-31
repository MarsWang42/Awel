import { tool } from 'ai';
import { z } from 'zod';

export function createAskUserTool() {
    return tool({
        description:
            'Ask the user clarifying questions before proceeding with a task. ' +
            'Use this when you need to gather preferences, clarify ambiguous requirements, ' +
            'or let the user choose between approaches. Present 1-4 questions, each with 2-4 options. ' +
            'Set multiSelect to true when choices are not mutually exclusive. ' +
            'After asking, STOP and wait for the user to respond before continuing. ' +
            'IMPORTANT: All string fields must be plain text — no markdown, no bullet points, no bold/italic, no code blocks. ' +
            'The UI renders these strings directly in a structured card layout.',
        inputSchema: z.object({
            questions: z.array(z.object({
                question: z.string().describe('The full question text. Plain text only, no markdown.'),
                header: z.string().describe('Short tab label (max 12 chars). Plain text only, e.g. "Framework" or "Auth method".'),
                multiSelect: z.boolean().describe('Whether the user can select multiple options'),
                options: z.array(z.object({
                    label: z.string().describe('Short option name (1-5 words). Plain text only, no markdown.'),
                    description: z.string().describe('One sentence explaining this option. Plain text only, no markdown.'),
                })).min(2).max(4),
            })).min(1).max(4),
        }),
        execute: async (input) => {
            // Actual interception happens in the streaming loop (vercel.ts).
            return JSON.stringify(input);
        },
    });
}
