import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertCircle, Clock, DollarSign, Undo2, Eye } from 'lucide-react'
import type { ResultSubtype } from '../../types/messages'
import type { FileDiff } from '../DiffModal'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { Tooltip } from '../ui/tooltip'

interface FileStat {
    relativePath: string
    additions: number
    deletions: number
    isNew: boolean
}

interface ResultMessageProps {
    msgId: string
    subtype: ResultSubtype
    result?: string
    errors?: string[]
    numTurns?: number
    durationMs?: number
    totalCostUsd?: number
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
    fileStats?: FileStat[]
    undone?: boolean
    isLatest?: boolean
    onReviewDiffs?: (diffs: FileDiff[]) => void
    onUndone?: (msgId: string) => void
}

const ERROR_LABEL_KEYS: Record<string, string> = {
    error_max_turns: 'errorMaxTurns',
    error_during_execution: 'errorDuringExecution',
    error_max_budget_usd: 'errorMaxBudget',
    error_max_structured_output_retries: 'errorOutputParsing',
}

export function ResultMessage({
    msgId,
    subtype,
    result,
    errors,
    numTurns,
    durationMs,
    totalCostUsd,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    fileStats,
    undone,
    isLatest,
    onReviewDiffs,
    onUndone,
}: ResultMessageProps) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    const [undoState, setUndoState] = useState<'idle' | 'loading' | 'undone' | 'error'>('idle')
    const [undoMessage, setUndoMessage] = useState<string>('')
    const [reviewLoading, setReviewLoading] = useState(false)
    const [showTooltip, setShowTooltip] = useState(false)
    const [showUndoConfirm, setShowUndoConfirm] = useState(false)
    const hoverTimeout = useRef<ReturnType<typeof setTimeout>>()

    const handleReviewMouseEnter = useCallback(() => {
        hoverTimeout.current = setTimeout(() => setShowTooltip(true), 300)
    }, [])

    const handleReviewMouseLeave = useCallback(() => {
        clearTimeout(hoverTimeout.current)
        setShowTooltip(false)
    }, [])

    // Don't render anything when waiting for user input (e.g. AskUser / ProposePlan)
    if (subtype === 'waiting_for_input') return null

    const isError = subtype !== 'success'
    const errorLabelKey = ERROR_LABEL_KEYS[subtype]
    const errorLabel = errorLabelKey ? t(errorLabelKey) : 'Error'

    // Format duration
    const duration = durationMs ? (durationMs / 1000).toFixed(1) : null

    const hasFileChanges = fileStats && fileStats.length > 0

    const handleUndoClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (undoState === 'loading' || undoState === 'undone') return
        setShowUndoConfirm(true)
    }

    const handleUndoConfirm = async () => {
        setShowUndoConfirm(false)
        setUndoState('loading')
        try {
            const res = await fetch('/api/undo', { method: 'POST' })
            const data = await res.json()
            if (data.success) {
                setUndoState('undone')
                const restored = data.restored as string[]
                if (restored.length === 1) {
                    setUndoMessage(t('revertedFile', { file: restored[0] }))
                } else {
                    setUndoMessage(t('revertedFiles', { count: restored.length, files: restored.join(', ') }))
                }
                onUndone?.(msgId)
            } else {
                setUndoState('error')
                setUndoMessage(data.error || t('nothingToUndo'))
            }
        } catch {
            setUndoState('error')
            setUndoMessage(t('undoFailed'))
        }
    }

    const handleReview = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (reviewLoading) return

        setReviewLoading(true)
        try {
            const res = await fetch('/api/undo/diff')
            const data = await res.json()
            if (data.success && data.diffs?.length > 0) {
                onReviewDiffs?.(data.diffs)
            }
        } catch {
            // ignore
        } finally {
            setReviewLoading(false)
        }
    }

    return (
        <div
            className={`border-l-2 ${isError ? 'border-red-500/50' : 'border-border/50'} pl-3 py-2 my-2`}
        >
            {/* Header */}
            <div
                className={`flex items-center gap-2 text-xs cursor-pointer transition-colors ${isError ? 'text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300' : 'text-foreground hover:text-foreground'
                    }`}
                onClick={() => setExpanded(!expanded)}
            >
                {isError ? <AlertCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                <span className="font-medium">
                    {isError ? errorLabel : t('taskCompleted')}
                </span>

                {/* Undone label */}
                {hasFileChanges && undone && (
                    <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                        <Undo2 className="w-3 h-3" />
                        {t('undone')}
                    </span>
                )}

                {/* Review + Undo buttons (only on latest non-undone result with file changes) */}
                {isLatest && !isError && hasFileChanges && !undone && undoState === 'idle' && (
                    <div className="ml-auto flex items-center gap-2">
                        <div
                            className="relative"
                            onMouseEnter={handleReviewMouseEnter}
                            onMouseLeave={handleReviewMouseLeave}
                        >
                            <button
                                onClick={handleReview}
                                className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100/60 text-blue-700 hover:bg-blue-200/60 hover:text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/50 dark:hover:text-blue-200 transition-colors"
                                disabled={reviewLoading}
                            >
                                <Eye className="w-3 h-3" />
                                <span>{reviewLoading ? t('loading') : t('review')}</span>
                            </button>
                            {showTooltip && (
                                <div className="absolute bottom-full right-0 mb-1.5 w-max max-w-xs bg-card border border-border rounded-md shadow-lg py-1.5 px-2 z-50">
                                    {fileStats!.map((f) => (
                                        <div key={f.relativePath} className="flex items-center gap-2 text-[11px] leading-5 whitespace-nowrap">
                                            <span className="text-muted-foreground truncate max-w-[180px]">{f.relativePath}</span>
                                            <span className="text-green-600 dark:text-green-400">+{f.additions}</span>
                                            <span className="text-red-600 dark:text-red-400">-{f.deletions}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleUndoClick}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100/60 text-amber-700 hover:bg-amber-200/60 hover:text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-800/50 dark:hover:text-amber-200 transition-colors"
                            title={t('undoLastFileChange')}
                        >
                            <Undo2 className="w-3 h-3" />
                            <span>{t('undo')}</span>
                        </button>
                    </div>
                )}
                {undoState === 'loading' && (
                    <span className="ml-auto text-muted-foreground animate-pulse">{t('undoing')}</span>
                )}
                {undoState === 'error' && (
                    <span className="ml-auto text-muted-foreground">{undoMessage}</span>
                )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 mt-1 text-muted-foreground text-xs">
                {numTurns && (
                    <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t('turn', { count: numTurns })}
                    </span>
                )}
                {duration && (
                    <span>{duration}s</span>
                )}
                {(inputTokens != null || outputTokens != null) && (() => {
                    const inTotal = inputTokens ?? 0
                    const out = outputTokens ?? 0
                    const cached = cacheReadTokens ?? 0
                    const nonCached = inTotal - cached
                    const display = nonCached + out
                    const tooltipParts = [`In: ${nonCached.toLocaleString()}`]
                    if (cached > 0) tooltipParts.push(`Cache read: ${cached.toLocaleString()}`)
                    if (cacheWriteTokens) tooltipParts.push(`Cache write: ${cacheWriteTokens.toLocaleString()}`)
                    tooltipParts.push(`Out: ${out.toLocaleString()}`)
                    return (
                        <Tooltip text={tooltipParts.join(' / ')}>
                            <span>{display.toLocaleString()} tokens</span>
                        </Tooltip>
                    )
                })()}
                {totalCostUsd !== undefined && totalCostUsd > 0 && (
                    <span className="flex items-center gap-0.5">
                        <DollarSign className="w-3 h-3" />
                        {totalCostUsd.toFixed(4)}
                    </span>
                )}
            </div>

            {/* Error details */}
            {isError && errors && errors.length > 0 && expanded && (
                <div className="mt-2 text-red-700 dark:text-red-300 text-xs whitespace-pre-wrap">
                    {errors.join('\n')}
                </div>
            )}

            {/* Success result preview */}
            {!isError && result && expanded && (
                <div className="mt-2 text-muted-foreground text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {result}
                </div>
            )}

            {showUndoConfirm && (
                <ConfirmDialog
                    title={t('undoFileChanges')}
                    description={t('undoConfirmDescription', { count: fileStats?.length ?? 0 })}
                    confirmLabel={t('undo')}
                    variant="warning"
                    onConfirm={handleUndoConfirm}
                    onCancel={() => setShowUndoConfirm(false)}
                />
            )}

        </div>
    )
}
