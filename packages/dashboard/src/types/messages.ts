export type MessageType = 'text' | 'tool_use' | 'tool_result' | 'error' | 'status' | 'stream' | 'done' | 'system' | 'user' | 'compact_boundary' | 'result' | 'plan' | 'question'

export type ResultSubtype = 'success' | 'waiting_for_input' | 'error_max_turns' | 'error_during_execution' | 'error_max_budget_usd' | 'error_max_structured_output_retries'

export interface ParsedMessage {
    id: string
    type: MessageType
    timestamp: Date
    // Parsed content based on type
    text?: string
    toolName?: string
    toolInput?: Record<string, unknown>
    toolOutput?: string
    isError?: boolean
    model?: string
    tools?: string[]
    raw?: unknown
    // Result message fields
    resultSubtype?: ResultSubtype
    resultText?: string
    resultErrors?: string[]
    numTurns?: number
    durationMs?: number
    totalCostUsd?: number
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    fileStats?: Array<{ relativePath: string; additions: number; deletions: number; isNew: boolean }>
    undone?: boolean
    // Compact boundary fields
    compactTrigger?: 'manual' | 'auto'
    preTokens?: number
    // Attachments
    imageUrls?: string[]
    consoleEntries?: ConsoleEntry[]
    attachedElements?: SelectedElement[]
    contentSegments?: ContentSegment[]
    // Plan fields
    planId?: string
    planTitle?: string
    planContent?: string
    // Question fields
    answered?: boolean
    questionId?: string
    questions?: Array<{
        question: string
        header: string
        multiSelect: boolean
        options: Array<{ label: string; description: string }>
    }>
}

export interface SelectedElement {
    tag: string
    component: string | null
    source: string | null
    text: string
    className: string
    line: number | null
    column: number | null
    props: Record<string, string> | null
    componentChain: string[] | null
    attributes: Record<string, string> | null
    comment?: string
    mode?: 'attach'
    // Enrichment fields (populated server-side)
    sourceSnippet?: string | null
    propsTypeDefinition?: string | null
}

export interface SourceFrame {
    source: string
    line?: number
    column?: number
}

export interface ConsoleEntry {
    id: string
    level: 'error' | 'warning'
    message: string
    source?: string
    line?: number
    column?: number
    sourceTrace?: SourceFrame[]
    stack?: string
    timestamp: number
    count: number
}

export interface PageContext {
    url: string
    title: string
    routeComponent?: string
}

export type ContentSegment =
    | { type: 'text'; text: string }
    | { type: 'element'; elementIndex: number }
