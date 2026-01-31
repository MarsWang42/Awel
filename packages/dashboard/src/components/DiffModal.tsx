import { useState, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, FileCode, FilePlus } from 'lucide-react'
import * as Diff from 'diff'

export interface FileDiff {
    relativePath: string
    originalContent: string
    currentContent: string
    existed: boolean
    existsNow: boolean
}

interface DiffModalProps {
    diffs: FileDiff[]
    onClose: () => void
}

export function DiffModal({ diffs, onClose }: DiffModalProps) {
    const { t } = useTranslation()
    const [selectedIndex, setSelectedIndex] = useState(0)

    const selectedFile = diffs[selectedIndex]
    const patch = Diff.structuredPatch(
        selectedFile.relativePath,
        selectedFile.relativePath,
        selectedFile.originalContent,
        selectedFile.currentContent,
        '',
        '',
        { context: 3 }
    )

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose()
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(i => Math.min(i + 1, diffs.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(i => Math.max(i - 1, 0))
        }
    }, [onClose, diffs.length])

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    const fileName = (path: string) => {
        const parts = path.split('/')
        return parts[parts.length - 1]
    }

    const dirPath = (path: string) => {
        const parts = path.split('/')
        return parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    }

    const isNewFile = (diff: FileDiff) => !diff.existed && diff.existsNow

    return (
        <div className="fixed inset-0 z-50" onClick={(e) => { e.stopPropagation(); onClose(); }}>
            <div
                className="absolute inset-0 bg-background overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="text-sm text-foreground">
                        {t('fileChanged', { count: diffs.length })}
                    </span>
                    <button
                        onClick={onClose}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-1 min-h-0">
                    {/* Sidebar */}
                    <div className="w-64 border-r border-border overflow-y-auto flex-shrink-0">
                        {diffs.map((diff, i) => (
                            <button
                                key={diff.relativePath}
                                onClick={() => setSelectedIndex(i)}
                                className={`w-full text-left px-3 py-2 text-xs border-b border-border/50 transition-colors ${
                                    i === selectedIndex
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground hover:bg-card hover:text-foreground'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    {isNewFile(diff)
                                        ? <FilePlus className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />
                                        : <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                    }
                                    <div className="min-w-0">
                                        <div className="font-medium truncate">{fileName(diff.relativePath)}</div>
                                        {dirPath(diff.relativePath) && (
                                            <div className="text-muted-foreground truncate">{dirPath(diff.relativePath)}</div>
                                        )}
                                    </div>
                                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                                        isNewFile(diff)
                                            ? 'bg-green-100/60 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                                            : 'bg-blue-100/60 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400'
                                    }`}>
                                        {isNewFile(diff) ? 'New' : 'Modified'}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Diff pane */}
                    <div className="flex-1 overflow-auto">
                        <div className="font-mono text-xs leading-5">
                            {patch.hunks.length === 0 ? (
                                <div className="p-4 text-muted-foreground">{t('noChanges')}</div>
                            ) : (
                                patch.hunks.map((hunk, hunkIdx) => (
                                    <div key={hunkIdx}>
                                        {/* Hunk header */}
                                        <div className="bg-muted/50 text-muted-foreground px-4 py-1 select-none border-y border-border/50">
                                            @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                                        </div>
                                        {/* Lines */}
                                        {renderHunkLines(hunk)}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function renderHunkLines(hunk: Diff.Hunk) {
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart

    return hunk.lines.map((line, i) => {
        const prefix = line[0]
        const content = line.slice(1)

        let bgClass = ''
        let textClass = 'text-muted-foreground'
        let leftNum = ''
        let rightNum = ''

        if (prefix === '-') {
            bgClass = 'bg-red-100/50 dark:bg-red-900/20'
            textClass = 'text-red-700 dark:text-red-300'
            leftNum = String(oldLine++)
            rightNum = ''
        } else if (prefix === '+') {
            bgClass = 'bg-green-100/50 dark:bg-green-900/20'
            textClass = 'text-green-700 dark:text-green-300'
            leftNum = ''
            rightNum = String(newLine++)
        } else {
            leftNum = String(oldLine++)
            rightNum = String(newLine++)
        }

        return (
            <div key={i} className={`flex ${bgClass}`}>
                <span className="w-10 text-right pr-1 text-muted-foreground select-none flex-shrink-0">
                    {leftNum}
                </span>
                <span className="w-10 text-right pr-1 text-muted-foreground select-none flex-shrink-0">
                    {rightNum}
                </span>
                <span className={`w-6 text-center select-none flex-shrink-0 ${
                    prefix === '+' ? 'text-green-500' : prefix === '-' ? 'text-red-500' : 'text-muted-foreground'
                }`}>
                    {prefix === ' ' ? '' : prefix}
                </span>
                <span className={`flex-1 whitespace-pre ${textClass}`}>{content}</span>
            </div>
        )
    })
}
