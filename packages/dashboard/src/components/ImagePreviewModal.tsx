import { useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

interface ImagePreviewModalProps {
    images: string[]
    currentIndex: number
    onClose: () => void
    onNavigate: (index: number) => void
}

export function ImagePreviewModal({ images, currentIndex, onClose, onNavigate }: ImagePreviewModalProps) {
    const { t } = useTranslation()
    const hasMultiple = images.length > 1

    const goNext = useCallback(() => {
        if (currentIndex < images.length - 1) onNavigate(currentIndex + 1)
    }, [currentIndex, images.length, onNavigate])

    const goPrev = useCallback(() => {
        if (currentIndex > 0) onNavigate(currentIndex - 1)
    }, [currentIndex, onNavigate])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowRight') goNext()
            if (e.key === 'ArrowLeft') goPrev()
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose, goNext, goPrev])

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
            >
                <X className="w-6 h-6" />
            </button>

            {hasMultiple && currentIndex > 0 && (
                <button
                    onClick={(e) => { e.stopPropagation(); goPrev() }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors"
                >
                    <ChevronLeft className="w-8 h-8" />
                </button>
            )}

            <img
                src={images[currentIndex]}
                alt={t('previewAlt', { index: currentIndex + 1 })}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
            />

            {hasMultiple && currentIndex < images.length - 1 && (
                <button
                    onClick={(e) => { e.stopPropagation(); goNext() }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors"
                >
                    <ChevronRight className="w-8 h-8" />
                </button>
            )}

            {hasMultiple && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
                    {currentIndex + 1} / {images.length}
                </div>
            )}
        </div>
    )
}
