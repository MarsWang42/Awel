import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, Minimize2, Loader2, ChevronLeft, Sun, Moon, AlertCircle, RotateCcw, Clock, Zap, FileText } from 'lucide-react'
import { Button } from './ui/button'
import { Console } from './Console'
import { DiffModal, type FileDiff } from './DiffModal'
import { useTheme } from '../hooks/useTheme'
import type { ConsoleEntry } from '../types/messages'

interface ComparisonRun {
    id: string
    branchName: string
    modelId: string
    modelLabel: string
    modelProvider: string
    providerLabel: string
    status: 'building' | 'success' | 'failed'
    prompt: string
    createdAt: string
    duration?: number // in milliseconds
    tokenUsage?: {
        input: number
        output: number
    }
}

interface ComparisonState {
    runs: ComparisonRun[]
    activeRunId: string | null
    phase: 'initial' | 'building' | 'comparing' | null
    originalPrompt?: string
}

interface ProviderEntry {
    id: string
    label: string
    color: string
    available: boolean
    models: { id: string; label: string }[]
}

export function ComparisonView() {
    const { t } = useTranslation()
    const { resolvedTheme, setTheme } = useTheme()
    const [comparisonState, setComparisonState] = useState<ComparisonState | null>(null)
    // Always start expanded on page load
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
    const [editedPrompt, setEditedPrompt] = useState('')
    const [providers, setProviders] = useState<ProviderEntry[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [reviewDiffs, setReviewDiffs] = useState<FileDiff[] | null>(null)
    const [chatKey, setChatKey] = useState(0)
    const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])

    // Get active run's model info for chat
    const activeRun = comparisonState?.runs.find(r => r.id === comparisonState.activeRunId)
    const selectedModel = activeRun?.modelId || ''
    const selectedModelProvider = activeRun?.modelProvider || ''

    // Fetch comparison state on mount
    useEffect(() => {
        async function fetchState() {
            try {
                const res = await fetch('/api/comparison/runs')
                const data = await res.json()
                if (data.phase === 'comparing' && data.runs) {
                    setComparisonState(data)
                    if (data.originalPrompt) {
                        setEditedPrompt(data.originalPrompt)
                    }
                }
            } catch {
                // Not in comparison mode
            }
        }
        fetchState()
    }, [])

    // Fetch providers for model selector
    useEffect(() => {
        async function fetchProviders() {
            try {
                const res = await fetch('/api/models')
                const data = await res.json()
                if (data.providers) {
                    setProviders(data.providers.filter((p: ProviderEntry) => p.available))
                }
            } catch {
                // API not available
            }
        }
        fetchProviders()
    }, [])


    // Notify parent of theme changes
    useEffect(() => {
        window.parent.postMessage({ type: 'AWEL_THEME', theme: resolvedTheme }, '*')
    }, [resolvedTheme])

    // Listen for console entries from host script (always, not just when chat is open)
    useEffect(() => {
        function handleMessage(event: MessageEvent) {
            if (event.data?.type === 'AWEL_CONSOLE_ENTRIES') {
                const entries = event.data.entries as ConsoleEntry[]
                setConsoleEntries(entries)
                window.parent.postMessage({ type: 'AWEL_CONSOLE_VIEWED' }, '*')
            }
        }
        window.addEventListener('message', handleMessage)
        // Request current console entries on mount (in case errors occurred before iframe loaded)
        window.parent.postMessage({ type: 'AWEL_REQUEST_CONSOLE_ENTRIES' }, '*')
        return () => window.removeEventListener('message', handleMessage)
    }, [])

    const handleSwitchRun = useCallback(async (runId: string) => {
        if (!comparisonState || runId === comparisonState.activeRunId) return
        const run = comparisonState.runs.find(r => r.id === runId)
        if (!run || run.status === 'building') return

        try {
            const res = await fetch(`/api/comparison/runs/${runId}/switch`, { method: 'POST' })
            const data = await res.json()
            if (data.success) {
                // Tell parent to reload to show the new branch's app content
                window.parent.postMessage({ type: 'AWEL_NAVIGATE', action: 'reload' }, '*')
            }
        } catch {
            // Switch failed
        }
    }, [comparisonState])

    const handleSelectRun = useCallback(async () => {
        if (!comparisonState?.activeRunId) return
        try {
            const res = await fetch(`/api/comparison/runs/${comparisonState.activeRunId}/select`, { method: 'POST' })
            const data = await res.json()
            if (data.success) {
                // Tell parent to navigate to the app (comparison mode will be cleared)
                window.parent.postMessage({ type: 'AWEL_NAVIGATE', action: 'href', url: '/' }, '*')
            }
        } catch {
            // Select failed
        }
    }, [comparisonState])

    const handleTryAnother = useCallback(() => {
        setModelSelectorOpen(true)
    }, [])

    const handleNewModelSelect = useCallback(async (modelId: string, modelProvider: string, modelLabel: string, providerLabel: string) => {
        if (!comparisonState) return
        setModelSelectorOpen(false)

        // Use edited prompt if provided, otherwise use original
        const promptToUse = editedPrompt.trim() || comparisonState.originalPrompt

        try {
            const res = await fetch('/api/comparison/runs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modelId, modelLabel, modelProvider, providerLabel, prompt: promptToUse }),
            })
            const data = await res.json()
            if (data.success) {
                // Tell parent to navigate to creation mode for full-screen regeneration
                window.parent.postMessage({
                    type: 'AWEL_NAVIGATE',
                    action: 'href',
                    url: '/',
                    autoSubmit: data.autoSubmit
                }, '*')
            }
        } catch {
            // Create failed
        }
    }, [comparisonState, editedPrompt])

    const handleOpenChat = useCallback(() => {
        setIsChatOpen(true)
        setIsCollapsed(true)
        // Tell parent to expand iframe for chat
        window.parent.postMessage({ type: 'AWEL_COMPARISON_EXPAND' }, '*')
    }, [])

    const handleCloseChat = useCallback(() => {
        setIsChatOpen(false)
        setIsCollapsed(false)
        // Tell parent to collapse iframe back to small size
        window.parent.postMessage({ type: 'AWEL_COMPARISON_COLLAPSE' }, '*')
    }, [])

    const handleToggleCollapse = useCallback(() => {
        if (isChatOpen) {
            // Close chat when collapsing from chat view
            setIsChatOpen(false)
        }
        setIsCollapsed(prev => !prev)
    }, [isChatOpen])

    const handleReviewOpen = useCallback((diffs: FileDiff[]) => {
        setReviewDiffs(diffs)
        window.parent.postMessage({ type: 'AWEL_HIDE_CONTROLS' }, '*')
    }, [])

    const handleReviewClose = useCallback(() => {
        setReviewDiffs(null)
        window.parent.postMessage({ type: 'AWEL_SHOW_CONTROLS' }, '*')
    }, [])

    const handleToggleTheme = useCallback(() => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }, [resolvedTheme, setTheme])

    const handleConsoleEntryClick = useCallback((entry: ConsoleEntry) => {
        // Open chat and let the user discuss the error
        setIsChatOpen(true)
        setIsCollapsed(true)
        window.parent.postMessage({ type: 'AWEL_COMPARISON_EXPAND' }, '*')
    }, [])

    const dismissConsoleEntry = useCallback((id: string) => {
        setConsoleEntries(prev => prev.filter(e => e.id !== id))
        window.parent.postMessage({ type: 'AWEL_CONSOLE_DISMISS', id }, '*')
    }, [])

    const clearConsoleEntries = useCallback(() => {
        setConsoleEntries([])
        window.parent.postMessage({ type: 'AWEL_CONSOLE_CLEAR' }, '*')
    }, [])

    // Don't render if not in comparison mode
    if (!comparisonState || comparisonState.phase !== 'comparing') {
        return null
    }

    const hasBuilding = comparisonState.runs.some(r => r.status === 'building')
    const canTryAnother = !hasBuilding && comparisonState.runs.length < 5
    const canUseVersion = !!comparisonState.activeRunId && !hasBuilding

    // Find most recent run (the one with current chat history)
    const sortedRuns = [...comparisonState.runs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    const mostRecentRun = sortedRuns[0]
    const showChatButton = mostRecentRun && comparisonState.activeRunId === mostRecentRun.id

    // Get used models for marking in selector
    const usedModelKeys = new Set(comparisonState.runs.map(r => `${r.modelProvider}:${r.modelId}`))

    // All available models with used flag
    const allModels = providers.flatMap(p =>
        p.models.map(m => ({
            ...m,
            provider: p,
            isUsed: usedModelKeys.has(`${p.id}:${m.id}`),
            existingRun: comparisonState.runs.find(r => r.modelProvider === p.id && r.modelId === m.id),
        }))
    )

    // Collapsed/trigger buttons view
    if (isCollapsed && !isChatOpen) {
        return (
            <div className="fixed bottom-6 right-6 z-[999998] flex items-center gap-1 ">
                <button
                    onClick={() => setIsCollapsed(false)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-background shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)] text-[13px] font-medium text-foreground hover:bg-accent transition-all active:scale-[0.98]"
                >
                    <span className="text-sm leading-none">🌸</span>
                    <span>{t('comparisonTitle')}</span>
                </button>
                <button
                    onClick={handleSelectRun}
                    disabled={!canUseVersion}
                    className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)] text-[13px] font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {t('comparisonUseThis')}
                </button>
            </div>
        )
    }

    // Floating chat panel (similar to normal sidebar)
    if (isChatOpen) {
        return (
            <>
                {/* Floating chat panel */}
                <div className="fixed top-6 right-6 bottom-20 w-[380px] z-[999999] bg-background rounded-xl shadow-2xl flex flex-col overflow-hidden border border-border ">
                    {/* Header */}
                    <header className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-sm leading-none">🌸</span>
                            <span className="text-sm font-semibold text-foreground">Awel</span>
                            {isLoading && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleToggleTheme}
                                className="h-7 w-7 hover:bg-muted"
                                title={t('toggleTheme')}
                            >
                                {resolvedTheme === 'dark'
                                    ? <Sun className="w-3.5 h-3.5" />
                                    : <Moon className="w-3.5 h-3.5" />
                                }
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCloseChat}
                                className="h-7 px-2 hover:bg-muted text-xs"
                            >
                                <Minimize2 className="w-3.5 h-3.5 mr-1" />
                                {t('collapse')}
                            </Button>
                        </div>
                    </header>

                    {/* Chat content */}
                    <Console
                        key={chatKey}
                        selectedModel={selectedModel}
                        selectedModelProvider={selectedModelProvider}
                        modelReady={!!selectedModel}
                        onModelRequired={() => {}}
                        onStreamingChange={setIsLoading}
                        onReviewDiffs={handleReviewOpen}
                    />
                </div>

                {/* Floating buttons at bottom */}
                <div className="fixed bottom-6 right-6 z-[999998] flex items-center gap-1 ">
                    <button
                        onClick={handleCloseChat}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-background shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)] text-[13px] font-medium text-foreground hover:bg-accent transition-all active:scale-[0.98]"
                    >
                        <span className="text-sm leading-none">🌸</span>
                        <span>{t('comparisonTitle')}</span>
                    </button>
                    <button
                        onClick={handleSelectRun}
                        disabled={!canUseVersion}
                        className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] dark:shadow-[0_4px_12px_rgba(0,0,0,0.4)] text-[13px] font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {t('comparisonUseThis')}
                    </button>
                </div>

                {reviewDiffs && (
                    <DiffModal diffs={reviewDiffs} onClose={handleReviewClose} />
                )}
            </>
        )
    }

    // Sidebar card view
    return (
        <div className="fixed bottom-6 right-6 z-[999998] ">
            <div className="bg-background border border-border rounded-xl shadow-lg w-[360px] max-h-[calc(100vh-48px)] flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
                    {modelSelectorOpen ? (
                        <button
                            onClick={() => setModelSelectorOpen(false)}
                            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span>{t('comparisonBack')}</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                            <span className="text-sm">🌸</span>
                            <span>{t('comparisonTitle')}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-1">
                        {!modelSelectorOpen && comparisonState.originalPrompt && (
                            <div className="relative group">
                                <button
                                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                    title={t('comparisonPrompt')}
                                >
                                    <FileText className="w-3.5 h-3.5" />
                                </button>
                                <div className="absolute right-0 top-full mt-1 w-[280px] p-2.5 bg-background border border-border rounded-lg shadow-lg scale-95 invisible group-hover:scale-100 group-hover:visible transition-transform duration-150 z-10">
                                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                        {t('comparisonPrompt')}
                                    </span>
                                    <div className="text-[11px] text-foreground leading-relaxed max-h-[120px] overflow-y-auto">
                                        {comparisonState.originalPrompt}
                                    </div>
                                </div>
                            </div>
                        )}
                        {showChatButton && !modelSelectorOpen && (
                            <button
                                onClick={handleOpenChat}
                                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                title={t('comparisonOpenChat')}
                            >
                                <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <button
                            onClick={handleToggleTheme}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title={t('toggleTheme')}
                        >
                            {resolvedTheme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                        </button>
                        <button
                            onClick={handleToggleCollapse}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title={t('collapse')}
                        >
                            <Minimize2 className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                {modelSelectorOpen ? (
                    /* Model selector with prompt editing */
                    <div className="p-3 space-y-3 overflow-y-auto min-h-0">
                        {/* Prompt editor */}
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                {t('comparisonPrompt')}
                            </label>
                            <textarea
                                value={editedPrompt}
                                onChange={(e) => setEditedPrompt(e.target.value)}
                                className="w-full h-[80px] px-2.5 py-2 text-xs leading-relaxed rounded-lg border border-border bg-background text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                                placeholder={t('comparisonPromptPlaceholder')}
                            />
                        </div>

                        {/* Model list */}
                        <div>
                            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
                                {t('comparisonSelectModel')}
                            </label>
                            <div className="max-h-[180px] overflow-y-auto space-y-0.5">
                                {comparisonState.runs.length >= 5 ? (
                                    <p className="text-xs text-muted-foreground px-2 py-3 text-center">
                                        {t('comparisonMaxRuns')}
                                    </p>
                                ) : (
                                    allModels.map(model => (
                                        <button
                                            key={`${model.provider.id}:${model.id}`}
                                            onClick={() => handleNewModelSelect(model.id, model.provider.id, model.label, model.provider.label)}
                                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left"
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-xs font-medium text-foreground">{model.label}</span>
                                                <span className="text-[10px] text-muted-foreground">{model.provider.label}</span>
                                            </div>
                                            {model.isUsed && (
                                                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                    <RotateCcw className="w-3 h-3" />
                                                    {t('comparisonRegenerate')}
                                                </span>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Runs list */
                    <div className="p-2 space-y-1.5 overflow-y-auto min-h-0">
                        {comparisonState.runs.map(run => {
                            const isActive = run.id === comparisonState.activeRunId
                            const isDisabled = run.status === 'building' || (isChatOpen && !isActive)
                            const createdDate = new Date(run.createdAt)
                            const timeStr = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

                            return (
                                <button
                                    key={run.id}
                                    onClick={() => handleSwitchRun(run.id)}
                                    disabled={isDisabled}
                                    className={`w-full px-3 py-2.5 rounded-lg transition-colors text-left ${
                                        isActive
                                            ? 'bg-muted border border-primary/50'
                                            : 'hover:bg-muted/50 border border-transparent'
                                    } ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-foreground">{run.modelLabel}</span>
                                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${
                                            run.status === 'success'
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                : run.status === 'failed'
                                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                        }`}>
                                            {run.status === 'building' ? (
                                                <span className="flex items-center gap-1">
                                                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                                    <span>{t('comparisonBuilding')}</span>
                                                </span>
                                            ) : run.status === 'success' ? (
                                                t('comparisonReady')
                                            ) : (
                                                t('comparisonFailed')
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                        <span>{run.providerLabel}</span>
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {timeStr}
                                        </span>
                                        {run.duration && (
                                            <span>{(run.duration / 1000).toFixed(1)}s</span>
                                        )}
                                        {run.tokenUsage && (
                                            <span className="flex items-center gap-1">
                                                <Zap className="w-3 h-3" />
                                                {run.tokenUsage.input + run.tokenUsage.output}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Console errors indicator */}
                {!modelSelectorOpen && consoleEntries.length > 0 && (
                    <div className="px-3 py-2 border-t border-border shrink-0">
                        <button
                            onClick={handleOpenChat}
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                        >
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{consoleEntries.filter(e => e.level === 'error').length} errors</span>
                        </button>
                    </div>
                )}

                {/* Actions */}
                {!modelSelectorOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-border space-y-2 shrink-0">
                        <button
                            onClick={handleSelectRun}
                            disabled={!canUseVersion}
                            className="w-full px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {t('comparisonUseThis')}
                        </button>
                        <button
                            onClick={handleTryAnother}
                            disabled={!canTryAnother}
                            className="w-full px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {t('comparisonTryAnother')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
