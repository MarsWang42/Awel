import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createElement } from 'react'
import {
    AssistantMessage,
    UserMessage,
    StatusMessage,
    ToolUseMessage,
    ToolResultMessage,
    SystemInfoMessage,
    ErrorMessage,
    CompactBoundaryMessage,
    ResultMessage,
    PlanMessage,
    QuestionMessage,
    ConfirmMessage,
} from '../components/chat'
import { ToolGroup } from '../components/chat/ToolGroup'
import type { ParsedMessage, SelectedElement, ConsoleEntry, ContentSegment, PageContext } from '../types/messages'
import { parseSSEData } from '../services/sseParser'
import { buildInspectorContext, buildMultiElementContext } from './inspectorHelpers'

export interface ElementAttachEvent {
    element: SelectedElement
    suggestedText?: string
    clearExisting?: boolean
}

export function useConsole(selectedModel: string, selectedModelProvider: string, onReviewDiffs?: (diffs: import('../components/DiffModal').FileDiff[]) => void) {
    const [messages, setMessages] = useState<ParsedMessage[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [waitingForInput, setWaitingForInput] = useState(false)
    const [aborted, setAborted] = useState(false)
    const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
    const [attachedConsoleEntries, setAttachedConsoleEntries] = useState<ConsoleEntry[]>([])
    const [imageAttachments, setImageAttachments] = useState<{ dataUrl: string; mediaType: string; name: string }[]>([])
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const eventSourceRef = useRef<EventSource | null>(null)
    // Track last tool name for tool_result messages
    const lastToolNameRef = useRef<string | undefined>(undefined)
    // Callback ref: Console sets this to receive element attach events
    const onElementAttachedRef = useRef<((event: ElementAttachEvent) => void) | null>(null)
    // Callback ref: Console sets this for image preview clicks
    const onImageClickRef = useRef<((images: string[], index: number) => void) | null>(null)
    // Ref for reading attachedConsoleEntries inside stable callbacks
    const attachedConsoleEntriesRef = useRef<ConsoleEntry[]>([])
    // Page context from the host (ref — no re-renders needed)
    const pageContextRef = useRef<PageContext | null>(null)

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Report full document height to the host so the popover can grow
    useEffect(() => {
        const height = document.documentElement.scrollHeight
        window.parent.postMessage({ type: 'AWEL_RESIZE', height }, '*')
    }, [messages, isLoading, consoleEntries])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            eventSourceRef.current?.close()
        }
    }, [])

    // Load chat history on mount
    useEffect(() => {
        async function loadHistory() {
            try {
                const res = await fetch('/api/chat/history')
                const data = await res.json()
                if (data.history && Array.isArray(data.history)) {
                    const parsedMessages: ParsedMessage[] = []
                    let lastToolName: string | undefined

                    for (const item of data.history) {
                        // Skip metadata-only events — they're handled in the second pass below
                        if (item.eventType === 'confirm_resolved' || item.eventType === 'question_answered' || item.eventType === 'plan_approved') continue

                        const parsed = parseSSEData(item.eventType, item.data)
                        if (parsed) {
                            // Track tool name for result pairing
                            if (parsed.toolName) {
                                lastToolName = parsed.toolName
                            }
                            if (parsed.type === 'tool_result' && !parsed.toolName) {
                                parsed.toolName = lastToolName
                            }

                            parsedMessages.push({
                                id: item.id || crypto.randomUUID(),
                                type: parsed.type || 'text',
                                timestamp: new Date(item.timestamp || Date.now()),
                                ...parsed,
                            } as ParsedMessage)
                        }
                    }
                    // Collect question IDs that were answered (from persisted question_answered events)
                    const answeredIds = new Set<string>()
                    for (const item of data.history) {
                        if (item.eventType === 'question_answered') {
                            try {
                                const d = JSON.parse(item.data)
                                if (d.questionId) answeredIds.add(d.questionId)
                            } catch {}
                        }
                    }
                    for (const msg of parsedMessages) {
                        if (msg.type === 'question' && msg.questionId && answeredIds.has(msg.questionId)) {
                            msg.answered = true
                        }
                    }

                    // Resolve confirm messages from persisted confirm_resolved events
                    const resolvedConfirms = new Map<string, boolean>()
                    for (const item of data.history) {
                        if (item.eventType === 'confirm_resolved') {
                            try {
                                const d = JSON.parse(item.data)
                                if (d.confirmId) resolvedConfirms.set(d.confirmId, d.approved)
                            } catch {}
                        }
                    }
                    for (const msg of parsedMessages) {
                        if (msg.type === 'confirm' && msg.confirmId && resolvedConfirms.has(msg.confirmId)) {
                            msg.confirmResolved = true
                            msg.confirmApproved = resolvedConfirms.get(msg.confirmId)
                        }
                    }

                    // Resolve plan messages from persisted plan_approved events
                    const approvedPlanIds = new Set<string>()
                    for (const item of data.history) {
                        if (item.eventType === 'plan_approved') {
                            try {
                                const d = JSON.parse(item.data)
                                if (d.planId) approvedPlanIds.add(d.planId)
                            } catch {}
                        }
                    }
                    for (const msg of parsedMessages) {
                        if (msg.type === 'plan' && msg.planId && approvedPlanIds.has(msg.planId)) {
                            msg.planApproved = true
                        }
                    }

                    setMessages(parsedMessages)

                    // Check if there's an active stream we should reconnect to
                    try {
                        const statusRes = await fetch('/api/stream/status')
                        const statusData = await statusRes.json()
                        if (statusData.active) {
                            setIsLoading(true)
                            connectEventSourceRef.current('/api/stream?reconnect=1')
                        }
                    } catch {
                        // Status check failed, no reconnection
                    }
                }
            } catch {
                // History not available, start fresh
            }
        }
        loadHistory()
    }, [])

    // Listen for console entries from the host script
    useEffect(() => {
        function handleMessage(event: MessageEvent) {
            if (event.data?.type === 'AWEL_CONSOLE_ENTRIES') {
                const entries = event.data.entries as ConsoleEntry[]
                setConsoleEntries(entries)
                // Tell the host we've seen the entries so the dot clears
                window.parent.postMessage({ type: 'AWEL_CONSOLE_VIEWED' }, '*')
            }
        }
        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    // Listen for page context updates from the host script
    useEffect(() => {
        function handleMessage(event: MessageEvent) {
            if (event.data?.type === 'AWEL_PAGE_CONTEXT') {
                pageContextRef.current = event.data.context as PageContext
            }
        }
        window.addEventListener('message', handleMessage)
        // Request initial page context from the host
        window.parent.postMessage({ type: 'AWEL_REQUEST_PAGE_CONTEXT' }, '*')
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    const handleConsoleEntryClick = useCallback((entry: ConsoleEntry) => {
        setAttachedConsoleEntries(prev => {
            if (prev.some(e => e.id === entry.id)) return prev
            return [...prev, entry]
        })
        // Remove from the console list so it's clear it moved
        setConsoleEntries(prev => prev.filter(e => e.id !== entry.id))
        window.parent.postMessage({ type: 'AWEL_CONSOLE_DISMISS', id: entry.id }, '*')
    }, [])

    const removeAttachedConsoleEntry = useCallback((id: string) => {
        setAttachedConsoleEntries(prev => {
            const entry = prev.find(e => e.id === id)
            // Put it back in the console list
            if (entry) {
                setConsoleEntries(list => [...list, entry])
            }
            return prev.filter(e => e.id !== id)
        })
    }, [])

    const reattachConsoleEntry = useCallback((entry: ConsoleEntry) => {
        setAttachedConsoleEntries(prev => {
            if (prev.some(e => e.id === entry.id)) return prev
            return [...prev, entry]
        })
    }, [])

    const dismissConsoleEntry = useCallback((id: string) => {
        setConsoleEntries(prev => prev.filter(e => e.id !== id))
        window.parent.postMessage({ type: 'AWEL_CONSOLE_DISMISS', id }, '*')
    }, [])

    const clearConsoleEntries = useCallback(() => {
        setConsoleEntries([])
        window.parent.postMessage({ type: 'AWEL_CONSOLE_CLEAR' }, '*')
    }, [])

    // Keep ref in sync for use inside stable callbacks
    useEffect(() => { attachedConsoleEntriesRef.current = attachedConsoleEntries }, [attachedConsoleEntries])

    const addParsedMessage = useCallback((parsed: Partial<ParsedMessage>) => {
        const id = crypto.randomUUID()
        setMessages(prev => [...prev, {
            id,
            type: parsed.type || 'text',
            timestamp: new Date(),
            ...parsed,
        } as ParsedMessage])
        return id
    }, [])

    const addUserMessage = useCallback((text: string, opts?: {
        imageUrls?: string[]
        consoleEntries?: ConsoleEntry[]
        attachedElements?: SelectedElement[]
        contentSegments?: ContentSegment[]
    }) => {
        // Store to server for persistence
        fetch('/api/chat/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventType: 'user', data: JSON.stringify({ type: 'user', text }) }),
        }).catch(() => { /* ignore persistence errors */ })

        return addParsedMessage({
            type: 'user',
            text,
            imageUrls: opts?.imageUrls,
            consoleEntries: opts?.consoleEntries,
            attachedElements: opts?.attachedElements,
            contentSegments: opts?.contentSegments,
        })
    }, [addParsedMessage])

    // ─── SSE Handler ─────────────────────────────────────────

    const handleSSEEvent = useCallback((eventType: string) => {
        return (e: MessageEvent) => {
            const parsed = parseSSEData(eventType, e.data || '')
            if (parsed) {
                // Track tool name for result pairing
                if (parsed.toolName) {
                    lastToolNameRef.current = parsed.toolName
                }
                if (parsed.type === 'tool_result' && !parsed.toolName) {
                    parsed.toolName = lastToolNameRef.current
                }

                // Plan/question events mean the agent is waiting for user input
                if (parsed.type === 'plan' || parsed.type === 'question') {
                    setWaitingForInput(true)
                }

                // confirm_resolved updates an existing confirm message in-place
                if (parsed.type === 'confirm' && parsed.confirmResolved && parsed.confirmId) {
                    setMessages(prev => prev.map(m =>
                        m.type === 'confirm' && m.confirmId === parsed.confirmId
                            ? { ...m, confirmResolved: true, confirmApproved: parsed.confirmApproved }
                            : m
                    ))
                    return
                }

                const shouldClearStatus = parsed.type && ['text', 'tool_use', 'tool_result', 'result', 'plan', 'question', 'confirm'].includes(parsed.type)

                setMessages(prev => {
                    const base = shouldClearStatus ? prev.filter(m => m.type !== 'status') : prev

                    // Merge consecutive text events for smooth streaming
                    if (parsed.type === 'text' && parsed.text) {
                        const last = base[base.length - 1]
                        if (last && last.type === 'text') {
                            const updated = [...base]
                            updated[updated.length - 1] = {
                                ...last,
                                text: (last.text || '') + parsed.text,
                            }
                            return updated
                        }
                    }

                    return [...base, {
                        id: crypto.randomUUID(),
                        type: parsed.type || 'text',
                        timestamp: new Date(),
                        ...parsed,
                    } as ParsedMessage]
                })
            }
        }
    }, [])

    const handleErrorEvent = useCallback((e: Event) => {
        if (e instanceof MessageEvent) {
            addParsedMessage({ type: 'error', text: e.data || 'Connection error' })
        } else {
            addParsedMessage({ type: 'error', text: 'Connection lost' })
        }
        setIsLoading(false)
    }, [addParsedMessage])

    // ─── Stream Helper ──────────────────────────────────────

    const SSE_EVENT_TYPES = ['text', 'tool_use', 'tool_result', 'status', 'plan', 'question', 'confirm', 'confirm_resolved', 'result', 'message'] as const

    const connectEventSource = useCallback((url: string) => {
        eventSourceRef.current?.close()

        const es = new EventSource(url)
        eventSourceRef.current = es

        for (const type of SSE_EVENT_TYPES) {
            es.addEventListener(type, handleSSEEvent(type))
        }

        es.addEventListener('done', (e) => {
            handleSSEEvent('done')(e as MessageEvent)
            es.close()
            eventSourceRef.current = null
            setIsLoading(false)
        })

        es.addEventListener('error', (e) => {
            if (e instanceof MessageEvent) {
                // Server-sent error event (has data)
                handleSSEEvent('error')(e)
            } else {
                // Connection error — close and report
                es.close()
                eventSourceRef.current = null
                handleErrorEvent(e)
            }
        })

        return es
    }, [handleSSEEvent, handleErrorEvent])

    // Ref so the mount effect can call the latest connectEventSource without re-running
    const connectEventSourceRef = useRef(connectEventSource)
    useEffect(() => { connectEventSourceRef.current = connectEventSource }, [connectEventSource])

    const startStream = useCallback((prompt: string, consoleEntries?: ConsoleEntry[], images?: string[]) => {
        setIsLoading(true)
        setWaitingForInput(false)
        setAborted(false)

        // Open SSE listener first, then trigger the LLM via POST
        const es = connectEventSource('/api/stream')

        es.onopen = () => {
            // Connection established — now send the prompt
            const body: Record<string, unknown> = { prompt, model: selectedModel, modelProvider: selectedModelProvider }
            if (consoleEntries && consoleEntries.length > 0) {
                body.consoleEntries = consoleEntries
            }
            if (images && images.length > 0) {
                body.images = images
            }
            if (pageContextRef.current) {
                body.pageContext = pageContextRef.current
            }

            fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            }).catch(() => {
                es.close()
                eventSourceRef.current = null
                handleErrorEvent(new Event('error'))
            })
        }
    }, [selectedModel, selectedModelProvider, connectEventSource, handleErrorEvent])

    // Listen for element selections from the host inspector via SSE
    useEffect(() => {
        const es = new EventSource('/api/inspector/events')

        es.addEventListener('selection', (e: MessageEvent) => {
            try {
                const sel = JSON.parse(e.data) as SelectedElement

                if (sel.mode === 'attach') {
                    // Attach mode: insert element chip, no auto-submit
                    onElementAttachedRef.current?.({ element: sel })
                } else if (sel.comment?.trim()) {
                    // Auto-submit: build inspector context + comment and stream to LLM
                    const context = buildInspectorContext(sel)
                    const augmentedPrompt = context + '\n\n' + sel.comment
                    addUserMessage(sel.comment, { attachedElements: [sel] })
                    startStream(augmentedPrompt)
                } else {
                    // No comment: replace chips, attach element, auto-suggest a prompt
                    const name = sel.component || `<${sel.tag}>`
                    const hasUndefinedProps = sel.props && Object.values(sel.props).some(
                        (v: string) => v === 'undefined' || v === 'null'
                    )
                    const suggestedText = hasUndefinedProps
                        ? `Why is ${name} receiving undefined props?`
                        : `Explain what ${name} does and how I can modify it.`
                    onElementAttachedRef.current?.({ element: sel, suggestedText, clearExisting: true })
                }
            } catch {
                // Malformed event data, ignore
            }
        })

        return () => es.close()
    }, [addUserMessage, startStream])

    // ─── Stop Stream ────────────────────────────────────────

    const stopStream = useCallback(() => {
        fetch('/api/stream/abort', { method: 'POST' }).catch(() => {})
        eventSourceRef.current?.close()
        eventSourceRef.current = null
        setIsLoading(false)
        setWaitingForInput(false)
        setAborted(true)
        setMessages(prev => prev.filter(m => m.type !== 'status'))
    }, [])

    // ─── Submit ──────────────────────────────────────────────

    const removeImageAttachment = useCallback((index: number) => {
        setImageAttachments(prev => prev.filter((_, i) => i !== index))
    }, [])

    const submitMessage = useCallback((text: string, opts?: {
        elements?: SelectedElement[]
        imageDataUrls?: string[]
        contentSegments?: ContentSegment[]
    }) => {
        // Capture and clear console entries
        const entriesToSend = attachedConsoleEntriesRef.current.length > 0 ? [...attachedConsoleEntriesRef.current] : undefined
        if (entriesToSend) setAttachedConsoleEntries([])

        // Clear images
        if (opts?.imageDataUrls && opts.imageDataUrls.length > 0) setImageAttachments([])

        // Augment prompt with attached element context
        let augmentedPrompt = text
        if (opts?.elements && opts.elements.length > 0) {
            augmentedPrompt = buildMultiElementContext(opts.elements) + '\n\n' + augmentedPrompt
        }

        addUserMessage(text, {
            imageUrls: opts?.imageDataUrls,
            consoleEntries: entriesToSend,
            attachedElements: opts?.elements,
            contentSegments: opts?.contentSegments,
        })
        startStream(augmentedPrompt, entriesToSend, opts?.imageDataUrls)
    }, [addUserMessage, startStream])

    // ─── Plan Handlers ───────────────────────────────────────

    const handlePlanApprove = useCallback(async (planId: string, autoApprove?: boolean) => {
        // Mark plan as approved in state
        setMessages(prev => prev.map(m =>
            m.type === 'plan' && m.planId === planId
                ? { ...m, planApproved: true }
                : m
        ))

        // Persist approved state for history reload
        fetch('/api/chat/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                eventType: 'plan_approved',
                data: JSON.stringify({ planId }),
            }),
        }).catch(() => {})

        await fetch('/api/plan/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ autoApprove: autoApprove || false }),
        })
        const res = await fetch('/api/plan/active')
        const data = await res.json()
        const plan = data.plan
        if (!plan) return

        const executionPrompt =
            `The user has approved the following plan. Execute it now.\n\n` +
            `## ${plan.plan.title}\n\n${plan.plan.content}\n\n` +
            `Original request: ${plan.originalPrompt}`

        startStream(executionPrompt)
    }, [startStream])

    const handlePlanComment = useCallback(async (planId: string, comment: string) => {
        await fetch('/api/plan/comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId, comment }),
        })

        addUserMessage(comment)

        const revisionPrompt =
            `The user provided feedback on your proposed plan. Please revise the plan based on their feedback and call ProposePlan again with the updated plan.\n\n` +
            `User feedback: ${comment}`

        startStream(revisionPrompt)
    }, [startStream, addUserMessage])

    // ─── Question Handler ────────────────────────────────────

    const handleQuestionAnswer = useCallback((_questionId: string, answers: Record<string, string[]>) => {
        // Mark the question message as answered
        setMessages(prev => prev.map(m =>
            m.type === 'question' && m.questionId === _questionId
                ? { ...m, answered: true }
                : m
        ))

        // Persist answered state so it survives page refresh
        fetch('/api/chat/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                eventType: 'question_answered',
                data: JSON.stringify({ questionId: _questionId }),
            }),
        }).catch(() => {})

        // Build a readable summary of the user's selections
        const lines = Object.entries(answers).map(([header, selected]) =>
            `**${header}**: ${selected.join(', ')}`
        )
        const summary = lines.join('\n')

        const answerPrompt =
            `The user answered your clarifying questions. Here are their selections:\n\n` +
            `${summary}\n\n` +
            `Please proceed based on these answers.`

        startStream(answerPrompt)
    }, [startStream])

    // ─── Confirm Handler ─────────────────────────────────────

    const handleConfirmResponse = useCallback((confirmId: string, approved: boolean, opts?: { allowAll?: boolean; category?: string }) => {
        // Optimistically update the message state
        setMessages(prev => prev.map(m =>
            m.type === 'confirm' && m.confirmId === confirmId
                ? { ...m, confirmResolved: true, confirmApproved: approved }
                : m
        ))

        fetch('/api/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                confirmId,
                approved,
                allowAll: opts?.allowAll || false,
                category: opts?.category,
            }),
        }).catch(() => {})
    }, [])

    const handleUndone = useCallback((msgId: string) => {
        setMessages(prev => prev.map(m =>
            m.id === msgId ? { ...m, undone: true } : m
        ))
    }, [])

    // ─── Render ──────────────────────────────────────────────

    const renderedMessages = useMemo(() => {
        const elements: React.ReactNode[] = []
        let i = 0

        // Find the last result message with file changes so only it gets Review/Undo buttons
        let lastResultIndex = -1
        for (let j = messages.length - 1; j >= 0; j--) {
            if (messages[j].type === 'result' && messages[j].fileStats?.length && !messages[j].undone) {
                lastResultIndex = j
                break
            }
        }

        while (i < messages.length) {
            const msg = messages[i]

            // Group consecutive tool_use / tool_result messages
            if (msg.type === 'tool_use' || msg.type === 'tool_result') {
                const groupMessages: ParsedMessage[] = []
                while (i < messages.length && (messages[i].type === 'tool_use' || messages[i].type === 'tool_result')) {
                    groupMessages.push(messages[i])
                    i++
                }
                const toolUseCount = groupMessages.filter(m => m.type === 'tool_use').length

                const children = groupMessages.map(m => {
                    if (m.type === 'tool_use') {
                        return createElement(ToolUseMessage, {
                            key: m.id,
                            toolName: m.toolName || 'Tool',
                            input: m.toolInput,
                        })
                    }
                    return createElement(ToolResultMessage, {
                        key: m.id,
                        toolName: m.toolName,
                        output: m.toolOutput,
                        isError: m.isError,
                    })
                })

                elements.push(
                    createElement(ToolGroup, {
                        key: `tool-group-${groupMessages[0].id}`,
                        toolCount: toolUseCount,
                        children,
                    })
                )
                continue
            }

            // Render non-tool messages
            let element: React.ReactNode = null
            switch (msg.type) {
                case 'user':
                    element = createElement(UserMessage, {
                        key: msg.id,
                        content: msg.text || '',
                        imageUrls: msg.imageUrls,
                        consoleEntries: msg.consoleEntries,
                        attachedElements: msg.attachedElements,
                        contentSegments: msg.contentSegments,
                        onConsoleEntryClick: reattachConsoleEntry,
                        onImageClick: (images: string[], index: number) => onImageClickRef.current?.(images, index),
                    })
                    break
                case 'status':
                    element = createElement(StatusMessage, { key: msg.id, text: msg.text || '' })
                    break
                case 'text':
                    element = msg.text ? createElement(AssistantMessage, { key: msg.id, text: msg.text }) : null
                    break
                case 'system':
                    element = createElement(SystemInfoMessage, { key: msg.id, model: msg.model, tools: msg.tools })
                    break
                case 'compact_boundary':
                    element = createElement(CompactBoundaryMessage, { key: msg.id, trigger: msg.compactTrigger, preTokens: msg.preTokens })
                    break
                case 'plan':
                    element = createElement(PlanMessage, {
                        key: msg.id,
                        planId: msg.planId || '',
                        title: msg.planTitle || 'Plan',
                        content: msg.planContent || '',
                        onApprove: handlePlanApprove,
                        onComment: handlePlanComment,
                        disabled: aborted,
                        approved: msg.planApproved,
                    })
                    break
                case 'question':
                    element = msg.questions ? createElement(QuestionMessage, {
                        key: msg.id,
                        questionId: msg.questionId || '',
                        questions: msg.questions,
                        onAnswer: handleQuestionAnswer,
                        disabled: aborted,
                        answered: msg.answered,
                    }) : null
                    break
                case 'confirm':
                    element = msg.confirmId ? createElement(ConfirmMessage, {
                        key: msg.id,
                        confirmId: msg.confirmId,
                        toolName: msg.confirmToolName || 'Tool',
                        summary: msg.confirmSummary || '',
                        details: msg.confirmDetails,
                        resolved: msg.confirmResolved,
                        approved: msg.confirmApproved,
                        onConfirm: handleConfirmResponse,
                        disabled: aborted,
                    }) : null
                    break
                case 'result':
                    element = createElement(ResultMessage, {
                        key: msg.id,
                        msgId: msg.id,
                        subtype: msg.resultSubtype || 'success',
                        result: msg.resultText,
                        errors: msg.resultErrors,
                        numTurns: msg.numTurns,
                        durationMs: msg.durationMs,
                        totalCostUsd: msg.totalCostUsd,
                        inputTokens: msg.inputTokens,
                        outputTokens: msg.outputTokens,
                        cacheReadTokens: msg.cacheReadTokens,
                        cacheWriteTokens: msg.cacheWriteTokens,
                        fileStats: msg.fileStats,
                        undone: msg.undone,
                        isLatest: i === lastResultIndex,
                        onReviewDiffs,
                        onUndone: handleUndone,
                    })
                    break
                case 'error':
                    element = createElement(ErrorMessage, { key: msg.id, text: msg.text || 'Unknown error' })
                    break
                case 'done':
                default:
                    break
            }
            if (element) elements.push(element)
            i++
        }

        return elements
    }, [messages, handlePlanApprove, handlePlanComment, handleQuestionAnswer, handleConfirmResponse, reattachConsoleEntry, onReviewDiffs, aborted])

    return {
        messages,
        isLoading,
        waitingForInput,
        onElementAttachedRef,
        onImageClickRef,
        submitMessage,
        stopStream,
        messagesEndRef,
        renderedMessages,
        consoleEntries,
        handleConsoleEntryClick,
        dismissConsoleEntry,
        clearConsoleEntries,
        attachedConsoleEntries,
        removeAttachedConsoleEntry,
        imageAttachments,
        setImageAttachments,
        removeImageAttachment,
    }
}
