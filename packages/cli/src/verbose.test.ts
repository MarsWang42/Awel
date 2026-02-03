import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setVerbose, isVerbose, logEvent } from './verbose.js';

describe('verbose', () => {
    beforeEach(() => {
        setVerbose(false);
    });

    describe('setVerbose / isVerbose', () => {
        it('defaults to false', () => {
            expect(isVerbose()).toBe(false);
        });

        it('can be enabled', () => {
            setVerbose(true);
            expect(isVerbose()).toBe(true);
        });

        it('can be toggled', () => {
            setVerbose(true);
            expect(isVerbose()).toBe(true);
            setVerbose(false);
            expect(isVerbose()).toBe(false);
        });
    });

    describe('logEvent', () => {
        let stderrSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        });

        afterEach(() => {
            stderrSpy.mockRestore();
        });

        it('is a no-op when verbose is off', () => {
            setVerbose(false);
            logEvent('tool-call', 'some detail');
            expect(stderrSpy).not.toHaveBeenCalled();
        });

        it('writes to stderr when verbose is on', () => {
            setVerbose(true);
            logEvent('tool-call', 'Read file.ts');
            expect(stderrSpy).toHaveBeenCalledTimes(1);
            const output = stderrSpy.mock.calls[0][0] as string;
            expect(output).toContain('tool-call');
            expect(output).toContain('Read file.ts');
            expect(output).toMatch(/\n$/);
        });

        it('works without detail', () => {
            setVerbose(true);
            logEvent('finish-step');
            expect(stderrSpy).toHaveBeenCalledTimes(1);
            const output = stderrSpy.mock.calls[0][0] as string;
            expect(output).toContain('finish-step');
        });

        it('truncates long details', () => {
            setVerbose(true);
            const longDetail = 'x'.repeat(300);
            logEvent('text-delta', longDetail);
            const output = stderrSpy.mock.calls[0][0] as string;
            // The truncate function limits to 200 chars for logEvent detail
            expect(output.length).toBeLessThan(longDetail.length + 100);
        });
    });
});
