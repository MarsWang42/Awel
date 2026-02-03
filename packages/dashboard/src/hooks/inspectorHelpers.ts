import type { SelectedElement } from '../types/messages'

export function buildOpeningTag(el: SelectedElement): string {
    const attrs: string[] = []
    if (el.attributes) {
        for (const [name, value] of Object.entries(el.attributes)) {
            attrs.push(value ? `${name}="${value}"` : name)
        }
    }
    return attrs.length > 0 ? `<${el.tag} ${attrs.join(' ')}>` : `<${el.tag}>`
}

export function buildInspectorContext(el: SelectedElement): string {
    const lines: string[] = ['[Inspector Context]']

    // ── Selected tag (the specific element the user clicked) ──
    lines.push('')
    lines.push('## Selected Tag')
    lines.push(`Rendered HTML: ${buildOpeningTag(el)}`)
    if (el.text) {
        lines.push(`Text content: "${el.text}"`)
    }
    lines.push('')
    lines.push('IMPORTANT: The user selected this specific <' + el.tag + '> tag. Any changes must target ONLY this element, not the entire parent component.')

    // ── Parent component (broader context) ──
    if (el.component) {
        lines.push('')
        lines.push('## Parent Component Context')
        lines.push(`Component: ${el.component}`)
        if (el.source) {
            let loc = `Source: ${el.source}`
            if (el.line) loc += `:${el.line}`
            if (el.column) loc += `:${el.column}`
            lines.push(loc)
        }
        if (el.propsTypeDefinition) {
            lines.push('')
            lines.push('Props type definition:')
            lines.push('```tsx')
            lines.push(el.propsTypeDefinition)
            lines.push('```')
        }
        if (el.sourceSnippet) {
            lines.push('')
            lines.push(`Source code around line ${el.line} (find the <${el.tag}> within this snippet):`)
            lines.push('```tsx')
            lines.push(el.sourceSnippet)
            lines.push('```')
        }
    } else {
        // No parent component — still show source context if available
        if (el.source) {
            lines.push('')
            lines.push('## Source Context')
            let loc = `Source: ${el.source}`
            if (el.line) loc += `:${el.line}`
            if (el.column) loc += `:${el.column}`
            lines.push(loc)
        }
        if (el.sourceSnippet) {
            lines.push('')
            lines.push(`Source code around line ${el.line}:`)
            lines.push('```tsx')
            lines.push(el.sourceSnippet)
            lines.push('```')
        }
    }

    return lines.join('\n')
}

export function buildMultiElementContext(elements: SelectedElement[]): string {
    if (elements.length === 1) {
        return buildInspectorContext(elements[0])
    }
    return elements.map((el, i) => {
        const name = el.component || `<${el.tag}>`
        return `[Component ${i + 1}: ${name}]\n${buildInspectorContext(el)}`
    }).join('\n\n')
}
