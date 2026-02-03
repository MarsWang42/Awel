import { Loader2, StopCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface StatusMessageProps {
    text: string
}

export function StatusMessage({ text }: StatusMessageProps) {
    const { t } = useTranslation()
    const isAborted = text === 'aborted'

    if (isAborted) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground text-xs py-1">
                <StopCircle className="w-3 h-3" />
                <span>{t('aborted')}</span>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2 text-muted-foreground text-xs py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{text}</span>
        </div>
    )
}
