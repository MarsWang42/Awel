import { describe, it, expect } from 'vitest';
import { consoleDedupeKey, formatConsoleArgs } from './consoleUtils.js';

describe('consoleDedupeKey', () => {
    it('builds key from level and message', () => {
        expect(consoleDedupeKey('error', 'Something failed')).toBe('error:Something failed');
    });

    it('trims whitespace from message', () => {
        expect(consoleDedupeKey('warning', '  spaces  ')).toBe('warning:spaces');
    });

    it('truncates long messages to 200 chars', () => {
        const longMsg = 'x'.repeat(300);
        const key = consoleDedupeKey('error', longMsg);
        // level: + 200 chars
        expect(key).toBe('error:' + 'x'.repeat(200));
    });

    it('normalizes common error prefixes', () => {
        expect(consoleDedupeKey('error', 'Error: Something failed')).toBe('error:Something failed');
        expect(consoleDedupeKey('error', 'Uncaught Error: Something failed')).toBe('error:Something failed');
        expect(consoleDedupeKey('error', 'TypeError: undefined is not a function')).toBe('error:undefined is not a function');
    });

    it('uses only first line for multiline messages', () => {
        const multiline = 'First line\nSecond line\nThird line';
        expect(consoleDedupeKey('error', multiline)).toBe('error:First line');
    });
});

describe('formatConsoleArgs', () => {
    it('formats strings directly', () => {
        expect(formatConsoleArgs(['hello', 'world'])).toBe('hello world');
    });

    it('formats Error objects with stack', () => {
        const err = new Error('test error');
        const result = formatConsoleArgs([err]);
        expect(result).toContain('test error');
    });

    it('formats objects as JSON', () => {
        const result = formatConsoleArgs([{ key: 'value' }]);
        expect(result).toContain('"key"');
        expect(result).toContain('"value"');
    });

    it('formats mixed args', () => {
        const result = formatConsoleArgs(['Error:', 42, { detail: true }]);
        expect(result).toContain('Error:');
        expect(result).toContain('42');
        expect(result).toContain('"detail"');
    });

    it('handles circular objects gracefully', () => {
        const obj: Record<string, unknown> = {};
        obj.self = obj;
        const result = formatConsoleArgs([obj]);
        // JSON.stringify will throw, fallback to String(obj)
        expect(result).toBe('[object Object]');
    });
});
