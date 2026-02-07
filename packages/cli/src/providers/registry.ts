import { execSync } from 'node:child_process';
import { createVercelProvider } from './vercel.js';
import type { StreamProvider, ProviderType, ProviderCatalogEntry, ProviderEntry } from './types.js';

// ─── Provider Catalog ─────────────────────────────────────────

const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
    {
        id: 'claude-code',
        label: 'Claude Code',
        color: 'text-orange-600 dark:text-orange-400',
        envVar: null,
        models: [
            { id: 'sonnet', label: 'Claude Sonnet' },
            { id: 'opus', label: 'Claude Opus' },
            { id: 'haiku', label: 'Claude Haiku' },
        ],
    },
    {
        id: 'codex-cli',
        label: 'Codex CLI',
        color: 'text-green-600 dark:text-green-400',
        envVar: null,
        models: [
            { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
            { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
            { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
            { id: 'gpt-5.2-codex-mini', label: 'GPT-5.2 Codex Mini' },
            { id: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini' },
        ],
    },
    {
        id: 'anthropic',
        label: 'Anthropic API',
        color: 'text-orange-600 dark:text-orange-400',
        envVar: 'ANTHROPIC_API_KEY',
        models: [
            { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
            { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
            { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
        ],
    },
    {
        id: 'openai',
        label: 'OpenAI',
        color: 'text-green-600 dark:text-green-400',
        envVar: 'OPENAI_API_KEY',
        models: [
            { id: 'gpt-5.3-codex-medium', label: 'GPT-5.3 Codex Medium' },
            { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex' },
            { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex' },
            { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro' },
            { id: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat Latest' },
            { id: 'gpt-5-nano', label: 'GPT-5 Nano' },
            { id: 'gpt-5-mini', label: 'GPT-5 Mini' },
        ],
    },
    {
        id: 'google-ai',
        label: 'Google AI',
        color: 'text-blue-600 dark:text-blue-400',
        envVar: 'GOOGLE_GENERATIVE_AI_API_KEY',
        models: [
            { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro' },
            { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash' },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        ],
    },
    {
        id: 'minimax',
        label: 'MiniMax',
        color: 'text-pink-600 dark:text-pink-400',
        envVar: 'MINIMAX_API_KEY',
        models: [
            { id: 'MiniMax-M2', label: 'MiniMax M2' },
        ],
    },
    {
        id: 'zhipu',
        label: 'Zhipu AI',
        color: 'text-cyan-600 dark:text-cyan-400',
        envVar: 'ZHIPU_API_KEY',
        models: [
            { id: 'glm-4-plus', label: 'GLM-4 Plus' },
            { id: 'glm-4-flash', label: 'GLM-4 Flash' },
            { id: 'glm-4-long', label: 'GLM-4 Long' },
        ],
    },
    {
        id: 'vercel-gateway',
        label: 'Vercel AI Gateway',
        color: 'text-purple-600 dark:text-purple-400',
        envVar: 'AI_GATEWAY_API_KEY',
        models: [
            { id: 'anthropic/claude-sonnet-4-5', label: 'Sonnet 4.5 (Gateway)' },
            { id: 'anthropic/claude-opus-4-5', label: 'Opus 4.5 (Gateway)' },
            { id: 'anthropic/claude-sonnet-4', label: 'Sonnet 4 (Gateway)' },
            { id: 'anthropic/claude-opus-4', label: 'Opus 4 (Gateway)' },
        ],
    },
    {
        id: 'moonshot',
        label: 'Moonshot AI',
        color: 'text-indigo-600 dark:text-indigo-400',
        envVar: 'MOONSHOT_API_KEY',
        models: [
            { id: 'kimi-k2.5', label: 'Kimi K2.5' },
        ],
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        color: 'text-teal-600 dark:text-teal-400',
        envVar: 'OPENROUTER_API_KEY',
        customModelInput: true,
        models: [],
    },
];

// ─── Derived Maps (for consumers that need simple key→value lookups) ──

export const PROVIDER_ENV_KEYS: Record<string, string> = Object.fromEntries(
    PROVIDER_CATALOG.filter(p => p.envVar).map(p => [p.id, p.envVar!])
);

export const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(
    PROVIDER_CATALOG.map(p => [p.id, p.label])
);

// ─── Binary Check ─────────────────────────────────────────────

/**
 * Checks whether the `claude` CLI binary is available in PATH.
 * Cached after first call since the binary won't appear/disappear mid-session.
 */
let _claudeBinaryAvailable: boolean | null = null;
export function isClaudeBinaryAvailable(): boolean {
    if (_claudeBinaryAvailable !== null) return _claudeBinaryAvailable;
    try {
        execSync('which claude', { stdio: 'ignore' });
        _claudeBinaryAvailable = true;
    } catch {
        _claudeBinaryAvailable = false;
    }
    return _claudeBinaryAvailable;
}

/**
 * Checks whether the `codex` CLI binary is available in PATH.
 * Cached after first call since the binary won't appear/disappear mid-session.
 */
let _codexBinaryAvailable: boolean | null = null;
export function isCodexBinaryAvailable(): boolean {
    if (_codexBinaryAvailable !== null) return _codexBinaryAvailable;
    try {
        execSync('which codex', { stdio: 'ignore' });
        _codexBinaryAvailable = true;
    } catch {
        _codexBinaryAvailable = false;
    }
    return _codexBinaryAvailable;
}

// ─── Provider Catalog API ─────────────────────────────────────

/**
 * Returns the full provider catalog with availability info.
 * Each provider entry includes its nested models, availability status,
 * and an optional unavailableReason.
 */
export function getProviderCatalog(): ProviderEntry[] {
    return PROVIDER_CATALOG.map((entry) => {
        if (entry.id === 'claude-code') {
            const hasBinary = isClaudeBinaryAvailable();
            return {
                ...entry,
                available: hasBinary,
                ...(!hasBinary && { unavailableReason: 'Claude Code CLI not installed' }),
            };
        }

        if (entry.id === 'codex-cli') {
            const hasBinary = isCodexBinaryAvailable();
            return {
                ...entry,
                available: hasBinary,
                ...(!hasBinary && { unavailableReason: 'Codex CLI not installed' }),
            };
        }

        if (!entry.envVar) {
            return { ...entry, available: true };
        }

        const hasKey = !!process.env[entry.envVar];
        return {
            ...entry,
            available: hasKey,
            ...(!hasKey && { unavailableReason: `${entry.envVar} not set` }),
        };
    });
}

// ─── Provider Resolution ─────────────────────────────────────

export function resolveProvider(modelId: string, modelProvider: string): { provider: StreamProvider; modelProvider: string } {
    return { provider: createVercelProvider(modelId, modelProvider as ProviderType), modelProvider };
}
