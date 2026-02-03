import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
    it('merges class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles conditional classes', () => {
        expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
    });

    it('deduplicates Tailwind classes', () => {
        const result = cn('p-4', 'p-2');
        expect(result).toBe('p-2');
    });

    it('handles empty input', () => {
        expect(cn()).toBe('');
    });

    it('handles undefined and null inputs', () => {
        expect(cn('a', undefined, null, 'b')).toBe('a b');
    });

    it('merges conflicting Tailwind utilities', () => {
        const result = cn('text-red-500', 'text-blue-500');
        expect(result).toBe('text-blue-500');
    });
});
