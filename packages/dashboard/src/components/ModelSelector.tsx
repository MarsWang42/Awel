import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDown, ChevronDown, Lock, X, Copy, Check } from 'lucide-react'

interface ModelDefinition {
    id: string
    label: string
    provider: string
    available: boolean
    unavailableReason?: string
}

interface ProviderAvailability {
    provider: string
    label: string
    available: boolean
    envVar: string | null
}

interface ModelSelectorProps {
    selectedModel: string
    selectedModelProvider: string
    onModelChange: (modelId: string, modelProvider: string) => void
    chatHasMessages?: boolean
}

const PROVIDER_COLORS: Record<string, string> = {
    'claude-code': 'text-orange-600 dark:text-orange-400',
    anthropic: 'text-orange-600 dark:text-orange-400',
    openai: 'text-green-600 dark:text-green-400',
    'google-ai': 'text-blue-600 dark:text-blue-400',
    'vercel-gateway': 'text-purple-600 dark:text-purple-400',
    minimax: 'text-pink-600 dark:text-pink-400',
    zhipu: 'text-cyan-600 dark:text-cyan-400',
    openrouter: 'text-teal-600 dark:text-teal-400',
}

const PROVIDER_LABELS: Record<string, string> = {
    'claude-code': 'Claude Code',
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    'google-ai': 'Google AI',
    'vercel-gateway': 'Vercel AI Gateway',
    minimax: 'MiniMax',
    zhipu: 'Zhipu AI',
    openrouter: 'OpenRouter',
}

const PROVIDER_ENV_KEYS: Record<string, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    'google-ai': 'GOOGLE_GENERATIVE_AI_API_KEY',
    'vercel-gateway': 'AI_GATEWAY_API_KEY',
    minimax: 'MINIMAX_API_KEY',
    zhipu: 'ZHIPU_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
}

const RECENT_CUSTOM_MODELS_KEY = 'awel-custom-models'
const MAX_RECENT_CUSTOM_MODELS = 10

function loadRecentCustomModels(): string[] {
    try {
        const raw = localStorage.getItem(RECENT_CUSTOM_MODELS_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function saveRecentCustomModel(modelId: string): string[] {
    const existing = loadRecentCustomModels()
    const deduped = [modelId, ...existing.filter(m => m !== modelId)].slice(0, MAX_RECENT_CUSTOM_MODELS)
    localStorage.setItem(RECENT_CUSTOM_MODELS_KEY, JSON.stringify(deduped))
    return deduped
}

// ─── Instant Tooltip ─────────────────────────────────────────

function Tooltip({ text, children, position = 'bottom' }: {
    text: string
    children: React.ReactNode
    position?: 'bottom' | 'top'
}) {
    return (
        <div className="relative group/tip">
            {children}
            <div className={`invisible group-hover/tip:visible opacity-0 group-hover/tip:opacity-100 transition-opacity duration-100
                absolute z-[60] px-2 py-1 text-[10px] leading-tight text-muted-foreground bg-card border border-border rounded shadow-lg
                whitespace-nowrap pointer-events-none
                ${position === 'bottom' ? 'top-full mt-1.5 left-1/2 -translate-x-1/2' : 'bottom-full mb-1.5 left-1/2 -translate-x-1/2'}`}>
                {text}
            </div>
        </div>
    )
}

// ─── Env Key Row (click to copy) ─────────────────────────────

function EnvKeyRow({ provider }: { provider: string }) {
    const [copied, setCopied] = useState(false)
    const envKey = PROVIDER_ENV_KEYS[provider]

    if (!envKey) return null

    const template = `export ${envKey}=your-key-here`

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation()
        try {
            await navigator.clipboard.writeText(template)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        } catch { /* clipboard not available */ }
    }

    return (
        <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 mt-1 px-1.5 py-0.5 rounded bg-muted/80 hover:bg-accent/80 transition-colors text-[10px] font-mono text-muted-foreground hover:text-foreground w-fit"
        >
            <span className="truncate max-w-[220px]">{template}</span>
            {copied
                ? <Check className="w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                : <Copy className="w-2.5 h-2.5 flex-shrink-0" />
            }
        </button>
    )
}

// ─── Model Selector ──────────────────────────────────────────

export function ModelSelector({ selectedModel, selectedModelProvider, onModelChange, chatHasMessages }: ModelSelectorProps) {
    const { t } = useTranslation()
    const [models, setModels] = useState<ModelDefinition[]>([])
    const [providers, setProviders] = useState<ProviderAvailability[]>([])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [providerFilter, setProviderFilter] = useState<string>('all')
    const [customModelInput, setCustomModelInput] = useState('')
    const [recentCustomModels, setRecentCustomModels] = useState<string[]>(loadRecentCustomModels)

    // Determine if the current model uses the self-contained claude-code provider.
    // Switching to/from claude-code mid-chat is not supported because its tool set
    // is incompatible with messages produced by other providers.
    const selectedDef = models.find(m => m.id === selectedModel)
    const isClaudeCode = selectedDef?.provider === 'claude-code' || selectedModelProvider === 'claude-code'
    const disabled = chatHasMessages && isClaudeCode

    const openRouterAvailable = providers.some(p => p.provider === 'openrouter' && p.available)

    useEffect(() => {
        async function fetchModels() {
            try {
                const res = await fetch('/api/models')
                const data = await res.json()
                if (data.providers && Array.isArray(data.providers)) {
                    setProviders(data.providers)
                }
                if (data.models && Array.isArray(data.models)) {
                    setModels(data.models)
                    // If current selection is a custom OpenRouter model, don't override it
                    const isCustomModel = selectedModelProvider === 'openrouter' && !data.models.find((m: ModelDefinition) => m.id === selectedModel)
                    if (isCustomModel) return
                    // If current selection isn't in the list or is unavailable, select first available
                    const current = data.models.find((m: ModelDefinition) => m.id === selectedModel)
                    if (data.models.length > 0 && (!current || !current.available)) {
                        const firstAvailable = data.models.find((m: ModelDefinition) => m.available)
                        if (firstAvailable) {
                            onModelChange(firstAvailable.id, firstAvailable.provider)
                        }
                    }
                }
            } catch {
                // API not available yet
            }
        }
        fetchModels()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsModalOpen(false)
    }, [])

    useEffect(() => {
        if (isModalOpen) {
            document.addEventListener('keydown', handleKeyDown)
            return () => document.removeEventListener('keydown', handleKeyDown)
        }
    }, [isModalOpen, handleKeyDown])

    const handleUseCustomModel = useCallback(() => {
        const trimmed = customModelInput.trim()
        if (!trimmed) return
        const updated = saveRecentCustomModel(trimmed)
        setRecentCustomModels(updated)
        onModelChange(trimmed, 'openrouter')
        setCustomModelInput('')
        setIsModalOpen(false)
    }, [customModelInput, onModelChange])

    // Split models into available and unavailable
    const availableModels = models.filter(m => m.available)
    const unavailableModels = models.filter(m => !m.available)

    // Group available models by provider
    const availableGrouped = availableModels.reduce<Record<string, ModelDefinition[]>>((acc, m) => {
        if (!acc[m.provider]) acc[m.provider] = []
        acc[m.provider].push(m)
        return acc
    }, {})

    // Get unique unavailable providers from both models and providers list
    const unavailableProviderKeys = new Set(unavailableModels.map(m => m.provider))
    // Also add providers that are unavailable and not represented in availableGrouped
    for (const p of providers) {
        if (!p.available && !availableGrouped[p.provider]) {
            unavailableProviderKeys.add(p.provider)
        }
    }
    const unavailableProviders = [...unavailableProviderKeys]

    // Available provider keys for the filter dropdown
    const availableProviderKeys = [...Object.keys(availableGrouped)]
    if (openRouterAvailable) {
        availableProviderKeys.push('openrouter')
    }

    // Filtered groups based on provider filter
    const filteredGroups = providerFilter === 'all'
        ? availableGrouped
        : { [providerFilter]: availableGrouped[providerFilter] || [] }

    // Show custom model section when openrouter is available and filter allows it
    const showCustomModelSection = openRouterAvailable && (providerFilter === 'all' || providerFilter === 'openrouter')

    if (models.length === 0 && providers.length === 0) return null

    // Display for the trigger button
    const isCustomOpenRouterModel = !selectedDef && selectedModelProvider === 'openrouter'

    const selectorButton = (
        <button
            onClick={() => {
                if (!disabled) {
                    setProviderFilter('all')
                    setIsModalOpen(true)
                }
            }}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors max-w-[10rem] ${
                disabled
                    ? 'bg-muted/50 border-muted/50 cursor-default text-muted-foreground'
                    : 'bg-muted/80 hover:bg-accent/80 border-border/50 text-foreground'
            }`}
        >
            {selectedDef && (
                <span className={`truncate ${disabled ? 'text-muted-foreground' : PROVIDER_COLORS[selectedDef.provider]}`}>
                    {selectedDef.label}
                </span>
            )}
            {isCustomOpenRouterModel && (
                <span className={`truncate ${PROVIDER_COLORS['openrouter']}`}>
                    {selectedModel}
                </span>
            )}
            {!selectedDef && !isCustomOpenRouterModel && <span>{t('selectModel')}</span>}
            {!disabled && <ChevronsUpDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
        </button>
    )

    return (
        <div className="relative">
            {disabled
                ? <Tooltip text={t('modelSwitchDisabled')}>{selectorButton}</Tooltip>
                : selectorButton
            }

            {isModalOpen && !disabled && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false) }}
                >
                    <div className="bg-card border border-border rounded-lg w-full max-w-md shadow-xl mx-4 flex flex-col max-h-[70vh]">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                            <h3 className="text-sm font-medium text-foreground">{t('selectModel')}</h3>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Provider filter */}
                        <div className="px-4 py-2.5 border-b border-border">
                            <div className="relative">
                                <select
                                    value={providerFilter}
                                    onChange={(e) => setProviderFilter(e.target.value)}
                                    className="w-full text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 pr-7 text-foreground outline-none focus:border-ring transition-colors appearance-none"
                                >
                                    <option value="all">{t('allProviders', 'All Providers')}</option>
                                    {availableProviderKeys.map(key => (
                                        <option key={key} value={key}>
                                            {PROVIDER_LABELS[key] || key}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>

                        {/* Model list */}
                        <div className="overflow-y-auto flex-1">
                            {Object.entries(filteredGroups).map(([provider, providerModels]) => (
                                <div key={provider}>
                                    <div className={`px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider bg-card/50 sticky top-0 ${PROVIDER_COLORS[provider] || 'text-muted-foreground'}`}>
                                        {PROVIDER_LABELS[provider] || provider}
                                    </div>
                                    {providerModels.map(m => {
                                        // Block switching to claude-code models mid-chat from a non-claude-code model
                                        const isLocked = chatHasMessages && !isClaudeCode && m.provider === 'claude-code'

                                        const button = (
                                            <button
                                                key={m.id}
                                                disabled={isLocked}
                                                onClick={() => {
                                                    if (isLocked) return
                                                    onModelChange(m.id, m.provider)
                                                    setIsModalOpen(false)
                                                }}
                                                className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                                                    isLocked
                                                        ? 'text-muted-foreground cursor-not-allowed'
                                                        : m.id === selectedModel
                                                            ? 'bg-muted text-foreground'
                                                            : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                                                }`}
                                            >
                                                <span className={isLocked ? 'text-muted-foreground' : PROVIDER_COLORS[m.provider]}>{m.label}</span>
                                                {isLocked && (
                                                    <Lock className="w-3 h-3 text-muted-foreground inline ml-1.5" />
                                                )}
                                                {m.id === selectedModel && (
                                                    <span className="ml-2 text-[10px] text-muted-foreground">&#10003;</span>
                                                )}
                                            </button>
                                        )

                                        return isLocked
                                            ? <Tooltip key={m.id} text={t('modelSwitchDisabled')} position="top">{button}</Tooltip>
                                            : button
                                    })}
                                </div>
                            ))}

                            {/* Custom OpenRouter model input */}
                            {showCustomModelSection && (
                                <div>
                                    <div className={`px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider bg-card/50 sticky top-0 ${PROVIDER_COLORS['openrouter']}`}>
                                        {PROVIDER_LABELS['openrouter']}
                                    </div>
                                    <div className="px-4 py-2.5 space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={customModelInput}
                                                onChange={(e) => setCustomModelInput(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleUseCustomModel() } }}
                                                placeholder={t('customModelPlaceholder', 'e.g. deepseek/deepseek-r1')}
                                                className="flex-1 text-xs bg-muted border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground outline-none focus:border-ring transition-colors"
                                            />
                                            <button
                                                onClick={handleUseCustomModel}
                                                disabled={!customModelInput.trim()}
                                                className={`text-xs px-3 py-1.5 rounded-md transition-colors font-medium ${
                                                    customModelInput.trim()
                                                        ? 'bg-teal-600 hover:bg-teal-700 text-white'
                                                        : 'bg-muted text-muted-foreground cursor-not-allowed'
                                                }`}
                                            >
                                                {t('useModel', 'Use')}
                                            </button>
                                        </div>
                                        {recentCustomModels.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {recentCustomModels.map(modelId => (
                                                    <button
                                                        key={modelId}
                                                        onClick={() => {
                                                            const updated = saveRecentCustomModel(modelId)
                                                            setRecentCustomModels(updated)
                                                            onModelChange(modelId, 'openrouter')
                                                            setIsModalOpen(false)
                                                        }}
                                                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                                                            modelId === selectedModel && selectedModelProvider === 'openrouter'
                                                                ? 'border-teal-500 bg-teal-500/10 text-teal-600 dark:text-teal-400'
                                                                : 'border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted'
                                                        }`}
                                                    >
                                                        {modelId}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Unavailable providers */}
                            {providerFilter === 'all' && unavailableProviders.length > 0 && (
                                <>
                                    <div className="flex items-center gap-2 px-4 py-2">
                                        <div className="flex-1 border-t border-border" />
                                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Unavailable</span>
                                        <div className="flex-1 border-t border-border" />
                                    </div>
                                    {unavailableProviders.map(provider => (
                                        <div
                                            key={provider}
                                            className="px-4 py-2 text-xs text-muted-foreground"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Lock className="w-3 h-3 text-muted-foreground" />
                                                <span>{PROVIDER_LABELS[provider] || provider}</span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {provider === 'claude-code' ? 'CLI not installed' : 'API key required'}
                                                </span>
                                            </div>
                                            <EnvKeyRow provider={provider} />
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
