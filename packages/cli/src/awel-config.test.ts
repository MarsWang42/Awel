import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { readAwelConfig, writeAwelConfig, isProjectFresh, markProjectReady } from './awel-config.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);

describe('awel-config', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('readAwelConfig', () => {
        it('returns empty object when config does not exist', () => {
            mockExistsSync.mockReturnValue(false);
            expect(readAwelConfig('/project')).toEqual({});
        });

        it('reads and parses existing config', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify({ fresh: true, onboarded: true }));
            const config = readAwelConfig('/project');
            expect(config).toEqual({ fresh: true, onboarded: true });
        });

        it('returns empty object on invalid JSON', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue('not json');
            expect(readAwelConfig('/project')).toEqual({});
        });
    });

    describe('writeAwelConfig', () => {
        it('creates directory if it does not exist', () => {
            mockExistsSync.mockReturnValue(false);
            writeAwelConfig('/project', { fresh: true });
            expect(mockMkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('.awel'),
                { recursive: true }
            );
        });

        it('writes JSON config file', () => {
            mockExistsSync.mockReturnValue(true);
            writeAwelConfig('/project', { fresh: false });
            expect(mockWriteFileSync).toHaveBeenCalledWith(
                expect.stringContaining('config.json'),
                expect.stringContaining('"fresh": false'),
                'utf-8'
            );
        });
    });

    describe('isProjectFresh', () => {
        it('returns true when fresh is true', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify({ fresh: true }));
            expect(isProjectFresh('/project')).toBe(true);
        });

        it('returns false when fresh is false', () => {
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify({ fresh: false }));
            expect(isProjectFresh('/project')).toBe(false);
        });

        it('returns false when config does not exist', () => {
            mockExistsSync.mockReturnValue(false);
            expect(isProjectFresh('/project')).toBe(false);
        });
    });

    describe('markProjectReady', () => {
        it('sets fresh to false and writes config', () => {
            // First call to readAwelConfig
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify({ fresh: true, createdAt: '2024-01-01' }));

            markProjectReady('/project');

            expect(mockWriteFileSync).toHaveBeenCalledWith(
                expect.stringContaining('config.json'),
                expect.stringContaining('"fresh": false'),
                'utf-8'
            );
        });
    });
});
