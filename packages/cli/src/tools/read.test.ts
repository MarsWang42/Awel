import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('fs', () => ({
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
}));

// Mock zod to avoid ESM import issues with the ai package
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

import { existsSync, readFileSync } from 'fs';
import { createReadTool } from './read.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);

describe('createReadTool', () => {
    const cwd = '/project';
    let execute: (args: { file_path: string }) => Promise<string>;

    beforeEach(() => {
        vi.clearAllMocks();
        const toolDef = createReadTool(cwd) as unknown as { execute: typeof execute };
        execute = toolDef.execute;
    });

    it('reads a file successfully with relative path', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('file content here');
        const result = await execute({ file_path: 'src/index.ts' });
        expect(result).toBe('file content here');
        expect(mockReadFileSync).toHaveBeenCalledWith('/project/src/index.ts', 'utf-8');
    });

    it('reads a file with absolute path', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue('abs content');
        const result = await execute({ file_path: '/other/path/file.ts' });
        expect(result).toBe('abs content');
        expect(mockReadFileSync).toHaveBeenCalledWith('/other/path/file.ts', 'utf-8');
    });

    it('returns error when file not found', async () => {
        mockExistsSync.mockReturnValue(false);
        const result = await execute({ file_path: 'missing.ts' });
        expect(result).toContain('Error: File not found');
    });

    it('returns error on read failure', async () => {
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockImplementation(() => { throw new Error('Permission denied'); });
        const result = await execute({ file_path: 'src/secret.ts' });
        expect(result).toContain('Error reading file');
        expect(result).toContain('Permission denied');
    });
});
