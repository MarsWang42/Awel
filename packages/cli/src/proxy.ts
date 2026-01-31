/**
 * Creates proxy middleware that forwards requests to the target app
 * and injects the Awel host script into HTML responses.
 */
export function createProxyMiddleware(targetPort: number, projectCwd?: string) {
    return async (c: any, _next: () => Promise<void>) => {
        const url = new URL(c.req.url);
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

            // If it's HTML, inject our script
            if (contentType.includes('text/html')) {
                let html = await response.text();

                // Inject project CWD (for source-map resolution) and the host script
                const cwdScript = projectCwd
                    ? `<script>window.__AWEL_PROJECT_CWD__=${JSON.stringify(projectCwd)}</script>`
                    : '';
                // Constrain Next.js error overlay stacking context below Awel's UI.
                // Covers both legacy and modern Next.js error overlay custom elements.
                const awelOverlayStyle = `<style id="awel-overlay-fix">nextjs-portal, nextjs-portal-root, next-error-overlay, nextjs-dev-tools { position: relative !important; z-index: 999997 !important; }</style>`;
                const scriptTag = `${awelOverlayStyle}${cwdScript}<script src="/_awel/host.js"></script>`;

                // Inject into <head> so the script loads early — even on error pages
                // where the body might be minimal or replaced by Next.js error recovery.
                // Fall back to </body> then </html> if <head> isn't found.
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

                return new Response(html, {
                    status: response.status,
                    headers: responseHeaders,
                });
            }

            // For non-HTML responses, pass through as-is but clean up encoding headers
            const body = await response.arrayBuffer();
            const responseHeaders = new Headers(response.headers);
            // Remove content-encoding since we've already decoded the response
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
