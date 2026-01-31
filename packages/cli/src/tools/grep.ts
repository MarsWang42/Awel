import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, relative } from 'path';
import fg from 'fast-glob';

const MAX_RESULTS = 100;
const MAX_LINE_LENGTH = 2000;

const IGNORE_DIRS = ['node_modules', '.git', 'dist', 'build', '.next'];

/** Check once at startup whether ripgrep is available. */
let rgAvailable: boolean | null = null;
function hasRipgrep(): boolean {
    if (rgAvailable === null) {
        try {
            execSync('rg --version', { stdio: 'pipe', timeout: 3000 });
            rgAvailable = true;
        } catch {
            rgAvailable = false;
        }
    }
    return rgAvailable;
}

export function createGrepTool(cwd: string) {
    return tool({
        description:
            'Search file contents for a regex pattern. ' +
            'Returns matching lines with file paths and line numbers. ' +
            'Use this to find where functions are defined, where variables are used, ' +
            'or to locate specific strings across the codebase.',
        inputSchema: z.object({
            pattern: z.string().describe('Regex pattern to search for (e.g. "function\\s+handleSubmit", "TODO", "import.*from")'),
            path: z.string().optional().describe('Directory or file to search in (default: project root)'),
            include: z.string().optional().describe('File glob filter (e.g. "*.ts", "*.{js,jsx,ts,tsx}")'),
        }),
        execute: async ({ pattern, path, include }) => {
            const searchPath = path
                ? (path.startsWith('/') ? path : resolve(cwd, path))
                : cwd;

            if (hasRipgrep()) {
                return searchWithRipgrep(cwd, pattern, searchPath, include);
            }
            return searchWithNode(cwd, pattern, searchPath, include);
        },
    });
}

function searchWithRipgrep(cwd: string, pattern: string, searchPath: string, include?: string): string {
    const args = [
        '--no-heading',
        '--line-number',
        '--color=never',
        '--max-count=5',
        '--hidden',
        '--follow',
        ...IGNORE_DIRS.map(d => `--glob=!${d}`),
    ];

    if (include) {
        args.push(`--glob=${include}`);
    }

    args.push('--', pattern, searchPath);

    try {
        const output = execSync(`rg ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
            cwd,
            encoding: 'utf-8',
            timeout: 15_000,
            stdio: ['pipe', 'pipe', 'pipe'],
            maxBuffer: 2 * 1024 * 1024,
        });

        return formatOutput(output);
    } catch (err: unknown) {
        const execErr = err as { status?: number; stderr?: string; message?: string };
        if (execErr.status === 1) {
            return 'No matches found.';
        }
        return `Error: ${execErr.stderr || execErr.message || 'Search failed'}`.trim();
    }
}

async function searchWithNode(cwd: string, pattern: string, searchPath: string, include?: string): Promise<string> {
    let regex: RegExp;
    try {
        regex = new RegExp(pattern);
    } catch {
        return `Error: Invalid regex pattern: ${pattern}`;
    }

    const globPattern = include || '**/*';
    const ignore = IGNORE_DIRS.map(d => `**/${d}/**`);

    let files: string[];
    try {
        files = await fg(globPattern, {
            cwd: searchPath,
            dot: true,
            ignore,
            followSymbolicLinks: true,
            onlyFiles: true,
            absolute: true,
        });
    } catch {
        return 'Error: Failed to list files for search.';
    }

    const matches: string[] = [];
    let matchCount = 0;

    for (const filePath of files) {
        if (matchCount >= MAX_RESULTS) break;

        let content: string;
        try {
            content = readFileSync(filePath, 'utf-8');
        } catch {
            continue; // skip binary / unreadable files
        }

        // Quick binary check: skip files with null bytes
        if (content.includes('\0')) continue;

        const lines = content.split('\n');
        let fileMatches = 0;
        for (let i = 0; i < lines.length; i++) {
            if (fileMatches >= 5 || matchCount >= MAX_RESULTS) break;
            if (regex.test(lines[i])) {
                const rel = relative(cwd, filePath);
                const line = lines[i].length > MAX_LINE_LENGTH
                    ? lines[i].slice(0, MAX_LINE_LENGTH) + '...'
                    : lines[i];
                matches.push(`${rel}:${i + 1}:${line}`);
                fileMatches++;
                matchCount++;
            }
        }
    }

    if (matches.length === 0) {
        return 'No matches found.';
    }

    return matches.join('\n');
}

function formatOutput(output: string): string {
    const lines = output.split('\n').filter(Boolean);
    const truncated = lines.slice(0, MAX_RESULTS).map(line =>
        line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + '...' : line
    );

    const result = truncated.join('\n');
    const suffix = lines.length > MAX_RESULTS
        ? `\n\n(showing ${MAX_RESULTS} of ${lines.length} matches)`
        : '';

    return result + suffix || 'No matches found.';
}
