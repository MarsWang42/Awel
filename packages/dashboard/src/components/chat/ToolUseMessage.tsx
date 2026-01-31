import { useState, useMemo } from 'react'
import { Wrench, FileText, Edit, Terminal, Search, FolderTree, List } from 'lucide-react'

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
const TOOL_COLORS: Record<string, string> = {
    Read: 'text-blue-400 border-blue-500/50',
    Write: 'text-foreground border-border/50',
    Edit: 'text-foreground border-border/50',
    Bash: 'text-purple-400 border-purple-500/50',
    Grep: 'text-orange-400 border-orange-500/50',
    Glob: 'text-cyan-400 border-cyan-500/50',
    Ls: 'text-cyan-400 border-cyan-500/50',
}

export function ToolUseMessage({ toolName, input }: ToolUseMessageProps) {
    const [expanded, setExpanded] = useState(false)

    const Icon = TOOL_ICONS[toolName] || Wrench
    const colorClass = TOOL_COLORS[toolName] || 'text-amber-400 border-amber-500/50'

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
        <div className={`border-l-2 ${colorClass.split(' ')[1]} pl-3 py-1.5 my-1`}>
            <div
                className={`flex items-center gap-2 text-xs cursor-pointer transition-colors ${colorClass.split(' ')[0]} hover:brightness-125`}
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
