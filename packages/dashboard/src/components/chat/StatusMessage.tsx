import { Loader2 } from 'lucide-react'

interface StatusMessageProps {
    text: string
}

export function StatusMessage({ text }: StatusMessageProps) {
    return (
        <div className="flex items-center gap-2 text-muted-foreground text-xs py-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{text}</span>
        </div>
    )
}
