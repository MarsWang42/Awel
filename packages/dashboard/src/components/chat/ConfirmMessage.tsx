import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/card'

interface ConfirmMessageProps {
    confirmId: string
    toolName: string
    summary: string
    details?: string
    resolved?: boolean
    approved?: boolean
    onConfirm: (confirmId: string, approved: boolean, opts?: { allowAll?: boolean; category?: string }) => void
    disabled?: boolean
    pendingCount?: number
}

type DiffLine = { type: 'same' | 'remove' | 'add'; text: string }

function computeLineDiff(oldStr: string, newStr: string): DiffLine[] {
    const oldLines = oldStr.split('\n')
    const newLines = newStr.split('\n')
    const m = oldLines.length
    const n = newLines.length

    // LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = oldLines[i - 1] === newLines[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1])
        }
    }

    // Backtrack
    const stack: DiffLine[] = []
    let i = m, j = n
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
            stack.push({ type: 'same', text: oldLines[i - 1] })
            i--; j--
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            stack.push({ type: 'add', text: newLines[j - 1] })
            j--
        } else {
            stack.push({ type: 'remove', text: oldLines[i - 1] })
            i--
        }
    }
    return stack.reverse()
}

function DiffView({ oldStr, newStr }: { oldStr: string; newStr: string }) {
    const lines = computeLineDiff(oldStr, newStr)
    return (
        <div className="text-[11px] font-mono bg-muted/50 rounded-md overflow-x-auto border border-border/50">
            {lines.map((line, i) => {
                const prefix = line.type === 'remove' ? '−' : line.type === 'add' ? '+' : ' '
                const bg = line.type === 'remove'
                    ? 'bg-diff-remove-bg'
                    : line.type === 'add'
                        ? 'bg-diff-add-bg'
                        : ''
                const textColor = line.type === 'remove'
                    ? 'text-diff-remove-text'
                    : line.type === 'add'
                        ? 'text-diff-add-text'
                        : 'text-diff-context-text'
                const prefixColor = line.type === 'remove'
                    ? 'text-diff-remove-marker'
                    : line.type === 'add'
                        ? 'text-diff-add-marker'
                        : 'text-diff-context-text'
                return (
                    <div key={i} className={cn("px-2 leading-5 whitespace-pre-wrap break-all", bg)}>
                        <span className={cn("select-none inline-block w-3 font-bold", prefixColor)}>{prefix}</span>
                        <span className={textColor}>{line.text || '\u00A0'}</span>
                    </div>
                )
            })}
        </div>
    )
}

export function ConfirmMessage({ confirmId, toolName, summary, details, resolved, approved, onConfirm, disabled, pendingCount }: ConfirmMessageProps) {
    const { t } = useTranslation()
    const inactive = !!resolved || !!disabled

    const category = toolName === 'Bash' ? 'bash' : 'fileWrites'

    const headerKey = toolName === 'Bash' ? 'confirmBashHeader'
        : toolName === 'Write' ? 'confirmWriteHeader'
        : toolName === 'Edit' || toolName === 'MultiEdit' ? 'confirmEditHeader'
        : 'confirmBashHeader'

    const showQueueIndicator = !resolved && pendingCount && pendingCount > 1

    const renderDetails = () => {
        if (toolName === 'Bash') {
            return (
                <pre className="text-xs font-mono bg-confirm-code-bg rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap break-all text-confirm-code-text">
                    {summary}
                </pre>
            )
        }

        if (toolName === 'Write') {
            return (
                <div className="space-y-1.5">
                    <p className="text-xs text-foreground font-medium font-mono">{summary}</p>
                    {details && (
                        <pre className="text-[11px] font-mono bg-confirm-code-bg rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all text-confirm-code-text max-h-40 overflow-y-auto">
                            {details}
                        </pre>
                    )}
                </div>
            )
        }

        if (toolName === 'Edit' || toolName === 'MultiEdit') {
            let edits: { old_string: string; new_string: string }[] = []
            if (details) {
                try {
                    const parsed = JSON.parse(details)
                    edits = Array.isArray(parsed) ? parsed : [parsed]
                } catch {
                    // Not parseable, show raw
                }
            }

            if (edits.length === 0 && details) {
                return (
                    <div className="space-y-1.5">
                        <p className="text-xs text-foreground font-medium font-mono">{summary}</p>
                        <pre className="text-[11px] font-mono bg-confirm-code-bg rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all text-confirm-code-text max-h-40 overflow-y-auto">
                            {details}
                        </pre>
                    </div>
                )
            }

            return (
                <div className="space-y-1.5">
                    <p className="text-xs text-foreground font-medium font-mono">{summary}</p>
                    {edits.map((edit, i) => (
                        <div key={i}>
                            {edits.length > 1 && (
                                <p className="text-[10px] text-muted-foreground mb-0.5">Edit {i + 1}/{edits.length}</p>
                            )}
                            <DiffView oldStr={edit.old_string} newStr={edit.new_string} />
                        </div>
                    ))}
                </div>
            )
        }

        // Fallback
        return <p className="text-xs text-foreground font-mono">{summary}</p>
    }

    // Shield icon for pending, checkmark for approved, X for rejected
    const renderIcon = () => {
        if (resolved && approved) {
            return (
                <svg className="w-4 h-4 shrink-0 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        }
        if (resolved && !approved) {
            return (
                <svg className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            )
        }
        return (
            <svg className="w-4 h-4 shrink-0 text-confirm-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
        )
    }

    return (
        <Card className={cn("border-confirm-border bg-confirm-bg", inactive && "opacity-75")}>
            <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    {renderIcon()}
                    {resolved ? (
                        approved ? (
                            <span className="text-green-700 dark:text-green-400">{t('confirmApproved')}</span>
                        ) : (
                            <span className="text-red-700 dark:text-red-400">{t('confirmRejected')}</span>
                        )
                    ) : (
                        <span className="text-confirm-header">{t(headerKey)}</span>
                    )}
                    {showQueueIndicator && (
                        <span className="ml-auto text-[10px] font-normal text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            1 of {pendingCount}
                        </span>
                    )}
                </CardTitle>
            </CardHeader>

            <CardContent className="p-3 pt-1">
                {renderDetails()}
            </CardContent>

            {!inactive && (
                <CardFooter className="p-3 pt-0 flex flex-col gap-1.5">
                    <div className="flex gap-2 w-full">
                        <button
                            onClick={() => onConfirm(confirmId, true)}
                            className="flex-1 text-xs font-medium px-4 py-2 rounded bg-confirm-btn-primary-bg text-white hover:bg-confirm-btn-primary-hover transition-colors"
                        >
                            {t('confirmAllow')}
                        </button>
                        <button
                            onClick={() => onConfirm(confirmId, true, { allowAll: true, category })}
                            className="flex-1 text-xs font-medium px-4 py-2 rounded bg-confirm-btn-secondary-bg text-confirm-btn-secondary-text hover:bg-confirm-btn-secondary-hover transition-colors"
                        >
                            {t('confirmAllowAll')}
                        </button>
                        <button
                            onClick={() => onConfirm(confirmId, false)}
                            className="flex-1 text-xs font-medium px-4 py-2 rounded bg-confirm-btn-deny-bg text-confirm-btn-deny-text hover:bg-confirm-btn-deny-hover transition-colors"
                        >
                            {t('confirmDeny')}
                        </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center">
                        {showQueueIndicator
                            ? t('confirmAllowAllHintPending', { count: pendingCount })
                            : t('confirmAllowAllHint')
                        }
                    </p>
                </CardFooter>
            )}
        </Card>
    )
}
