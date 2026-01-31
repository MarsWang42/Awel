import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Wrench, ChevronDown, ChevronRight } from 'lucide-react'

interface ToolGroupProps {
    toolCount: number
    children: React.ReactNode
}

export function ToolGroup({ toolCount, children }: ToolGroupProps) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)

    const label = t('toolCall', { count: toolCount })

    return (
        <div className="my-1">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded hover:bg-muted/50 w-full"
            >
                <Wrench className="w-3 h-3" />
                <span>{label}</span>
                {expanded
                    ? <ChevronDown className="w-3 h-3 ml-auto" />
                    : <ChevronRight className="w-3 h-3 ml-auto" />
                }
            </button>
            {expanded && (
                <div className="mt-1 space-y-0.5">
                    {children}
                </div>
            )}
        </div>
    )
}
