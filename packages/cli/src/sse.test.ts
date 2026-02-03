import { describe, it, expect, beforeEach } from 'vitest';
import { addToHistory, getHistory, clearHistory } from './sse.js';

describe('sse history', () => {
    beforeEach(() => {
        clearHistory();
    });

    it('starts with empty history', () => {
        expect(getHistory()).toEqual([]);
    });

    it('adds an event to history', () => {
        addToHistory('text', JSON.stringify({ type: 'text', text: 'hello' }));
        const history = getHistory();
        expect(history).toHaveLength(1);
        expect(history[0].eventType).toBe('text');
        expect(history[0].data).toContain('hello');
    });

    it('filters transient events (status, done)', () => {
        addToHistory('status', JSON.stringify({ type: 'status', message: 'thinking...' }));
        addToHistory('done', JSON.stringify({ type: 'done', message: 'completed' }));
        expect(getHistory()).toHaveLength(0);
    });

    it('merges consecutive text events', () => {
        addToHistory('text', JSON.stringify({ type: 'text', text: 'Hello' }));
        addToHistory('text', JSON.stringify({ type: 'text', text: ' world' }));
        const history = getHistory();
        expect(history).toHaveLength(1);
        const parsed = JSON.parse(history[0].data);
        expect(parsed.text).toBe('Hello world');
    });

    it('does not merge text events with different types', () => {
        addToHistory('text', JSON.stringify({ type: 'text', text: 'Hello' }));
        addToHistory('text', JSON.stringify({ type: 'assistant', text: 'World' }));
        expect(getHistory()).toHaveLength(2);
    });

    it('does not merge text after non-text event', () => {
        addToHistory('text', JSON.stringify({ type: 'text', text: 'A' }));
        addToHistory('tool_use', JSON.stringify({ type: 'tool_use', tool: 'Read' }));
        addToHistory('text', JSON.stringify({ type: 'text', text: 'B' }));
        expect(getHistory()).toHaveLength(3);
    });

    it('trims history when exceeding MAX_HISTORY (500)', () => {
        for (let i = 0; i < 510; i++) {
            addToHistory('tool_use', JSON.stringify({ type: 'tool_use', tool: `tool-${i}` }));
        }
        const history = getHistory();
        expect(history.length).toBeLessThanOrEqual(500);
    });

    it('returns a copy from getHistory', () => {
        addToHistory('text', JSON.stringify({ type: 'text', text: 'test' }));
        const h1 = getHistory();
        const h2 = getHistory();
        expect(h1).not.toBe(h2);
        expect(h1).toEqual(h2);
    });

    it('clearHistory empties the history', () => {
        addToHistory('text', JSON.stringify({ type: 'text', text: 'test' }));
        clearHistory();
        expect(getHistory()).toHaveLength(0);
    });
});
