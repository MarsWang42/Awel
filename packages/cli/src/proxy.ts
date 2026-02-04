import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { ComparisonPhase } from './comparison.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Reads the dashboard index.html and injects the creation mode flag.
 * Returns the modified HTML or null if the file doesn't exist.
 */
function getCreationModeHtml(): string | null {
    const indexPath = join(__dirname, '../dashboard/index.html');
    if (!existsSync(indexPath)) return null;
    let html = readFileSync(indexPath, 'utf-8');
    const creationScript = `<script>window.__AWEL_CREATION_MODE__=true</script>`;
    if (html.includes('</head>')) {
        html = html.replace('</head>', `${creationScript}</head>`);
    } else {
        html = creationScript + html;
    }
    return html;
}

/**
 * Creates proxy middleware that forwards requests to the target app
 * and injects the Awel host script into HTML responses.
 */
export function createProxyMiddleware(
    targetPort: number,
    projectCwd?: string,
    isFresh?: () => boolean,
    getComparisonPhase?: () => ComparisonPhase | null
) {
    return async (c: any, _next: () => Promise<void>) => {
        const url = new URL(c.req.url);
        const comparisonPhase = getComparisonPhase?.();

        // In creation mode or building phase, serve the dashboard at all HTML navigation requests.
        // Non-HTML requests (JS, CSS, HMR) still proxy through to the dev server.
        if (isFresh?.() || comparisonPhase === 'building') {
            const accept = c.req.header('accept') || '';
            const isNavigation = accept.includes('text/html');
            if (isNavigation) {
                const html = getCreationModeHtml();
                if (html) {
                    return new Response(html, {
                        status: 200,
                        headers: { 'Content-Type': 'text/html; charset=utf-8' },
                    });
                }
            }
        }

        const targetUrl = `http://localhost:${targetPort}${url.pathname}${url.search}`;

        try {
            // Clone headers and remove Accept-Encoding to get uncompressed response
            const headers = new Headers(c.req.raw.headers);
            headers.delete('accept-encoding');

            const response = await fetch(targetUrl, {
                method: c.req.method,
                headers,
                body: c.req.method !== 'GET' && c.req.method !== 'HEAD'
                    ? await c.req.raw.arrayBuffer()
                    : undefined,
            });

            const contentType = response.headers.get('content-type') || '';

            // If it's HTML, inject the Awel host script
            if (contentType.includes('text/html')) {
                let html = await response.text();

                // Inject project CWD (for source-map resolution) and the host script
                const cwdScript = projectCwd
                    ? `<script>window.__AWEL_PROJECT_CWD__=${JSON.stringify(projectCwd)}</script>`
                    : '';

                // Inject comparison mode flag if in comparing phase
                const comparisonScript = comparisonPhase === 'comparing'
                    ? `<script>window.__AWEL_COMPARISON_MODE__=true</script>`
                    : '';

                // Constrain Next.js error overlay stacking context below Awel's UI.
                const awelOverlayStyle = `<style id="awel-overlay-fix">nextjs-portal, nextjs-portal-root, next-error-overlay, nextjs-dev-tools { position: relative !important; z-index: 999997 !important; }</style>`;
                const scriptTag = `${awelOverlayStyle}${cwdScript}${comparisonScript}<script src="/_awel/host.js"></script>`;

                if (html.includes('</head>')) {
                    html = html.replace('</head>', `${scriptTag}</head>`);
                } else if (html.includes('</body>')) {
                    html = html.replace('</body>', `${scriptTag}</body>`);
                } else if (html.includes('</html>')) {
                    html = html.replace('</html>', `${scriptTag}</html>`);
                } else {
                    html += scriptTag;
                }

                const responseHeaders = new Headers(response.headers);
                responseHeaders.delete('content-encoding');
                responseHeaders.delete('content-length');
                responseHeaders.set('content-type', 'text/html; charset=utf-8');
                // Prevent caching to ensure fresh comparison mode state
                responseHeaders.set('cache-control', 'no-store, must-revalidate');

                return new Response(html, {
                    status: response.status,
                    headers: responseHeaders,
                });
            }

            // For non-HTML responses, pass through as-is but clean up encoding headers
            const body = await response.arrayBuffer();
            const responseHeaders = new Headers(response.headers);
            responseHeaders.delete('content-encoding');
            responseHeaders.delete('content-length');

            return new Response(body, {
                status: response.status,
                headers: responseHeaders,
            });
        } catch (error) {
            // Target app might not be ready yet
            return c.text('Waiting for target app to start...', 503);
        }
    };
}
