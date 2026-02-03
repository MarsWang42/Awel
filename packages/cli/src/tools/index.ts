import { createReadTool } from './read.js';
import { createWriteTool } from './write.js';
import { createEditTool } from './edit.js';
import { createBashTool } from './bash.js';
import { createGlobTool } from './glob.js';
import { createLsTool } from './ls.js';
import { createProposePlanTool } from './propose-plan.js';
import { createAskUserTool } from './ask-user.js';
import { createReactBestPracticesTool } from './react-best-practices.js';
import { createWebSearchTool } from './web-search.js';
import { createWebFetchTool } from './web-fetch.js';
import { createGrepTool } from './grep.js';
import { createCodeSearchTool } from './code-search.js';
import { createMultiEditTool } from './multi-edit.js';
import { createTodoReadTool, createTodoWriteTool } from './todo.js';
import { createRestartDevServerTool } from './restart-dev-server.js';
import { createMemoryTool } from './memory.js';

export interface ToolContext {
    cwd: string;
    emitSSE: (event: string, data: string) => void;
    confirmBash: boolean;
    confirmFileWrites: boolean;
}

/**
 * Returns all agentic tools configured for the given project directory.
 * Tool names use PascalCase to match Claude Code tool names for consistent SSE events.
 */
export function awelTools(ctx: ToolContext) {
    const { cwd } = ctx;
    return {
        Read: createReadTool(cwd),
        Write: createWriteTool(ctx),
        Edit: createEditTool(ctx),
        MultiEdit: createMultiEditTool(ctx),
        Bash: createBashTool(ctx),
        Glob: createGlobTool(cwd),
        Grep: createGrepTool(cwd),
        Ls: createLsTool(cwd),
        ProposePlan: createProposePlanTool(),
        AskUser: createAskUserTool(),
        ReactBestPractices: createReactBestPracticesTool(),
        WebSearch: createWebSearchTool(),
        WebFetch: createWebFetchTool(),
        CodeSearch: createCodeSearchTool(),
        TodoRead: createTodoReadTool(),
        TodoWrite: createTodoWriteTool(),
        RestartDevServer: createRestartDevServerTool(),
        Memory: createMemoryTool(cwd),
    };
}
