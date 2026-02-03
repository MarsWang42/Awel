export function isPascalCase(name: string): boolean {
    return /^[A-Z][a-zA-Z0-9]*$/.test(name);
}

export function parsePixelValue(value: string): number {
    const n = parseFloat(value);
    return isNaN(n) ? 0 : n;
}

export function getSourceLocFromAttribute(element: HTMLElement): { fileName: string; line: number; column: number } | null {
    const attr = element.getAttribute('data-source-loc');
    if (!attr) return null;
    const parts = attr.split(':');
    if (parts.length < 2) return null;
    const column = parts.length >= 3 ? parseInt(parts[parts.length - 1], 10) : 0;
    const line = parseInt(parts[parts.length - 2], 10);
    const fileName = parts.slice(0, parts.length - 2).join(':');
    if (fileName && !isNaN(line)) {
        return { fileName, line, column: isNaN(column) ? 0 : column };
    }
    return null;
}

export function getElementLabel(element: HTMLElement): string {
    const tag = `<${element.tagName.toLowerCase()}>`;
    const component = element.getAttribute('data-source-component');
    return component ? `${component} · ${tag}` : tag;
}
