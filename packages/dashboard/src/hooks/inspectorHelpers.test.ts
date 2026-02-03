import { describe, it, expect } from 'vitest';
import { buildOpeningTag, buildInspectorContext, buildMultiElementContext } from './inspectorHelpers';
import type { SelectedElement } from '../types/messages';

function makeElement(overrides: Partial<SelectedElement> = {}): SelectedElement {
    return {
        tag: 'div',
        component: null,
        source: null,
        text: '',
        className: '',
        line: null,
        column: null,
        props: null,
        componentChain: null,
        attributes: null,
        ...overrides,
    };
}

describe('buildOpeningTag', () => {
    it('builds a simple tag with no attributes', () => {
        const el = makeElement({ tag: 'button' });
        expect(buildOpeningTag(el)).toBe('<button>');
    });

    it('builds a tag with attributes', () => {
        const el = makeElement({
            tag: 'input',
            attributes: { type: 'text', placeholder: 'Enter name' },
        });
        const result = buildOpeningTag(el);
        expect(result).toContain('<input');
        expect(result).toContain('type="text"');
        expect(result).toContain('placeholder="Enter name"');
    });

    it('handles attributes with empty string value', () => {
        const el = makeElement({
            tag: 'div',
            attributes: { disabled: '' },
        });
        expect(buildOpeningTag(el)).toBe('<div disabled>');
    });
});

describe('buildInspectorContext', () => {
    it('includes selected tag info', () => {
        const el = makeElement({ tag: 'h1', text: 'Hello World' });
        const result = buildInspectorContext(el);
        expect(result).toContain('[Inspector Context]');
        expect(result).toContain('## Selected Tag');
        expect(result).toContain('<h1>');
        expect(result).toContain('Text content: "Hello World"');
    });

    it('includes component context when component is present', () => {
        const el = makeElement({
            tag: 'button',
            component: 'Header',
            source: 'src/components/Header.tsx',
            line: 42,
            column: 8,
        });
        const result = buildInspectorContext(el);
        expect(result).toContain('## Parent Component Context');
        expect(result).toContain('Component: Header');
        expect(result).toContain('Source: src/components/Header.tsx:42:8');
    });

    it('includes source snippet when present', () => {
        const el = makeElement({
            tag: 'p',
            component: 'About',
            source: 'src/About.tsx',
            line: 10,
            sourceSnippet: 'return <p>About page</p>',
        });
        const result = buildInspectorContext(el);
        expect(result).toContain('```tsx');
        expect(result).toContain('return <p>About page</p>');
    });

    it('shows Source Context when no component', () => {
        const el = makeElement({
            tag: 'span',
            source: 'src/page.tsx',
            line: 5,
        });
        const result = buildInspectorContext(el);
        expect(result).toContain('## Source Context');
        expect(result).toContain('Source: src/page.tsx:5');
        expect(result).not.toContain('## Parent Component Context');
    });

    it('shows no source section when neither component nor source', () => {
        const el = makeElement({ tag: 'div' });
        const result = buildInspectorContext(el);
        expect(result).not.toContain('## Parent Component Context');
        expect(result).not.toContain('## Source Context');
    });
});

describe('buildMultiElementContext', () => {
    it('delegates to buildInspectorContext for single element', () => {
        const el = makeElement({ tag: 'div' });
        const result = buildMultiElementContext([el]);
        expect(result).toContain('[Inspector Context]');
        expect(result).not.toContain('[Component 1:');
    });

    it('labels multiple elements', () => {
        const els = [
            makeElement({ tag: 'h1', component: 'Title' }),
            makeElement({ tag: 'p', component: null }),
        ];
        const result = buildMultiElementContext(els);
        expect(result).toContain('[Component 1: Title]');
        expect(result).toContain('[Component 2: <p>]');
    });
});
