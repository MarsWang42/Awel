import { tool } from 'ai';
import { z } from 'zod';
import TurndownService from 'turndown';

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

export function createWebFetchTool() {
    return tool({
        description:
            'Fetch content from a URL and return it as markdown, plain text, or raw HTML. ' +
            'Use this to read documentation pages, API references, blog posts, or any web content. ' +
            'Defaults to markdown format which works best for reading HTML pages.',
        inputSchema: z.object({
            url: z.string().describe('The URL to fetch (must start with http:// or https://)'),
            format: z.enum(['markdown', 'text', 'html']).optional().default('markdown')
                .describe('Output format: "markdown" (default, best for HTML pages), "text" (stripped), or "html" (raw)'),
            timeout: z.number().optional().describe('Timeout in seconds (default: 30, max: 120)'),
        }),
        execute: async ({ url, format, timeout }) => {
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                return 'Error: URL must start with http:// or https://';
            }

            const timeoutMs = Math.min(
                (timeout ?? DEFAULT_TIMEOUT_MS / 1000) * 1000,
                MAX_TIMEOUT_MS,
            );

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            // Build Accept header based on requested format
            let acceptHeader: string;
            switch (format) {
                case 'text':
                    acceptHeader = 'text/plain;q=1.0, text/html;q=0.8, */*;q=0.1';
                    break;
                case 'html':
                    acceptHeader = 'text/html;q=1.0, application/xhtml+xml;q=0.9, */*;q=0.1';
                    break;
                case 'markdown':
                default:
                    acceptHeader = 'text/html;q=1.0, text/plain;q=0.8, */*;q=0.1';
                    break;
            }

            try {
                const headers = {
                    'User-Agent': 'Mozilla/5.0 (compatible; Awel/1.0)',
                    'Accept': acceptHeader,
                    'Accept-Language': 'en-US,en;q=0.9',
                };

                let response = await fetch(url, { signal: controller.signal, headers });

                // Retry with honest UA if Cloudflare blocks the request
                if (response.status === 403 && response.headers.get('cf-mitigated') === 'challenge') {
                    response = await fetch(url, {
                        signal: controller.signal,
                        headers: { ...headers, 'User-Agent': 'Awel' },
                    });
                }

                clearTimeout(timeoutId);

                if (!response.ok) {
                    return `Error: Request failed with status ${response.status}`;
                }

                const contentLength = response.headers.get('content-length');
                if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
                    return 'Error: Response too large (exceeds 5MB limit)';
                }

                const buffer = await response.arrayBuffer();
                if (buffer.byteLength > MAX_RESPONSE_SIZE) {
                    return 'Error: Response too large (exceeds 5MB limit)';
                }

                const content = new TextDecoder().decode(buffer);
                const contentType = response.headers.get('content-type') || '';
                const isHTML = contentType.includes('text/html');

                switch (format) {
                    case 'markdown':
                        return isHTML ? convertHTMLToMarkdown(content) : content;
                    case 'text':
                        return isHTML ? stripHTMLTags(content) : content;
                    case 'html':
                        return content;
                    default:
                        return content;
                }
            } catch (err) {
                clearTimeout(timeoutId);
                if (err instanceof Error && err.name === 'AbortError') {
                    return `Error: Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`;
                }
                return `Error: ${err instanceof Error ? err.message : String(err)}`;
            }
        },
    });
}

function convertHTMLToMarkdown(html: string): string {
    const turndown = new TurndownService({
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        emDelimiter: '*',
    });
    turndown.remove(['script', 'style', 'meta', 'link', 'noscript']);
    return turndown.turndown(html);
}

function stripHTMLTags(html: string): string {
    // Remove script, style, and noscript blocks entirely
    let text = html.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, ' ');
    // Decode common HTML entities
    text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
    // Collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    return text;
}
