import { program } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { startServer } from './server.js';
import { AWEL_PORT, USER_APP_PORT } from './config.js';
import { setVerbose } from './verbose.js';
import { ensureBabelPlugin } from './babel-setup.js';
import { ensureProvider } from './onboarding.js';
import { ensureSkills } from './skills.js';
import { awel } from './logger.js';
import { spawnDevServer } from './subprocess.js';
import { writeAwelConfig, isProjectFresh } from './awel-config.js';
import { initHistory } from './sse.js';
import { initSession } from './session.js';

program
    .name('awel')
    .description('AI-powered development overlay for Next.js & React')
    .version('0.1.0');

type ProjectFramework = 'nextjs' | 'react' | null;

function detectFramework(cwd: string): ProjectFramework {
    // Next.js: config file or `next` in dependencies
    const nextConfigs = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
    if (nextConfigs.some(f => existsSync(join(cwd, f)))) return 'nextjs';

    const pkgPath = join(cwd, 'package.json');
    if (!existsSync(pkgPath)) return null;

    let pkg: any;
    try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    } catch {
        return null;
    }

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps.next) return 'nextjs';
    if (deps.react) return 'react';

    return null;
}

program
    .command('dev')
    .description('Start the development server with Awel overlay')
    .option('-p, --port <port>', 'Port for target app', String(USER_APP_PORT))
    .option('-v, --verbose', 'Print all LLM stream events to stderr')
    .action(async (options) => {
        const targetPort = parseInt(options.port, 10);
        if (options.verbose) setVerbose(true);

        const cwd = process.cwd();
        const framework = detectFramework(cwd);

        if (!framework) {
            awel.error('This directory does not appear to be a React project.');
            awel.error('Awel requires a React app (Next.js, Vite, CRA, etc.) to run.');
            awel.error('Make sure you are in a directory with `react` in package.json.');
            awel.error('');
            awel.error('To create a new Next.js project, run: npx awel create');
            process.exit(1);
        }

        const fresh = isProjectFresh(cwd);

        await ensureProvider(cwd);
        if (!fresh && framework === 'nextjs') await ensureBabelPlugin(cwd);
        await ensureSkills(cwd);

        // Restore chat history and session from previous run
        initHistory(cwd);
        initSession(cwd);

        awel.log('🌟 Starting Awel...');
        if (fresh) awel.log('   Mode: Creation (new project)');
        awel.log(`   Target app port: ${targetPort}`);
        awel.log(`   Awel control server: http://localhost:${AWEL_PORT}`);
        awel.log('');

        // Start the Awel control server (proxy + dashboard)
        await startServer({ awelPort: AWEL_PORT, targetPort, projectCwd: cwd, fresh });

        // Start the user's dev server via subprocess manager (handles auto-restart)
        await spawnDevServer({ port: targetPort, cwd: cwd });

        awel.log('');
        if (fresh) {
            awel.log(`✨ Awel is ready! Open http://localhost:${AWEL_PORT}`);
            awel.log('   Describe what you want to build and Awel will create it for you.');
        } else {
            awel.log(`✨ Awel is ready! Open http://localhost:${AWEL_PORT}`);
            awel.log('   Look for the floating button in the bottom-right corner.');
        }
    });

program
    .command('create')
    .description('Create a new Next.js project with Awel')
    .action(async () => {
        const p = await import('@clack/prompts');
        const { execa } = await import('execa');

        p.intro('Create a new project with Awel');

        const name = await p.text({
            message: 'Project name',
            placeholder: 'my-app',
            validate: (value) => {
                if (!value) return 'Project name is required';
                if (!/^[a-z0-9._-]+$/i.test(value)) return 'Project name must only contain letters, numbers, dashes, dots, and underscores';
            },
        });

        if (p.isCancel(name)) {
            p.cancel('Cancelled');
            process.exit(0);
        }

        const s = p.spinner();
        s.start('Creating Next.js project...');

        try {
            await execa('npx', [
                'create-next-app@latest', name,
                '--yes',
                '--typescript', '--tailwind', '--eslint',
                '--app', '--use-npm',
            ], { cwd: process.cwd(), stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
        } catch (err: any) {
            s.stop('Failed to create project');
            const stderr = err.stderr || err.message || String(err);
            p.log.error(stderr);
            process.exit(1);
        }

        s.stop('Project created');

        const projectDir = resolve(process.cwd(), name);
        writeAwelConfig(projectDir, { fresh: true, createdAt: new Date().toISOString() });

        p.outro(`Done! Now run:\n\n  cd ${name}\n  npx awel dev`);
    });

program.parse();
