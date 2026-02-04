import { useTranslation } from 'react-i18next'
import { XCircle, AlertTriangle } from 'lucide-react'
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
    const allImages = imageUrls ?? []
    const hasInlineSegments = contentSegments && contentSegments.length > 0 && attachedElements && attachedElements.length > 0

    return (
        <div className="text-foreground bg-muted/50 rounded-lg px-3 py-2 text-sm self-end max-w-[85%]">
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
                // Fallback: separate block for element chips, then text
                <>
                    {attachedElements && attachedElements.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                            {attachedElements.map((el, i) => (
                                <InlineElementChip key={`${el.tag}:${el.source}:${el.line}:${i}`} el={el} />
                            ))}
                        </div>
                    )}
                    {content}
                </>
            )}
        </div>
    )
}
