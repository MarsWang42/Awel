import { ImagePlus, Send, Square, Terminal, Loader2, X, Crosshair } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { ConsoleChips } from './ConsoleChips'
import { ImagePreviewModal } from './ImagePreviewModal'
import { useConsole } from '../hooks/useConsole'
import type { ConsoleEntry, SelectedElement, ContentSegment } from '../types/messages'

function InstantTooltip({ text, children }: { text: string; children: React.ReactNode }) {
    return (
        <div className="relative group/tip">
            {children}
            <div className="invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-100
                absolute z-[60] px-2 py-1 text-[10px] leading-tight text-muted-foreground bg-card border border-border rounded shadow-lg
                whitespace-nowrap pointer-events-none bottom-full mb-1.5 right-0">
                {text}
            </div>
        </div>
    )
}

interface ConsoleProps {
    selectedModel: string
    selectedModelProvider: string
    onHasMessagesChange?: (hasMessages: boolean) => void
    onStreamingChange?: (isStreaming: boolean) => void
    onReviewDiffs?: (diffs: import('./DiffModal').FileDiff[]) => void
}

export function Console({ selectedModel, selectedModelProvider, onHasMessagesChange, onStreamingChange, onReviewDiffs }: ConsoleProps) {
    const { t } = useTranslation()
    const {
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
    } = useConsole(selectedModel, selectedModelProvider, onReviewDiffs)

    const fileInputRef = useRef<HTMLInputElement>(null)
    const editableRef = useRef<HTMLDivElement>(null)
    const chipMapRef = useRef(new Map<string, SelectedElement>())
    const chipCounterRef = useRef(0)
    const [inputEmpty, setInputEmpty] = useState(true)
    const [previewImages, setPreviewImages] = useState<string[] | null>(null)
    const [previewIndex, setPreviewIndex] = useState(0)

    const handleImageAttach = () => {
        fileInputRef.current?.click()
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        for (const file of Array.from(files)) {
            const reader = new FileReader()
            reader.onload = () => {
                const dataUrl = reader.result as string
                setImageAttachments(prev => [...prev, { dataUrl, mediaType: file.type, name: file.name }])
            }
            reader.readAsDataURL(file)
        }
        e.target.value = ''
    }

    useEffect(() => {
        onHasMessagesChange?.(messages.length > 0)
    }, [messages.length, onHasMessagesChange])

    useEffect(() => {
        onStreamingChange?.(isLoading)
    }, [isLoading, onStreamingChange])

    // Listen for screenshot annotations from the host script
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data?.type === 'AWEL_SCREENSHOT_ANNOTATION' && event.data.dataUrl) {
                setImageAttachments(prev => [...prev, {
                    dataUrl: event.data.dataUrl,
                    mediaType: 'image/png',
                    name: 'screenshot.png',
                }])
            }
        }
        window.addEventListener('message', handler)
        return () => window.removeEventListener('message', handler)
    }, [setImageAttachments])

    // ─── Contenteditable helpers ──────────────────────────────

    const getTextFromEditable = useCallback((): string => {
        const div = editableRef.current
        if (!div) return ''
        let text = ''
        const walk = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent || ''
            } else if ((node as HTMLElement).dataset?.chipId) {
                // Skip chip nodes
            } else {
                for (const child of Array.from(node.childNodes)) {
                    walk(child)
                }
            }
        }
        for (const child of Array.from(div.childNodes)) {
            walk(child)
        }
        return text.trim()
    }, [])

    const getChipsFromEditable = useCallback((): SelectedElement[] => {
        const div = editableRef.current
        if (!div) return []
        const elements: SelectedElement[] = []
        div.querySelectorAll('[data-chip-id]').forEach(node => {
            const chipId = (node as HTMLElement).dataset.chipId!
            const el = chipMapRef.current.get(chipId)
            if (el) elements.push(el)
        })
        return elements
    }, [])

    const syncChipMap = useCallback(() => {
        const div = editableRef.current
        if (!div) return
        const presentIds = new Set<string>()
        div.querySelectorAll('[data-chip-id]').forEach(node => {
            presentIds.add((node as HTMLElement).dataset.chipId!)
        })
        for (const id of chipMapRef.current.keys()) {
            if (!presentIds.has(id)) chipMapRef.current.delete(id)
        }
    }, [])

    const updateIsEmpty = useCallback(() => {
        const div = editableRef.current
        if (!div) { setInputEmpty(true); return }
        const text = getTextFromEditable()
        const hasChips = chipMapRef.current.size > 0
        setInputEmpty(!text && !hasChips)
    }, [getTextFromEditable])

    const clearEditable = useCallback(() => {
        if (editableRef.current) {
            editableRef.current.innerHTML = ''
            chipMapRef.current.clear()
            setInputEmpty(true)
        }
    }, [])

    const placeCursorAtEnd = useCallback(() => {
        const div = editableRef.current
        if (!div) return
        const range = document.createRange()
        range.selectNodeContents(div)
        range.collapse(false)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
    }, [])

    const insertChipNode = useCallback((el: SelectedElement) => {
        const div = editableRef.current
        if (!div) return

        // Dedupe
        const key = `${el.tag}:${el.source}:${el.line}`
        for (const [, existing] of chipMapRef.current) {
            if (`${existing.tag}:${existing.source}:${existing.line}` === key) return
        }

        const chipId = `chip-${++chipCounterRef.current}`
        chipMapRef.current.set(chipId, el)

        const name = el.component || `<${el.tag}>`

        const chip = document.createElement('span')
        chip.dataset.chipId = chipId
        chip.contentEditable = 'false'
        chip.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'gap:3px',
            'padding:1px 6px',
            'margin:0 2px',
            'border-radius:4px',
            'background:rgba(136,19,57,0.75)',
            'color:#ffe4e6',
            'font-size:11px',
            'font-weight:500',
            'line-height:18px',
            'white-space:nowrap',
            'user-select:all',
            'vertical-align:baseline',
        ].join(';')

        const nameSpan = document.createElement('span')
        nameSpan.textContent = name
        chip.appendChild(nameSpan)

        const removeBtn = document.createElement('span')
        removeBtn.dataset.removeChip = chipId
        removeBtn.textContent = '\u00d7'
        removeBtn.style.cssText = 'cursor:pointer;opacity:0.6;font-size:13px;line-height:1;'
        removeBtn.onmouseenter = () => { removeBtn.style.opacity = '1' }
        removeBtn.onmouseleave = () => { removeBtn.style.opacity = '0.6' }
        chip.appendChild(removeBtn)

        // Insert at cursor if inside div, otherwise at end
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0 && div.contains(sel.anchorNode)) {
            const range = sel.getRangeAt(0)
            range.deleteContents()
            range.insertNode(chip)
            range.setStartAfter(chip)
            range.collapse(true)
            sel.removeAllRanges()
            sel.addRange(range)
        } else {
            div.appendChild(chip)
        }

        // Ensure trailing space for cursor placement
        if (!chip.nextSibling || (chip.nextSibling.nodeType === Node.TEXT_NODE && !chip.nextSibling.textContent)) {
            chip.after(document.createTextNode(' '))
        }

        updateIsEmpty()
    }, [updateIsEmpty])

    // Register element attach callback from the hook
    useEffect(() => {
        onElementAttachedRef.current = (event) => {
            const div = editableRef.current
            if (!div) return

            if (event.clearExisting) {
                div.innerHTML = ''
                chipMapRef.current.clear()
            }

            insertChipNode(event.element)

            if (event.suggestedText) {
                const existingText = getTextFromEditable()
                if (!existingText.trim()) {
                    div.appendChild(document.createTextNode(event.suggestedText))
                }
            }

            updateIsEmpty()
            div.focus()
            placeCursorAtEnd()
        }
        return () => { onElementAttachedRef.current = null }
    }, [onElementAttachedRef, insertChipNode, getTextFromEditable, updateIsEmpty, placeCursorAtEnd])

    // Register image click callback from the hook
    useEffect(() => {
        onImageClickRef.current = (images: string[], index: number) => {
            setPreviewImages(images)
            setPreviewIndex(index)
        }
        return () => { onImageClickRef.current = null }
    }, [onImageClickRef])

    // ─── Input event handlers ────────────────────────────────

    const handleEditableInput = useCallback(() => {
        syncChipMap()
        updateIsEmpty()
        const div = editableRef.current
        if (div) div.scrollTop = div.scrollHeight
    }, [syncChipMap, updateIsEmpty])

    const getContentSegmentsFromEditable = useCallback((): ContentSegment[] | undefined => {
        const div = editableRef.current
        if (!div) return undefined
        const segments: ContentSegment[] = []
        let hasChips = false
        const walk = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const t = node.textContent || ''
                if (t) segments.push({ type: 'text', text: t })
            } else if ((node as HTMLElement).dataset?.chipId) {
                hasChips = true
                const chipId = (node as HTMLElement).dataset.chipId!
                const el = chipMapRef.current.get(chipId)
                if (el) {
                    // Find index in current chips
                    const allChips = getChipsFromEditable()
                    const idx = allChips.findIndex(c =>
                        `${c.tag}:${c.source}:${c.line}` === `${el.tag}:${el.source}:${el.line}`
                    )
                    segments.push({ type: 'element', elementIndex: idx >= 0 ? idx : 0 })
                }
            } else {
                for (const child of Array.from(node.childNodes)) {
                    walk(child)
                }
            }
        }
        for (const child of Array.from(div.childNodes)) {
            walk(child)
        }
        return hasChips ? segments : undefined
    }, [getChipsFromEditable])

    const handleFormSubmit = useCallback((e?: React.FormEvent) => {
        e?.preventDefault()
        const text = getTextFromEditable()
        const elements = getChipsFromEditable()
        const hasImages = imageAttachments.length > 0
        const hasContent = !!text || elements.length > 0 || hasImages
        if (!hasContent || isLoading) return

        let prompt = text
        if (!prompt) {
            const parts: string[] = []
            if (elements.length > 0) parts.push(t('attachedElements'))
            if (hasImages) parts.push(imageAttachments.length === 1 ? t('attachedImage') : t('attachedImages'))
            prompt = `(${t('seeAttached', { parts: parts.join(' & ') })})`
        }
        const contentSegments = getContentSegmentsFromEditable()
        submitMessage(prompt, {
            elements: elements.length > 0 ? elements : undefined,
            imageDataUrls: hasImages ? imageAttachments.map(a => a.dataUrl) : undefined,
            contentSegments,
        })
        clearEditable()
    }, [getTextFromEditable, getChipsFromEditable, getContentSegmentsFromEditable, imageAttachments, isLoading, submitMessage, clearEditable, t])

    const handleEditableKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleFormSubmit()
        }
    }, [handleFormSubmit])

    const handleEditablePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault()
        const text = e.clipboardData.getData('text/plain')
        document.execCommand('insertText', false, text)
    }, [])

    const handleEditableClick = useCallback((e: React.MouseEvent) => {
        const target = e.target as HTMLElement
        const removeBtn = target.closest('[data-remove-chip]') as HTMLElement | null
        if (removeBtn) {
            const chipId = removeBtn.dataset.removeChip!
            const chipNode = editableRef.current?.querySelector(`[data-chip-id="${chipId}"]`)
            if (chipNode) {
                chipNode.remove()
                chipMapRef.current.delete(chipId)
                updateIsEmpty()
            }
        }
    }, [updateIsEmpty])

    const triggerInspectForAttach = useCallback(() => {
        window.parent.postMessage({ type: 'AWEL_INSPECT_FOR_ATTACH' }, '*')
    }, [])

    // ─── Render ──────────────────────────────────────────────

    return (
        <div className="flex flex-col relative h-full min-h-0 overflow-hidden">
            {/* Messages Area */}
            <div className="overflow-y-auto p-4 space-y-3 flex-1 min-h-0 break-words">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center min-h-full gap-4 text-muted-foreground text-center">
                        <Terminal className="w-8 h-8 opacity-50" />
                        <p className="text-sm">{t('emptyState')}</p>
                        <p className="text-xs mt-1 text-muted-foreground">{t('emptyStateHint')}</p>
                    </div>
                ) : renderedMessages}
                {isLoading && (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{t('thinking')}</span>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Image preview pills */}
            {imageAttachments.length > 0 && (
                <div className="mx-4 mt-2 mb-2 flex flex-wrap gap-2">
                    {imageAttachments.map((img, i) => (
                        <div key={i} className="relative group" title={img.name}>
                            <img
                                src={img.dataUrl}
                                alt={img.name}
                                className="w-10 h-10 rounded-lg border border-border/50 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                onClick={() => { setPreviewImages(imageAttachments.map(a => a.dataUrl)); setPreviewIndex(i) }}
                            />
                            <button
                                onClick={() => removeImageAttachment(i)}
                                className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            >
                                <X className="w-2.5 h-2.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Console Errors/Warnings */}
            <div className="border-t border-border flex items-end">
                <div className="flex-1 min-w-0">
                    <ConsoleChips
                        entries={consoleEntries}
                        onEntryClick={handleConsoleEntryClick}
                        onDismiss={dismissConsoleEntry}
                        onClearAll={clearConsoleEntries}
                    />
                </div>
                <div className="flex items-center gap-0.5 mr-4 mb-1.5">
                    <InstantTooltip text={t('inspectElement')}>
                        <button
                            type="button"
                            onClick={triggerInspectForAttach}
                            className={`shrink-0 p-1 rounded transition-colors ${
                                !inputEmpty ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <Crosshair className="w-4 h-4" />
                        </button>
                    </InstantTooltip>
                    <InstantTooltip text={t('attachImage')}>
                        <button
                            type="button"
                            onClick={handleImageAttach}
                            className={`shrink-0 p-1 rounded transition-colors ${
                                imageAttachments.length > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            <ImagePlus className="w-4 h-4" />
                        </button>
                    </InstantTooltip>
                </div>
            </div>

            {/* Hidden file input for image attachment */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Input Area */}
            <form onSubmit={handleFormSubmit}>
                {/* Attached console entries */}
                {attachedConsoleEntries.length > 0 && (
                    <div className="px-4 pt-3 pb-0 flex items-center gap-1.5 flex-wrap">
                        {attachedConsoleEntries.map(entry => (
                            <AttachedEntryPill
                                key={entry.id}
                                entry={entry}
                                onRemove={removeAttachedConsoleEntry}
                            />
                        ))}
                    </div>
                )}
                <div className="flex gap-2 p-4 pt-1.5 items-end">
                    <div className="flex-1 bg-card border border-border rounded-lg focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring relative min-h-[36px]">
                        <div
                            ref={editableRef}
                            contentEditable={!isLoading && !waitingForInput}
                            suppressContentEditableWarning
                            onInput={handleEditableInput}
                            onKeyDown={handleEditableKeyDown}
                            onPaste={handleEditablePaste}
                            onClick={handleEditableClick}
                            className={`px-4 py-2 text-sm text-foreground focus:outline-none min-w-0 ${
                                isLoading || waitingForInput ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: '20px', maxHeight: '80px', overflowY: 'auto' }}
                        />
                        {inputEmpty && (
                            <div className="absolute left-4 top-2 text-sm text-muted-foreground pointer-events-none">
                                {t('inputPlaceholder')}
                            </div>
                        )}
                    </div>
                    {isLoading || waitingForInput ? (
                        <Button
                            type="button"
                            onClick={stopStream}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            <Square className="w-3.5 h-3.5" />
                        </Button>
                    ) : (
                        <Button
                            type="submit"
                            disabled={inputEmpty && imageAttachments.length === 0}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    )}
                </div>
            </form>

            {previewImages && (
                <ImagePreviewModal
                    images={previewImages}
                    currentIndex={previewIndex}
                    onClose={() => setPreviewImages(null)}
                    onNavigate={setPreviewIndex}
                />
            )}
        </div>
    )
}

// ─── Attached Entry Pill ─────────────────────────────────────

function AttachedEntryPill({ entry, onRemove }: { entry: ConsoleEntry; onRemove: (id: string) => void }) {
    const [showTooltip, setShowTooltip] = useState(false)
    const isError = entry.level === 'error'

    const tooltipText = (() => {
        const lines = [entry.message]
        if (entry.sourceTrace && entry.sourceTrace.length > 0) {
            lines.push('')
            for (const f of entry.sourceTrace) {
                lines.push(`  ${f.source}${f.line ? `:${f.line}` : ''}`)
            }
        } else if (entry.source) {
            let loc = entry.source
            if (entry.line) loc += `:${entry.line}`
            if (entry.column) loc += `:${entry.column}`
            lines.push(`Source: ${loc}`)
        }
        if (entry.count > 1) {
            lines.push('')
            lines.push(`Occurred ${entry.count} times`)
        }
        return lines.join('\n')
    })()

    return (
        <div
            className="relative"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-default ${
                isError
                    ? 'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100'
            }`}>
                {isError ? 'error' : 'warning'}
                <span className={`font-normal text-[11px] truncate max-w-[160px] ${
                    isError ? 'text-red-600 dark:text-red-200' : 'text-yellow-600 dark:text-yellow-200'
                }`}>
                    {entry.message.length > 40 ? entry.message.slice(0, 40) + '\u2026' : entry.message}
                </span>
                <button
                    type="button"
                    onClick={() => onRemove(entry.id)}
                    className="text-current opacity-60 hover:opacity-100 transition-opacity"
                >
                    <X className="w-3 h-3" />
                </button>
            </span>

            {showTooltip && (
                <div className="absolute bottom-full left-0 mb-1.5 z-50 w-72 max-h-48 overflow-y-auto rounded-md border border-border bg-card p-2.5 text-xs text-foreground shadow-lg whitespace-pre-wrap break-words font-mono">
                    {tooltipText}
                </div>
            )}
        </div>
    )
}
