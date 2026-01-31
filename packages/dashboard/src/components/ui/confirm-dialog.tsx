import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

interface ConfirmDialogProps {
    title: string
    description: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'danger' | 'warning'
    onConfirm: () => void
    onCancel: () => void
}

export function ConfirmDialog({
    title,
    description,
    confirmLabel,
    cancelLabel,
    variant = 'danger',
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    const { t } = useTranslation()
    const resolvedConfirmLabel = confirmLabel ?? t('confirm')
    const resolvedCancelLabel = cancelLabel ?? t('cancel')
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onCancel()
    }, [onCancel])

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [handleKeyDown])

    const confirmClasses = variant === 'danger'
        ? 'bg-red-600 hover:bg-red-500 text-white'
        : 'bg-amber-600 hover:bg-amber-500 text-white'

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
            onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onCancel() }}
        >
            <div className="bg-card border border-border rounded-lg w-full max-w-sm shadow-xl mx-4 p-4">
                <h3 className="text-sm font-medium text-foreground">{title}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>
                <div className="mt-4 flex gap-2 justify-end">
                    <button
                        onClick={onCancel}
                        className="text-xs px-3 py-1.5 rounded bg-muted text-muted-foreground hover:bg-accent transition-colors"
                    >
                        {resolvedCancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`text-xs px-3 py-1.5 rounded transition-colors ${confirmClasses}`}
                    >
                        {resolvedConfirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
