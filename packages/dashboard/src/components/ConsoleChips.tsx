import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronDown, X, XCircle, Trash2 } from 'lucide-react'
import type { ConsoleEntry } from '../types/messages'

const MAX_VISIBLE = 5
const MSG_TRUNCATE = 80

function formatTrace(entry: ConsoleEntry): string | null {
    if (!entry.sourceTrace || entry.sourceTrace.length === 0) return null
    return entry.sourceTrace
        .map(f => `  ${f.source}${f.line ? `:${f.line}` : ''}`)
        .join('\n')
}

interface ConsoleChipsProps {
    entries: ConsoleEntry[]
    onEntryClick: (entry: ConsoleEntry) => void
    onDismiss: (id: string) => void
    onClearAll: () => void
}

export function ConsoleChips({ entries, onEntryClick, onDismiss, onClearAll }: ConsoleChipsProps) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)

    const handleEntryClick = (entry: ConsoleEntry) => {
        onEntryClick(entry)
        setExpanded(false)
    }

    const errorCount = entries.filter(e => e.level === 'error').length
    const warningCount = entries.filter(e => e.level === 'warning').length
    const hasEntries = entries.length > 0
    const visible = entries.slice(-MAX_VISIBLE).reverse()
    const hiddenCount = entries.length - visible.length

    return (
        <div className="mx-4 my-1.5 flex flex-col-reverse gap-2">
            {/* Summary bar — always visible */}
            <button
                onClick={() => hasEntries && setExpanded(prev => !prev)}
                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border bg-card/60 text-xs transition-colors ${hasEntries ? 'hover:bg-muted/60 cursor-pointer' : 'cursor-default'
                    }`}
            >
                <span className="flex items-center gap-1 text-red-600/60 dark:text-red-400/60 font-medium">
                    <XCircle className="w-3 h-3" />
                    {errorCount}
                </span>
                <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400/60 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    {warningCount}
                </span>
                {hasEntries && (
                    <>
                        <span
                            role="button"
                            onClick={(e) => {
                                e.stopPropagation()
                                onClearAll()
                            }}
                            className="flex items-center gap-1 ml-auto text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                        </span>
                        <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${expanded ? '' : 'rotate-180'}`} />
                    </>
                )}
            </button>

            {/* Expanded detail list — renders above the summary bar */}
            {expanded && (
                <div className="flex flex-col gap-1">
                    <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto">
                        {visible.map(entry => (
                            <ConsoleChip
                                key={entry.id}
                                entry={entry}
                                onEntryClick={handleEntryClick}
                                onDismiss={onDismiss}
                            />
                        ))}
                    </div>
                    {hiddenCount > 0 && (
                        <span className="text-[11px] text-muted-foreground px-1">{t('plusMore', { count: hiddenCount })}</span>
                    )}
                </div>
            )}
        </div>
    )
}

function ConsoleChip({ entry, onEntryClick, onDismiss }: {
    entry: ConsoleEntry
    onEntryClick: (entry: ConsoleEntry) => void
    onDismiss: (id: string) => void
}) {
    const [showTooltip, setShowTooltip] = useState(false)
    const chipRef = useRef<HTMLDivElement>(null)
    const trace = formatTrace(entry)

    const tooltipStyle = (): React.CSSProperties | undefined => {
        if (!chipRef.current) return undefined
        const rect = chipRef.current.getBoundingClientRect()
        return {
            position: 'fixed',
            bottom: window.innerHeight - rect.top + 6,
            left: rect.left,
        }
    }

    return (
        <div
            ref={chipRef}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <button
                onClick={() => onEntryClick(entry)}
                className={`group flex items-start gap-1.5 px-2.5 py-2 rounded-md border text-left text-xs transition-colors cursor-pointer w-full ${entry.level === 'error'
                        ? 'border-red-300/60 bg-red-100/60 text-red-800 hover:bg-red-200/60 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/40'
                        : 'border-yellow-300/60 bg-yellow-100/60 text-yellow-800 hover:bg-yellow-200/60 dark:border-yellow-800/60 dark:bg-yellow-950/40 dark:text-yellow-200 dark:hover:bg-yellow-900/40'
                    }`}
            >
                {entry.level === 'error' ? (
                    <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
                ) : (
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                )}
                <span className="flex-1 min-w-0 truncate">
                    {entry.message.length > MSG_TRUNCATE
                        ? entry.message.slice(0, MSG_TRUNCATE) + '…'
                        : entry.message}
                </span>
                {entry.source && (
                    <span className="shrink-0 text-[10px] text-muted-foreground font-mono">
                        {entry.source.split('/').pop()}{entry.line ? `:${entry.line}` : ''}
                    </span>
                )}
                {entry.count > 1 && (
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${entry.level === 'error'
                            ? 'bg-red-200/60 text-red-800 dark:bg-red-800/60 dark:text-red-200'
                            : 'bg-yellow-200/60 text-yellow-800 dark:bg-yellow-800/60 dark:text-yellow-200'
                        }`}>
                        {entry.count}
                    </span>
                )}
                <span
                    role="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        onDismiss(entry.id)
                    }}
                    className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                >
                    <X className="w-3.5 h-3.5" />
                </span>
            </button>

            {showTooltip && trace && (
                <div
                    style={tooltipStyle()}
                    className="z-[9999] w-72 max-h-48 overflow-y-auto rounded-md border border-border bg-card p-2.5 text-xs text-foreground shadow-lg whitespace-pre-wrap break-words font-mono pointer-events-none"
                >
                    {entry.message}{'\n\n'}{trace}
                </div>
            )}
        </div>
    )
}
