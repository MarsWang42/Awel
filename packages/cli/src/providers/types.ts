import type { SSEStreamingApi } from 'hono/streaming';
import type { ModelMessage, AssistantModelMessage, ToolModelMessage } from 'ai';

export type ResponseMessage = AssistantModelMessage | ToolModelMessage;

export interface ProviderConfig {
    projectCwd: string;
    targetPort: number;
    /** When aborted, the provider should stop the LLM stream and exit early. */
    signal?: AbortSignal;
}

export interface StreamProvider {
    streamResponse(
        stream: SSEStreamingApi,
        messages: ModelMessage[],
        config: ProviderConfig
    ): Promise<ResponseMessage[]>;
}

export interface ModelDefinition {
    id: string;
    label: string;
    provider: 'claude-code' | 'anthropic' | 'openai' | 'google-ai' | 'vercel-gateway' | 'qwen' | 'minimax';
}
