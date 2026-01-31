import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readAwelConfig, writeAwelConfig } from './awel-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BABEL_CONFIG_FILES = [
    'babel.config.js',
    'babel.config.cjs',
    'babel.config.mjs',
    '.babelrc',
    '.babelrc.json',
    '.babelrc.js',
    '.babelrc.cjs',
];

function getPluginPath(): string {
    // babel-plugin-awel-source.cjs lives at the root of the cli package,
    // which is one level up from dist/ (where this compiled file lives).
    return join(__dirname, '..', '..', 'babel-plugin-awel-source.cjs');
}

function hasPackageJsonBabelKey(projectCwd: string): boolean {
    const pkgPath = join(projectCwd, 'package.json');
    if (!existsSync(pkgPath)) return false;
    try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        return 'babel' in pkg;
    } catch {
        return false;
    }
}

function findExistingBabelConfig(projectCwd: string): string | null {
    for (const file of BABEL_CONFIG_FILES) {
        if (existsSync(join(projectCwd, file))) return file;
    }
    if (hasPackageJsonBabelKey(projectCwd)) return 'package.json';
    return null;
}

// ANSI 256-color helpers — darker shades that stay visible on light backgrounds
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const green = (s: string) => `\x1b[38;5;34m${s}\x1b[39m`;
const cyan = (s: string) => `\x1b[38;5;30m${s}\x1b[39m`;

interface SelectOption {
    label: string;
    value: boolean;
}

function promptSelect(title: string, description: string, options: SelectOption[]): Promise<boolean> {
    return new Promise((resolve) => {
        let selected = 0;
        const { stdin, stdout } = process;

        const hide = '\x1b[?25l'; // hide cursor
        const show = '\x1b[?25h'; // show cursor

        function render() {
            // Move to start and clear from cursor down
            let out = `\x1b[${options.length}A\x1b[J`;
            for (let i = 0; i < options.length; i++) {
                const pointer = i === selected ? green('❯') : ' ';
                const label = i === selected ? bold(options[i].label) : dim(options[i].label);
                out += `  ${pointer} ${label}\n`;
            }
            stdout.write(out);
        }

        function cleanup() {
            stdin.setRawMode(false);
            stdin.removeListener('data', onKey);
            stdin.pause();
            stdout.write(show);
        }

        // Print header + initial render
        stdout.write(`\n${bold(green('?'))} ${bold(title)}\n`);
        stdout.write(`  ${dim(description)}\n\n`);
        stdout.write(hide);
        // Print placeholder lines so render() can overwrite them
        for (let i = 0; i < options.length; i++) stdout.write('\n');
        render();

        function onKey(data: Buffer) {
            const key = data.toString();

            // Up arrow or k
            if (key === '\x1b[A' || key === 'k') {
                selected = (selected - 1 + options.length) % options.length;
                render();
            }
            // Down arrow or j
            else if (key === '\x1b[B' || key === 'j') {
                selected = (selected + 1) % options.length;
                render();
            }
            // Enter
            else if (key === '\r' || key === '\n') {
                cleanup();
                // Overwrite options with the final selection
                stdout.write(`\x1b[${options.length}A\x1b[J`);
                stdout.write(`  ${green('❯')} ${bold(options[selected].label)}\n\n`);
                resolve(options[selected].value);
            }
            // Ctrl-C
            else if (key === '\x03') {
                cleanup();
                stdout.write('\n');
                resolve(false);
            }
        }

        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('data', onKey);
    });
}

function createBabelConfig(projectCwd: string): void {
    const pluginPath = getPluginPath();
    const configContent = `module.exports = {
  presets: ['next/babel'],
  plugins: [${JSON.stringify(pluginPath)}],
};
`;
    writeFileSync(join(projectCwd, 'babel.config.js'), configContent, 'utf-8');
}

export async function ensureBabelPlugin(projectCwd: string): Promise<void> {
    const pluginPath = getPluginPath();
    const existing = findExistingBabelConfig(projectCwd);

    if (existing) {
        // Config exists — check if the awel plugin is already referenced
        const configPath = existing === 'package.json'
            ? join(projectCwd, 'package.json')
            : join(projectCwd, existing);
        const content = readFileSync(configPath, 'utf-8');
        if (content.includes('awel-source')) return;

        console.log(`[Awel] Babel config found (${existing}) but Awel source plugin is not configured.`);
        console.log(`       Add this to your plugins array:`);
        console.log(`       require.resolve(${JSON.stringify(pluginPath)})`);
        console.log(`       Inspector source mapping will use runtime fiber fallback.`);
        return;
    }

    // No babel config exists — check stored preference
    const config = readAwelConfig(projectCwd);

    if (config.babelPlugin === true) {
        createBabelConfig(projectCwd);
        console.log('[Awel] Created babel.config.js with source-mapping plugin (previously opted in).');
        return;
    }

    if (config.babelPlugin === false) {
        return;
    }

    // Never prompted — ask interactively (skip if not a TTY)
    if (!process.stdin.isTTY) {
        return;
    }

    const accepted = await promptSelect(
        'Inspector source mapping',
        'The Babel plugin gives click-to-source with exact line numbers,\n' +
        '  but replaces Next.js SWC with Babel (slower builds).\n' +
        '  Without it, the inspector still works via React fiber detection.',
        [
            { label: '⚡ Skip — use runtime fiber detection (no build impact)', value: false },
            { label: '🌸 Enable — create babel.config.js (best experience, slower builds)', value: true },
        ],
    );

    writeAwelConfig(projectCwd, { ...config, babelPlugin: accepted });

    if (accepted) {
        createBabelConfig(projectCwd);
        console.log(`${green('✔')} Created ${cyan('babel.config.js')} with source-mapping plugin.`);
    } else {
        console.log(`${dim('→')} Skipped Babel plugin. Inspector will use runtime fiber fallback.`);
        console.log(`  ${dim('Run with a fresh .awel/ to be asked again.')}`);
    }
}
