import { useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Maximize2, Minimize2, Trash2, Sun, Moon } from 'lucide-react'
import { Button } from './components/ui/button'
import { ConfirmDialog } from './components/ui/confirm-dialog'
import { Console } from './components/Console'
import { ModelSelector, type ModelSelectorHandle } from './components/ModelSelector'
import { DiffModal, type FileDiff } from './components/DiffModal'
import { CreationView } from './components/CreationView'
import { ComparisonView } from './components/ComparisonView'
import { useTheme } from './hooks/useTheme'
import { cn } from './lib/utils'

const IS_CREATION_MODE = !!(window as any).__AWEL_CREATION_MODE__
const IS_COMPARISON_MODE = !!(window as any).__AWEL_COMPARISON_MODE__ ||
    new URLSearchParams(window.location.search).get('mode') === 'comparison'

function App() {
    const { t } = useTranslation()
    const { resolvedTheme, setTheme } = useTheme()
    const [selectedModel, setSelectedModel] = useState(
        () => localStorage.getItem('awel-model') || ''
    )
    const [selectedModelProvider, setSelectedModelProvider] = useState(
        () => localStorage.getItem('awel-model-provider') || ''
    )
    const [expanded, setExpanded] = useState(false)
    const [chatKey, setChatKey] = useState(0)
    const [chatHasMessages, setChatHasMessages] = useState(false)
    const [isStreaming, setIsStreaming] = useState(false)
    const [reviewDiffs, setReviewDiffs] = useState<FileDiff[] | null>(null)
    const [showClearConfirm, setShowClearConfirm] = useState(false)
    const [modelReady, setModelReady] = useState(false)
    const modelSelectorRef = useRef<ModelSelectorHandle>(null)

    const handleReviewOpen = useCallback((diffs: FileDiff[]) => {
        setReviewDiffs(diffs)
        window.parent.postMessage({ type: 'AWEL_HIDE_CONTROLS' }, '*')
    }, [])

    const handleReviewClose = useCallback(() => {
        setReviewDiffs(null)
        window.parent.postMessage({ type: 'AWEL_SHOW_CONTROLS' }, '*')
    }, [])

    const handleClearChat = async () => {
        setShowClearConfirm(false)
        await fetch('/api/chat/history', { method: 'DELETE' })
        setChatKey(k => k + 1)
    }

    const handleClearHistory = async () => {
        await fetch('/api/chat/history', { method: 'DELETE' })
        setChatKey(k => k + 1)
    }

    const handleModelChange = (modelId: string, modelProvider: string) => {
        setSelectedModel(modelId)
        setSelectedModelProvider(modelProvider)
        setModelReady(true)
        localStorage.setItem('awel-model', modelId)
        localStorage.setItem('awel-model-provider', modelProvider)
    }

    const handleModelReady = useCallback((valid: boolean) => {
        setModelReady(valid)
    }, [])

    const handleModelRequired = useCallback(() => {
        modelSelectorRef.current?.open()
    }, [])

    const handleHasMessagesChange = useCallback((hasMessages: boolean) => {
        setChatHasMessages(hasMessages)
    }, [])

    const handleClose = () => {
        window.parent.postMessage({ type: 'AWEL_CLOSE' }, '*')
    }

    const handleToggleExpand = () => {
        setExpanded(e => !e)
    }

    const handleBackdropClick = () => {
        window.parent.postMessage({ type: 'AWEL_CLOSE' }, '*')
    }

    const handleToggleTheme = () => {
        setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
    }

    if (IS_CREATION_MODE) {
        return (
            <CreationView
                initialModel={selectedModel}
                initialModelProvider={selectedModelProvider}
                onModelChange={handleModelChange}
            />
        )
    }

    if (IS_COMPARISON_MODE) {
        return <ComparisonView />
    }

    return (
        <div className="fixed inset-0" onClick={handleBackdropClick}>
            {/* Panel */}
            <div
                className={cn(
                    "absolute top-6 right-6 bottom-20 bg-background rounded-xl shadow-2xl flex flex-col overflow-hidden border border-border transition-[width] duration-200 ease-out",
                    expanded ? "w-[calc(100%-3rem)]" : "w-[380px]"
                )}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <header className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="text-sm leading-none">🌸</span>
                        <span className="text-sm font-semibold text-foreground">Awel</span>
                        {isStreaming && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <ModelSelector
                            ref={modelSelectorRef}
                            selectedModel={selectedModel}
                            selectedModelProvider={selectedModelProvider}
                            onModelChange={handleModelChange}
                            onClearHistory={handleClearHistory}
                            onReady={handleModelReady}
                            chatHasMessages={chatHasMessages}
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
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setShowClearConfirm(true)}
                            className="h-7 w-7 hover:bg-muted"
                            title={t('deleteChatHistory')}
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleToggleExpand}
                            className="h-7 w-7 hover:bg-muted"
                            title={expanded ? t('collapse') : t('expand')}
                        >
                            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleClose}
                            className="h-7 w-7 hover:bg-muted"
                        >
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    </div>
                </header>

                <Console
                    key={chatKey}
                    selectedModel={selectedModel}
                    selectedModelProvider={selectedModelProvider}
                    modelReady={modelReady}
                    onModelRequired={handleModelRequired}
                    onHasMessagesChange={handleHasMessagesChange}
                    onStreamingChange={setIsStreaming}
                    onReviewDiffs={handleReviewOpen}
                />
            </div>

            {reviewDiffs && (
                <DiffModal
                    diffs={reviewDiffs}
                    onClose={handleReviewClose}
                />
            )}

            {showClearConfirm && (
                <ConfirmDialog
                    title={t('deleteChatHistory')}
                    description={t('deleteChatHistoryDescription')}
                    confirmLabel={t('delete')}
                    variant="danger"
                    onConfirm={handleClearChat}
                    onCancel={() => setShowClearConfirm(false)}
                />
            )}
        </div>
    )
}

export default App
