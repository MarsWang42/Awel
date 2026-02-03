import { createServer } from 'net';

/**
 * Shared configuration constants for Awel
 */

export const AWEL_PORT = 3001;
export const USER_APP_PORT = 3000;
export const DASHBOARD_URL = `http://localhost:${AWEL_PORT}/_awel/dashboard`;

/**
 * Check if a port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const server = createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port, '127.0.0.1');
    });
}

/**
 * Find an available port starting from the given port.
 * Increments until an available port is found (max 100 attempts).
 */
export async function findAvailablePort(startPort: number, maxAttempts = 100): Promise<number> {
    for (let i = 0; i < maxAttempts; i++) {
        const port = startPort + i;
        if (await isPortAvailable(port)) {
            return port;
        }
    }
    throw new Error(`Could not find an available port after ${maxAttempts} attempts starting from ${startPort}`);
}

/**
 * MIME type mappings for static file serving
 */
export const MIME_TYPES: Record<string, string> = {
    'js': 'application/javascript',
    'css': 'text/css',
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'html': 'text/html',
    'json': 'application/json',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
};

/**
 * Get MIME type for a file extension
 */
export function getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    return MIME_TYPES[ext] || 'application/octet-stream';
}
