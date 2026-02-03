# Awel

[English](./README.md) | 中文

为 Next.js 打造的 AI 开发助手。Awel 在你的开发服务器前运行一个代理，向页面注入一个悬浮聊天按钮，让你通过内嵌的面板与 AI 智能体对话——它可以读取、编写和编辑项目中的文件。

![Awel 面板](docs/screenshot.png)

## 快速开始

### 创建新项目

```bash
# 至少配置一个 AI 服务商（任选其一）：
export ANTHROPIC_API_KEY="sk-ant-..."   # Anthropic API
export OPENAI_API_KEY="sk-..."          # OpenAI
export GOOGLE_GENERATIVE_AI_API_KEY="..." # Google AI
# 或安装 Claude CLI：https://docs.anthropic.com/en/docs/claude-code

npx awel create
```

此命令会创建一个新的 Next.js 项目并标记为创建模式。按照提示 `cd` 进入项目目录并运行 `npx awel dev`。你会看到一个全屏创建界面，描述你想构建的应用——AI 智能体会为你生成整个应用，完成后自动切换到正常的 Awel 浮层模式。

### 在已有项目中使用

```bash
cd my-existing-next-app
npx awel dev
```

Awel 需要至少一个已配置的服务商才能运行。完整列表见[支持的模型](#支持的模型)。

Awel 会在端口 3001 启动，并代理运行在端口 3000 的 Next.js 开发服务器。打开 `http://localhost:3001` 即可看到带有 Awel 浮层的应用。

### 命令

```
awel create              创建一个带有 Awel 的新 Next.js 项目
awel dev [options]       启动带有 Awel 浮层的开发服务器

  -p, --port <port>    目标应用端口（默认：3000）
  -v, --verbose        将 LLM 流式事件输出到 stderr
```

## 工作原理

Awel 位于浏览器和开发服务器之间：

```
浏览器 → Awel（代理 :3001）→ 你的应用（开发服务器 :3000）
```

1. Awel 拦截 HTML 响应，注入一段脚本
2. 脚本在页面右下角渲染一个悬浮按钮（通过 Shadow DOM 隔离）
3. 点击按钮会打开一个全屏聊天面板（iframe）
4. 描述你的需求——AI 智能体会读取代码、进行编辑、执行命令，并实时流式返回结果

HMR / WebSocket 流量会透明代理，在智能体编辑文件期间暂停，以防止热重载干扰。

## 支持的模型

Awel 使用 [Vercel AI SDK](https://sdk.vercel.ai)，支持多个服务商。设置对应的环境变量即可启用：

| 服务商 | 环境变量 | 示例模型 |
|--------|----------|----------|
| Claude Code | PATH 中有 Claude CLI | sonnet, opus, haiku |
| Anthropic API | `ANTHROPIC_API_KEY` | claude-sonnet-4-5, claude-opus-4-5 |
| OpenAI | `OPENAI_API_KEY` | gpt-5.2-codex, gpt-5.1-codex |
| Google AI | `GOOGLE_GENERATIVE_AI_API_KEY` | gemini-3-pro-preview, gemini-2.5-pro |
| MiniMax | `MINIMAX_API_KEY` | MiniMax-M2 |
| 智谱 AI | `ZHIPU_API_KEY` | glm-4-plus, glm-4-flash |
| Vercel Gateway | `AI_GATEWAY_API_KEY` | 通过网关访问多种模型 |
| OpenRouter | `OPENROUTER_API_KEY` | 通过 OpenRouter 访问任意模型 |

可随时在面板顶部的下拉菜单中切换模型。

> **注意：** Claude Code 模型使用"YOLO 模式"——会自动批准所有文件编辑和命令执行，不会请求确认。选择这些模型时会显示警告提示。

### 额外环境变量

| 变量 | 说明 |
|------|------|
| `OPENAI_BASE_URL` | OpenAI 服务商的自定义 Base URL（例如代理或兼容 API）。默认为 `https://api.openai.com/v1`。 |
| `AWEL_MAX_OUTPUT_TOKENS` | 模型单次响应的最大生成 token 数。对所有服务商生效。 |

## 智能体工具

AI 智能体可使用以下工具：

- **Read** / **Write** / **Edit** / **MultiEdit** — 文件操作（支持用户确认）
- **Bash** — 执行 Shell 命令（支持用户确认）
- **Glob** / **Grep** / **Ls** / **CodeSearch** — 查找文件和搜索代码
- **WebSearch** / **WebFetch** — 网络搜索
- **ProposePlan** — 提出多步骤实施计划，等待你审批后再执行
- **AskUser** — 在执行过程中向你提问
- **RestartDevServer** — 配置变更后重启开发服务器
- **TodoRead** / **TodoWrite** — 跨对话的任务管理
- **Memory** — 存储和检索持久化的项目知识

## 功能特性

- **元素检查器** — 点击十字准星图标，在应用中选择一个元素，自动作为上下文附加到提示中

  ![元素检查器](docs/Screenshot-Inspector.png)

- **截图标注** — 用图形、箭头和文字标注截图后发送给智能体

  ![截图标注](docs/Screenshot-annotator.png)

- **图片附件** — 附加截图或参考图片
- **计划审批** — 智能体可以提出计划，由你审核后再执行变更
- **工具确认** — 在文件编辑和命令执行前进行确认（非 Claude Code 模型）
- **撤销** — 一键回滚整个智能体会话的所有文件变更
- **Diff 审查** — 在接受变更前查看所有文件修改的摘要
- **记忆** — 智能体可以跨会话保存和调用项目相关知识
- **深色模式** — 跟随系统偏好
- **国际化** — 支持英文和中文
- **创建模式** — `awel create` 创建新项目并启动全屏 AI 对话界面，描述你的应用，智能体从零开始为你构建

## 开发

```bash
npm run build           # 构建所有模块
npm run dev             # 监听模式（仅 CLI）
npm run test            # 运行测试
npm run test:watch      # 测试监听模式
```

单独构建：

```bash
npm run build:cli       # TypeScript → dist/cli/
npm run build:dashboard # Vite → dist/dashboard/
npm run build:host      # esbuild → dist/host/host.js
```

## 许可证

MIT
