import { useTranslation } from 'react-i18next'
import { Scissors } from 'lucide-react'

interface CompactBoundaryMessageProps {
    trigger?: 'manual' | 'auto'
    preTokens?: number
}

export function CompactBoundaryMessage({ trigger, preTokens }: CompactBoundaryMessageProps) {
    const { t } = useTranslation()
    return (
        <div className="flex items-center gap-2 text-muted-foreground text-xs py-2 my-1 border-t border-b border-border/50">
            <Scissors className="w-3 h-3" />
            <span>
                {t('conversationCompacted')}
                {trigger && <span className="text-muted-foreground"> ({trigger})</span>}
                {preTokens && <span className="text-muted-foreground"> · {preTokens.toLocaleString()} tokens</span>}
            </span>
        </div>
    )
}
