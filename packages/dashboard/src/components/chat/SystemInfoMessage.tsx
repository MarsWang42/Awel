import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'

interface SystemInfoMessageProps {
    model?: string
    tools?: string[]
}

export function SystemInfoMessage({ model, tools }: SystemInfoMessageProps) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)

    return (
        <div
            className="flex items-start gap-2 text-muted-foreground text-xs py-1 cursor-pointer hover:text-foreground transition-colors"
            onClick={() => setExpanded(!expanded)}
        >
            <Info className="w-3 h-3 mt-0.5 shrink-0" />
            <div>
                <span>{t('sessionInitialized')}</span>
                {model && <span className="text-muted-foreground"> · {model}</span>}
                {expanded && tools && tools.length > 0 && (
                    <div className="mt-1 text-muted-foreground">
                        Tools: {tools.join(', ')}
                    </div>
                )}
            </div>
        </div>
    )
}
