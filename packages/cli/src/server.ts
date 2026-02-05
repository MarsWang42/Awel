import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import httpProxy from 'http-proxy';
import { createProxyMiddleware } from './proxy.js';
import { createAgentRoute } from './agent.js';
import { createUndoRoute } from './undo.js';
import { createInspectorRoute } from './inspector.js';
import { createCommentPopupRoute } from './comment-popup.js';
import { trackProxySocket } from './devserver.js';
import { getMimeType } from './config.js';
import { markProjectReady } from './awel-config.js';
import { awel } from './logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import {
    getComparisonState,
    initComparison,
    createRun,
    switchRun,
    selectRun,
    deleteRun,
    markRunComplete,
    resumeComparison,
    getComparisonPhase,
    abortComparison,
    type ComparisonPhase,
} from './comparison.js';
import { clearHistory } from './sse.js';
import { resetSession } from './session.js';
import { resetAutoApprove } from './confirm-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ServerOptions {
  awelPort: number;
  targetPort: number;
  projectCwd: string;
  fresh?: boolean;
}

/**
 * Serves a static file with proper MIME type, or returns null if not found
 */
function serveStaticFile(filePath: string): { content: ArrayBuffer; mimeType: string } | null {
  if (!existsSync(filePath)) return null;
  const buffer = readFileSync(filePath);
  // Convert Node Buffer to ArrayBuffer for Hono compatibility
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return {
    content: arrayBuffer,
    mimeType: getMimeType(filePath)
  };
}

/**
 * Serves the dashboard index.html, or returns null if not found
 */
function serveDashboardIndex(): string | null {
  const indexPath = join(__dirname, '../dashboard/index.html');
  if (!existsSync(indexPath)) return null;
  return readFileSync(indexPath, 'utf-8');
}

export async function startServer({ awelPort, targetPort, projectCwd, fresh }: ServerOptions) {
  const app = new Hono();

  let isFresh = fresh ?? false;
  let comparisonPhase: ComparisonPhase | null = null;

  // Resume comparison state if it exists
  const resumedState = resumeComparison(projectCwd);
  if (resumedState) {
    comparisonPhase = resumedState.phase;
  }

  // Create a proxy for WebSocket connections
  const wsProxy = httpProxy.createProxyServer({
    target: `http://localhost:${targetPort}`,
    ws: true,
  });

  wsProxy.on('error', (err) => {
    // EPIPE / ECONNRESET are expected when the dev server restarts during HMR
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EPIPE' || code === 'ECONNRESET' || !err.message) return;
    console.error('WebSocket proxy error:', err.message);
  });

  // Track target-side sockets so we can pause HMR during agent streams
  wsProxy.on('open', (proxySocket) => {
    trackProxySocket(proxySocket);
  });

  // Mount agent API routes
  app.route('/', createAgentRoute(projectCwd, targetPort, () => isFresh || comparisonPhase === 'building'));

  // Mount undo API routes
  app.route('/', createUndoRoute(projectCwd));

  // Mount inspector relay routes
  app.route('/', createInspectorRoute(projectCwd));

  // Serve the comment popup page (loaded in an iframe by the host script)
  app.route('/', createCommentPopupRoute());

  // ─── Project Status Endpoints ─────────────────────────────
  app.get('/api/project/status', (c) => {
    return c.json({
      fresh: isFresh,
      comparisonPhase,
      comparison: getComparisonState(projectCwd),
    });
  });

  // ─── Comparison API Endpoints ─────────────────────────────
  app.get('/api/comparison/runs', (c) => {
    const state = getComparisonState(projectCwd);
    if (!state) {
      return c.json({ runs: [], activeRunId: null, phase: null });
    }
    return c.json({
      runs: state.runs,
      activeRunId: state.activeRunId,
      phase: state.phase,
      originalPrompt: state.originalPrompt,
    });
  });

  app.post('/api/comparison/runs', async (c) => {
    let body: { modelId: string; modelLabel: string; modelProvider: string; providerLabel: string; prompt?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ success: false, error: 'Invalid JSON' }, 400);
    }

    const { modelId, modelLabel, modelProvider, providerLabel, prompt } = body;
    if (!modelId || !modelProvider) {
      return c.json({ success: false, error: 'Missing modelId or modelProvider' }, 400);
    }

    try {
      const existingState = getComparisonState(projectCwd);

      if (!existingState) {
        // First run: initialize comparison mode
        if (!prompt) {
          return c.json({ success: false, error: 'Missing prompt for first run' }, 400);
        }
        const state = initComparison(projectCwd, prompt, modelId, modelLabel || modelId, modelProvider, providerLabel || modelProvider);
        comparisonPhase = state.phase;
        // Note: isFresh stays true until user selects a version (in /select endpoint)
        return c.json({
          success: true,
          run: state.runs[0],
          state,
        });
      }

      // Subsequent run: create new branch, clear chat history for fresh start
      const { state, run } = createRun(projectCwd, modelId, modelLabel || modelId, modelProvider, providerLabel || modelProvider);
      comparisonPhase = state.phase;

      // Clear chat history so the new run starts fresh
      clearHistory();
      resetSession();
      resetAutoApprove();

      return c.json({
        success: true,
        run,
        state,
        autoSubmit: true, // Signal to dashboard to auto-submit the originalPrompt
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ success: false, error: message }, 400);
    }
  });

  app.post('/api/comparison/runs/:id/switch', async (c) => {
    const runId = c.req.param('id');
    try {
      const state = switchRun(projectCwd, runId);
      comparisonPhase = state.phase;
      return c.json({ success: true, state });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ success: false, error: message }, 400);
    }
  });

  app.post('/api/comparison/runs/:id/select', async (c) => {
    const runId = c.req.param('id');

    // Each step is independent - don't let one failure prevent others
    try { selectRun(projectCwd, runId); } catch { /* merge may have succeeded */ }

    // Always clear comparison phase and mark as no longer fresh
    comparisonPhase = null;
    isFresh = false;

    // Persist to config file
    try { markProjectReady(projectCwd); } catch { /* non-critical */ }

    // Clear session state
    try { clearHistory(); } catch { /* non-critical */ }
    try { resetSession(); } catch { /* non-critical */ }
    try { resetAutoApprove(); } catch { /* non-critical */ }

    return c.json({ success: true });
  });

  app.post('/api/comparison/runs/:id/complete', async (c) => {
    const runId = c.req.param('id');
    let body: { success: boolean; duration?: number; inputTokens?: number; outputTokens?: number };
    try {
      body = await c.req.json();
    } catch {
      body = { success: true };
    }
    try {
      const stats = (body.duration !== undefined || body.inputTokens !== undefined || body.outputTokens !== undefined)
        ? { duration: body.duration, inputTokens: body.inputTokens, outputTokens: body.outputTokens }
        : undefined;
      const state = markRunComplete(projectCwd, runId, body.success, stats);
      comparisonPhase = state.phase;
      return c.json({ success: true, state });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ success: false, error: message }, 400);
    }
  });

  app.delete('/api/comparison/runs/:id', async (c) => {
    const runId = c.req.param('id');
    try {
      const state = deleteRun(projectCwd, runId);
      comparisonPhase = state.phase;
      return c.json({ success: true, state });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ success: false, error: message }, 400);
    }
  });

  app.post('/api/comparison/abort', async (c) => {
    try {
      abortComparison(projectCwd);
      comparisonPhase = null;
      // Clear chat history and session for a clean slate
      try { clearHistory(); } catch { /* non-critical */ }
      try { resetSession(); } catch { /* non-critical */ }
      try { resetAutoApprove(); } catch { /* non-critical */ }
      return c.json({ success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return c.json({ success: false, error: message }, 400);
    }
  });

  // Serve the host script
  app.get('/_awel/host.js', async (c) => {
    const hostDistPath = join(__dirname, '../host/host.js');
    const file = serveStaticFile(hostDistPath);

    if (file) {
      return c.body(file.content, 200, { 'Content-Type': file.mimeType });
    }

    return c.text('Host script not found. Run npm run build:host first.', 404);
  });

  // Serve the dashboard app
  app.get('/_awel/dashboard', async (c) => {
    const html = serveDashboardIndex();
    if (html) return c.html(html);
    return c.text('Dashboard not found. Run npm run build:dashboard first.', 404);
  });

  app.get('/_awel/dashboard/*', async (c) => {
    const path = c.req.path.replace('/_awel/dashboard/', '');
    const filePath = join(__dirname, '../dashboard', path);

    const file = serveStaticFile(filePath);
    if (file) {
      return c.body(file.content, 200, { 'Content-Type': file.mimeType });
    }

    // Fallback to index.html for SPA routing
    const html = serveDashboardIndex();
    if (html) return c.html(html);

    return c.text('Not found', 404);
  });

  // Proxy all other requests to the target app
  app.all('*', createProxyMiddleware(targetPort, projectCwd, () => isFresh, () => comparisonPhase));

  // Create the HTTP server with Hono
  const server = serve({
    fetch: app.fetch,
    port: awelPort,
  }, (info) => {
    awel.log(`🎛️  Awel control server running on http://localhost:${info.port}`);
  });

  // Handle WebSocket upgrades for HMR
  server.on('upgrade', (req, socket, head) => {
    wsProxy.ws(req, socket, head);
  });
}
