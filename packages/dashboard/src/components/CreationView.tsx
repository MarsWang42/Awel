import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Loader2, Sparkles, Sun, Moon, Rocket, Palette, Package, UtensilsCrossed, Square, BarChart3, Settings, Users, ShoppingCart, ImagePlus, X } from 'lucide-react'
import { Button } from './ui/button'
import { ImagePreviewModal } from './ImagePreviewModal'
import { ModelSelector } from './ModelSelector'
import { useConsole } from '../hooks/useConsole'
import { useTheme } from '../hooks/useTheme'
import { cn } from '../lib/utils'

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
    iconKey: 'rocket' | 'palette' | 'package' | 'utensils' | 'bar-chart' | 'settings' | 'users' | 'shopping-cart'
    questionKey: string
    questionFallback: string
    placeholderKey: string
    placeholderFallback: string
    styles: StyleOption[]
}

const CATEGORY_ICONS = {
    rocket: Rocket,
    palette: Palette,
    package: Package,
    utensils: UtensilsCrossed,
    'bar-chart': BarChart3,
    settings: Settings,
    users: Users,
    'shopping-cart': ShoppingCart,
}

const CREATION_CATEGORIES: CategoryOption[] = [
    {
        labelKey: 'creationChipSaaS',
        fallback: 'SaaS Landing Page',
        iconKey: 'rocket',
        questionKey: 'creationSaasQuestion',
        questionFallback: 'What does your product do?',
        placeholderKey: 'creationSaasPlaceholder',
        placeholderFallback: 'e.g. Project management for remote teams, AI writing assistant...',
        styles: [
            { nameKey: 'styleSaasGradientName', descKey: 'styleSaasGradientDesc', promptKey: 'promptSaasGradient' },
            { nameKey: 'styleSaasDarkName', descKey: 'styleSaasDarkDesc', promptKey: 'promptSaasDark' },
            { nameKey: 'styleSaasMinimalName', descKey: 'styleSaasMinimalDesc', promptKey: 'promptSaasMinimal' }
        ]
    },
    {
        labelKey: 'creationChipAgency',
        fallback: 'Creative Portfolio',
        iconKey: 'palette',
        questionKey: 'creationAgencyQuestion',
        questionFallback: 'What do you create?',
        placeholderKey: 'creationAgencyPlaceholder',
        placeholderFallback: 'e.g. Brand identity design, Product photography, Motion graphics...',
        styles: [
            { nameKey: 'styleAgencyEditorialName', descKey: 'styleAgencyEditorialDesc', promptKey: 'promptAgencyEditorial' },
            { nameKey: 'styleAgencyBrutalistName', descKey: 'styleAgencyBrutalistDesc', promptKey: 'promptAgencyBrutalist' },
            { nameKey: 'styleAgencyElegantName', descKey: 'styleAgencyElegantDesc', promptKey: 'promptAgencyElegant' }
        ]
    },
    {
        labelKey: 'creationChipProduct',
        fallback: 'Product Showcase',
        iconKey: 'package',
        questionKey: 'creationProductQuestion',
        questionFallback: 'What are you selling?',
        placeholderKey: 'creationProductPlaceholder',
        placeholderFallback: 'e.g. Wireless earbuds, Artisan candles, Fitness app...',
        styles: [
            { nameKey: 'styleProductLuxuryName', descKey: 'styleProductLuxuryDesc', promptKey: 'promptProductLuxury' },
            { nameKey: 'styleProductGlassName', descKey: 'styleProductGlassDesc', promptKey: 'promptProductGlass' },
            { nameKey: 'styleProductBoldName', descKey: 'styleProductBoldDesc', promptKey: 'promptProductBold' }
        ]
    },
    {
        labelKey: 'creationChipLocal',
        fallback: 'Restaurant & Local',
        iconKey: 'utensils',
        questionKey: 'creationLocalQuestion',
        questionFallback: 'What type of establishment?',
        placeholderKey: 'creationLocalPlaceholder',
        placeholderFallback: 'e.g. Italian trattoria, Craft coffee roaster, Ramen bar...',
        styles: [
            { nameKey: 'styleLocalWarmName', descKey: 'styleLocalWarmDesc', promptKey: 'promptLocalWarm' },
            { nameKey: 'styleLocalModernName', descKey: 'styleLocalModernDesc', promptKey: 'promptLocalModern' },
            { nameKey: 'styleLocalRusticName', descKey: 'styleLocalRusticDesc', promptKey: 'promptLocalRustic' }
        ]
    },
    {
        labelKey: 'creationChipAnalytics',
        fallback: 'Analytics Dashboard',
        iconKey: 'bar-chart',
        questionKey: 'creationAnalyticsQuestion',
        questionFallback: 'What metrics do you track?',
        placeholderKey: 'creationAnalyticsPlaceholder',
        placeholderFallback: 'e.g. User engagement, Revenue analytics, Server monitoring...',
        styles: [
            { nameKey: 'styleAnalyticsDarkName', descKey: 'styleAnalyticsDarkDesc', promptKey: 'promptAnalyticsDark' },
            { nameKey: 'styleAnalyticsCleanName', descKey: 'styleAnalyticsCleanDesc', promptKey: 'promptAnalyticsClean' },
            { nameKey: 'styleAnalyticsColorfulName', descKey: 'styleAnalyticsColorfulDesc', promptKey: 'promptAnalyticsColorful' }
        ]
    },
    {
        labelKey: 'creationChipAdmin',
        fallback: 'Admin Panel',
        iconKey: 'settings',
        questionKey: 'creationAdminQuestion',
        questionFallback: 'What does your admin panel manage?',
        placeholderKey: 'creationAdminPlaceholder',
        placeholderFallback: 'e.g. User accounts, Content, Settings, Permissions...',
        styles: [
            { nameKey: 'styleAdminSidebarName', descKey: 'styleAdminSidebarDesc', promptKey: 'promptAdminSidebar' },
            { nameKey: 'styleAdminCompactName', descKey: 'styleAdminCompactDesc', promptKey: 'promptAdminCompact' },
            { nameKey: 'styleAdminFriendlyName', descKey: 'styleAdminFriendlyDesc', promptKey: 'promptAdminFriendly' }
        ]
    },
    {
        labelKey: 'creationChipCRM',
        fallback: 'CRM Dashboard',
        iconKey: 'users',
        questionKey: 'creationCRMQuestion',
        questionFallback: 'What does your CRM track?',
        placeholderKey: 'creationCRMPlaceholder',
        placeholderFallback: 'e.g. Sales leads, Customer accounts, Deal pipeline...',
        styles: [
            { nameKey: 'styleCRMPipelineName', descKey: 'styleCRMPipelineDesc', promptKey: 'promptCRMPipeline' },
            { nameKey: 'styleCRMCardName', descKey: 'styleCRMCardDesc', promptKey: 'promptCRMCard' },
            { nameKey: 'styleCRMTableName', descKey: 'styleCRMTableDesc', promptKey: 'promptCRMTable' }
        ]
    },
    {
        labelKey: 'creationChipEcommerce',
        fallback: 'E-commerce Dashboard',
        iconKey: 'shopping-cart',
        questionKey: 'creationEcommerceQuestion',
        questionFallback: 'What does your store sell?',
        placeholderKey: 'creationEcommercePlaceholder',
        placeholderFallback: 'e.g. Fashion apparel, Electronics, Handmade crafts...',
        styles: [
            { nameKey: 'styleEcomCleanName', descKey: 'styleEcomCleanDesc', promptKey: 'promptEcomClean' },
            { nameKey: 'styleEcomDarkName', descKey: 'styleEcomDarkDesc', promptKey: 'promptEcomDark' },
            { nameKey: 'styleEcomPlayfulName', descKey: 'styleEcomPlayfulDesc', promptKey: 'promptEcomPlayful' }
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
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null)
    const [creationMode, setCreationMode] = useState<'template' | 'custom'>('template')
    const [imageAttachments, setImageAttachments] = useState<{ dataUrl: string; mediaType: string; name: string }[]>([])
    const [previewImages, setPreviewImages] = useState<string[] | null>(null)
    const [previewIndex, setPreviewIndex] = useState(0)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const contextInputRef = useRef<HTMLInputElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const {
        messages,
        isLoading,
        renderedMessages,
        submitMessage,
        stopStream,
        clearMessages,
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

    // When the agent finishes, handle success or error.
    useEffect(() => {
        if (phase !== 'building') return

        // Check for errors first
        const lastError = [...messages].reverse().find(m => m.type === 'error')
        const lastResult = [...messages].reverse().find(m => m.type === 'result')

        // Handle error case - show error and return to initial phase.
        // Clear messages so the "messages exist → building" effect doesn't
        // immediately flip phase back to 'building', causing a flicker loop.
        const buildError = (() => {
            if (lastError && !isLoading) {
                return lastError.message || t('creationError', 'Something went wrong. Please try again.')
            }
            if (lastResult && lastResult.isError && !isLoading) {
                return lastResult.result || t('creationError', 'Something went wrong. Please try again.')
            }
            return null
        })()

        if (buildError) {
            // Abort the current run. If there are previous runs the server
            // removes only this run and switches back to comparing mode;
            // otherwise it tears everything down.
            setPhase('initial')
            clearMessages()
            fetch('/api/comparison/abort', { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    if (data.comparing) {
                        window.location.href = '/'
                    } else {
                        setErrorMessage(buildError)
                        setComparisonState(null)
                    }
                })
                .catch(() => {
                    setErrorMessage(buildError)
                    setComparisonState(null)
                })
            return
        }

        // Handle successful completion
        if (lastResult && lastResult.resultSubtype === 'success') {
            // Mark the run as complete (this transitions to comparing phase)
            // Include duration and token usage stats for the comparison view
            if (comparisonState?.activeRunId) {
                fetch(`/api/comparison/runs/${comparisonState.activeRunId}/complete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        success: true,
                        duration: lastResult.durationMs,
                        inputTokens: lastResult.inputTokens,
                        outputTokens: lastResult.outputTokens,
                        cacheReadTokens: lastResult.cacheReadTokens,
                    }),
                })
                    .then(r => r.json())
                    .then(data => {
                        if (data.state) {
                            setComparisonState(data.state)
                        }
                    })
                    .catch(() => {})
            }
            setPhase('success')
            setTimeout(() => {
                // Redirect to app - comparison sidebar will be shown by host script
                window.location.href = '/'
            }, 3000)
        }
    }, [messages, phase, isLoading, t, clearMessages])

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

                    if (shouldAutoSubmit) {
                        // Use the active run's prompt (may differ from originalPrompt if edited)
                        const promptToUse = activeRun.prompt || data.originalPrompt
                        if (promptToUse) {
                            setPendingAutoSubmit(promptToUse)
                        }
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
        setErrorMessage(null) // Clear any previous error

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

        const imageDataUrls = imageAttachments.map(a => a.dataUrl)
        setImageAttachments([])
        submitMessage(prompt, imageDataUrls.length > 0 ? { imageDataUrls } : undefined)
    }, [input, isLoading, submitMessage, comparisonState, selectedModel, selectedModelProvider, providers, imageAttachments])

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
        // Set the generated prompt to show review view
        setGeneratedPrompt(prompt)
        setSelectedCategory(null)
        setSelectedStyle(null)
        setContextInput('')
    }, [selectedStyle, contextInput, t])

    const resetWizard = useCallback(() => {
        setSelectedCategory(null)
        setSelectedStyle(null)
        setContextInput('')
    }, [])

    const handleBackToStyles = useCallback(() => {
        setSelectedStyle(null)
        setContextInput('')
    }, [])

    const availableProviders = providers.filter(p => p.available && p.models.length > 0)

    const handleToggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }

    const handleAbort = useCallback(async () => {
        // Stop the stream
        stopStream()

        // Abort the current run. If there are previous runs the server
        // removes only this run and switches back to comparing mode.
        try {
            const res = await fetch('/api/comparison/abort', { method: 'POST' })
            const data = await res.json()
            if (data.comparing) {
                window.location.href = '/'
                return
            }
        } catch {
            // Ignore errors during cleanup
        }

        // First run or full teardown — reset to initial state
        clearMessages()
        setComparisonState(null)
        setPhase('initial')
    }, [stopStream, clearMessages])

    const handleImageAttach = useCallback(() => {
        fileInputRef.current?.click()
    }, [])

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        for (const file of Array.from(files)) {
            const reader = new FileReader()
            reader.onload = () => {
                const dataUrl = reader.result as string
                setImageAttachments(prev => [...prev, { dataUrl, mediaType: file.type, name: file.name }])
            }
            reader.readAsDataURL(file)
        }
        e.target.value = ''
    }, [])

    const removeImageAttachment = useCallback((index: number) => {
        setImageAttachments(prev => prev.filter((_, i) => i !== index))
    }, [])

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

                        {availableProviders.length === 0 && providers.length > 0 && (
                            <p className="text-xs text-muted-foreground">{t('noModelsAvailable', 'No models available. Configure a provider to continue.')}</p>
                        )}

                        <div className="w-full space-y-4">
                            {availableProviders.map(provider => (
                                <div key={provider.id}>
                                    <div className={cn("text-[10px] font-medium uppercase tracking-wider mb-1.5 px-1", provider.color || "text-muted-foreground")}>
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

                {/* Step 2a: Main view - tabbed interface for template vs custom */}
                {phase === 'initial' && modelReady && !generatedPrompt && (
                    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl px-6">
                        {/* Error banner */}
                        {errorMessage && (
                            <div className="w-full max-w-lg mb-6 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50">
                                <div className="flex items-start gap-3">
                                    <span className="text-red-500 text-lg shrink-0">⚠️</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-red-800 dark:text-red-200">
                                            {t('creationFailed', 'Creation failed')}
                                        </p>
                                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 break-words">
                                            {errorMessage}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => setErrorMessage(null)}
                                        className="text-red-400 hover:text-red-600 dark:hover:text-red-300 text-lg leading-none"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Header */}
                        <div className="text-center mb-6 space-y-3">
                            <h1 className="text-3xl font-semibold text-foreground tracking-tight">
                                {t('creationHeading', 'What would you like to build?')}
                            </h1>
                        </div>

                        {/* Tab switcher */}
                        <div className="flex gap-1 p-1 bg-muted rounded-lg mb-8">
                            <button
                                onClick={() => {
                                    setCreationMode('template')
                                    resetWizard()
                                }}
                                className={cn(
                                    "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                                    creationMode === 'template'
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {t('creationTabTemplate', 'Use a template')}
                            </button>
                            <button
                                onClick={() => setCreationMode('custom')}
                                className={cn(
                                    "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                                    creationMode === 'custom'
                                        ? "bg-background text-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {t('creationTabCustom', 'Write your own')}
                            </button>
                        </div>

                        {/* Template flow */}
                        {creationMode === 'template' && (
                            <div className="w-full flex flex-col items-center">
                                {/* Subheading for template mode */}
                                {!selectedCategory && !selectedStyle && (
                                    <p className="text-sm text-muted-foreground text-center mb-6">
                                        {t('creationTemplateSubheading', 'Choose a category to generate a detailed design prompt.')}
                                    </p>
                                )}

                                {/* Dynamic subheading during wizard */}
                                {(selectedCategory || selectedStyle) && (
                                    <p className="text-sm text-muted-foreground text-center mb-6">
                                        {selectedStyle
                                            ? t(selectedCategory!.questionKey, selectedCategory!.questionFallback)
                                            : `${t(selectedCategory!.labelKey, selectedCategory!.fallback)} · ${t('creationChooseStyle', 'Choose a design style')}`
                                        }
                                    </p>
                                )}

                                {/* Category selection */}
                                {!selectedCategory && (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl">
                                        {CREATION_CATEGORIES.map((category) => {
                                            const IconComponent = CATEGORY_ICONS[category.iconKey]
                                            return (
                                                <button
                                                    key={category.labelKey}
                                                    onClick={() => handleCategoryClick(category)}
                                                    className="flex flex-col items-center gap-3 px-4 py-5 rounded-xl border border-border bg-card hover:bg-accent hover:border-ring transition-colors text-center"
                                                >
                                                    <IconComponent className="w-6 h-6 text-muted-foreground" />
                                                    <span className="text-sm font-medium text-foreground">
                                                        {t(category.labelKey, category.fallback)}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Style selection */}
                                {selectedCategory && !selectedStyle && (
                                    <div className="w-full max-w-lg space-y-3">
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
                                            onClick={resetWizard}
                                            className="w-full text-center px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            ← {t('creationBackToCategories', 'Back to categories')}
                                        </button>
                                    </div>
                                )}

                                {/* Context input */}
                                {selectedStyle && (
                                    <div className="w-full max-w-lg space-y-4">
                                        <div className="text-xs text-muted-foreground text-center mb-2">
                                            {t(selectedStyle.nameKey)} · {t(selectedCategory?.labelKey || '', selectedCategory?.fallback)}
                                        </div>
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
                                            placeholder={t(selectedCategory!.placeholderKey, selectedCategory!.placeholderFallback)}
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
                                                {t('creationGeneratePrompt', 'Generate Prompt')} →
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Custom prompt flow */}
                        {creationMode === 'custom' && (
                            <div className="w-full flex flex-col items-center">
                                <p className="text-sm text-muted-foreground text-center mb-6">
                                    {t('creationCustomSubheading', 'Describe what you want to build in your own words.')}
                                </p>
                                <div className="w-full max-w-lg">
                                    {imageAttachments.length > 0 && (
                                        <div className="mb-2 flex flex-wrap gap-2">
                                            {imageAttachments.map((img, i) => (
                                                <div key={i} className="relative group" title={img.name}>
                                                    <img
                                                        src={img.dataUrl}
                                                        alt={img.name}
                                                        className="w-10 h-10 rounded-lg border border-border/50 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                                        onClick={() => { setPreviewImages(imageAttachments.map(a => a.dataUrl)); setPreviewIndex(i) }}
                                                    />
                                                    <button
                                                        onClick={() => removeImageAttachment(i)}
                                                        className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                                    >
                                                        <X className="w-2.5 h-2.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex gap-2 items-end">
                                        <div className="flex-1 bg-card border border-border rounded-xl focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring">
                                            <textarea
                                                ref={inputRef}
                                                value={input}
                                                onChange={(e) => setInput(e.target.value)}
                                                onKeyDown={handleKeyDown}
                                                placeholder={t('creationPlaceholder', 'Describe what you want to build...')}
                                                className="w-full px-4 py-3 text-sm bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
                                                rows={5}
                                                style={{ minHeight: '120px', maxHeight: '240px' }}
                                            />
                                            <div className="flex items-center px-3 pb-2">
                                                <button
                                                    type="button"
                                                    onClick={handleImageAttach}
                                                    className={cn(
                                                        "shrink-0 p-1 rounded transition-colors",
                                                        imageAttachments.length > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground hover:text-foreground"
                                                    )}
                                                    title={t('creationAddInspiration', 'Add inspiration image')}
                                                >
                                                    <ImagePlus className="w-4 h-4" />
                                                </button>
                                                <span className="ml-1.5 text-xs text-muted-foreground">
                                                    {t('creationAddInspirationDesc', 'Add an inspiration image')}
                                                </span>
                                            </div>
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
                    </div>
                )}

                {/* Step 2b: Review generated prompt */}
                {phase === 'initial' && modelReady && generatedPrompt && (
                    <div className="flex-1 flex flex-col items-center justify-center w-full max-w-2xl px-6">
                        <div className="text-center mb-8 space-y-3">
                            <h1 className="text-3xl font-semibold text-foreground tracking-tight">
                                {t('creationReviewPrompt', 'Review your prompt')}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {t('creationReviewSubheading', 'Edit the prompt if needed, then start building.')}
                            </p>
                        </div>

                        <div className="w-full">
                            {imageAttachments.length > 0 && (
                                <div className="mb-2 flex flex-wrap gap-2">
                                    {imageAttachments.map((img, i) => (
                                        <div key={i} className="relative group" title={img.name}>
                                            <img
                                                src={img.dataUrl}
                                                alt={img.name}
                                                className="w-10 h-10 rounded-lg border border-border/50 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                                onClick={() => { setPreviewImages(imageAttachments.map(a => a.dataUrl)); setPreviewIndex(i) }}
                                            />
                                            <button
                                                onClick={() => removeImageAttachment(i)}
                                                className="absolute -top-1.5 -right-1.5 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                                            >
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex gap-2 items-end">
                                <div className="flex-1 bg-card border border-border rounded-xl focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring">
                                    <textarea
                                        ref={inputRef}
                                        value={generatedPrompt}
                                        onChange={(e) => setGeneratedPrompt(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault()
                                                handleSubmit(generatedPrompt || '')
                                            }
                                        }}
                                        className="w-full px-4 py-3 text-sm bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
                                        rows={8}
                                        style={{ minHeight: '160px', maxHeight: '320px' }}
                                    />
                                    <div className="flex items-center px-3 pb-2">
                                        <button
                                            type="button"
                                            onClick={handleImageAttach}
                                            className={cn(
                                                "shrink-0 p-1 rounded transition-colors",
                                                imageAttachments.length > 0 ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground hover:text-foreground"
                                            )}
                                            title={t('creationAddInspiration', 'Add inspiration image')}
                                        >
                                            <ImagePlus className="w-4 h-4" />
                                        </button>
                                        <span className="ml-1.5 text-xs text-muted-foreground">
                                            {t('creationAddInspirationDesc', 'Add an inspiration image')}
                                        </span>
                                    </div>
                                </div>
                                <Button
                                    onClick={() => handleSubmit(generatedPrompt || '')}
                                    disabled={!generatedPrompt?.trim()}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 w-12 rounded-xl"
                                >
                                    <Send className="w-5 h-5" />
                                </Button>
                            </div>
                            <button
                                onClick={() => setGeneratedPrompt(null)}
                                className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                            >
                                ← {t('creationStartOver', 'Start over')}
                            </button>
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

                        {/* Abort button */}
                        <div className="shrink-0 border-t border-border p-4 flex justify-center">
                            <button
                                onClick={handleAbort}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                                <Square className="w-3.5 h-3.5" />
                                <span>{t('creationAbort', 'Cancel')}</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Hidden file input for image uploads */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
            />

            {/* Image preview modal */}
            {previewImages && (
                <ImagePreviewModal
                    images={previewImages}
                    currentIndex={previewIndex}
                    onClose={() => setPreviewImages(null)}
                    onNavigate={setPreviewIndex}
                />
            )}
        </div>
    )
}
