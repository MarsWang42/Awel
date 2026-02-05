import type { SSEStreamingApi } from 'hono/streaming';
import type { ModelMessage, AssistantModelMessage, ToolModelMessage } from 'ai';

export type ResponseMessage = AssistantModelMessage | ToolModelMessage;

export interface ProviderConfig {
    projectCwd: string;
    targetPort: number;
    /** When aborted, the provider should stop the LLM stream and exit early. */
    signal?: AbortSignal;
    /** When true, the agent uses a creation-mode system prompt for building new apps. */
    creationMode?: boolean;
    /** User's preferred language (e.g., 'en', 'zh'). Used to select localized system prompts. */
    language?: string;
}

export interface StreamProvider {
    streamResponse(
        stream: SSEStreamingApi,
        messages: ModelMessage[],
        config: ProviderConfig
    ): Promise<ResponseMessage[]>;
}

export type ProviderType = 'claude-code' | 'anthropic' | 'openai' | 'google-ai' | 'vercel-gateway' | 'minimax' | 'zhipu' | 'openrouter' | 'moonshot';

export interface ModelEntry {
    id: string;
    label: string;
}

export interface ProviderCatalogEntry {
    id: ProviderType;
    label: string;
    color: string;
    envVar: string | null;
    customModelInput?: boolean;
    models: ModelEntry[];
}

export interface ProviderEntry extends ProviderCatalogEntry {
    available: boolean;
    unavailableReason?: string;
}
