import { readAwelConfig, writeAwelConfig } from './awel-config.js';
import { getAvailableProviders, PROVIDER_ENV_KEYS, PROVIDER_LABELS } from './providers/registry.js';
import { awel } from './logger.js';

function printSetupInstructions(): void {
    awel.log('No LLM providers are configured.');
    awel.log('Awel needs at least one AI provider to function.');
    awel.log('');
    awel.log('Set up a provider by exporting its API key:');
    awel.log('');

    // List all providers with their setup commands
    for (const [provider, envKey] of Object.entries(PROVIDER_ENV_KEYS)) {
        const label = PROVIDER_LABELS[provider] ?? provider;
        awel.log(`  ${label}`);
        awel.log(`  export ${envKey}="..."`);
        awel.log('');
    }

    // Claude Code is special — no env var, needs CLI install
    const label = PROVIDER_LABELS['claude-code'] ?? 'Claude Code';
    awel.log(`  ${label}`);
    awel.log('  Install the Claude CLI: https://docs.anthropic.com/en/docs/claude-code');
    awel.log('');

    awel.log('Then run `awel dev` again.');
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
        // First run with NO providers — show welcome + instructions, exit
        awel.log('');
        awel.log('Welcome to Awel!');
        awel.log('AI-powered development overlay for Next.js');
        awel.log('');
        printSetupInstructions();
        process.exit(1);
    }

    if (!isFirstRun && available.length === 0) {
        // Subsequent run with NO providers — instructions only, exit
        printSetupInstructions();
        process.exit(1);
    }

    // Subsequent run with providers available — silent pass-through
}
