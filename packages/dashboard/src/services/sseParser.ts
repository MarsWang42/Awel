import type { ParsedMessage, ResultSubtype } from '../types/messages'

/** Coerce an unknown value into a readable string. */
function stringify(value: unknown): string {
    if (typeof value === 'string') return value
    if (value instanceof Error) return value.message
    try { return JSON.stringify(value) } catch { return String(value) }
}

/**
 * Parses raw SSE event data into a partial ParsedMessage.
 * Pure function with no React dependencies.
 */
export function parseSSEData(eventType: string, rawData: string): Partial<ParsedMessage> | null {
    try {
        const data = JSON.parse(rawData)

        // Handle different event types
        switch (eventType) {
            case 'user':
                // User message from history
                return { type: 'user', text: data.text }

            case 'status':
                return { type: 'status', text: data.message }

            case 'text': {
                // Assistant message - extract text from content array
                if (data.type === 'assistant' && data.message?.content) {
                    const textContent = data.message.content
                        .filter((c: { type: string }) => c.type === 'text')
                        .map((c: { text: string }) => c.text)
                        .join('')
                    return { type: 'text', text: textContent, model: data.message?.model }
                }
                return { type: 'text', text: stringify(data.message || data.text || rawData) }
            }

            case 'tool_use': {
                // Tool invocation
                return {
                    type: 'tool_use',
                    toolName: data.tool || data.name,
                    toolInput: data.input,
                }
            }

            case 'tool_result': {
                // Tool result now comes with content field from server
                const content = data.content || data.result
                const result = typeof content === 'string' ? content : JSON.stringify(content)
                return {
                    type: 'tool_result',
                    toolName: data.tool,
                    toolOutput: result,
                    isError: data.is_error || data.subtype?.startsWith('error'),
                }
            }

            case 'result': {
                // SDK result message with subtypes
                const errors = Array.isArray(data.errors)
                    ? data.errors.map(stringify)
                    : data.errors ? [stringify(data.errors)] : undefined
                return {
                    type: 'result',
                    resultSubtype: data.subtype as ResultSubtype,
                    resultText: data.result,
                    resultErrors: errors,
                    numTurns: data.num_turns,
                    durationMs: data.duration_ms,
                    totalCostUsd: data.total_cost_usd,
                    fileStats: data.file_stats,
                    isError: data.is_error || data.subtype !== 'success',
                }
            }

            case 'message': {
                // System/init message
                if (data.type === 'system' && data.subtype === 'init') {
                    return {
                        type: 'system',
                        model: data.model,
                        tools: data.tools,
                    }
                }
                // Compact boundary message
                if (data.type === 'system' && data.subtype === 'compact_boundary') {
                    return {
                        type: 'compact_boundary',
                        compactTrigger: data.compact_metadata?.trigger,
                        preTokens: data.compact_metadata?.pre_tokens,
                    }
                }
                // Result message
                if (data.type === 'result') {
                    const msgErrors = Array.isArray(data.errors)
                        ? data.errors.map(stringify)
                        : data.errors ? [stringify(data.errors)] : undefined
                    return {
                        type: 'result',
                        resultSubtype: data.subtype as ResultSubtype,
                        resultText: data.result,
                        resultErrors: msgErrors,
                        numTurns: data.num_turns,
                        durationMs: data.duration_ms,
                        totalCostUsd: data.total_cost_usd,
                        fileStats: data.file_stats,
                        isError: data.is_error || data.subtype !== 'success',
                    }
                }
                // Other messages - try to extract useful info
                if (data.message?.content) {
                    const textContent = data.message.content
                        .filter((c: { type: string }) => c.type === 'text')
                        .map((c: { text: string }) => c.text)
                        .join('')
                    if (textContent) {
                        return { type: 'text', text: textContent }
                    }
                }
                return null
            }

            case 'plan':
                return {
                    type: 'plan',
                    planId: data.planId,
                    planTitle: data.planTitle,
                    planContent: data.planContent,
                }

            case 'question':
                return {
                    type: 'question',
                    questionId: data.questionId,
                    questions: data.questions,
                }

            case 'done':
                return { type: 'done', text: data.message }

            case 'error':
                return { type: 'error', text: stringify(data.message || 'Unknown error') }

            default:
                return null
        }
    } catch {
        // If JSON parsing fails, return raw text
        return { type: 'text', text: rawData }
    }
}
