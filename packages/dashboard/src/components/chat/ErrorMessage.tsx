import { AlertCircle } from 'lucide-react'

interface ErrorMessageProps {
    text: string
}

export function ErrorMessage({ text }: ErrorMessageProps) {
    return (
        <div className="flex items-start gap-2 text-red-600 dark:text-red-400 text-xs py-1">
            <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="whitespace-pre-wrap">{text}</span>
        </div>
    )
}
