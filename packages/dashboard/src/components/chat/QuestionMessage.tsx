import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/card'

export interface QuestionOption {
    label: string
    description: string
}

export interface Question {
    question: string
    header: string
    multiSelect: boolean
    options: QuestionOption[]
}

interface QuestionMessageProps {
    questionId: string
    questions: Question[]
    onAnswer: (questionId: string, answers: Record<string, string[]>) => void
    disabled?: boolean
    answered?: boolean
}

export function QuestionMessage({ questionId, questions, onAnswer, disabled, answered }: QuestionMessageProps) {
    const { t } = useTranslation()
    const [submitted, setSubmitted] = useState(!!answered)
    const inactive = submitted || !!disabled
    const [activeTab, setActiveTab] = useState(0)
    // selections: questionIndex -> array of selected option indices
    const [selections, setSelections] = useState<Record<number, number[]>>(() => {
        const init: Record<number, number[]> = {}
        for (let i = 0; i < questions.length; i++) init[i] = []
        return init
    })
    // Free text input per question for additional context
    const [freeText, setFreeText] = useState<Record<number, string>>(() => {
        const init: Record<number, string> = {}
        for (let i = 0; i < questions.length; i++) init[i] = ''
        return init
    })

    const handleToggle = (qIdx: number, optIdx: number, multiSelect: boolean) => {
        if (inactive) return
        setSelections(prev => {
            const current = prev[qIdx] || []
            if (multiSelect) {
                const next = current.includes(optIdx)
                    ? current.filter(i => i !== optIdx)
                    : [...current, optIdx]
                return { ...prev, [qIdx]: next }
            }
            return { ...prev, [qIdx]: [optIdx] }
        })
    }

    const handleSubmit = () => {
        if (inactive) return
        setSubmitted(true)

        // Build answers: header -> array of selected labels (+ free text if provided)
        const answers: Record<string, string[]> = {}
        questions.forEach((q, i) => {
            const selected = (selections[i] || []).map(optIdx => q.options[optIdx].label)
            if (freeText[i]?.trim()) {
                selected.push(freeText[i].trim())
            }
            answers[q.header] = selected
        })
        onAnswer(questionId, answers)
    }

    const hasTabs = questions.length > 1
    const isLastTab = activeTab === questions.length - 1
    const q = questions[activeTab]
    const qIdx = activeTab

    const handleFooterAction = () => {
        if (!isLastTab) {
            setActiveTab(prev => prev + 1)
        } else {
            handleSubmit()
        }
    }

    return (
        <Card className={`border-violet-700/50 bg-card/80 ${inactive ? 'opacity-80' : ''}`}>
            <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm font-medium text-violet-400 flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {inactive ? t('questionsAnswered') : t('auraHasQuestions')}
                </CardTitle>
            </CardHeader>

            {/* Tab bar */}
            {hasTabs && (
                <div className="flex gap-1 px-3 pt-1 border-b border-border/60">
                    {questions.map((tab, idx) => {
                        const isActive = idx === activeTab
                        const hasSelection = (selections[idx] || []).length > 0 || (freeText[idx]?.trim().length > 0)
                        return (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => setActiveTab(idx)}
                                className={`relative px-2.5 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5 ${
                                    isActive
                                        ? 'text-violet-300 border-b-2 border-violet-500'
                                        : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tab.header}
                                {hasSelection && (
                                    <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}

            <CardContent className="p-3 pt-1 space-y-4">
                <div className="space-y-2">
                    {/* Header chip + question */}
                    <div className="flex items-start gap-2">
                        {!hasTabs && (
                            <span className="shrink-0 mt-0.5 text-[10px] font-medium uppercase tracking-wider bg-violet-900/50 text-violet-300 px-1.5 py-0.5 rounded">
                                {q.header}
                            </span>
                        )}
                        <p className="text-xs text-foreground leading-relaxed">{q.question}</p>
                    </div>
                    {q.multiSelect && !inactive && (
                        <p className="text-[10px] text-muted-foreground ml-0.5">{t('selectAllThatApply')}</p>
                    )}

                    {/* Options */}
                    <div className="space-y-1.5">
                        {q.options.map((opt, optIdx) => {
                            const isSelected = (selections[qIdx] || []).includes(optIdx)
                            return (
                                <button
                                    key={optIdx}
                                    type="button"
                                    disabled={inactive}
                                    onClick={() => handleToggle(qIdx, optIdx, q.multiSelect)}
                                    className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                                        inactive
                                            ? isSelected
                                                ? 'border-violet-600/60 bg-violet-950/40'
                                                : 'border-border bg-card/50 opacity-50'
                                            : isSelected
                                                ? 'border-violet-500/70 bg-violet-950/50'
                                                : 'border-border/50 bg-muted/40 hover:border-ring'
                                    }`}
                                >
                                    <div className="flex items-start gap-2">
                                        {/* Indicator */}
                                        <span className={`shrink-0 mt-0.5 w-3.5 h-3.5 flex items-center justify-center border ${
                                            q.multiSelect ? 'rounded-sm' : 'rounded-full'
                                        } ${
                                            isSelected
                                                ? 'border-violet-400 bg-violet-500'
                                                : 'border-border'
                                        }`}>
                                            {isSelected && (
                                                q.multiSelect
                                                    ? <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    : <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                            )}
                                        </span>
                                        <div className="min-w-0">
                                            <p className={`text-xs font-medium ${isSelected ? 'text-violet-200' : 'text-foreground'}`}>
                                                {opt.label}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{opt.description}</p>
                                        </div>
                                    </div>
                                </button>
                            )
                        })}

                        {/* Free text input for additional context */}
                        {!inactive && (
                            <input
                                type="text"
                                value={freeText[qIdx] || ''}
                                onChange={(e) => setFreeText(prev => ({ ...prev, [qIdx]: e.target.value }))}
                                placeholder={t('additionalContext', 'Add additional context...')}
                                className="w-full text-xs bg-muted/60 border border-border/50 rounded-md px-3 py-2 text-foreground placeholder-muted-foreground outline-none focus:border-violet-500/70 transition-colors"
                            />
                        )}
                        {inactive && freeText[qIdx]?.trim() && (
                            <div className="text-xs text-muted-foreground border border-border rounded-md px-3 py-2 bg-card/50">
                                {freeText[qIdx].trim()}
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>

            {!inactive && (
                <CardFooter className="p-3 pt-0">
                    <button
                        onClick={handleFooterAction}
                        className="w-full text-xs font-medium px-4 py-2 rounded bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                    >
                        {isLastTab ? t('submitAnswers') : t('next')}
                    </button>
                </CardFooter>
            )}
        </Card>
    )
}
