import { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronsUpDown, ChevronDown, Lock, X, Copy, Check } from 'lucide-react'
import { Tooltip } from './ui/tooltip'
import { ConfirmDialog } from './ui/confirm-dialog'
import { cn } from '../lib/utils'

interface ModelEntry {
    id: string
    label: string
}

interface ProviderEntry {
    id: string
    label: string
    color: string
    envVar: string | null
    available: boolean
    unavailableReason?: string
    customModelInput?: boolean
    models: ModelEntry[]
}

export interface ModelSelectorHandle {
    open: () => void
}

interface ModelSelectorProps {
    selectedModel: string
    selectedModelProvider: string
    onModelChange: (modelId: string, modelProvider: string) => void
    onClearHistory?: () => Promise<void>
    onReady?: (hasValidSelection: boolean) => void
    chatHasMessages?: boolean
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

// ─── Env Key Row (click to copy) ─────────────────────────────

function EnvKeyRow({ envVar }: { envVar: string }) {
    const [copied, setCopied] = useState(false)

    const template = `export ${envVar}=your-key-here`

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

export const ModelSelector = forwardRef<ModelSelectorHandle, ModelSelectorProps>(
    function ModelSelector({ selectedModel, selectedModelProvider, onModelChange, onClearHistory, onReady, chatHasMessages }, ref) {
    const { t } = useTranslation()
    const [providers, setProviders] = useState<ProviderEntry[]>([])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [providerFilter, setProviderFilter] = useState<string>('all')
    const [customModelInput, setCustomModelInput] = useState('')
    const [recentCustomModels, setRecentCustomModels] = useState<string[]>(loadRecentCustomModels)
    // For switching away from Claude Code (needs history clear)
    const [pendingSwitch, setPendingSwitch] = useState<{ modelId: string; providerId: string } | null>(null)
    // For selecting Claude Code (warning modal)
    const [pendingClaudeCode, setPendingClaudeCode] = useState<{ modelId: string; providerId: string } | null>(null)

    useImperativeHandle(ref, () => ({
        open: () => {
            setProviderFilter('all')
            setIsModalOpen(true)
        },
    }))

    const isClaudeCode = selectedModelProvider === 'claude-code'

    const handleModelSelect = useCallback((modelId: string, providerId: string) => {
        const selectingClaudeCode = providerId === 'claude-code'
        const switchingFromClaudeCode = !selectingClaudeCode && isClaudeCode && chatHasMessages

        // Selecting Claude Code (and not already on it) → show warning
        if (selectingClaudeCode && !isClaudeCode) {
            setPendingClaudeCode({ modelId, providerId })
            return
        }

        // Switching away from Claude Code with messages → show clear history warning
        if (switchingFromClaudeCode) {
            setPendingSwitch({ modelId, providerId })
            return
        }

        // Otherwise, just switch
        onModelChange(modelId, providerId)
        setIsModalOpen(false)
    }, [isClaudeCode, chatHasMessages, onModelChange])

    // Confirm Claude Code warning
    const handleConfirmClaudeCode = useCallback(async () => {
        if (!pendingClaudeCode) return
        // If switching from another model with messages, also clear history
        if (chatHasMessages && onClearHistory) {
            await onClearHistory()
        }
        onModelChange(pendingClaudeCode.modelId, pendingClaudeCode.providerId)
        setPendingClaudeCode(null)
        setIsModalOpen(false)
    }, [pendingClaudeCode, chatHasMessages, onClearHistory, onModelChange])

    const handleCancelClaudeCode = useCallback(() => {
        setPendingClaudeCode(null)
    }, [])

    // Confirm switching away from Claude Code
    const handleConfirmSwitch = useCallback(async () => {
        if (!pendingSwitch) return
        if (onClearHistory) {
            await onClearHistory()
        }
        onModelChange(pendingSwitch.modelId, pendingSwitch.providerId)
        setPendingSwitch(null)
        setIsModalOpen(false)
    }, [pendingSwitch, onClearHistory, onModelChange])

    const handleCancelSwitch = useCallback(() => {
        setPendingSwitch(null)
    }, [])

    // Find the selected model's definition by searching nested providers
    const selectedDef = (() => {
        for (const p of providers) {
            const m = p.models.find(m => m.id === selectedModel && p.id === selectedModelProvider)
            if (m) return { ...m, provider: p.id, color: p.color }
        }
        return null
    })()

    const disabled = chatHasMessages && isClaudeCode && !onClearHistory

    const availableProviders = providers.filter(p => p.available)
    const unavailableProviders = providers.filter(p => !p.available)

    const openRouterProvider = availableProviders.find(p => p.id === 'openrouter')

    useEffect(() => {
        async function fetchModels() {
            try {
                const res = await fetch('/api/models')
                const data = await res.json()
                if (data.providers && Array.isArray(data.providers)) {
                    const fetched: ProviderEntry[] = data.providers
                    setProviders(fetched)

                    // Check if current selection is valid
                    const isCustomModel = selectedModelProvider === 'openrouter'
                        && !fetched.flatMap(p => p.models).find(m => m.id === selectedModel)
                    if (isCustomModel) {
                        // Custom OpenRouter model — consider valid if provider is available
                        const orProvider = fetched.find(p => p.id === 'openrouter')
                        onReady?.(!!orProvider?.available)
                        return
                    }

                    const currentProvider = fetched.find(p => p.id === selectedModelProvider)
                    const current = currentProvider?.available && currentProvider.models.find(m => m.id === selectedModel)
                    onReady?.(!!current)
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
        handleModelSelect(trimmed, 'openrouter')
        setCustomModelInput('')
    }, [customModelInput, handleModelSelect])

    // Available providers with models (for the main list)
    const availableWithModels = availableProviders.filter(p => p.models.length > 0)

    // Available provider keys for the filter dropdown
    const availableProviderKeys = [
        ...availableWithModels.map(p => p.id),
        ...(openRouterProvider ? ['openrouter'] : []),
    ]
    // Deduplicate (openrouter may already be in availableWithModels if it gains catalog models)
    const uniqueProviderKeys = [...new Set(availableProviderKeys)]

    // Filtered providers based on provider filter
    const filteredProviders = providerFilter === 'all'
        ? availableWithModels
        : availableWithModels.filter(p => p.id === providerFilter)

    // Show custom model section when openrouter is available and filter allows it
    const showCustomModelSection = !!openRouterProvider && (providerFilter === 'all' || providerFilter === 'openrouter')

    if (providers.length === 0) return null

    // Display for the trigger button
    const isCustomOpenRouterModel = !selectedDef && selectedModelProvider === 'openrouter'
    const hasSelection = !!selectedDef || isCustomOpenRouterModel

    const selectorButton = (
        <button
            onClick={() => {
                if (!disabled) {
                    setProviderFilter('all')
                    setIsModalOpen(true)
                }
            }}
            disabled={disabled}
            className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition-colors max-w-[10rem]",
                disabled
                    ? "bg-muted/50 border-muted/50 cursor-default text-muted-foreground"
                    : "bg-muted/80 hover:bg-accent/80 border-border/50 text-foreground"
            )}
        >
            {selectedDef && (
                <span className={cn("truncate", selectedDef.color)}>
                    {selectedDef.label}
                </span>
            )}
            {isCustomOpenRouterModel && (
                <span className={cn("truncate", providers.find(p => p.id === 'openrouter')?.color)}>
                    {selectedModel}
                </span>
            )}
            {!hasSelection && <span>{t('selectModel')}</span>}
            {!disabled && <ChevronsUpDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
        </button>
    )

    return (
        <div className="relative">
            {disabled
                ? <Tooltip text={t('modelSwitchDisabled')} position="bottom">{selectorButton}</Tooltip>
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
                                    {uniqueProviderKeys.map(key => {
                                        const p = providers.find(p => p.id === key)
                                        return (
                                            <option key={key} value={key}>
                                                {p?.label ?? key}
                                            </option>
                                        )
                                    })}
                                </select>
                                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>

                        {/* Model list */}
                        <div className="overflow-y-auto flex-1">
                            {filteredProviders.map(provider => (
                                <div key={provider.id}>
                                    <div className={cn("px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider bg-card/50 sticky top-0", provider.color || "text-muted-foreground")}>
                                        {provider.label}
                                    </div>
                                    {provider.models.map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => handleModelSelect(m.id, provider.id)}
                                            className={cn(
                                                "w-full text-left px-4 py-2 text-xs transition-colors",
                                                m.id === selectedModel && provider.id === selectedModelProvider
                                                    ? "bg-muted text-foreground"
                                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                                            )}
                                        >
                                            <span className={provider.color}>{m.label}</span>
                                            {m.id === selectedModel && provider.id === selectedModelProvider && (
                                                <span className="ml-2 text-[10px] text-muted-foreground">&#10003;</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            ))}

                            {/* Custom OpenRouter model input */}
                            {showCustomModelSection && (
                                <div>
                                    <div className={cn("px-4 py-1.5 text-[10px] font-medium uppercase tracking-wider bg-card/50 sticky top-0", openRouterProvider?.color)}>
                                        {openRouterProvider?.label ?? 'OpenRouter'}
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
                                                className={cn(
                                                    "text-xs px-3 py-1.5 rounded-md transition-colors font-medium",
                                                    customModelInput.trim()
                                                        ? "bg-teal-600 hover:bg-teal-700 text-white"
                                                        : "bg-muted text-muted-foreground cursor-not-allowed"
                                                )}
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
                                                            handleModelSelect(modelId, 'openrouter')
                                                        }}
                                                        className={cn(
                                                            "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                                                            modelId === selectedModel && selectedModelProvider === 'openrouter'
                                                                ? "border-teal-500 bg-teal-500/10 text-teal-600 dark:text-teal-400"
                                                                : "border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted"
                                                        )}
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
                                            key={provider.id}
                                            className="px-4 py-2 text-xs text-muted-foreground"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Lock className="w-3 h-3 text-muted-foreground" />
                                                <span>{provider.label}</span>
                                                <span className="text-[10px] text-muted-foreground">
                                                    {provider.id === 'claude-code' ? 'CLI not installed' : 'API key required'}
                                                </span>
                                            </div>
                                            {provider.envVar && <EnvKeyRow envVar={provider.envVar} />}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Warning dialog when selecting Claude Code */}
            {pendingClaudeCode && (
                <ConfirmDialog
                    title={t('claudeCodeWarningTitle')}
                    description={chatHasMessages ? t('claudeCodeWarningWithClearDescription') : t('claudeCodeWarningDescription')}
                    confirmLabel={t('continue')}
                    variant="warning"
                    onConfirm={handleConfirmClaudeCode}
                    onCancel={handleCancelClaudeCode}
                />
            )}

            {/* Confirmation dialog for switching away from Claude Code */}
            {pendingSwitch && (
                <ConfirmDialog
                    title={t('claudeCodeSwitchTitle')}
                    description={t('claudeCodeSwitchDescription')}
                    variant="warning"
                    onConfirm={handleConfirmSwitch}
                    onCancel={handleCancelSwitch}
                />
            )}
        </div>
    )
})
