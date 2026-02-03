import { describe, it, expect } from 'vitest';
import { countLineStats } from './undo.js';

describe('countLineStats', () => {
    it('returns zero changes for identical content', () => {
        const text = 'line1\nline2\nline3';
        const result = countLineStats(text, text);
        expect(result).toEqual({ additions: 0, deletions: 0 });
    });

    it('counts pure additions', () => {
        const original = 'line1\nline2';
        const current = 'line1\nline2\nline3\nline4';
        const result = countLineStats(original, current);
        expect(result.additions).toBe(2);
        expect(result.deletions).toBe(0);
    });

    it('counts pure deletions', () => {
        const original = 'line1\nline2\nline3\nline4';
        const current = 'line1\nline2';
        const result = countLineStats(original, current);
        expect(result.additions).toBe(0);
        expect(result.deletions).toBe(2);
    });

    it('counts mixed changes', () => {
        const original = 'line1\nline2\nline3';
        const current = 'line1\nmodified\nline3\nnewline';
        const result = countLineStats(original, current);
        // 'line2' deleted, 'modified' and 'newline' added
        expect(result.additions).toBe(2);
        expect(result.deletions).toBe(1);
    });

    it('handles empty strings', () => {
        expect(countLineStats('', '')).toEqual({ additions: 0, deletions: 0 });
    });

    it('handles complete replacement', () => {
        const original = 'a\nb\nc';
        const current = 'x\ny\nz';
        const result = countLineStats(original, current);
        expect(result.additions).toBe(3);
        expect(result.deletions).toBe(3);
    });

    it('handles duplicate lines correctly using bag matching', () => {
        const original = 'a\na\nb';
        const current = 'a\nb\nc';
        const result = countLineStats(original, current);
        // One 'a' matches, 'b' matches. One 'a' deleted, 'c' added.
        expect(result.additions).toBe(1);
        expect(result.deletions).toBe(1);
    });
});
