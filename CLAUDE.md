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
| `src/index.ts` | CLI entry point (Commander.js). Defines `awel dev` command. |
| `src/server.ts` | Hono app setup: mounts API routes, serves dashboard/host static files, proxies everything else to user's app. Handles WebSocket upgrades for HMR. |
| `src/agent.ts` | Agent API routes: `POST /api/stream` (SSE streaming), `GET /api/history`, `GET /api/models`, plan approval endpoints. |
| `src/session.ts` | Multi-turn conversation state. Model-aware session caching and message history preservation across model switches. |
| `src/config.ts` | Port defaults (`AWEL_PORT`, `USER_APP_PORT`), MIME type mappings. |
| `src/types.ts` | Shared type definitions. |
| `src/providers/registry.ts` | Model catalog and provider resolution. Maps model IDs → providers. |
| `src/providers/vercel.ts` | Core streaming implementation using Vercel AI SDK `streamText()`. Handles tool execution, SSE event emission, chat history management. |
| `src/providers/types.ts` | Shared types: `StreamProvider`, `ModelDefinition`, `ProviderConfig`. |
| `src/proxy.ts` | HTTP proxy middleware. Intercepts HTML responses to inject the host script (`/_awel/host.js`). |
| `src/subprocess.ts` | Dev server process management: spawning via execa, health checks, auto-restart on crash, status tracking. |
| `src/devserver.ts` | HMR WebSocket traffic pause/resume during agent streams. |
| `src/undo.ts` | Session-based undo system. Snapshots files before modifications, stack-based LIFO rollback. |
| `src/plan-store.ts` | Singleton store for proposed plans awaiting user approval. |
| `src/sse.ts` | SSE event helper utilities. |
| `src/inspector.ts` | Inspector relay routes for element selection. |
| `src/babel-setup.ts` | Babel plugin setup for source mapping. |
| `src/comment-popup.ts` | Comment popup handling. |
| `src/logger.ts` | Logging utilities. |
| `src/verbose.ts` | Verbose mode tracking. |
| `src/tools/` | Tool implementations available to the LLM (see below). |
| `src/skills/` | Static skill files (e.g. `react-best-practices.md`), copied to dist at build time. |

**Agentic tools** (defined in `src/tools/`):

- `Read` – Read file contents
- `Write` – Create/overwrite files (auto-creates directories)
- `Edit` – String find-and-replace edits
- `MultiEdit` – Multiple edits in a single tool call
- `Bash` – Execute shell commands
- `Glob` – Find files by glob pattern
- `Grep` – Search file contents by regex
- `Ls` – List directory contents
- `CodeSearch` – Semantic code search
- `WebSearch` – Web search
- `WebFetch` – Fetch and extract web page content
- `TodoRead` / `TodoWrite` – Task list management
- `ProposePlan` – Propose a structured implementation plan (intercepted as SSE `plan` event)
- `AskUser` – Ask the user clarifying questions with selectable options
- `RestartDevServer` – Restart the user's dev server process
- `ReactBestPractices` – Consult built-in React/Next.js guidance from `skills/`

**Supported LLM providers** (configured in `src/providers/registry.ts`):

| Provider | Models | SDK | Env Var |
|----------|--------|-----|---------|
| Claude Code | sonnet, opus, haiku | `ai-sdk-provider-claude-code` | Claude CLI binary in PATH |
| Anthropic API | claude-sonnet-4-5, claude-opus-4-5, claude-haiku-4-5 | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` |
| OpenAI | gpt-5.2-codex, gpt-5.1-codex, gpt-5.2-pro, gpt-5.2-chat-latest, gpt-5-nano, gpt-5-mini | `@ai-sdk/openai` | `OPENAI_API_KEY` |
| Google AI | gemini-3-pro-preview, gemini-3-flash-preview, gemini-2.5-pro, gemini-2.5-flash | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Qwen | qwen-max, qwen-plus-latest | `qwen-ai-provider` | `DASHSCOPE_API_KEY` |
| MiniMax | MiniMax-M2 | `vercel-minimax-ai-provider` | `MINIMAX_API_KEY` |
| Vercel Gateway | anthropic/claude-sonnet-4-5, anthropic/claude-opus-4-5, anthropic/claude-sonnet-4, anthropic/claude-opus-4 | Vercel AI SDK | `AI_GATEWAY_API_KEY` |

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
| `src/App.tsx` | Root component. Header with model selector, inspector toggle, controls. |
| `src/main.tsx` | React entry point. |
| `src/i18n.ts` | i18n setup and locale configuration. |
| `src/hooks/useConsole.ts` | Core state management. Manages message list, SSE stream consumption, plan/question handling. |
| `src/hooks/useTheme.ts` | Theme (dark mode) management. |
| `src/services/sseParser.ts` | Parses SSE events from the server stream. |
| `src/types/messages.ts` | Shared message and event type definitions. |
| `src/components/Console.tsx` | Main chat interface component. |
| `src/components/ModelSelector.tsx` | Model selection dropdown (persists to localStorage). |
| `src/components/ConsoleChips.tsx` | Console entry chips displayed above the input area. |
| `src/components/DiffModal.tsx` | Diff review modal for file changes. |
| `src/components/ImagePreviewModal.tsx` | Image attachment preview. |
| `src/components/chat/` | Message type components: `AssistantMessage`, `UserMessage`, `ToolUseMessage`, `ToolResultMessage`, `PlanMessage`, `QuestionMessage`, `StatusMessage`, `ErrorMessage`, `ToolGroup`, etc. |
| `src/components/ui/` | Shared UI primitives: `button`, `card`, `confirm-dialog`. |

### Host (`packages/host/`)

Vanilla JS bundle injected into the user's web app, built from multiple source modules into a single IIFE.

- **Build**: esbuild → `dist/host/host.js` (IIFE format, minified)
- **Isolation**: Uses Shadow DOM to avoid CSS/JS conflicts with the user's app

**Source modules** (`src/`):

| File | Purpose |
|------|---------|
| `index.ts` | Entry point. Initializes all modules, sets up postMessage listeners. |
| `state.ts` | Shared state management. |
| `overlay.ts` | Floating trigger button and full-screen iframe overlay for the dashboard. |
| `inspector.ts` | Element inspector mode: hover highlight, depth scrolling, click to select. |
| `console.ts` | Console error/warning interception and forwarding to the dashboard. |
| `annotation.ts` | Screenshot annotation support. |
| `pageContext.ts` | Page context extraction for the AI agent. |

## Architecture & Data Flow

```
User types in Dashboard UI
  → POST /api/stream (with prompt + selected model)
  → CLI resolves provider from registry
  → Vercel AI SDK streamText() calls LLM
  → LLM returns text + tool calls
  → Tools execute against the project filesystem
  → SSE events stream back to dashboard
  → Dashboard renders messages in real-time
```

**SSE event types:** `text`, `tool_use`, `tool_result`, `plan`, `question`, `status`, `error`, `result`, `end`

**Special flows:**
- `ProposePlan` tool calls are intercepted and emitted as `plan` SSE events. The user approves/rejects in the dashboard, which calls `/api/plan/approve`.
- `AskUser` tool calls pause the stream and wait for user input via the dashboard's question UI.
- HMR is paused during agent streams (`devserver.ts`) to prevent hot reload interference while files are being modified.
- The undo system (`undo.ts`) snapshots files before each modification, allowing stack-based rollback of an entire agent session.
- The subprocess manager (`subprocess.ts`) can spawn, monitor, and auto-restart the user's dev server.

## Key Conventions

- All packages use ES modules (`"type": "module"`). Use `.js` extensions in import paths (even for TypeScript sources).
- TypeScript target is ES2022 with `NodeNext` module resolution.
- The CLI compiles with plain `tsc` (no bundler). Dashboard uses Vite. Host uses esbuild.
- No test framework is currently set up.
- Zod v4 is used for validation in the CLI package.
