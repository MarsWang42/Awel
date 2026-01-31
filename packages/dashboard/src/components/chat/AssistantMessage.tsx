import ReactMarkdown from 'react-markdown'

interface AssistantMessageProps {
    text: string
}

export function AssistantMessage({ text }: AssistantMessageProps) {
    return (
        <div className="text-sm text-foreground">
            <ReactMarkdown
                components={{
                    // Style code blocks
                    pre: ({ children }) => (
                        <pre className="bg-card rounded-lg p-2 overflow-x-auto text-xs my-2">
                            {children}
                        </pre>
                    ),
                    code: ({ className, children, ...props }) => {
                        const isInline = !className
                        return isInline ? (
                            <code className="bg-muted px-1 py-0.5 rounded text-muted-foreground text-xs" {...props}>
                                {children}
                            </code>
                        ) : (
                            <code className={className} {...props}>
                                {children}
                            </code>
                        )
                    },
                    // Style links
                    a: ({ children, ...props }) => (
                        <a className="text-muted-foreground hover:text-foreground underline" {...props}>
                            {children}
                        </a>
                    ),
                    // Style lists
                    ul: ({ children }) => (
                        <ul className="list-disc list-inside space-y-0.5 my-1.5 text-sm">{children}</ul>
                    ),
                    ol: ({ children }) => (
                        <ol className="list-decimal list-inside space-y-0.5 my-1.5 text-sm">{children}</ol>
                    ),
                    // Style paragraphs - same size as user message
                    p: ({ children }) => (
                        <p className="my-1.5 leading-relaxed text-sm">{children}</p>
                    ),
                    // Style headings - scaled down
                    h1: ({ children }) => (
                        <h1 className="text-base font-semibold text-foreground mt-3 mb-1">{children}</h1>
                    ),
                    h2: ({ children }) => (
                        <h2 className="text-sm font-semibold text-foreground mt-2 mb-1">{children}</h2>
                    ),
                    h3: ({ children }) => (
                        <h3 className="text-sm font-medium text-foreground mt-1.5 mb-0.5">{children}</h3>
                    ),
                    // Style blockquotes
                    blockquote: ({ children }) => (
                        <blockquote className="border-l-2 border-border pl-2 my-1.5 text-muted-foreground italic text-sm">
                            {children}
                        </blockquote>
                    ),
                    // Style list items
                    li: ({ children }) => (
                        <li className="text-sm">{children}</li>
                    ),
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    )
}
