import { execSync } from 'node:child_process';
import { createVercelProvider } from './vercel.js';
import type { StreamProvider, ModelDefinition } from './types.js';

// ─── Model Catalog ───────────────────────────────────────────

const MODEL_CATALOG: ModelDefinition[] = [
    // Claude Code models (via ai-sdk-provider-claude-code — uses Claude CLI binary, no API key)
    { id: 'sonnet', label: 'Claude Sonnet', provider: 'claude-code' },
    { id: 'opus', label: 'Claude Opus', provider: 'claude-code' },
    { id: 'haiku', label: 'Claude Haiku', provider: 'claude-code' },

    // Anthropic API models (@ai-sdk/anthropic — uses ANTHROPIC_API_KEY)
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'anthropic' },
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', provider: 'anthropic' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },

    // OpenAI models (@ai-sdk/openai)
    { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', provider: 'openai' },
    { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex', provider: 'openai' },
    { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro', provider: 'openai' },
    { id: 'gpt-5.2-chat-latest', label: 'GPT-5.2 Chat Latest', provider: 'openai' },
    { id: 'gpt-5-nano', label: 'GPT-5 Nano', provider: 'openai' },
    { id: 'gpt-5-mini', label: 'GPT-5 Mini', provider: 'openai' },

    // Google AI models (@ai-sdk/google)
    { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', provider: 'google-ai' },
    { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', provider: 'google-ai' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google-ai' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google-ai' },

    // Qwen models (qwen-ai-provider — uses DASHSCOPE_API_KEY)
    { id: 'qwen-max', label: 'Qwen Max', provider: 'qwen' },
    { id: 'qwen-plus-latest', label: 'Qwen Plus', provider: 'qwen' },

    // MiniMax models (vercel-minimax-ai-provider — uses MINIMAX_API_KEY)
    { id: 'MiniMax-M2', label: 'MiniMax M2', provider: 'minimax' },

    // Vercel AI Gateway — Claude models via gateway (Claude Max / API key)
    { id: 'anthropic/claude-sonnet-4-5', label: 'Sonnet 4.5 (Gateway)', provider: 'vercel-gateway' },
    { id: 'anthropic/claude-opus-4-5', label: 'Opus 4.5 (Gateway)', provider: 'vercel-gateway' },
    { id: 'anthropic/claude-sonnet-4', label: 'Sonnet 4 (Gateway)', provider: 'vercel-gateway' },
    { id: 'anthropic/claude-opus-4', label: 'Opus 4 (Gateway)', provider: 'vercel-gateway' },
];

export const PROVIDER_ENV_KEYS: Record<string, string> = {
    // claude-code: uses Claude Code CLI binary, checked separately
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    'google-ai': 'GOOGLE_GENERATIVE_AI_API_KEY',
    'vercel-gateway': 'AI_GATEWAY_API_KEY',
    qwen: 'DASHSCOPE_API_KEY',
    minimax: 'MINIMAX_API_KEY',
};

/**
 * Checks whether the `claude` CLI binary is available in PATH.
 * Cached after first call since the binary won't appear/disappear mid-session.
 */
let _claudeBinaryAvailable: boolean | null = null;
function isClaudeBinaryAvailable(): boolean {
    if (_claudeBinaryAvailable !== null) return _claudeBinaryAvailable;
    try {
        execSync('which claude', { stdio: 'ignore' });
        _claudeBinaryAvailable = true;
    } catch {
        _claudeBinaryAvailable = false;
    }
    return _claudeBinaryAvailable;
}

// ─── Provider Resolution ─────────────────────────────────────

export function resolveProvider(modelId: string): { provider: StreamProvider; modelProvider: string } {
    const model = MODEL_CATALOG.find(m => m.id === modelId);
    if (!model) {
        throw new Error(`Unknown model: ${modelId}. Use GET /api/models for available models.`);
    }

    let provider: StreamProvider;
    switch (model.provider) {
        case 'claude-code':
        case 'anthropic':
        case 'openai':
        case 'google-ai':
        case 'vercel-gateway':
        case 'qwen':
        case 'minimax':
            provider = createVercelProvider(modelId, model.provider);
            break;
        default:
            throw new Error(`No provider implementation for: ${model.provider}`);
    }

    return { provider, modelProvider: model.provider };
}

// ─── Model Catalog API ───────────────────────────────────────

export interface ModelWithAvailability extends ModelDefinition {
    available: boolean;
    unavailableReason?: string;
}

/**
 * Returns the model catalog enriched with availability info.
 * Each entry includes `available: boolean` and an optional `unavailableReason`.
 * The `claude-code` provider checks for the `claude` CLI binary instead of an env var.
 * Providers without a known env key mapping default to available.
 */
export function getModelCatalogWithAvailability(): ModelWithAvailability[] {
    return MODEL_CATALOG.map((model) => {
        // Claude Code provider: check for the `claude` binary, not an API key
        if (model.provider === 'claude-code') {
            const hasBinary = isClaudeBinaryAvailable();
            return {
                ...model,
                available: hasBinary,
                ...(!hasBinary && { unavailableReason: 'Claude Code CLI not installed' }),
            };
        }

        const envKey = PROVIDER_ENV_KEYS[model.provider];
        if (!envKey) {
            return { ...model, available: true };
        }
        const hasKey = !!process.env[envKey];
        return {
            ...model,
            available: hasKey,
            ...(!hasKey && { unavailableReason: `${envKey} not set` }),
        };
    });
}
