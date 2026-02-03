# CLAUDE.md — Awel Codebase Guide

## What is Awel?

Awel is an AI-powered development overlay for Next.js applications. It runs a proxy server that sits in front of the user's dev server, injects a floating button into the page, and opens an interactive dashboard (in an iframe) where users can chat with an AI agent that can read, write, and edit files in the project.

## Project Structure

A single npm package (`awel`) with source code organized under `packages/`. Uses ES modules (`"type": "module"`) throughout. Published as a single package with `bin: { awel: "./bin/awel.js" }`.

```
packages/
  cli/         – Hono server, agent orchestration, LLM integration, proxy
  dashboard/   – React UI for chatting with the agent (embedded iframe)
  host/        – Vanilla JS script injected into the user's app (Shadow DOM)
```

Output structure after build:

```
dist/
  cli/         – Compiled CLI JS + skills/
  dashboard/   – Vite-built React SPA
  host/        – Single bundled host.js (IIFE)
bin/
  awel.js      – CLI entry point
```

## Build & Dev Commands

```bash
npm run build              # Build all packages (host → dashboard → cli)
npm run build:cli          # tsc + copy skills/ to dist
npm run build:host         # esbuild → dist/host/host.js (IIFE, minified)
npm run build:dashboard    # Vite build → dist/dashboard/
npm run dev                # CLI watch mode (tsc --watch)
npm run test               # vitest run
npm run test:watch         # vitest watch

# Create a new project with Awel (scaffolds Next.js + marks for creation mode)
npx awel create

# Running Awel against a Next.js app
npx awel dev               # Start on default ports (Awel:3001, app:3000)
npx awel dev -p 4000       # Target app on port 4000
npx awel dev -v            # Verbose mode (prints LLM stream events to stderr)
```

## Package Details

### CLI (`packages/cli/`)

The core server and agent orchestration layer.

- **Runtime**: Node.js, TypeScript compiled with `tsc`
- **Web framework**: Hono (served via `@hono/node-server`)
- **AI SDK**: Vercel AI SDK v6 (`ai` package) as the unified LLM abstraction
- **Ports**: Awel server on 3001 (`AWEL_PORT`), proxies to user app on 3000 (`USER_APP_PORT`). Configured in `src/config.ts`.

**Key source files:**

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point (Commander.js). Defines `awel dev` and `awel create` commands. |
| `src/server.ts` | Hono app setup: mounts API routes, serves dashboard/host static files, proxies everything else to user's app. Handles WebSocket upgrades for HMR. Manages creation mode state and project status endpoints. |
| `src/agent.ts` | Agent API routes: `POST /api/stream` (SSE streaming), `GET /api/history`, `GET /api/models`, `DELETE /api/chat/history`, plan/question/confirmation approval endpoints. |
| `src/session.ts` | Multi-turn conversation state. Model-aware session caching and message history preservation across model switches. Persists to `.awel/session.json`. |
| `src/config.ts` | Port defaults (`AWEL_PORT`, `USER_APP_PORT`), MIME type mappings. |
| `src/types.ts` | Shared type definitions. |
| `src/providers/registry.ts` | Model catalog and provider resolution. Maps model IDs → providers. |
| `src/providers/vercel.ts` | Core streaming implementation using Vercel AI SDK `streamText()`. Handles tool execution, SSE event emission, chat history management. Uses a specialized creation system prompt when in creation mode. |
| `src/providers/types.ts` | Shared types: `StreamProvider`, `ModelDefinition`, `ProviderConfig` (includes `creationMode` flag). |
| `src/proxy.ts` | HTTP proxy middleware. Intercepts HTML responses to inject the host script (`/_awel/host.js`). In creation mode, serves the dashboard as a full-page app at `/` instead of proxying. |
| `src/subprocess.ts` | Dev server process management: spawning via execa, health checks, auto-restart on crash, status tracking. |
| `src/devserver.ts` | HMR WebSocket traffic pause/resume during agent streams. |
| `src/undo.ts` | Session-based undo system. Captures git baseline, tracks changed files, stack-based LIFO rollback. |
| `src/plan-store.ts` | Singleton store for proposed plans awaiting user approval. |
| `src/confirm-store.ts` | Request/resolve confirmation for destructive tool operations (bash, file writes). Separate auto-approve flags for `bash` and `fileWrites`. |
| `src/memory.ts` | Persistent project knowledge system. Stores memories in `.awel/memory.json` with recency/usage scoring. Two scopes: "always" (injected every request) and "contextual" (searched on-demand). |
| `src/sse.ts` | SSE event helper utilities. Chat history storage and persistence to `.awel/history.json`. |
| `src/inspector.ts` | Inspector relay routes for element selection. |
| `src/babel-setup.ts` | Babel plugin setup for source mapping. |
| `src/comment-popup.ts` | Comment popup handling. |
| `src/logger.ts` | Logging utilities. |
| `src/verbose.ts` | Verbose mode tracking. |
| `src/awel-config.ts` | `.awel/config.json` read/write. `AwelConfig` interface includes `fresh`, `createdAt`, `onboarded`, `skillsInstalled` fields. Helpers: `isProjectFresh()`, `markProjectReady()`. |
| `src/onboarding.ts` | Interactive provider setup on first run; checks available LLM providers. |
| `src/skills.ts` | Installs `.claude/skills/` markdown files for Memory and Dev Server guidance. |
| `src/tools/` | Tool implementations available to the LLM (see below). |
| `src/skills/` | Static skill files (e.g. `react-best-practices.md`), copied to dist at build time. |

**Agentic tools** (defined in `src/tools/`):

- `Read` – Read file contents
- `Write` – Create/overwrite files (auto-creates directories). Supports user confirmation.
- `Edit` – String find-and-replace edits. Supports user confirmation.
- `MultiEdit` – Multiple edits in a single tool call. Supports user confirmation.
- `Bash` – Execute shell commands with timeout. Supports user confirmation.
- `Glob` – Find files by glob pattern
- `Grep` – Search file contents by regex
- `Ls` – List directory contents
- `CodeSearch` – Semantic code search from the web
- `WebSearch` – Web search for real-time information
- `WebFetch` – Fetch and extract web page content as markdown
- `TodoRead` / `TodoWrite` – Task list management
- `ProposePlan` – Propose a structured implementation plan (intercepted as SSE `plan` event)
- `AskUser` – Ask the user clarifying questions with selectable options
- `RestartDevServer` – Restart the user's dev server process
- `ReactBestPractices` – Consult built-in React/Next.js guidance from `skills/`
- `Memory` – Read, write, or search persistent project memories. Actions: `read`, `write`, `search`.

**Supported LLM providers** (configured in `src/providers/registry.ts`):

| Provider | Models | SDK | Env Var |
|----------|--------|-----|---------|
| Claude Code | sonnet, opus, haiku | `ai-sdk-provider-claude-code` | Claude CLI binary in PATH |
| Anthropic API | claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5 | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-5.2-codex, gpt-5.1-codex, gpt-5.2-pro, gpt-5.2-chat-latest, gpt-5-nano, gpt-5-mini | `@ai-sdk/openai` | `OPENAI_API_KEY` |
| Google AI | gemini-3-pro-preview, gemini-3-flash-preview, gemini-2.5-pro, gemini-2.5-flash | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| MiniMax | MiniMax-M2 | `vercel-minimax-ai-provider` | `MINIMAX_API_KEY` |
| Zhipu AI | glm-4-plus, glm-4-flash, glm-4-long | `zhipu-ai-provider` | `ZHIPU_API_KEY` |
| Vercel Gateway | anthropic/claude-sonnet-4-5, anthropic/claude-opus-4-5, anthropic/claude-sonnet-4, anthropic/claude-opus-4 | Vercel AI SDK | `AI_GATEWAY_API_KEY` |
| OpenRouter | Custom model input | `@openrouter/ai-sdk-provider` | `OPENROUTER_API_KEY` |

**Claude Code provider notes:**
- Uses `ai-sdk-provider-claude-code` with `permissionMode: 'acceptEdits'`
- Auto-approves all file edits and bash commands without user confirmation ("YOLO mode")
- Has its own built-in tools; doesn't use Awel's tool implementations
- Cannot share chat history with other providers (switching requires clearing history)
- Dashboard shows a warning modal when selecting Claude Code models

### Dashboard (`packages/dashboard/`)

React 18 SPA served at `/_awel/dashboard` by the CLI server.

- **Build**: Vite 6 with `base: '/_awel/dashboard/'`
- **Styling**: Tailwind CSS 3.4
- **UI components**: shadcn/ui pattern (CVA + clsx + tailwind-merge)
- **Icons**: lucide-react
- **i18n**: `i18next` + `react-i18next` with English (`en.json`) and Chinese (`zh.json`) locales

**Key source files:**

| File | Purpose |
|------|---------|
| `src/App.tsx` | Root component. Detects `window.__AWEL_CREATION_MODE__` and renders `CreationView` (full-page) or the normal sidebar layout. Handles theme toggle, chat clearing, model selection. Panel expand/collapse is animated (200ms width transition). |
| `src/main.tsx` | React entry point. |
| `src/i18n.ts` | i18n setup and locale configuration. |
| `src/hooks/useConsole.ts` | Core state management. Manages message list, SSE stream consumption, plan/question/confirmation handling. |
| `src/hooks/useTheme.ts` | Theme (dark mode) management. |
| `src/hooks/inspectorHelpers.ts` | Inspector context building helpers. |
| `src/services/sseParser.ts` | Parses SSE events from the server stream into typed message objects. |
| `src/types/messages.ts` | Shared message and event type definitions. |
| `src/components/Console.tsx` | Main chat interface component. |
| `src/components/CreationView.tsx` | Full-page creation mode UI. Three phases: initial (heading + suggestion chips + input), building (streaming chat), success (auto-redirect to app). |
| `src/components/ModelSelector.tsx` | Model selection dropdown. Features: provider filtering, custom OpenRouter model input, recent models, env var copy helpers. Shows warning modal when selecting Claude Code (YOLO mode). Shows confirmation when switching between Claude Code and other providers (clears chat history). |
| `src/components/ConsoleChips.tsx` | Console entry chips displayed above the input area. |
| `src/components/DiffModal.tsx` | Diff review modal for file changes. |
| `src/components/ImagePreviewModal.tsx` | Image attachment preview. |
| `src/components/chat/` | Message type components (see below). |
| `src/components/ui/` | Shared UI primitives: `button`, `card`, `confirm-dialog`, `tooltip`. |

**Chat components** (`src/components/chat/`):

| Component | Purpose |
|-----------|---------|
| `AssistantMessage.tsx` | AI text responses |
| `UserMessage.tsx` | User prompts with attachments |
| `ToolUseMessage.tsx` | Tool invocation display |
| `ToolResultMessage.tsx` | Tool execution results |
| `PlanMessage.tsx` | Implementation plan cards with approve/reject/feedback |
| `QuestionMessage.tsx` | Clarifying questions with option selection |
| `ConfirmMessage.tsx` | Confirmation requests for bash/file operations (Allow/Allow All/Deny) |
| `ResultMessage.tsx` | Final stream result with stats |
| `ErrorMessage.tsx` | Error display |
| `StatusMessage.tsx` | Status updates including abort messages |
| `SystemInfoMessage.tsx` | System info display |
| `CompactBoundaryMessage.tsx` | Message boundary markers |
| `ToolGroup.tsx` | Tool grouping container |

### Host (`packages/host/`)

Vanilla JS bundle injected into the user's web app, built from multiple source modules into a single IIFE.

- **Build**: esbuild → `dist/host/host.js` (IIFE format, minified)
- **Isolation**: Uses Shadow DOM to avoid CSS/JS conflicts with the user's app

**Source modules** (`src/`):

| File | Purpose |
|------|---------|
| `index.ts` | Entry point. Initializes all modules, sets up postMessage listeners, self-healing mutation observer. |
| `state.ts` | Shared state management (sidebar visibility, theme). |
| `overlay.ts` | Floating trigger button and full-screen iframe overlay for the dashboard. |
| `inspector.ts` | Element inspector mode: hover highlight, depth scrolling, click to select, hold-to-inspect (Option+Shift). |
| `console.ts` | Console error/warning interception and forwarding to the dashboard. Unviewed notification dot. |
| `annotation.ts` | Screenshot annotation support. |
| `pageContext.ts` | Page context extraction (URL, title, route component) for the AI agent. |
| `consoleUtils.ts` | Utilities for console interception. |
| `inspectorUtils.ts` | Utilities for inspector functionality. |

## Architecture & Data Flow

```
User types in Dashboard UI
  → POST /api/stream (with prompt + selected model)
  → CLI resolves provider from registry
  → Vercel AI SDK streamText() calls LLM
  → LLM returns text + tool calls
  → Tools execute (with optional user confirmation)
  → SSE events stream back to dashboard
  → Dashboard renders messages in real-time
  → History persisted to .awel/history.json
```

**SSE event types:** `text`, `tool_use`, `tool_result`, `plan`, `question`, `confirm`, `status`, `error`, `result`, `confirm_resolved`, `question_answered`, `plan_approved`, `end`

**Special flows:**

- **Plan approval**: `ProposePlan` tool calls are intercepted and emitted as `plan` SSE events. The user approves/rejects in the dashboard, which calls `/api/plan/approve`.

- **User questions**: `AskUser` tool calls pause the stream and wait for user input via the dashboard's question UI.

- **Tool confirmation**: For non-Claude Code providers, `Bash`, `Write`, `Edit`, and `MultiEdit` tools emit `confirm` SSE events. User can Allow, Allow All (auto-approve for session), or Deny. Rejected operations return an error message to the agent.

- **HMR pause**: HMR is paused during agent streams (`devserver.ts`) to prevent hot reload interference while files are being modified.

- **Undo system**: The undo system (`undo.ts`) captures a git baseline at session start, tracks changed files, and allows stack-based LIFO rollback of an entire agent session.

- **Subprocess management**: The subprocess manager (`subprocess.ts`) can spawn, monitor, and auto-restart the user's dev server.

- **Memory system**: The Memory tool stores persistent project knowledge in `.awel/memory.json`. Two scopes: "always" (injected into every conversation) and "contextual" (searched on-demand). Uses recency × usage scoring for retrieval.

**Creation mode** (`awel create` → `awel dev`):
- `awel create` uses `@clack/prompts` to prompt for a project name, runs `npx create-next-app@latest`, and writes `.awel/config.json` with `{ fresh: true }`.
- `awel dev` reads `isProjectFresh()` at startup. When `fresh`, the server sets an in-memory `isFresh` flag.
- The proxy intercepts all HTML navigation requests (`Accept: text/html`) and serves the dashboard directly at `/` with `window.__AWEL_CREATION_MODE__=true` injected. No host script injection. Non-HTML requests (JS, CSS, HMR) still proxy to the Next.js dev server.
- `App.tsx` detects the flag and renders `CreationView` instead of the normal sidebar layout.
- The agent uses `CREATION_SYSTEM_PROMPT` (in `vercel.ts`) which instructs it to clarify requirements via `AskUser`, generate a complete app, and verify it builds.
- When the agent finishes (result SSE event with `success` subtype), `CreationView` calls `POST /api/project/mark-ready`, which writes `{ fresh: false }` to `.awel/config.json` and flips the in-memory flag. The UI shows a success screen and redirects to `/`.
- After redirect, the proxy sees `isFresh=false` and behaves normally: proxies to Next.js with host script injection. If there are build errors, the user sees the Next.js error overlay with the Awel button available.

**Model switching:**
- Chat history is preserved when switching between models within the same provider type.
- Switching between Claude Code and other providers requires clearing chat history (incompatible tool sets).
- Dashboard shows appropriate confirmation modals for these transitions.

## Project Files

Awel stores project-specific data in the `.awel/` directory:

| File | Purpose |
|------|---------|
| `.awel/config.json` | Project configuration: `fresh`, `createdAt`, `onboarded`, `skillsInstalled` |
| `.awel/history.json` | Persisted chat history (max 500 messages) |
| `.awel/session.json` | Session context: messages, model, provider |
| `.awel/memory.json` | Persistent project memories with tags and scopes |

## Key Conventions

- All packages use ES modules (`"type": "module"`). Use `.js` extensions in import paths (even for TypeScript sources).
- TypeScript target is ES2022 with `NodeNext` module resolution.
- The CLI compiles with plain `tsc` (no bundler). Dashboard uses Vite. Host uses esbuild.
- Zod v4 is used for validation in the CLI package.
- `@clack/prompts` is used for interactive CLI prompts in `awel create`.
- Tests use Vitest.
