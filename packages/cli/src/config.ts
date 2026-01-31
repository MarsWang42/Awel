/**
 * Shared configuration constants for Awel
 */

export const AWEL_PORT = 3001;
export const USER_APP_PORT = 3000;
export const DASHBOARD_URL = `http://localhost:${AWEL_PORT}/_awel/dashboard`;

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
