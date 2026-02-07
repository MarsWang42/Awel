import { streamText, stepCountIs, type LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { claudeCode } from 'ai-sdk-provider-claude-code';
import { codexCli } from 'ai-sdk-provider-codex-cli';
import { createMinimax } from 'vercel-minimax-ai-provider';
import { createZhipu } from 'zhipu-ai-provider';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { pauseDevServer, resumeDevServer } from '../devserver.js';
import { addToHistory, writeSSEEvent } from '../sse.js';
import { awelTools } from '../tools/index.js';
import { rejectAllPending } from '../confirm-store.js';
import { storePlan } from '../plan-store.js';
import { startUndoSession, endUndoSession, getCurrentSessionStats } from '../undo.js';
import { logEvent } from '../verbose.js';
import { getAlwaysMemoryContext, getContextualMemoryContext } from '../memory.js';
import type { SSEStreamingApi } from 'hono/streaming';
import type { ModelMessage } from 'ai';
import type { StreamProvider, ProviderConfig, ResponseMessage, ProviderType } from './types.js';

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
- Memory: Read, write, or search project memories. Memories persist across sessions. Actions: 'read' (list all), 'write' (save new entry), 'search' (find contextual memories by keyword). When writing: provide content, tags, and scope ('always' for project-wide rules, 'contextual' for specific patterns).

React Best Practices:
- When writing, reviewing, or refactoring React/Next.js code, use the ReactBestPractices tool to consult the performance guide. Request a specific section (e.g. "bundle", "rerender") when you know the area, or "all" for the full guide.

Guidelines:
- Always read a file before editing it
- Use relative paths when possible
- Be concise in explanations
- When making changes, explain what you did and why
- If a task requires multiple steps, work through them methodically

Memory:
Save knowledge that will help in future sessions using Memory tool with action 'write'.

WHEN TO SAVE (action 'write'):
- After fixing a bug: Save the root cause and solution. Example: "Auth token refresh fails silently when network is slow - added retry logic in src/api/auth.ts"
- After learning a project quirk: Save the constraint. Example: "CSS modules break in app/ directory - use Tailwind only"
- After making an architectural decision: Save the reasoning. Example: "Using Zustand over Redux for simplicity - see stores/ directory"
- After discovering undocumented behavior: Save the finding. Example: "API /users endpoint requires X-Tenant header even though not in docs"

WHEN TO SEARCH (action 'search'):
- When user says "like before", "the same way", "as usual", or references past work
- When working on code that might have known issues or patterns
- When the user asks "how did we..." or "what was the..."

SCOPE GUIDANCE:
- 'always': Project-wide rules every conversation needs (tech stack, coding standards, directory structure)
- 'contextual': Specific facts about files, components, bugs, or decisions

After completing a significant task, consider: "What did I learn that would be useful next time?"

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
- Reference the specific line numbers from the context when making edits.

Language:
- IMPORTANT: Always respond in the same language the user writes in. If the user writes in Chinese, respond in Chinese. If the user writes in English, respond in English. Match the user's language throughout the conversation.`;

const CREATION_SYSTEM_PROMPT_EN = `You are Awel in creation mode — a design-focused AI that creates beautiful, production-quality websites. The user has a fresh Next.js project and wants to build something visually impressive.

You have access to these tools:
- Read, Write, Edit, MultiEdit: File operations
- Bash: Execute shell commands
- Glob, Grep, Ls: Find and search files
- AskUser: Ask clarifying questions with selectable options
- WebSearch, WebFetch, CodeSearch: Research and reference
- TodoWrite, TodoRead: Track multi-step work
- RestartDevServer: Restart the dev server if needed

## YOUR WORKFLOW

### Step 1: DESIGN WITH INTENTION

When generating the website, focus on:
- ATMOSPHERE: Every design choice should contribute to the emotional experience
- TYPOGRAPHY: Choose fonts that match the style — bold for impact, refined for elegance
- SPACING: Generous whitespace signals quality; cramped layouts feel amateur
- COLOR: Use color purposefully — gradients for depth, accents for attention
- ANIMATION: Subtle motion adds polish — hover states, scroll reveals, transitions
- HIERARCHY: Guide the eye naturally through the content

### Step 2: GENERATE COMPLETE, WORKING CODE

Create a complete Next.js app using:
- App Router with TypeScript
- Tailwind CSS for all styling (use custom colors in tailwind.config.ts)
- Clean component structure in app/ directory
- Responsive design that looks great on all devices
- Real content — no "Lorem ipsum" or placeholder text
- Smooth animations using Tailwind's transition utilities or Framer Motion
- Proper semantic HTML for accessibility

### Step 3: VERIFY

After generating all files, verify the app builds without errors:
- Run \`npm run build\` to check for compilation errors and fix any issues
- Do NOT start the dev server — it is already managed by Awel
- Do NOT commit to git — Awel handles version control

## IMPORTANT GUIDELINES

Quality Standards:
- No placeholder content or TODOs
- Every page should feel complete and polished
- Design should look like it was made by a professional
- Small details matter: shadows, borders, spacing, hover states

Execution:
- Do NOT use the ProposePlan tool. Execute the implementation directly without asking for approval.
- You may use the AskUser tool if you need clarification on specific details.`;

const CREATION_SYSTEM_PROMPT_ZH = `你是 Awel 创作模式——一个专注于设计的 AI，能够创建精美、生产级别的网站。用户有一个全新的 Next.js 项目，希望构建视觉效果出众的网站。

你可以使用以下工具：
- Read, Write, Edit, MultiEdit：文件操作
- Bash：执行 shell 命令
- Glob, Grep, Ls：查找和搜索文件
- AskUser：通过可选选项向用户提问
- WebSearch, WebFetch, CodeSearch：研究和参考
- TodoWrite, TodoRead：跟踪多步骤工作
- RestartDevServer：在需要时重启开发服务器

## 工作流程

### 第一步：用心设计

生成网站时，请关注：
- 氛围：每个设计决策都应该服务于情感体验
- 字体排印：选择与风格匹配的字体——粗体展现力量，精致体现优雅
- 间距：充足的留白传达品质感；拥挤的布局显得业余
- 色彩：有目的地使用颜色——渐变营造深度，强调色吸引注意力
- 动画：微妙的动效增添精致感——悬停状态、滚动揭示、过渡效果
- 层级：自然地引导视线浏览内容

### 第二步：生成完整可运行的代码

使用以下技术创建完整的 Next.js 应用：
- App Router + TypeScript
- Tailwind CSS 实现所有样式（在 tailwind.config.ts 中配置自定义颜色）
- 在 app/ 目录中使用清晰的组件结构
- 响应式设计，在所有设备上都美观
- 真实内容——不使用 "Lorem ipsum" 或占位文本
- 使用 Tailwind 的 transition 工具或 Framer Motion 实现流畅动画
- 使用正确的语义化 HTML 以确保可访问性

### 第三步：验证

生成所有文件后，验证应用能够正常构建：
- 运行 \`npm run build\` 检查编译错误并修复任何问题
- 不要启动开发服务器——Awel 已经在管理它
- 不要提交到 git——Awel 会处理版本控制

## 重要准则

质量标准：
- 不使用占位内容或 TODO
- 每个页面都应该完整且精致
- 设计应该看起来像专业人士制作的
- 细节很重要：阴影、边框、间距、悬停状态

执行方式：
- 不要使用 ProposePlan 工具。直接执行实现，无需请求批准。
- 如果需要澄清具体细节，可以使用 AskUser 工具。

语言要求：
- 所有用户可见的界面文案必须使用中文
- 代码注释和技术术语可以使用英文`;

function getCreationSystemPrompt(language?: string): string {
    return language?.startsWith('zh') ? CREATION_SYSTEM_PROMPT_ZH : CREATION_SYSTEM_PROMPT_EN;
}

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

function createModel(modelId: string, providerType: ProviderType, cwd?: string) {
    if (providerType === 'claude-code') {
        let appendPrompt = 'IMPORTANT: Always respond in the same language the user writes in. If the user writes in Chinese, respond in Chinese. If the user writes in English, respond in English. Match the user\'s language throughout the conversation.';

        // Inject always-scope memories for Claude Code
        if (cwd) {
            const memoryContext = getAlwaysMemoryContext(cwd);
            if (memoryContext) {
                appendPrompt += '\n\n' + memoryContext;
            }
        }

        return claudeCode(modelId, {
            allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Ls', 'ProposePlan', 'AskUser', 'Skill'],
            settingSources: ['project'],
            cwd,
            permissionMode: 'acceptEdits',
            streamingInput: 'always',
            maxTurns: 25,
            systemPrompt: { type: 'preset', preset: 'claude_code', append: appendPrompt },
        });
    } else if (providerType === 'codex-cli') {
        return codexCli(modelId, { codexPath: 'codex', fullAuto: true, cwd });
    } else if (providerType === 'anthropic') {
        const anthropic = createAnthropic({});
        return anthropic(modelId);
    } else if (providerType === 'openai') {
        const openai = createOpenAI({
            baseURL: process.env.OPENAI_BASE_URL,
        });
        return openai(modelId);
    } else if (providerType === 'google-ai') {
        const google = createGoogleGenerativeAI({});
        return google(modelId);
    } else if (providerType === 'minimax') {
        const minimax = createMinimax({});
        return minimax(modelId);
    } else if (providerType === 'zhipu') {
        const zhipu = createZhipu({});
        return zhipu(modelId) as unknown as LanguageModel;
    } else if (providerType === 'openrouter') {
        const openrouter = createOpenRouter({
            apiKey: process.env.OPENROUTER_API_KEY,
        });
        return openrouter.chat(modelId);
    } else if (providerType === 'moonshot') {
        const moonshot = createMoonshotAI({});
        return moonshot(modelId);
    } else {
        // vercel-gateway: pass model ID string directly to streamText
        // ai v6 routes through the gateway using AI_GATEWAY_API_KEY env var
        return modelId;
    }
}

export function createVercelProvider(modelId: string, providerType: ProviderType): StreamProvider {
    return {
        async streamResponse(
            stream: SSEStreamingApi,
            messages: ModelMessage[],
            config: ProviderConfig
        ): Promise<ResponseMessage[]> {
            const PROVIDER_LABEL_MAP: Record<ProviderType, string> = {
                'claude-code': 'Claude Code',
                'codex-cli': 'Codex CLI',
                anthropic: 'Anthropic',
                openai: 'OpenAI',
                'google-ai': 'Google AI',
                'vercel-gateway': 'Vercel AI Gateway',
                minimax: 'MiniMax',
                zhipu: 'Zhipu AI',
                openrouter: 'OpenRouter',
                moonshot: 'Moonshot AI',
            };
            const providerLabel = PROVIDER_LABEL_MAP[providerType];
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
            const isSelfContained = providerType === 'claude-code' || providerType === 'codex-cli';
            const model = createModel(modelId, providerType, config.projectCwd);

            // emitSSE helper used by tools that need to send events (e.g. confirmations)
            const emitSSE = (event: string, data: string) => {
                addToHistory(event, data);
                stream.writeSSE({ event, data }).catch(() => { });
            };

            const tools = isSelfContained ? undefined : awelTools({
                cwd: config.projectCwd,
                emitSSE,
                confirmBash: !config.creationMode,
                confirmFileWrites: !config.creationMode,
            });

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
                    rejectAllPending();
                    abortController.abort();
                } else {
                    config.signal.addEventListener('abort', () => {
                        rejectAllPending();
                        abortController.abort();
                    }, { once: true });
                }
            }

            // Start undo session to group all file changes from this agent run.
            // Pass projectCwd so the session can capture a git baseline — this is
            // essential for self-contained providers (Claude Code) where tool-call
            // events arrive after the file has already been modified.
            startUndoSession(config.projectCwd);

            let responseMessages: ResponseMessage[] = [];

            try {
                // Self-contained providers handle their own system prompt and tools internally.
                // All other providers get our system prompt + tools.
                const basePrompt = config.creationMode ? getCreationSystemPrompt(config.language) : SYSTEM_PROMPT;
                let systemPrompt = isSelfContained
                    ? undefined
                    : `${basePrompt}\n\nThe user's project directory is: ${config.projectCwd}`;

                // Inject always-scope memories into the system prompt
                if (!isSelfContained && systemPrompt) {
                    const memoryContext = getAlwaysMemoryContext(config.projectCwd);
                    if (memoryContext) {
                        systemPrompt += '\n\n' + memoryContext;
                    }
                }

                // Auto-retrieve contextual memories relevant to the user's prompt
                if (!isSelfContained && systemPrompt && lastUserPrompt) {
                    const contextualMemory = getContextualMemoryContext(config.projectCwd, lastUserPrompt);
                    if (contextualMemory) {
                        systemPrompt += '\n\n' + contextualMemory;
                        logEvent('memory', `Auto-retrieved contextual memories for prompt`);
                    }
                }

                const maxOutputTokens = process.env.AWEL_MAX_OUTPUT_TOKENS
                    ? parseInt(process.env.AWEL_MAX_OUTPUT_TOKENS, 10)
                    : undefined;

                const streamTextArgs = {
                    model,
                    ...(systemPrompt && { system: systemPrompt }),
                    messages,
                    tools,
                    ...(!isSelfContained && { stopWhen: stepCountIs(25) }),
                    ...(maxOutputTokens && { maxOutputTokens }),
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

                                // Self-contained providers execute tools internally. The AI SDK
                                // emits NoSuchToolError because these tool calls lack the
                                // `dynamic` flag — suppress them rather than surfacing to the user.
                                if (isSelfContained) break;
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
                    // Ignore abort errors from user-input pauses or external cancellation.
                    // For other errors (e.g. transient API 400s from tool-use concurrency),
                    // log and surface them as SSE error events instead of killing the stream.
                    const externallyAborted = config.signal?.aborted;
                    if (!waitingForUserInput && !externallyAborted) {
                        const errorMsg = err instanceof Error ? err.message : String(err);
                        logEvent('error', `stream error (non-fatal): ${errorMsg}`);
                        const errorData = JSON.stringify({
                            type: 'error',
                            message: errorMsg
                        });
                        addToHistory('error', errorData);
                        await stream.writeSSE({ event: 'error', data: errorData });
                    }
                }

                // Capture response messages for multi-turn accumulation.
                // Skip only when externally aborted (new request cancelled this one).
                // For waitingForUserInput, we still try to capture the partial response
                // (e.g. the assistant's plan/question tool call) so the session history
                // stays consistent and avoids orphan user messages that cause 400 errors.
                const externallyAborted = config.signal?.aborted;
                let usage: {
                    inputTokens?: number;
                    outputTokens?: number;
                    totalTokens?: number;
                    inputTokenDetails?: { cacheReadTokens?: number; noCacheTokens?: number };
                } | undefined;
                if (!externallyAborted) {
                    try {
                        const [response, usageResult, totalUsageResult] = await Promise.all([
                            result.response,
                            result.usage,
                            result.totalUsage,
                        ]);
                        responseMessages = response.messages;
                        usage = totalUsageResult;
                        logEvent('usage', `lastStep=${JSON.stringify(usageResult)} total=${JSON.stringify(totalUsageResult)}`);
                    } catch (err) {
                        logEvent('usage', `failed to resolve totalUsage: ${err instanceof Error ? err.message : String(err)}`);
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
                        ...(usage && {
                            input_tokens: usage.inputTokens,
                            output_tokens: usage.outputTokens,
                            cache_read_tokens: usage.inputTokenDetails?.cacheReadTokens,
                            cache_write_tokens: usage.inputTokenDetails?.noCacheTokens,
                        }),
                    });
                    logEvent('stream:end', `duration=${durationMs}ms turns=${numTurns} result=${resultSubtype}`);
                    addToHistory('result', resultData);
                    await stream.writeSSE({ event: 'result', data: resultData });
                }
            } finally {
                // Reject any pending confirmations so tool promises don't hang
                rejectAllPending();
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
