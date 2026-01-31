import { program } from 'commander';
import { startServer } from './server.js';
import { AWEL_PORT, USER_APP_PORT } from './config.js';
import { setVerbose } from './verbose.js';
import { ensureBabelPlugin } from './babel-setup.js';
import { awel } from './logger.js';
import { spawnDevServer } from './subprocess.js';

program
    .name('awel')
    .description('AI-powered development overlay for Next.js')
    .version('0.1.0');

program
    .command('dev')
    .description('Start the development server with Awel overlay')
    .option('-p, --port <port>', 'Port for target app', String(USER_APP_PORT))
    .option('-v, --verbose', 'Print all LLM stream events to stderr')
    .action(async (options) => {
        const targetPort = parseInt(options.port, 10);
        if (options.verbose) setVerbose(true);

        await ensureBabelPlugin(process.cwd());

        awel.log('🌟 Starting Awel...');
        awel.log(`   Target app port: ${targetPort}`);
        awel.log(`   Awel control server: http://localhost:${AWEL_PORT}`);
        awel.log('');

        // Start the Awel control server (proxy + dashboard)
        await startServer({ awelPort: AWEL_PORT, targetPort, projectCwd: process.cwd() });

        // Start the user's Next.js app via subprocess manager (handles auto-restart)
        await spawnDevServer({ port: targetPort, cwd: process.cwd() });

        awel.log('');
        awel.log(`✨ Awel is ready! Open http://localhost:${AWEL_PORT}`);
        awel.log('   Look for the floating button in the bottom-right corner.');
    });

program.parse();
