import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

type Position = 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const positionClasses: Record<Position, string> = {
    'top': 'bottom-full mb-1.5 left-1/2 -translate-x-1/2',
    'bottom': 'top-full mt-1.5 left-1/2 -translate-x-1/2',
    'top-left': 'bottom-full mb-1.5 left-0',
    'top-right': 'bottom-full mb-1.5 right-0',
    'bottom-left': 'top-full mt-1.5 left-0',
    'bottom-right': 'top-full mt-1.5 right-0',
}

export function Tooltip({ text, children, position = 'top' }: {
    text: ReactNode
    children: ReactNode
    position?: Position
}) {
    return (
        <div className="relative group/tip">
            {children}
            <div className={cn(
                "invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-100",
                "absolute z-[60] px-2 py-1 text-[10px] leading-tight text-muted-foreground bg-card border border-border rounded shadow-lg",
                "whitespace-nowrap pointer-events-none",
                positionClasses[position]
            )}>
                {text}
            </div>
        </div>
    )
}
