import { streamText, stepCountIs, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { claudeCode } from 'ai-sdk-provider-claude-code';
import { createQwen } from 'qwen-ai-provider';
import { createMinimax } from 'vercel-minimax-ai-provider';
import { pauseDevServer, resumeDevServer } from '../devserver.js';
import { addToHistory, writeSSEEvent } from '../sse.js';
import { awelTools } from '../tools/index.js';
import { storePlan } from '../plan-store.js';
import { startUndoSession, endUndoSession, pushSnapshot, getCurrentSessionStats } from '../undo.js';
import { resolve } from 'path';
import { logEvent } from '../verbose.js';
import type { SSEStreamingApi } from 'hono/streaming';
import type { ModelMessage } from 'ai';
import type { StreamProvider, ProviderConfig, ResponseMessage } from './types.js';

const SYSTEM_PROMPT = `You are Awel, an expert AI coding assistant. You help users build, modify, and understand their code projects.

You have access to these tools:
- Read: Read file contents
- Write: Create or overwrite files (creates parent directories automatically)
- Edit: Find-and-replace edits in files
- Bash: Execute shell commands
- Glob: Find files by glob pattern
- Ls: List directory contents
- ProposePlan: Propose a structured implementation plan before executing complex tasks
- AskUser: Ask the user clarifying questions with selectable options
- ReactBestPractices: Get React/Next.js performance best practices (40+ rules). Call with a section name or "all".
- Grep: Search file contents for a regex pattern (find function definitions, variable usage, string matches)
- MultiEdit: Apply multiple find-and-replace edits to a single file in one call
- WebSearch: Search the web for real-time information (documentation, error messages, APIs, libraries)
- WebFetch: Fetch content from a URL and return it as markdown, plain text, or raw HTML
- CodeSearch: Search the web for code examples, API docs, and SDK references
- TodoRead: Read the current task list to check progress
- TodoWrite: Create or update the task list to track multi-step work
- RestartDevServer: Restart the user's dev server if it has crashed, is unresponsive, or needs a restart after config changes

React Best Practices:
- When writing, reviewing, or refactoring React/Next.js code, use the ReactBestPractices tool to consult the performance guide. Request a specific section (e.g. "bundle", "rerender") when you know the area, or "all" for the full guide.

Guidelines:
- Always read a file before editing it
- Use relative paths when possible
- Be concise in explanations
- When making changes, explain what you did and why
- If a task requires multiple steps, work through them methodically

Plan Mode:
- When a user's request involves changes to 2 or more files, or any non-trivial multi-step work, you MUST use the ProposePlan tool FIRST before making any changes.
- Write a detailed markdown plan (up to 600-700 words for complex projects) covering: an overview of the approach, step-by-step implementation details, which files will be modified or created, and critical considerations or trade-offs.
- After calling ProposePlan, STOP and wait for the user to approve the plan or provide feedback.
- Do NOT begin executing file changes until the user has approved your plan.
- If the user provides feedback, revise your plan and call ProposePlan again with the updated plan.

Clarifying Questions:
- When a user's request is ambiguous or has multiple valid approaches, use the AskUser tool to ask clarifying questions before proceeding.
- Present 1-4 questions, each with 2-4 concrete options. Use multiSelect when choices are not mutually exclusive.
- Keep header labels short (max 12 chars). Put the recommended option first with "(Recommended)" in the label.
- CRITICAL: All fields in the AskUser tool must be plain text. Do NOT use markdown formatting (no **, no ##, no \`code\`, no bullet points, no lists). The UI renders these strings directly in a structured card — markdown will display as raw characters.
- After calling AskUser, STOP and wait for the user's answers before continuing.

Inspector Context:
- When a prompt includes [Inspector Context], the user selected a specific HTML tag using the visual inspector.
- The context has two sections: "Selected Tag" (the exact element clicked) and "Parent Component Context" (the surrounding component for reference).
- CRITICAL: Focus your changes on the specific selected tag, NOT the entire parent component. The rendered HTML attributes help you locate the exact JSX element in the source code.
- Use the parent component source code only as context to find and modify the specific tag.
- Prioritize addressing what the user sees: if props are undefined/null, investigate why.
- Reference the specific line numbers from the context when making edits.`;

/** Detects files Claude Code uses for plan output (.claude/plans/*.md, plan.md) */
function isPlanFile(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    if (/\.claude\/plans\/[^/]+\.md$/.test(normalized)) return true;
    const basename = normalized.split('/').pop()?.toLowerCase() || '';
    return /^\.?plan\.md$/.test(basename);
}

/** Extracts a title and body from plan markdown content */
function parsePlanContent(raw: string): { title: string; content: string } {
    const lines = raw.split('\n');
    const headingIdx = lines.findIndex(l => /^#\s+/.test(l));
    if (headingIdx !== -1) {
        const title = lines[headingIdx].replace(/^#\s+/, '').trim();
        const content = [...lines.slice(0, headingIdx), ...lines.slice(headingIdx + 1)].join('\n').trim();
        return { title, content };
    }
    return { title: lines[0]?.trim() || 'Plan', content: lines.slice(1).join('\n').trim() };
}

/** Tool names that require pausing the stream for user interaction.
 *  Covers both custom tool names (non-Anthropic) and Claude Code SDK names. */
const ASK_USER_TOOLS = new Set(['AskUser', 'AskUserQuestion']);
const PLAN_TOOLS = new Set(['ProposePlan', 'EnterPlanMode', 'ExitPlanMode']);
const INTERACTIVE_TOOLS = new Set([...ASK_USER_TOOLS, ...PLAN_TOOLS]);

type VercelProviderType = 'claude-code' | 'anthropic' | 'openai' | 'google-ai' | 'vercel-gateway' | 'qwen' | 'minimax';

function createModel(modelId: string, providerType: VercelProviderType, cwd?: string) {
    if (providerType === 'claude-code') {
        return claudeCode(modelId, {
            allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Ls', 'ProposePlan', 'AskUser'],
            cwd,
            permissionMode: 'acceptEdits',
            streamingInput: 'always',
            maxTurns: 25,
        });
    } else if (providerType === 'anthropic') {
        const anthropic = createAnthropic({});
        return anthropic(modelId);
    } else if (providerType === 'openai') {
        const openai = createOpenAI({});
        return openai(modelId);
    } else if (providerType === 'google-ai') {
        const google = createGoogleGenerativeAI({});
        return google(modelId);
    } else if (providerType === 'qwen') {
        const qwen = createQwen({});
        // qwen-ai-provider returns LanguageModelV1; AI SDK v6 handles v1 models
        // at runtime but the type signature expects v2/v3 — cast to satisfy tsc.
        return qwen(modelId) as unknown as LanguageModel;
    } else if (providerType === 'minimax') {
        const minimax = createMinimax({});
        return minimax(modelId);
    } else {
        // vercel-gateway: pass model ID string directly to streamText
        // ai v6 routes through the gateway using AI_GATEWAY_API_KEY env var
        return modelId;
    }
}

export function createVercelProvider(modelId: string, providerType: VercelProviderType): StreamProvider {
    return {
        async streamResponse(
            stream: SSEStreamingApi,
            messages: ModelMessage[],
            config: ProviderConfig
        ): Promise<ResponseMessage[]> {
            const PROVIDER_LABELS: Record<VercelProviderType, string> = {
                'claude-code': 'Claude Code',
                anthropic: 'Anthropic',
                openai: 'OpenAI',
                'google-ai': 'Google AI',
                'vercel-gateway': 'Vercel AI Gateway',
                qwen: 'Qwen',
                minimax: 'MiniMax',
            };
            const providerLabel = PROVIDER_LABELS[providerType];
            await writeSSEEvent(stream, 'status', {
                type: 'status',
                message: `Connecting to ${providerLabel}...`
            });

            // Extract the last user message text for use in storePlan's originalPrompt
            const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
            const lastUserPrompt = typeof lastUserMsg?.content === 'string'
                ? lastUserMsg.content
                : '';

            // Self-contained providers have built-in tools, system prompt, and execution
            // loop via the `cwd` config — they don't need Awel's tools or system prompt.
            const isSelfContained = providerType === 'claude-code';
            const model = createModel(modelId, providerType, config.projectCwd);
            const tools = isSelfContained ? undefined : awelTools(config.projectCwd);

            pauseDevServer(config.targetPort);
            const startTime = Date.now();
            let numTurns = 0;
            // State for intercepting Claude Code native plan mode
            let pendingPlanContent: string | null = null;
            let accumulatedText = '';
            let planEmitted = false;
            let inPlanMode = false;
            let waitingForUserInput = false;
            let reasoningActive = false;
            const suppressedToolCallIds = new Set<string>();
            const abortController = new AbortController();

            // Propagate external cancellation (e.g. new chat request) to the internal controller
            if (config.signal) {
                if (config.signal.aborted) {
                    abortController.abort();
                } else {
                    config.signal.addEventListener('abort', () => abortController.abort(), { once: true });
                }
            }

            // Start undo session to group all file changes from this agent run
            startUndoSession();

            let responseMessages: ResponseMessage[] = [];

            try {
                // Self-contained providers handle their own system prompt and tools internally.
                // All other providers get our system prompt + tools.
                const systemPrompt = isSelfContained
                    ? undefined
                    : `${SYSTEM_PROMPT}\n\nThe user's project directory is: ${config.projectCwd}`;

                const streamTextArgs = {
                    model,
                    ...(systemPrompt && { system: systemPrompt }),
                    messages,
                    tools,
                    ...(!isSelfContained && { stopWhen: stepCountIs(25) }),
                    abortSignal: abortController.signal,
                };
                logEvent('stream:start', `model=${modelId} provider=${providerType} messages=${messages.length}`);
                const result = streamText(streamTextArgs);

                try {
                    for await (const part of result.fullStream) {
                        switch (part.type) {
                            case 'text-delta': {
                                logEvent('text-delta', part.text);
                                accumulatedText += part.text;
                                if (inPlanMode) break;
                                const textData = JSON.stringify({
                                    type: 'text',
                                    text: part.text,
                                    model: modelId
                                });
                                addToHistory('text', textData);
                                await stream.writeSSE({ event: 'text', data: textData });
                                break;
                            }

                            case 'tool-call': {
                                logEvent('tool-call', `${part.toolName} ${JSON.stringify(part.input).slice(0, 200)}`);
                                // Intercept ProposePlan — emit as a plan SSE event
                                if (part.toolName === 'ProposePlan') {
                                    const input = part.input as { title: string; content: string };
                                    const planId = crypto.randomUUID();
                                    storePlan({
                                        planId,
                                        plan: { title: input.title, content: input.content },
                                        originalPrompt: lastUserPrompt,
                                        modelId,
                                        approved: false,
                                    });
                                    const planData = JSON.stringify({
                                        type: 'plan',
                                        planId,
                                        planTitle: input.title,
                                        planContent: input.content,
                                    });
                                    addToHistory('plan', planData);
                                    await stream.writeSSE({ event: 'plan', data: planData });
                                    waitingForUserInput = true;
                                    break;
                                }

                                // Intercept AskUser / AskUserQuestion — emit as a question SSE event
                                if (ASK_USER_TOOLS.has(part.toolName)) {
                                    const input = part.input as { questions: Array<{ question: string; header: string; multiSelect: boolean; options: Array<{ label: string; description: string }> }> };
                                    const questionId = crypto.randomUUID();
                                    const questionData = JSON.stringify({
                                        type: 'question',
                                        questionId,
                                        questions: input.questions,
                                    });
                                    addToHistory('question', questionData);
                                    await stream.writeSSE({ event: 'question', data: questionData });
                                    waitingForUserInput = true;
                                    break;
                                }

                                // Intercept Claude Code native plan mode tools
                                if (part.toolName === 'EnterPlanMode') {
                                    inPlanMode = true;
                                    accumulatedText = '';
                                    break;
                                }

                                if (part.toolName === 'ExitPlanMode') {
                                    inPlanMode = false;
                                    // Deduplicate — Claude Code may call ExitPlanMode multiple times
                                    if (planEmitted) {
                                        break;
                                    }

                                    // Prefer Write-captured content, fall back to accumulated text-deltas
                                    const planContent = pendingPlanContent || accumulatedText;

                                    if (planContent) {
                                        const parsed = parsePlanContent(planContent);
                                        const planId = crypto.randomUUID();
                                        storePlan({
                                            planId,
                                            plan: { title: parsed.title, content: parsed.content || planContent },
                                            originalPrompt: lastUserPrompt,
                                            modelId,
                                            approved: false,
                                        });
                                        const planData = JSON.stringify({
                                            type: 'plan',
                                            planId,
                                            planTitle: parsed.title,
                                            planContent: parsed.content || planContent,
                                        });
                                        addToHistory('plan', planData);
                                        await stream.writeSSE({ event: 'plan', data: planData });
                                        planEmitted = true;
                                        waitingForUserInput = true;
                                    }
                                    pendingPlanContent = null;
                                    break;
                                }

                                // Snapshot files before Write/Edit execution for undo support.
                                // This is essential for CLI providers (Claude Code, Gemini CLI) whose
                                // built-in tools bypass Awel's tool implementations.
                                if (part.toolName === 'Write' || part.toolName === 'Edit') {
                                    const input = part.input as Record<string, unknown>;
                                    const filePath = (input.file_path || input.filePath || '') as string;
                                    if (filePath) {
                                        const fullPath = filePath.startsWith('/') ? filePath : resolve(config.projectCwd, filePath);
                                        pushSnapshot(fullPath);
                                    }
                                }

                                // Capture Write calls to plan files for ExitPlanMode interception
                                if (part.toolName === 'Write') {
                                    const input = part.input as Record<string, unknown>;
                                    const filePath = (input.file_path || input.filePath || '') as string;
                                    if (isPlanFile(filePath) && typeof input.content === 'string') {
                                        pendingPlanContent = input.content;
                                        suppressedToolCallIds.add(part.toolCallId);
                                        break;
                                    }
                                }

                                const toolData = JSON.stringify({
                                    type: 'tool_use',
                                    tool: part.toolName,
                                    input: part.input,
                                    id: part.toolCallId
                                });
                                addToHistory('tool_use', toolData);
                                await stream.writeSSE({ event: 'tool_use', data: toolData });
                                break;
                            }

                            case 'tool-result': {
                                logEvent('tool-result', `${part.toolName} ${typeof part.output === 'string' ? part.output.slice(0, 120) : JSON.stringify(part.output).slice(0, 120)}`);
                                // Suppress tool results for intercepted tools
                                if (INTERACTIVE_TOOLS.has(part.toolName)
                                    || suppressedToolCallIds.delete(part.toolCallId)) break;

                                const resultData = JSON.stringify({
                                    type: 'tool_result',
                                    tool_use_id: part.toolCallId,
                                    tool: part.toolName,
                                    content: part.output,
                                    is_error: false
                                });
                                addToHistory('tool_result', resultData);
                                await stream.writeSSE({ event: 'tool_result', data: resultData });
                                break;
                            }

                            case 'finish-step': {
                                numTurns++;
                                logEvent('finish-step', `turn=${numTurns}`);
                                if (inPlanMode) {
                                    accumulatedText = '';
                                }
                                break;
                            }

                            case 'reasoning-start': {
                                logEvent('reasoning', 'start');
                                reasoningActive = true;
                                // Emit a status so the UI shows progress
                                const reasoningStatus = JSON.stringify({ type: 'status', message: 'Reasoning...' });
                                addToHistory('status', reasoningStatus);
                                await stream.writeSSE({ event: 'status', data: reasoningStatus });
                                break;
                            }

                            case 'reasoning-delta': {
                                // Some providers surface reasoning text; capture if present
                                const rp = part as { type: string; text?: string };
                                if (rp.text) {
                                    logEvent('reasoning-delta', rp.text.slice(0, 120));
                                }
                                break;
                            }

                            case 'reasoning-end': {
                                logEvent('reasoning', 'end');
                                reasoningActive = false;
                                break;
                            }

                            case 'tool-input-start':
                            case 'tool-input-delta':
                            case 'tool-input-end': {
                                // Intermediate tool-input streaming; the aggregated tool-call
                                // event is what we act on — silently ignore these.
                                break;
                            }

                            case 'tool-error': {
                                const te = part as { type: string; toolName?: string; error?: unknown };
                                const toolErrMsg = te.error instanceof Error
                                    ? te.error.message
                                    : typeof te.error === 'string'
                                        ? te.error
                                        : JSON.stringify(te.error);
                                logEvent('tool-error', `${te.toolName ?? 'unknown'} ${toolErrMsg}`);
                                const toolErrData = JSON.stringify({
                                    type: 'tool_result',
                                    tool_use_id: '',
                                    content: toolErrMsg,
                                    is_error: true
                                });
                                addToHistory('tool_result', toolErrData);
                                await stream.writeSSE({ event: 'tool_result', data: toolErrData });
                                break;
                            }

                            case 'error': {
                                const errorMsg = part.error instanceof Error
                                    ? part.error.message
                                    : typeof part.error === 'string'
                                        ? part.error
                                        : JSON.stringify(part.error);
                                logEvent('error', errorMsg);
                                const errorData = JSON.stringify({
                                    type: 'error',
                                    message: errorMsg
                                });
                                addToHistory('error', errorData);
                                await stream.writeSSE({ event: 'error', data: errorData });
                                break;
                            }

                            // Known stream lifecycle events — no action needed
                            case 'start':
                            case 'start-step':
                            case 'text-start':
                            case 'text-end':
                            case 'source':
                            case 'file':
                            case 'finish':
                            case 'raw':
                                break;

                            default:
                                logEvent('stream:unknown', `type=${(part as { type: string }).type}`);
                                break;
                        }

                        // Stop consuming the stream when waiting for user input
                        if (waitingForUserInput) {
                            logEvent('abort', 'waiting for user input');
                            abortController.abort();
                            break;
                        }
                    }
                } catch (err) {
                    // Ignore abort errors from user-input pauses or external cancellation
                    const externallyAborted = config.signal?.aborted;
                    if (!waitingForUserInput && !externallyAborted) throw err;
                }

                // Capture response messages for multi-turn accumulation.
                // Skip only when externally aborted (new request cancelled this one).
                // For waitingForUserInput, we still try to capture the partial response
                // (e.g. the assistant's plan/question tool call) so the session history
                // stays consistent and avoids orphan user messages that cause 400 errors.
                const externallyAborted = config.signal?.aborted;
                if (!externallyAborted) {
                    try {
                        const response = await result.response;
                        responseMessages = response.messages;
                    } catch {
                        // If awaiting response fails (e.g. abort race), leave empty
                    }
                }

                if (externallyAborted) {
                    logEvent('abort', 'externally cancelled');
                }

                // When externally cancelled, skip result events — no client is listening
                if (!externallyAborted) {
                    const durationMs = Date.now() - startTime;
                    const resultSubtype = waitingForUserInput ? 'waiting_for_input' : 'success';
                    const fileStats = getCurrentSessionStats(config.projectCwd);
                    const resultData = JSON.stringify({
                        type: 'result',
                        subtype: resultSubtype,
                        duration_ms: durationMs,
                        num_turns: numTurns,
                        result: waitingForUserInput ? 'waiting_for_input' : 'completed',
                        is_error: false,
                        ...(fileStats && fileStats.length > 0 ? { file_stats: fileStats } : {}),
                    });
                    logEvent('stream:end', `duration=${durationMs}ms turns=${numTurns} result=${resultSubtype}`);
                    addToHistory('result', resultData);
                    await stream.writeSSE({ event: 'result', data: resultData });
                }
            } finally {
                // End undo session so all file changes are grouped together
                endUndoSession();
                resumeDevServer(config.targetPort);
            }

            if (!config.signal?.aborted) {
                await writeSSEEvent(stream, 'done', { type: 'done', message: 'Agent completed' });
            }

            return responseMessages;
        }
    };
}
