import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const skillPath = resolve(__dirname, '..', 'skills', 'react-best-practices.md');
let cached: string | null = null;

function loadSkill(): string {
    if (!cached) {
        cached = readFileSync(skillPath, 'utf-8');
    }
    return cached;
}

const SECTIONS: Record<string, string> = {
    waterfalls: '## 1. Eliminating Waterfalls',
    bundle: '## 2. Bundle Size Optimization',
    server: '## 3. Server-Side Performance',
    client: '## 4. Client-Side Data Fetching',
    rerender: '## 5. Re-render Optimization',
    rendering: '## 6. Rendering Performance',
    javascript: '## 7. JavaScript Performance',
    advanced: '## 8. Advanced Patterns',
};

export function createReactBestPracticesTool() {
    return tool({
        description:
            'Get React and Next.js performance best practices (40+ rules across 8 categories). ' +
            'Call with no section to get the full guide, or specify a section to get just that category. ' +
            'Sections: waterfalls, bundle, server, client, rerender, rendering, javascript, advanced.',
        inputSchema: z.object({
            section: z
                .enum(['all', 'waterfalls', 'bundle', 'server', 'client', 'rerender', 'rendering', 'javascript', 'advanced'])
                .optional()
                .default('all')
                .describe('Which section to return. Defaults to "all" for the full guide.'),
        }),
        execute: async ({ section }) => {
            const content = loadSkill();
            if (section === 'all') {
                return content;
            }
            const heading = SECTIONS[section];
            if (!heading) {
                return `Unknown section: ${section}. Available: ${Object.keys(SECTIONS).join(', ')}`;
            }
            const start = content.indexOf(heading);
            if (start === -1) {
                return `Section "${section}" not found in the guide.`;
            }
            // Find the next section heading (## N.) or end of file
            const nextSection = content.indexOf('\n## ', start + heading.length);
            return nextSection === -1 ? content.slice(start) : content.slice(start, nextSection);
        },
    });
}
