import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
}));

vi.mock('ai', () => ({
    tool: vi.fn((config) => ({
        ...config,
        execute: config.execute,
    })),
}));

vi.mock('zod', async () => {
    const actual = await vi.importActual('zod');
    return actual;
});

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createEditTool } from './edit.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

describe('createEditTool', () => {
    const cwd = '/project';
    let execute: (args: {
        file_path: string;
        old_string: string;
        new_string: string;
        replace_all?: boolean;
    }) => Promise<string>;

    beforeEach(() => {
        vi.clearAllMocks();
        const toolDef = createEditTool(cwd) as unknown as { execute: typeof execute };
        execute = toolDef.execute;
    });

    it('replaces first occurrence by default', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('hello world hello');

        const result = await execute({
            file_path: 'src/app.ts',
            old_string: 'hello',
            new_string: 'hi',
        });

        expect(result).toContain('Successfully edited');
        expect(mockWriteFileSync).toHaveBeenCalledWith(
            '/project/src/app.ts',
            'hi world hello',
            'utf-8'
        );
    });

    it('replaces all occurrences when replace_all is true', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('hello world hello');

        const result = await execute({
            file_path: 'src/app.ts',
            old_string: 'hello',
            new_string: 'hi',
            replace_all: true,
        });

        expect(result).toContain('Successfully edited');
        expect(mockWriteFileSync).toHaveBeenCalledWith(
            '/project/src/app.ts',
            'hi world hi',
            'utf-8'
        );
    });

    it('returns error when old_string not found', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('some content');

        const result = await execute({
            file_path: 'src/app.ts',
            old_string: 'nonexistent',
            new_string: 'replacement',
        });

        expect(result).toContain('Error: old_string not found');
        expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('returns error when file not found', async () => {
        mockExistsSync.mockReturnValue(false);

        const result = await execute({
            file_path: 'missing.ts',
            old_string: 'a',
            new_string: 'b',
        });

        expect(result).toContain('Error: File not found');
    });

    it('handles absolute paths', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('content');

        await execute({
            file_path: '/absolute/path/file.ts',
            old_string: 'content',
            new_string: 'new content',
        });

        expect(mockReadFileSync).toHaveBeenCalledWith('/absolute/path/file.ts', 'utf-8');
    });
});
