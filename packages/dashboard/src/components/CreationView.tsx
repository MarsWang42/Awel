import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, Square, Sparkles } from 'lucide-react'
import { Button } from './ui/button'
import { ModelSelector, type ModelSelectorHandle } from './ModelSelector'
import { useConsole } from '../hooks/useConsole'
import { useTheme } from '../hooks/useTheme'
import { Sun, Moon } from 'lucide-react'

interface ProviderEntry {
    id: string
    label: string
    color: string
    available: boolean
    models: { id: string; label: string }[]
}

interface StyleOption {
    nameKey: string
    descKey: string
    promptKey: string
}

interface CategoryOption {
    labelKey: string
    fallback: string
    icon: string
    styles: StyleOption[]
}

const CREATION_CATEGORIES: CategoryOption[] = [
    {
        labelKey: 'creationChipSaaS',
        fallback: 'SaaS Landing Page',
        icon: '🚀',
        styles: [
            { nameKey: 'styleSaasGradientName', descKey: 'styleSaasGradientDesc', promptKey: 'promptSaasGradient' },
            { nameKey: 'styleSaasDarkName', descKey: 'styleSaasDarkDesc', promptKey: 'promptSaasDark' },
            { nameKey: 'styleSaasMinimalName', descKey: 'styleSaasMinimalDesc', promptKey: 'promptSaasMinimal' }
        ]
    },
    {
        labelKey: 'creationChipAgency',
        fallback: 'Creative Portfolio',
        icon: '🎨',
        styles: [
            { nameKey: 'styleAgencyEditorialName', descKey: 'styleAgencyEditorialDesc', promptKey: 'promptAgencyEditorial' },
            { nameKey: 'styleAgencyBrutalistName', descKey: 'styleAgencyBrutalistDesc', promptKey: 'promptAgencyBrutalist' },
            { nameKey: 'styleAgencyElegantName', descKey: 'styleAgencyElegantDesc', promptKey: 'promptAgencyElegant' }
        ]
    },
    {
        labelKey: 'creationChipProduct',
        fallback: 'Product Showcase',
        icon: '✨',
        styles: [
            { nameKey: 'styleProductLuxuryName', descKey: 'styleProductLuxuryDesc', promptKey: 'promptProductLuxury' },
            { nameKey: 'styleProductGlassName', descKey: 'styleProductGlassDesc', promptKey: 'promptProductGlass' },
            { nameKey: 'styleProductBoldName', descKey: 'styleProductBoldDesc', promptKey: 'promptProductBold' }
        ]
    },
    {
        labelKey: 'creationChipLocal',
        fallback: 'Restaurant & Local',
        icon: '🍽️',
        styles: [
            { nameKey: 'styleLocalWarmName', descKey: 'styleLocalWarmDesc', promptKey: 'promptLocalWarm' },
            { nameKey: 'styleLocalModernName', descKey: 'styleLocalModernDesc', promptKey: 'promptLocalModern' },
            { nameKey: 'styleLocalRusticName', descKey: 'styleLocalRusticDesc', promptKey: 'promptLocalRustic' }
        ]
    }
]

interface ComparisonRun {
    id: string
    branchName: string
    modelId: string
    modelLabel: string
    modelProvider: string
    providerLabel: string
    status: 'building' | 'success' | 'failed'
    prompt: string
    createdAt: string
}

interface ComparisonState {
    runs: ComparisonRun[]
    activeRunId: string | null
    phase: 'initial' | 'building' | 'comparing' | null
    originalPrompt?: string
}

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
    const [modelReady, setModelReady] = useState(false)
    const [providers, setProviders] = useState<ProviderEntry[]>([])
    const [selectedCategory, setSelectedCategory] = useState<CategoryOption | null>(null)
    const [selectedStyle, setSelectedStyle] = useState<StyleOption | null>(null)
    const [contextInput, setContextInput] = useState('')
    const [comparisonState, setComparisonState] = useState<ComparisonState | null>(null)
    const [pendingAutoSubmit, setPendingAutoSubmit] = useState<string | null>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const contextInputRef = useRef<HTMLInputElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const modelSelectorRef = useRef<ModelSelectorHandle>(null)

    const {
        messages,
        isLoading,
        renderedMessages,
        submitMessage,
        stopStream,
        waitingForInput,
    } = useConsole(selectedModel, selectedModelProvider)

    // Auto-focus the input once model is ready
    useEffect(() => {
        if (modelReady && phase === 'initial') {
            inputRef.current?.focus()
        }
    }, [modelReady, phase])

    // Transition to building phase on first message
    useEffect(() => {
        if (messages.length > 0 && phase === 'initial') {
            setPhase('building')
        }
    }, [messages.length, phase])

    // When the agent finishes successfully, mark the project/run as ready and transition.
    useEffect(() => {
        if (phase !== 'building') return
        const lastResult = [...messages].reverse().find(m => m.type === 'result')
        if (lastResult && lastResult.resultSubtype === 'success') {
            // Mark the run as complete (this transitions to comparing phase)
            // Include duration and token usage stats for the comparison view
            fetch('/api/project/mark-ready', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    duration: lastResult.durationMs,
                    inputTokens: lastResult.inputTokens,
                    outputTokens: lastResult.outputTokens,
                }),
            })
                .then(r => r.json())
                .then(data => {
                    if (data.comparison) {
                        setComparisonState(data.comparison)
                    }
                })
                .catch(() => {})
            setPhase('success')
            setTimeout(() => {
                // Redirect to app - comparison sidebar will be shown by host script
                window.location.href = '/'
            }, 3000)
        }
    }, [messages, phase])

    // Auto-scroll messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    // Fetch provider catalog for the model picker and check initial model validity
    useEffect(() => {
        fetch('/api/models').then(r => r.json()).then(data => {
            if (data.providers && Array.isArray(data.providers)) {
                const providerList: ProviderEntry[] = data.providers
                setProviders(providerList)
                // If user already had a model stored, check it's still valid
                if (selectedModel && selectedModelProvider) {
                    const provider = providerList.find(p => p.id === selectedModelProvider && p.available)
                    if (!provider) return
                    // Custom OpenRouter model — valid if the provider is available
                    const isCustomModel = selectedModelProvider === 'openrouter'
                        && !provider.models.some(m => m.id === selectedModel)
                    if (isCustomModel || provider.models.some(m => m.id === selectedModel)) {
                        setModelReady(true)
                    }
                }
            }
        }).catch(() => {})
    }, [])

    // Check for existing comparison state (e.g., resuming after page reload or "Try Another Model")
    useEffect(() => {
        fetch('/api/comparison/runs').then(r => r.json()).then((data: ComparisonState) => {
            if (data.phase === 'building' && data.activeRunId) {
                setComparisonState(data)
                const activeRun = data.runs.find(r => r.id === data.activeRunId)
                if (activeRun) {
                    // Resume building phase with the active run's model
                    setSelectedModel(activeRun.modelId)
                    setSelectedModelProvider(activeRun.modelProvider)
                    setModelReady(true)
                    setPhase('building')

                    // Check if we should auto-submit (coming from "Try Another Model")
                    let shouldAutoSubmit = false
                    try {
                        shouldAutoSubmit = sessionStorage.getItem('awel-auto-submit') === 'true'
                        if (shouldAutoSubmit) {
                            sessionStorage.removeItem('awel-auto-submit')
                        }
                    } catch { /* ignore storage errors */ }

                    if (shouldAutoSubmit && data.originalPrompt) {
                        // Queue the prompt for auto-submit after model state is updated
                        setPendingAutoSubmit(data.originalPrompt)
                    }
                }
            }
        }).catch(() => {})
    }, [])

    // Handle pending auto-submit after model state is ready
    useEffect(() => {
        if (pendingAutoSubmit && modelReady && !isLoading) {
            const prompt = pendingAutoSubmit
            setPendingAutoSubmit(null)
            submitMessage(prompt)
        }
    }, [pendingAutoSubmit, modelReady, isLoading, submitMessage])

    const handleModelChange = useCallback((modelId: string, modelProvider: string) => {
        setSelectedModel(modelId)
        setSelectedModelProvider(modelProvider)
        setModelReady(true)
        onModelChange(modelId, modelProvider)
        localStorage.setItem('awel-model', modelId)
        localStorage.setItem('awel-model-provider', modelProvider)
    }, [onModelChange])

    const handleModelReady = useCallback((valid: boolean) => {
        setModelReady(valid)
    }, [])

    const handleSubmit = useCallback(async (text?: string) => {
        const prompt = text || input.trim()
        if (!prompt || isLoading) return
        setInput('')

        // Transition to building phase immediately to prevent UI flicker
        setPhase('building')

        // Initialize comparison mode if this is the first submission
        if (!comparisonState) {
            try {
                // Look up model and provider labels
                const provider = providers.find(p => p.id === selectedModelProvider)
                const model = provider?.models.find(m => m.id === selectedModel)
                const modelLabel = model?.label || selectedModel
                const providerLabel = provider?.label || selectedModelProvider

                const res = await fetch('/api/comparison/runs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        modelId: selectedModel,
                        modelLabel,
                        modelProvider: selectedModelProvider,
                        providerLabel,
                        prompt,
                    }),
                })
                const data = await res.json()
                if (data.success && data.state) {
                    setComparisonState(data.state)
                }
            } catch {
                // Fall back to normal flow if comparison init fails
            }
        }

        submitMessage(prompt)
    }, [input, isLoading, submitMessage, comparisonState, selectedModel, selectedModelProvider, providers])

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }, [handleSubmit])

    const handleCategoryClick = useCallback((category: CategoryOption) => {
        setSelectedCategory(category)
        setSelectedStyle(null)
        setContextInput('')
    }, [])

    const handleStyleClick = useCallback((style: StyleOption) => {
        // Show context input step for all categories
        setSelectedStyle(style)
        setTimeout(() => contextInputRef.current?.focus(), 100)
    }, [])

    const handleContextSubmit = useCallback(() => {
        if (!selectedStyle || !contextInput.trim()) return
        const context = contextInput.trim()
        // Build the full prompt with user's context (prompt is already localized via i18n)
        const basePrompt = t(selectedStyle.promptKey)
        const prompt = basePrompt.replace('{{context}}', context)
        setSelectedCategory(null)
        setSelectedStyle(null)
        setContextInput('')
        handleSubmit(prompt)
    }, [selectedStyle, contextInput, handleSubmit, t])

    const handleBackToCategories = useCallback(() => {
        setSelectedCategory(null)
        setSelectedStyle(null)
        setContextInput('')
    }, [])

    const handleBackToStyles = useCallback(() => {
        setSelectedStyle(null)
        setContextInput('')
    }, [])

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
            {/* Top bar — show ModelSelector in header once model is ready or in building phase */}
            <header className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm leading-none">🌸</span>
                    <span className="text-sm font-semibold text-foreground">Awel</span>
                    {isLoading && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {(modelReady || phase !== 'initial') && (
                        <ModelSelector
                            ref={modelSelectorRef}
                            selectedModel={selectedModel}
                            selectedModelProvider={selectedModelProvider}
                            onModelChange={handleModelChange}
                            onReady={handleModelReady}
                            chatHasMessages={messages.length > 0}
                        />
                    )}
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
                {/* Step 1: pick a model */}
                {phase === 'initial' && !modelReady && (
                    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-lg px-6">
                        <h1 className="text-xl font-semibold text-foreground tracking-tight text-center">
                            {t('chooseModelHeading', 'Select a model')}
                        </h1>
                        <p className="text-sm text-muted-foreground text-center mt-1.5 mb-6">
                            {t('chooseModelFirst', 'Choose a model to get started.')}
                        </p>

                        {providers.filter(p => p.available && p.models.length > 0).length === 0 && providers.length > 0 && (
                            <p className="text-xs text-muted-foreground">{t('noModelsAvailable', 'No models available. Configure a provider to continue.')}</p>
                        )}

                        <div className="w-full space-y-4">
                            {providers.filter(p => p.available && p.models.length > 0).map(provider => (
                                <div key={provider.id}>
                                    <div className={`text-[10px] font-medium uppercase tracking-wider mb-1.5 px-1 ${provider.color || 'text-muted-foreground'}`}>
                                        {provider.label}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {provider.models.map(m => (
                                            <button
                                                key={m.id}
                                                onClick={() => handleModelChange(m.id, provider.id)}
                                                className="px-3 py-2.5 rounded-lg border border-border bg-card text-left text-sm text-foreground hover:border-ring hover:bg-accent/50 transition-colors"
                                            >
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Step 2: describe what to build */}
                {phase === 'initial' && modelReady && (
                    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl px-6">
                        <div className="text-center mb-8 space-y-3">
                            <h1 className="text-3xl font-semibold text-foreground tracking-tight">
                                {selectedStyle
                                    ? (selectedCategory?.labelKey === 'creationChipSaaS'
                                        ? t('creationSaasQuestion', 'What does your product do?')
                                        : selectedCategory?.labelKey === 'creationChipAgency'
                                            ? t('creationAgencyQuestion', 'What do you create?')
                                            : selectedCategory?.labelKey === 'creationChipProduct'
                                                ? t('creationProductQuestion', 'What are you selling?')
                                                : t('creationLocalQuestion', 'What type of establishment?'))
                                    : selectedCategory
                                        ? t('creationChooseStyle', 'Choose a design style')
                                        : t('creationHeading', 'What would you like to build?')
                                }
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {selectedStyle
                                    ? `${t(selectedStyle.nameKey)} · ${selectedCategory?.icon} ${t(selectedCategory?.labelKey || '', selectedCategory?.fallback)}`
                                    : selectedCategory
                                        ? `${selectedCategory.icon} ${t(selectedCategory.labelKey, selectedCategory.fallback)}`
                                        : t('creationSubheading', 'Describe your app and Awel will create it for you.')
                                }
                            </p>
                        </div>

                        {/* Category selection */}
                        {!selectedCategory && (
                            <div className="grid grid-cols-2 gap-3 mb-8 w-full max-w-md">
                                {CREATION_CATEGORIES.map((category) => (
                                    <button
                                        key={category.labelKey}
                                        onClick={() => handleCategoryClick(category)}
                                        className="flex flex-col items-center gap-2 px-4 py-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-ring transition-colors text-center"
                                    >
                                        <span className="text-2xl">{category.icon}</span>
                                        <span className="text-sm font-medium text-foreground">
                                            {t(category.labelKey, category.fallback)}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Style selection */}
                        {selectedCategory && !selectedStyle && (
                            <div className="w-full max-w-lg mb-8 space-y-3">
                                {selectedCategory.styles.map((style, index) => (
                                    <button
                                        key={index}
                                        onClick={() => handleStyleClick(style)}
                                        className="w-full text-left px-4 py-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-ring transition-colors"
                                    >
                                        <div className="font-medium text-foreground mb-1">{t(style.nameKey)}</div>
                                        <div className="text-xs text-muted-foreground">{t(style.descKey)}</div>
                                    </button>
                                ))}
                                <button
                                    onClick={handleBackToCategories}
                                    className="w-full text-center px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    ← {t('creationBackToCategories', 'Back to categories')}
                                </button>
                            </div>
                        )}

                        {/* Context input for Product/Local */}
                        {selectedStyle && (
                            <div className="w-full max-w-lg mb-8 space-y-4">
                                <input
                                    ref={contextInputRef}
                                    type="text"
                                    value={contextInput}
                                    onChange={(e) => setContextInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault()
                                            handleContextSubmit()
                                        }
                                    }}
                                    placeholder={
                                        selectedCategory?.labelKey === 'creationChipSaaS'
                                            ? t('creationSaasPlaceholder', 'e.g. Project management for remote teams, AI writing assistant...')
                                            : selectedCategory?.labelKey === 'creationChipAgency'
                                                ? t('creationAgencyPlaceholder', 'e.g. Brand identity design, Product photography, Motion graphics...')
                                                : selectedCategory?.labelKey === 'creationChipProduct'
                                                    ? t('creationProductPlaceholder', 'e.g. Wireless earbuds, Artisan candles, Fitness app...')
                                                    : t('creationLocalPlaceholder', 'e.g. Italian trattoria, Craft coffee roaster, Ramen bar...')
                                    }
                                    className="w-full px-4 py-3 text-sm bg-card border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleBackToStyles}
                                        className="flex-1 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-accent transition-colors"
                                    >
                                        ← {t('creationBackToStyles', 'Back')}
                                    </button>
                                    <button
                                        onClick={handleContextSubmit}
                                        disabled={!contextInput.trim()}
                                        className="flex-1 px-4 py-2.5 text-sm bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {t('creationStart', 'Start Building')} →
                                    </button>
                                </div>
                            </div>
                        )}

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
                )}

                {/* Step 3: building */}
                {phase === 'building' && (
                    <div className="flex-1 flex flex-col w-full max-w-3xl min-h-0">
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
