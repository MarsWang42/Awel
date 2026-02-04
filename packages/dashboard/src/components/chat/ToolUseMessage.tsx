import { useState, useMemo } from 'react'
import { Wrench, FileText, Edit, Terminal, Search, FolderTree, List } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ToolUseMessageProps {
    toolName: string
    input?: Record<string, unknown>
}

// Tool-specific icons
const TOOL_ICONS: Record<string, typeof Wrench> = {
    Read: FileText,
    Write: Edit,
    Edit: Edit,
    Bash: Terminal,
    Grep: Search,
    Glob: FolderTree,
    Ls: List,
}

// Tool-specific colors
const TOOL_COLORS: Record<string, { text: string; border: string }> = {
    Read: { text: 'text-blue-400', border: 'border-blue-500/50' },
    Write: { text: 'text-foreground', border: 'border-border/50' },
    Edit: { text: 'text-foreground', border: 'border-border/50' },
    Bash: { text: 'text-purple-400', border: 'border-purple-500/50' },
    Grep: { text: 'text-orange-400', border: 'border-orange-500/50' },
    Glob: { text: 'text-cyan-400', border: 'border-cyan-500/50' },
    Ls: { text: 'text-cyan-400', border: 'border-cyan-500/50' },
}

const DEFAULT_COLORS = { text: 'text-amber-400', border: 'border-amber-500/50' }

export function ToolUseMessage({ toolName, input }: ToolUseMessageProps) {
    const [expanded, setExpanded] = useState(false)

    const Icon = TOOL_ICONS[toolName] || Wrench
    const colors = TOOL_COLORS[toolName] || DEFAULT_COLORS

    // Create a preview of the input based on tool type
    const preview = useMemo(() => {
        if (!input) return null

        switch (toolName) {
            case 'Read':
                return input.file_path ? `${input.file_path}` : null
            case 'Write':
            case 'Edit':
                return input.file_path ? `${input.file_path}` : null
            case 'Bash':
                return input.command ? `${input.command}` : null
            case 'Grep':
                return input.pattern ? `pattern: ${input.pattern}` : null
            case 'Glob':
                return input.pattern ? `${input.pattern}` : null
            case 'Ls':
                return input.path ? `${input.path}` : null
            default:
                if (input.file_path) return `${input.file_path}`
                if (input.command) return `${input.command}`
                if (input.pattern) return `${input.pattern}`
                return null
        }
    }, [input, toolName])

    // Format path for display (show only filename with directory hint)
    const formatPath = (path: string) => {
        const parts = path.split('/')
        if (parts.length <= 2) return path
        return `.../${parts.slice(-2).join('/')}`
    }

    const displayPreview = preview && typeof preview === 'string' && preview.includes('/')
        ? formatPath(preview)
        : preview

    return (
        <div className={cn("border-l-2 pl-3 py-1.5 my-1", colors.border)}>
            <div
                className={cn("flex items-center gap-2 text-xs cursor-pointer transition-colors hover:brightness-125", colors.text)}
                onClick={() => setExpanded(!expanded)}
            >
                <Icon className="w-3.5 h-3.5" />
                <span className="font-medium">{toolName}</span>
                {displayPreview && (
                    <span className="text-muted-foreground truncate max-w-[250px] font-mono text-[11px]">
                        {displayPreview}
                    </span>
                )}
                <span className="text-muted-foreground text-[10px] ml-auto">
                    {expanded ? '▼' : '▶'}
                </span>
            </div>
            {expanded && input && (
                <pre className="text-muted-foreground text-[11px] mt-2 overflow-x-auto max-h-48 overflow-y-auto bg-card/50 rounded p-2 font-mono">
                    {JSON.stringify(input, null, 2)}
                </pre>
            )}
        </div>
    )
}
