import { useState, useMemo } from 'react'
import { CheckCircle2, AlertCircle, FileCode, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ToolResultMessageProps {
    toolName?: string
    output?: string
    isError?: boolean
}

export function ToolResultMessage({ toolName, output, isError }: ToolResultMessageProps) {
    const [expanded, setExpanded] = useState(false)

    // Detect if output looks like file content (has line numbers like "1→" or numbered lines)
    const isFileContent = useMemo(() => {
        if (!output) return false
        return /^\s*\d+[→:]/.test(output) || output.includes('\n     1→')
    }, [output])

    // Detect if output is a file listing
    const isFileListing = useMemo(() => {
        if (!output) return false
        const lines = output.trim().split('\n')
        return lines.length > 0 && lines.every(line =>
            line.startsWith('/') || line.startsWith('./') || line.match(/^[a-zA-Z0-9_.-]+$/)
        )
    }, [output])

    // Create a smart preview
    const preview = useMemo(() => {
        if (!output) return ''

        if (isFileListing) {
            const files = output.trim().split('\n')
            if (files.length <= 3) return files.join(', ')
            return `${files.length} files found`
        }

        if (isFileContent) {
            const lines = output.trim().split('\n')
            return `${lines.length} lines`
        }

        // For regular output, show first line or truncated content
        const firstLine = output.split('\n')[0]
        if (firstLine.length > 60) return firstLine.slice(0, 60) + '...'
        return firstLine
    }, [output, isFileListing, isFileContent])

    const hasMore = (output?.length || 0) > 80 || (output?.split('\n').length || 0) > 1

    return (
        <div className={cn("border-l-2 pl-3 py-1 my-0.5", isError ? "border-red-500/50" : "border-border/50")}>
            <div
                className={cn(
                    "flex items-center gap-2 text-xs cursor-pointer transition-colors",
                    isError ? "text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setExpanded(!expanded)}
            >
                {isError ? (
                    <AlertCircle className="w-3 h-3" />
                ) : isFileContent ? (
                    <FileCode className="w-3 h-3" />
                ) : (
                    <CheckCircle2 className="w-3 h-3" />
                )}
                <span className="text-muted-foreground">
                    {toolName ? `← ${toolName}` : '← result'}
                </span>
                {preview && (
                    <span className="text-muted-foreground truncate max-w-[200px] font-mono text-[11px]">
                        {preview}
                    </span>
                )}
                {hasMore && (
                    <span className="text-muted-foreground ml-auto">
                        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </span>
                )}
            </div>
            {expanded && output && (
                <pre className={cn(
                    "text-[11px] mt-2 overflow-x-auto max-h-64 overflow-y-auto rounded p-2 font-mono",
                    isError ? "text-red-700 bg-red-100/50 dark:text-red-300 dark:bg-red-950/30" : "text-muted-foreground bg-card/50"
                )}>
                    {output}
                </pre>
            )}
        </div>
    )
}
