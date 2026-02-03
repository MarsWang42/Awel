// @vitest-environment jsdom
import { vi, describe, it, expect } from 'vitest';

// Mock matchMedia before state.ts module loads — jsdom doesn't implement it
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

// Now safe to import state.ts (getInitialTheme runs at module load and needs matchMedia)
const { isAwelElement } = await import('./state.js');

describe('isAwelElement', () => {
    it('returns true for element with id "awel-host"', () => {
        const el = document.createElement('div');
        el.id = 'awel-host';
        expect(isAwelElement(el)).toBe(true);
    });

    it('returns true for element with id "awel-sidebar"', () => {
        const el = document.createElement('div');
        el.id = 'awel-sidebar';
        expect(isAwelElement(el)).toBe(true);
    });

    it('returns true for a child of awel-host', () => {
        const host = document.createElement('div');
        host.id = 'awel-host';
        const child = document.createElement('span');
        host.appendChild(child);
        document.body.appendChild(host);
        expect(isAwelElement(child)).toBe(true);
        document.body.removeChild(host);
    });

    it('returns false for a non-Awel element', () => {
        const el = document.createElement('div');
        el.id = 'my-app';
        document.body.appendChild(el);
        expect(isAwelElement(el)).toBe(false);
        document.body.removeChild(el);
    });

    it('returns false for null', () => {
        expect(isAwelElement(null)).toBe(false);
    });

    it('returns false for an element with no Awel ancestor', () => {
        const parent = document.createElement('div');
        parent.id = 'app-root';
        const child = document.createElement('button');
        parent.appendChild(child);
        document.body.appendChild(parent);
        expect(isAwelElement(child)).toBe(false);
        document.body.removeChild(parent);
    });
});
