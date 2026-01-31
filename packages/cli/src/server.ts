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
import { awel } from './logger.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ServerOptions {
  awelPort: number;
  targetPort: number;
  projectCwd: string;
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

export async function startServer({ awelPort, targetPort, projectCwd }: ServerOptions) {
  const app = new Hono();

  // Create a proxy for WebSocket connections
  const wsProxy = httpProxy.createProxyServer({
    target: `http://localhost:${targetPort}`,
    ws: true,
  });

  wsProxy.on('error', (err) => {
    console.error('WebSocket proxy error:', err.message);
  });

  // Track target-side sockets so we can pause HMR during agent streams
  wsProxy.on('open', (proxySocket) => {
    trackProxySocket(proxySocket);
  });

  // Mount agent API routes
  app.route('/', createAgentRoute(projectCwd, targetPort));

  // Mount undo API routes
  app.route('/', createUndoRoute(projectCwd));

  // Mount inspector relay routes
  app.route('/', createInspectorRoute(projectCwd));

  // Serve the comment popup page (loaded in an iframe by the host script)
  app.route('/', createCommentPopupRoute());

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
  app.all('*', createProxyMiddleware(targetPort, projectCwd));

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
