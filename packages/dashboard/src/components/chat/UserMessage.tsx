import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import { XCircle, AlertTriangle, Copy, Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { ConsoleEntry, SelectedElement, ContentSegment } from '../../types/messages'

interface UserMessageProps {
    content: string
    imageUrls?: string[]
    consoleEntries?: ConsoleEntry[]
    attachedElements?: SelectedElement[]
    contentSegments?: ContentSegment[]
    onConsoleEntryClick?: (entry: ConsoleEntry) => void
    onImageClick?: (images: string[], index: number) => void
}

function InlineElementChip({ el }: { el: SelectedElement }) {
    const name = el.component || `<${el.tag}>`
    const sourceBasename = el.source?.split('/').pop() || null
    const fileLoc = sourceBasename
        ? el.line ? `${sourceBasename}:${el.line}` : sourceBasename
        : null
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-100 text-rose-800 dark:bg-rose-800/80 dark:text-rose-100 align-baseline mx-0.5">
            {name}
            {fileLoc && (
                <span className="text-rose-600 dark:text-rose-200 font-mono">{fileLoc}</span>
            )}
        </span>
    )
}

export function UserMessage({
    content,
    imageUrls,
    consoleEntries,
    attachedElements,
    contentSegments,
    onConsoleEntryClick,
    onImageClick,
}: UserMessageProps) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)
    const allImages = imageUrls ?? []
    const hasInlineSegments = contentSegments && contentSegments.length > 0 && attachedElements && attachedElements.length > 0

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(content).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        }).catch(() => {})
    }, [content])

    return (
        <div className="text-foreground bg-muted/50 rounded-lg px-3 py-2 text-sm self-end max-w-[85%] relative group">
            {allImages.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                    {allImages.map((url, i) => (
                        <img
                            key={i}
                            src={url}
                            alt={t('attachedAlt', { index: i + 1 })}
                            className={cn(
                                "max-w-[200px] max-h-[200px] rounded-lg border border-border/50 object-cover",
                                onImageClick && "cursor-pointer hover:opacity-80 transition-opacity"
                            )}
                            onClick={onImageClick ? () => onImageClick(allImages, i) : undefined}
                        />
                    ))}
                </div>
            )}
            {consoleEntries && consoleEntries.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {consoleEntries.map(entry => (
                        <button
                            key={entry.id}
                            type="button"
                            onClick={() => onConsoleEntryClick?.(entry)}
                            className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors",
                                entry.level === 'error'
                                    ? "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-800/80 dark:text-red-100 dark:hover:bg-red-700/80"
                                    : "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-800/80 dark:text-yellow-100 dark:hover:bg-yellow-700/80"
                            )}
                            title={t('clickToReattach', { level: entry.level })}
                        >
                            {entry.level === 'error'
                                ? <XCircle className="w-3 h-3" />
                                : <AlertTriangle className="w-3 h-3" />
                            }
                            <span className="truncate max-w-[180px]">
                                {entry.message.length > 40 ? entry.message.slice(0, 40) + '\u2026' : entry.message}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {hasInlineSegments ? (
                // Inline rendering: chips mixed with text
                <span>
                    {contentSegments!.map((seg, i) => {
                        if (seg.type === 'text') {
                            return <span key={i}>{seg.text}</span>
                        }
                        const el = attachedElements![seg.elementIndex]
                        return el ? <InlineElementChip key={i} el={el} /> : null
                    })}
                </span>
            ) : (
                // Fallback: separate block for element chips, then markdown-formatted text
                <>
                    {attachedElements && attachedElements.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                            {attachedElements.map((el, i) => (
                                <InlineElementChip key={`${el.tag}:${el.source}:${el.line}:${i}`} el={el} />
                            ))}
                        </div>
                    )}
                    <ReactMarkdown
                        components={{
                            pre: ({ children }) => (
                                <pre className="bg-card rounded-lg p-2 overflow-x-auto text-xs my-2">
                                    {children}
                                </pre>
                            ),
                            code: ({ className, children, ...props }) => {
                                const isInline = !className
                                return isInline ? (
                                    <code className="bg-background/50 px-1 py-0.5 rounded text-xs" {...props}>
                                        {children}
                                    </code>
                                ) : (
                                    <code className={className} {...props}>
                                        {children}
                                    </code>
                                )
                            },
                            a: ({ children, ...props }) => (
                                <a className="text-muted-foreground hover:text-foreground underline" {...props}>
                                    {children}
                                </a>
                            ),
                            ul: ({ children }) => (
                                <ul className="list-disc list-inside space-y-0.5 my-1.5 text-sm">{children}</ul>
                            ),
                            ol: ({ children }) => (
                                <ol className="list-decimal list-inside space-y-0.5 my-1.5 text-sm">{children}</ol>
                            ),
                            p: ({ children }) => (
                                <p className="my-1 leading-relaxed text-sm first:mt-0 last:mb-0">{children}</p>
                            ),
                            h1: ({ children }) => (
                                <h1 className="text-base font-semibold mt-3 mb-1">{children}</h1>
                            ),
                            h2: ({ children }) => (
                                <h2 className="text-sm font-semibold mt-2 mb-1">{children}</h2>
                            ),
                            h3: ({ children }) => (
                                <h3 className="text-sm font-medium mt-1.5 mb-0.5">{children}</h3>
                            ),
                            blockquote: ({ children }) => (
                                <blockquote className="border-l-2 border-border pl-2 my-1.5 text-muted-foreground italic text-sm">
                                    {children}
                                </blockquote>
                            ),
                            li: ({ children }) => (
                                <li className="text-sm">{children}</li>
                            ),
                        }}
                    >
                        {content}
                    </ReactMarkdown>
                </>
            )}
            {/* Copy raw markdown button */}
            <button
                onClick={handleCopy}
                className="absolute bottom-1.5 right-1.5 p-1 rounded text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-foreground hover:bg-background/50 transition-all"
                title={t('copyMessage', 'Copy message')}
            >
                {copied
                    ? <Check className="w-3 h-3 text-emerald-500" />
                    : <Copy className="w-3 h-3" />
                }
            </button>
        </div>
    )
}
