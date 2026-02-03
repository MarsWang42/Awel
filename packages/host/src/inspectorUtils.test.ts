// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
}));

import { isPascalCase, parsePixelValue, getSourceLocFromAttribute, getElementLabel } from './inspectorUtils.js';

describe('isPascalCase', () => {
    it('returns true for PascalCase names', () => {
        expect(isPascalCase('Header')).toBe(true);
        expect(isPascalCase('MyComponent')).toBe(true);
        expect(isPascalCase('A')).toBe(true);
        expect(isPascalCase('Button2')).toBe(true);
    });

    it('returns false for non-PascalCase names', () => {
        expect(isPascalCase('header')).toBe(false);
        expect(isPascalCase('my-component')).toBe(false);
        expect(isPascalCase('myComponent')).toBe(false);
        expect(isPascalCase('_Private')).toBe(false);
        expect(isPascalCase('')).toBe(false);
    });
});

describe('parsePixelValue', () => {
    it('parses valid pixel strings', () => {
        expect(parsePixelValue('10px')).toBe(10);
        expect(parsePixelValue('3.5px')).toBe(3.5);
        expect(parsePixelValue('0px')).toBe(0);
    });

    it('returns 0 for non-numeric values', () => {
        expect(parsePixelValue('auto')).toBe(0);
        expect(parsePixelValue('')).toBe(0);
        expect(parsePixelValue('abc')).toBe(0);
    });
});

describe('getSourceLocFromAttribute', () => {
    it('parses data-source-loc with file:line:column', () => {
        const el = document.createElement('div');
        el.setAttribute('data-source-loc', 'src/App.tsx:42:8');
        const result = getSourceLocFromAttribute(el);
        expect(result).toEqual({ fileName: 'src/App.tsx', line: 42, column: 8 });
    });

    it('returns null for file:line with no column (filename becomes empty)', () => {
        // With only 2 parts, fileName = parts.slice(0, 0) = '' which is falsy
        const el = document.createElement('div');
        el.setAttribute('data-source-loc', 'src/App.tsx:42');
        expect(getSourceLocFromAttribute(el)).toBeNull();
    });

    it('returns null when attribute is missing', () => {
        const el = document.createElement('div');
        expect(getSourceLocFromAttribute(el)).toBeNull();
    });

    it('returns null for malformed attribute', () => {
        const el = document.createElement('div');
        el.setAttribute('data-source-loc', 'invalid');
        expect(getSourceLocFromAttribute(el)).toBeNull();
    });

    it('handles paths with colons (e.g. Windows paths)', () => {
        const el = document.createElement('div');
        el.setAttribute('data-source-loc', 'C:/Users/dev/App.tsx:10:5');
        const result = getSourceLocFromAttribute(el);
        expect(result).toEqual({ fileName: 'C:/Users/dev/App.tsx', line: 10, column: 5 });
    });
});

describe('getElementLabel', () => {
    it('returns tag name for element without component', () => {
        const el = document.createElement('button');
        expect(getElementLabel(el)).toBe('<button>');
    });

    it('returns component + tag for element with data-source-component', () => {
        const el = document.createElement('div');
        el.setAttribute('data-source-component', 'Header');
        expect(getElementLabel(el)).toBe('Header · <div>');
    });
});
