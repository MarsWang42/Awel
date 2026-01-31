import { tool } from 'ai';
import { z } from 'zod';

/**
 * Simple in-memory todo store scoped to the current server session.
 * Resets when the Awel server restarts.
 */
interface TodoItem {
    id: number;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
}

let todos: TodoItem[] = [];
let nextId = 1;

export function createTodoReadTool() {
    return tool({
        description:
            'Read the current task/todo list. Use this to check progress, ' +
            'review remaining work, or decide what to do next during complex multi-step tasks.',
        inputSchema: z.object({}),
        execute: async () => {
            if (todos.length === 0) {
                return 'No tasks in the list.';
            }

            const pending = todos.filter(t => t.status === 'pending').length;
            const inProgress = todos.filter(t => t.status === 'in_progress').length;
            const completed = todos.filter(t => t.status === 'completed').length;

            const lines = todos.map(t => {
                const icon = t.status === 'completed' ? '[x]'
                    : t.status === 'in_progress' ? '[~]'
                    : '[ ]';
                return `${icon} #${t.id}: ${t.content}`;
            });

            return [
                `Tasks: ${completed}/${todos.length} done (${pending} pending, ${inProgress} in progress)`,
                '',
                ...lines,
            ].join('\n');
        },
    });
}

export function createTodoWriteTool() {
    return tool({
        description:
            'Create or update the task/todo list. Pass the full list of tasks — this replaces the current list. ' +
            'Use this to plan work, track progress on multi-step tasks, and mark items as completed.',
        inputSchema: z.object({
            todos: z.array(z.object({
                id: z.number().optional().describe('Task ID (omit for new tasks, include to update existing)'),
                content: z.string().describe('Task description'),
                status: z.enum(['pending', 'in_progress', 'completed']).describe('Task status'),
            })).min(1).describe('The full task list (replaces current list)'),
        }),
        execute: async ({ todos: newTodos }) => {
            todos = newTodos.map(t => ({
                id: t.id ?? nextId++,
                content: t.content,
                status: t.status,
            }));

            // Ensure nextId stays ahead of all existing IDs
            const maxId = Math.max(0, ...todos.map(t => t.id));
            if (nextId <= maxId) {
                nextId = maxId + 1;
            }

            const pending = todos.filter(t => t.status === 'pending').length;
            const inProgress = todos.filter(t => t.status === 'in_progress').length;
            const completed = todos.filter(t => t.status === 'completed').length;

            return `Updated task list: ${todos.length} tasks (${completed} done, ${inProgress} in progress, ${pending} pending)`;
        },
    });
}
