import { readAwelConfig, writeAwelConfig } from './awel-config.js';
import { getAvailableProviders, PROVIDER_ENV_KEYS, PROVIDER_LABELS } from './providers/registry.js';
import { awel } from './logger.js';

async function promptProviderSetup(): Promise<void> {
    const p = await import('@clack/prompts');

    p.log.warn('No LLM providers are configured.');
    p.log.message('Awel needs at least one AI provider to function.\n');

    const provider = await p.select({
        message: 'Which provider would you like to set up?',
        options: [
            { value: 'claude-code', label: 'Claude Code', hint: 'Uses Claude CLI binary' },
            { value: 'anthropic', label: 'Anthropic API', hint: 'ANTHROPIC_API_KEY' },
            { value: 'openai', label: 'OpenAI', hint: 'OPENAI_API_KEY' },
            { value: 'google-ai', label: 'Google AI', hint: 'GOOGLE_GENERATIVE_AI_API_KEY' },
            { value: 'vercel-gateway', label: 'Vercel AI Gateway', hint: 'AI_GATEWAY_API_KEY' },
            { value: 'qwen', label: 'Qwen', hint: 'DASHSCOPE_API_KEY' },
            { value: 'minimax', label: 'MiniMax', hint: 'MINIMAX_API_KEY' },
        ],
    });

    if (p.isCancel(provider)) {
        p.cancel('Cancelled');
        process.exit(0);
    }

    if (provider === 'claude-code') {
        p.note(
            'Install the Claude CLI:\n\n' +
            '  npm install -g @anthropic-ai/claude-code\n\n' +
            'Then authenticate:\n\n' +
            '  claude login',
            'Claude Code Setup'
        );
    } else if (provider === 'openai') {
        const envKey = PROVIDER_ENV_KEYS[provider];
        p.note(
            `Export your API key:\n\n` +
            `  export ${envKey}="your-api-key"\n\n` +
            `Or add it to your .env file:\n\n` +
            `  ${envKey}=your-api-key\n\n` +
            `To use a custom base URL (e.g. a proxy or compatible API):\n\n` +
            `  export OPENAI_BASE_URL="https://your-proxy.com/v1"`,
            'OpenAI Setup'
        );
    } else {
        const envKey = PROVIDER_ENV_KEYS[provider as string];
        const label = PROVIDER_LABELS[provider as string] ?? provider;
        p.note(
            `Export your API key:\n\n` +
            `  export ${envKey}="your-api-key"\n\n` +
            `Or add it to your .env file:\n\n` +
            `  ${envKey}=your-api-key`,
            `${label} Setup`
        );
    }

    p.log.message('Then run `awel dev` again.');
}

export async function ensureProvider(projectCwd: string): Promise<void> {
    const config = readAwelConfig(projectCwd);
    const providers = getAvailableProviders();
    const available = providers.filter(p => p.available);
    const isFirstRun = !config.onboarded;

    if (isFirstRun && available.length > 0) {
        // First run with providers available — show welcome
        awel.log('');
        awel.log('Welcome to Awel!');
        awel.log('AI-powered development overlay for Next.js');
        awel.log('');
        awel.log(`\u2714 ${available.length} provider${available.length === 1 ? '' : 's'} available:`);
        for (const p of available) {
            awel.log(`  \u25CF ${p.label}`);
        }
        awel.log('');

        writeAwelConfig(projectCwd, { ...config, onboarded: true });
        return;
    }

    if (isFirstRun && available.length === 0) {
        // First run with NO providers — show welcome + interactive setup, exit
        awel.log('');
        awel.log('Welcome to Awel!');
        awel.log('AI-powered development overlay for Next.js');
        awel.log('');
        await promptProviderSetup();
        process.exit(1);
    }

    if (!isFirstRun && available.length === 0) {
        // Subsequent run with NO providers — interactive setup, exit
        await promptProviderSetup();
        process.exit(1);
    }

    // Subsequent run with providers available — silent pass-through
}
