import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, Square, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { ModelSelector } from './ModelSelector'
import { useConsole } from '../hooks/useConsole'
import { useTheme } from '../hooks/useTheme'
import { Sun, Moon } from 'lucide-react'

const SUGGESTION_CHIPS = [
    { labelKey: 'creationChipEcommerce', fallback: 'E-commerce store' },
    { labelKey: 'creationChipBlog', fallback: 'Blog platform' },
    { labelKey: 'creationChipDashboard', fallback: 'Admin dashboard' },
    { labelKey: 'creationChipPortfolio', fallback: 'Portfolio site' },
]

interface CreationViewProps {
    initialModel: string
    initialModelProvider: string
    onModelChange: (modelId: string, modelProvider: string) => void
}

export function CreationView({ initialModel, initialModelProvider, onModelChange }: CreationViewProps) {
    const { t } = useTranslation()
    const { resolvedTheme, setTheme } = useTheme()
    const [selectedModel, setSelectedModel] = useState(initialModel)
    const [selectedModelProvider, setSelectedModelProvider] = useState(initialModelProvider)
    const [input, setInput] = useState('')
    const [phase, setPhase] = useState<'initial' | 'building' | 'success'>('initial')
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const {
        messages,
        isLoading,
        renderedMessages,
        submitMessage,
        stopStream,
        waitingForInput,
    } = useConsole(selectedModel, selectedModelProvider)

    // Auto-focus the input on mount
    useEffect(() => {
        inputRef.current?.focus()
    }, [])

    // Transition to building phase on first message
    useEffect(() => {
        if (messages.length > 0 && phase === 'initial') {
            setPhase('building')
        }
    }, [messages.length, phase])

    // When the agent finishes successfully, mark the project as ready and transition.
    useEffect(() => {
        if (phase !== 'building') return
        const lastResult = [...messages].reverse().find(m => m.type === 'result')
        if (lastResult && lastResult.resultSubtype === 'success') {
            fetch('/api/project/mark-ready', { method: 'POST' }).catch(() => {})
            setPhase('success')
            setTimeout(() => {
                window.location.href = '/'
            }, 3000)
        }
    }, [messages, phase])

    // Auto-scroll messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    const handleModelChange = useCallback((modelId: string, modelProvider: string) => {
        setSelectedModel(modelId)
        setSelectedModelProvider(modelProvider)
        onModelChange(modelId, modelProvider)
        localStorage.setItem('awel-model', modelId)
        localStorage.setItem('awel-model-provider', modelProvider)
    }, [onModelChange])

    const handleSubmit = useCallback((text?: string) => {
        const prompt = text || input.trim()
        if (!prompt || isLoading) return
        setInput('')
        submitMessage(prompt)
    }, [input, isLoading, submitMessage])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }, [handleSubmit])

    const handleChipClick = useCallback((fallback: string) => {
        handleSubmit(fallback)
    }, [handleSubmit])

    const handleToggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }

    // ─── Success State ──────────────────────────────────────
    if (phase === 'success') {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="text-center space-y-4 animate-in fade-in duration-500">
                    <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                        <Sparkles className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h1 className="text-2xl font-semibold text-foreground">
                        {t('creationSuccess', 'Your app is ready!')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {t('creationRedirecting', 'Redirecting to your app...')}
                    </p>
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                </div>
            </div>
        )
    }

    // ─── Initial + Building States ──────────────────────────
    return (
        <div className="h-screen bg-background flex flex-col overflow-hidden">
            {/* Top bar */}
            <header className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm leading-none">🌸</span>
                    <span className="text-sm font-semibold text-foreground">Awel</span>
                    {isLoading && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <ModelSelector
                        selectedModel={selectedModel}
                        selectedModelProvider={selectedModelProvider}
                        onModelChange={handleModelChange}
                        chatHasMessages={messages.length > 0}
                    />
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleToggleTheme}
                        className="h-7 w-7 hover:bg-muted"
                        title={t('toggleTheme')}
                    >
                        {resolvedTheme === 'dark'
                            ? <Sun className="w-3.5 h-3.5" />
                            : <Moon className="w-3.5 h-3.5" />
                        }
                    </Button>
                </div>
            </header>

            {/* Main content area */}
            <div className="flex-1 flex flex-col items-center min-h-0">
                {phase === 'initial' ? (
                    /* ─── Initial: centered prompt ─── */
                    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl px-6">
                        <div className="text-center mb-8 space-y-3">
                            <h1 className="text-3xl font-semibold text-foreground tracking-tight">
                                {t('creationHeading', 'What would you like to build?')}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {t('creationSubheading', 'Describe your app and Awel will create it for you.')}
                            </p>
                        </div>

                        {/* Suggestion chips */}
                        <div className="flex flex-wrap justify-center gap-2 mb-8">
                            {SUGGESTION_CHIPS.map((chip) => (
                                <button
                                    key={chip.labelKey}
                                    onClick={() => handleChipClick(t(chip.labelKey, chip.fallback))}
                                    className="px-4 py-2 text-sm rounded-full border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors text-muted-foreground"
                                >
                                    {t(chip.labelKey, chip.fallback)}
                                </button>
                            ))}
                        </div>

                        {/* Input */}
                        <div className="w-full">
                            <div className="flex gap-2 items-end">
                                <div className="flex-1 bg-card border border-border rounded-xl focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring">
                                    <textarea
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={t('creationPlaceholder', 'Describe what you want to build...')}
                                        className="w-full px-4 py-3 text-sm bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
                                        rows={3}
                                        style={{ minHeight: '48px', maxHeight: '160px' }}
                                    />
                                </div>
                                <Button
                                    onClick={() => handleSubmit()}
                                    disabled={!input.trim()}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 w-12 rounded-xl"
                                >
                                    <Send className="w-5 h-5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* ─── Building: chat messages + input ─── */
                    <div className="flex-1 flex flex-col w-full max-w-3xl min-h-0">
                        {/* Messages area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-0 break-words">
                            {renderedMessages}
                            {isLoading && !waitingForInput && (
                                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    <span>{t('thinking')}</span>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input area */}
                        <div className="border-t border-border p-4">
                            <div className="flex gap-2 items-end">
                                <div className="flex-1 bg-card border border-border rounded-lg focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring">
                                    <textarea
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder={t('inputPlaceholder')}
                                        disabled={isLoading && !waitingForInput}
                                        className={`w-full px-4 py-2 text-sm bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none ${
                                            isLoading && !waitingForInput ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                        rows={1}
                                        style={{ minHeight: '36px', maxHeight: '120px' }}
                                    />
                                </div>
                                {isLoading || waitingForInput ? (
                                    <Button
                                        onClick={stopStream}
                                        className="bg-red-600 hover:bg-red-700 text-white"
                                    >
                                        <Square className="w-3.5 h-3.5" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => handleSubmit()}
                                        disabled={!input.trim()}
                                        className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        <Send className="w-4 h-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
