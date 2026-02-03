import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        root: __dirname,
        include: ['packages/*/src/**/*.test.ts'],
        environmentMatchGlobs: [
            ['packages/dashboard/**', 'jsdom'],
            ['packages/host/**', 'jsdom'],
        ],
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './packages/dashboard/src'),
        },
    },
});
