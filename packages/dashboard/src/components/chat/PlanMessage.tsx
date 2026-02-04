import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { Card, CardHeader, CardTitle, CardFooter } from '../ui/card'

interface PlanMessageProps {
    planId: string
    title: string
    content: string
    onApprove: (planId: string, autoApprove?: boolean) => void
    onComment: (planId: string, comment: string) => void
    disabled?: boolean
    approved?: boolean
}

const IS_CREATION_MODE = !!(window as any).__AWEL_CREATION_MODE__

export function PlanMessage({ planId, title, content, onApprove, onComment, disabled, approved: initialApproved }: PlanMessageProps) {
    const { t } = useTranslation()
    const [modalOpen, setModalOpen] = useState(false)
    const [approved, setApproved] = useState(initialApproved ?? false)
    const [comment, setComment] = useState('')

    // Close modal on Escape
    useEffect(() => {
        if (!modalOpen) return
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setModalOpen(false)
        }
        window.addEventListener('keydown', handleKey)
        return () => window.removeEventListener('keydown', handleKey)
    }, [modalOpen])

    const handleApprove = (autoApprove?: boolean) => {
        setApproved(true)
        setModalOpen(false)
        onApprove(planId, autoApprove)
    }

    const handleSendComment = () => {
        const text = comment.trim()
        if (!text) return
        setModalOpen(false)
        onComment(planId, text)
        setComment('')
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendComment()
        }
    }

    const markdownComponents = {
        pre: ({ children }: { children?: React.ReactNode }) => (
            <pre className="bg-card rounded-lg p-2 overflow-x-auto text-xs my-2">{children}</pre>
        ),
        code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode }) => {
            const isInline = !className
            return isInline ? (
                <code className="bg-muted px-1 py-0.5 rounded text-muted-foreground text-xs" {...props}>{children}</code>
            ) : (
                <code className={className} {...props}>{children}</code>
            )
        },
        a: ({ children, ...props }: { children?: React.ReactNode }) => (
            <a className="text-muted-foreground hover:text-foreground underline" {...props}>{children}</a>
        ),
        ul: ({ children }: { children?: React.ReactNode }) => (
            <ul className="list-disc list-inside space-y-0.5 my-1.5 text-sm">{children}</ul>
        ),
        ol: ({ children }: { children?: React.ReactNode }) => (
            <ol className="list-decimal list-inside space-y-0.5 my-1.5 text-sm">{children}</ol>
        ),
        p: ({ children }: { children?: React.ReactNode }) => (
            <p className="my-1.5 leading-relaxed text-sm">{children}</p>
        ),
        h1: ({ children }: { children?: React.ReactNode }) => (
            <h1 className="text-base font-semibold text-foreground mt-3 mb-1">{children}</h1>
        ),
        h2: ({ children }: { children?: React.ReactNode }) => (
            <h2 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h2>
        ),
        h3: ({ children }: { children?: React.ReactNode }) => (
            <h3 className="text-sm font-medium text-foreground mt-1.5 mb-0.5">{children}</h3>
        ),
        blockquote: ({ children }: { children?: React.ReactNode }) => (
            <blockquote className="border-l-2 border-border pl-2 my-1.5 text-muted-foreground italic text-sm">{children}</blockquote>
        ),
        li: ({ children }: { children?: React.ReactNode }) => (
            <li className="text-sm">{children}</li>
        ),
    }

    return (
        <>
            {/* Compact card in chat */}
            <Card className="border-border/50 bg-card/80">
                <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        {title}
                    </CardTitle>
                </CardHeader>
                <CardFooter className="p-3 pt-2">
                    <button
                        onClick={() => setModalOpen(true)}
                        className={`w-full text-xs font-medium px-4 py-2 rounded transition-colors ${
                            approved
                                ? 'bg-muted text-muted-foreground hover:bg-accent'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                    >
                        {approved ? t('readPlan') : t('viewPlan')}
                    </button>
                </CardFooter>
            </Card>

            {/* Modal overlay */}
            {modalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}
                >
                    <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col shadow-xl mx-4">
                        {/* Modal header */}
                        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                            <h2 className="text-sm font-medium text-foreground flex items-center gap-2">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                {title}
                            </h2>
                            <button
                                onClick={() => setModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Modal content */}
                        <div className="flex-1 overflow-y-auto p-4 text-sm text-foreground min-h-0">
                            <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
                        </div>

                        {/* Modal footer — feedback + approve (only before approval, hidden when aborted) */}
                        {!approved && !disabled && (
                            <div className="p-4 border-t border-border flex flex-col gap-2 shrink-0">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={t('feedbackPlaceholder')}
                                        className="flex-1 bg-muted text-foreground text-xs rounded px-3 py-1.5 border border-border focus:border-ring focus:outline-none placeholder:text-muted-foreground"
                                    />
                                    <button
                                        onClick={handleSendComment}
                                        disabled={!comment.trim()}
                                        className="text-xs px-3 py-1.5 rounded bg-muted text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {t('send')}
                                    </button>
                                </div>
                                {IS_CREATION_MODE ? (
                                    /* In creation mode, just show a single proceed button (auto-approves all) */
                                    <button
                                        onClick={() => handleApprove(true)}
                                        className="w-full text-xs font-medium px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                    >
                                        {t('proceedWithPlan')}
                                    </button>
                                ) : (
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleApprove(false)}
                                                className="flex-1 text-xs font-medium px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                            >
                                                {t('proceedManual')}
                                            </button>
                                            <button
                                                onClick={() => handleApprove(true)}
                                                className="flex-1 text-xs font-medium px-4 py-2 rounded bg-primary/80 text-primary-foreground hover:bg-primary/70 transition-colors"
                                            >
                                                {t('proceedApproveAll')}
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground text-center">{t('proceedApproveAllHint')}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
