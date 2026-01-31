import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'awel-theme'

function getSystemTheme(): 'light' | 'dark' {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
    return 'system'
}

export function useTheme() {
    const [theme, setThemeState] = useState<Theme>(getStoredTheme)
    const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme)

    const resolvedTheme: 'light' | 'dark' = theme === 'system' ? systemTheme : theme

    const setTheme = useCallback((t: Theme) => {
        setThemeState(t)
        localStorage.setItem(STORAGE_KEY, t)
    }, [])

    useEffect(() => {
        const root = document.documentElement
        if (resolvedTheme === 'dark') {
            root.classList.add('dark')
        } else {
            root.classList.remove('dark')
        }
    }, [resolvedTheme])

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)')
        const handler = (e: MediaQueryListEvent) => {
            setSystemTheme(e.matches ? 'dark' : 'light')
        }
        mq.addEventListener('change', handler)
        return () => mq.removeEventListener('change', handler)
    }, [])

    return { theme, resolvedTheme, setTheme }
}
