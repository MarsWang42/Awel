/**
 * Subprocess manager singleton for the user's dev server.
 * Handles spawning, restarting, health checks, and auto-restart on crash.
 */

import { execa, type ResultPromise } from 'execa';
import { watch, type FSWatcher } from 'node:fs';
import { awel, pipeChildOutput } from './logger.js';

export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'restarting' | 'crashed';

interface DevServerState {
    process: ResultPromise | null;
    status: DevServerStatus;
    port: number;
    cwd: string;
    startedAt: number | null;
    restartCount: number;
    lastError: string | null;
}

const state: DevServerState = {
    process: null,
    status: 'stopped',
    port: 3000,
    cwd: process.cwd(),
    startedAt: null,
    restartCount: 0,
    lastError: null,
};

let autoRestartEnabled = true;
let crashWatcher: FSWatcher | null = null;
let crashDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const SOURCE_EXT_RE = /\.(ts|tsx|js|jsx|json|css|scss|html|mdx?)$/;
const IGNORE_RE = /(?:^|[/\\])(?:node_modules|\.next|\.git|dist|build)[/\\]/;

/**
 * Start watching the project directory for file changes while the server is
 * crashed.  When a source file is modified (e.g. the agent fixed the bug),
 * restart immediately instead of waiting for the next backoff tick.
 */
function startCrashWatcher() {
    if (crashWatcher) return;

    crashWatcher = watch(state.cwd, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        if (IGNORE_RE.test(filename)) return;
        if (!SOURCE_EXT_RE.test(filename)) return;
        if (state.status !== 'crashed') return;

        // Debounce — agents often write multiple files in quick succession
        if (crashDebounceTimer) clearTimeout(crashDebounceTimer);
        crashDebounceTimer = setTimeout(async () => {
            if (state.status !== 'crashed') return;
            awel.log(`File changed (${filename}), restarting dev server...`);
            stopCrashWatcher();
            try {
                state.restartCount = 0;
                await doSpawn();
                awel.log('Dev server restarted after file change.');
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                awel.error(`Restart after file change failed: ${msg}`);
                // Re-enable watcher for the next change
                startCrashWatcher();
            }
        }, 500);
    });
}

function stopCrashWatcher() {
    if (crashDebounceTimer) {
        clearTimeout(crashDebounceTimer);
        crashDebounceTimer = null;
    }
    if (crashWatcher) {
        crashWatcher.close();
        crashWatcher = null;
    }
}

/**
 * Wait for the dev server to respond on its port.
 * Polls with 500ms intervals up to the timeout.
 */
async function waitForServer(port: number, timeoutMs = 30_000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`http://localhost:${port}`, {
                signal: AbortSignal.timeout(2000),
            });
            // Any response (even 500) means the server is up
            if (res.status) return true;
        } catch {
            // Not ready yet
        }
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

/**
 * Spawn the dev server process and pipe its output.
 */
function spawn(port: number, cwd: string): ResultPromise {
    const child = execa('npm', ['run', 'dev'], {
        stdin: 'inherit',
        env: {
            ...process.env,
            PORT: String(port),
        },
        cwd,
    });

    pipeChildOutput(child);
    return child;
}

/**
 * Compute exponential backoff delay for auto-restart.
 */
function getBackoffDelay(restartCount: number): number {
    const delay = Math.min(1000 * Math.pow(2, restartCount - 1), 10_000);
    return delay;
}

/**
 * Handle process exit — attempt one auto-restart, then switch to file-watch
 * mode so the server restarts as soon as the agent (or user) saves a fix.
 */
function attachExitHandler(child: ResultPromise) {
    child.catch(async (error) => {
        // Don't auto-restart if we're intentionally stopping or restarting
        if (state.status === 'restarting' || state.status === 'stopped') return;

        state.status = 'crashed';
        state.lastError = error instanceof Error ? error.message : String(error);
        awel.error(`Dev server crashed: ${state.lastError}`);

        if (!autoRestartEnabled) return;

        state.restartCount++;

        // First crash: try one immediate auto-restart (could be a transient issue)
        if (state.restartCount <= 1) {
            const delay = getBackoffDelay(state.restartCount);
            awel.log(`Auto-restarting dev server in ${delay}ms (attempt ${state.restartCount})...`);
            await new Promise(r => setTimeout(r, delay));

            if (state.status !== 'crashed') return;

            try {
                await doSpawn();
                awel.log('Dev server auto-restarted successfully.');
                return;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                awel.error(`Auto-restart failed: ${msg}`);
            }
        }

        // Repeated crashes: stop retrying blindly, watch for file changes instead
        awel.log('Watching for file changes to restart dev server...');
        startCrashWatcher();
    });
}

/**
 * Internal spawn + health-check routine.
 */
async function doSpawn(): Promise<void> {
    stopCrashWatcher();
    state.status = 'starting';
    const child = spawn(state.port, state.cwd);
    state.process = child;

    attachExitHandler(child);

    const ready = await waitForServer(state.port);
    if (ready) {
        state.status = 'running';
        state.startedAt = Date.now();
    } else {
        awel.error('Dev server did not respond within 30s — it may still be starting.');
        // Keep it as 'starting'; the exit handler will catch a crash if it happens
    }
}

/**
 * Spawn the dev server. Called once from CLI entry point.
 */
export async function spawnDevServer(opts: { port: number; cwd: string }): Promise<void> {
    state.port = opts.port;
    state.cwd = opts.cwd;
    state.restartCount = 0;

    awel.log('Starting your Next.js app...');
    await doSpawn();
}

/**
 * Restart the dev server. Sends SIGTERM, waits for exit, then spawns a new one.
 */
export async function restartDevServer(): Promise<{ success: boolean; message: string }> {
    if (!state.process) {
        return { success: false, message: 'No dev server process to restart.' };
    }

    state.status = 'restarting';
    awel.log('Restarting dev server...');

    // Kill current process
    try {
        state.process.kill('SIGTERM');
        // Wait up to 5s for graceful shutdown
        await Promise.race([
            state.process.catch(() => {}),
            new Promise(r => setTimeout(r, 5000)),
        ]);
    } catch {
        // Process may already be dead
    }

    state.process = null;
    state.restartCount = 0;

    try {
        await doSpawn();
        return { success: true, message: 'Dev server restarted successfully.' };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, message: `Restart failed: ${msg}` };
    }
}

/**
 * Get the current status of the dev server.
 */
export function getDevServerStatus(): {
    status: DevServerStatus;
    port: number;
    startedAt: number | null;
    restartCount: number;
    lastError: string | null;
    pid: number | undefined;
} {
    return {
        status: state.status,
        port: state.port,
        startedAt: state.startedAt,
        restartCount: state.restartCount,
        lastError: state.lastError,
        pid: state.process?.pid,
    };
}
