import { describe, it, expect } from 'vitest';
import { getMimeType, MIME_TYPES, AWEL_PORT, USER_APP_PORT } from './config.js';

describe('config', () => {
    describe('getMimeType', () => {
        it('returns correct MIME type for known extensions', () => {
            expect(getMimeType('app.js')).toBe('application/javascript');
            expect(getMimeType('style.css')).toBe('text/css');
            expect(getMimeType('icon.svg')).toBe('image/svg+xml');
            expect(getMimeType('photo.png')).toBe('image/png');
            expect(getMimeType('photo.jpg')).toBe('image/jpeg');
            expect(getMimeType('photo.jpeg')).toBe('image/jpeg');
            expect(getMimeType('index.html')).toBe('text/html');
            expect(getMimeType('data.json')).toBe('application/json');
            expect(getMimeType('font.woff')).toBe('font/woff');
            expect(getMimeType('font.woff2')).toBe('font/woff2');
            expect(getMimeType('font.ttf')).toBe('font/ttf');
        });

        it('returns application/octet-stream for unknown extensions', () => {
            expect(getMimeType('file.xyz')).toBe('application/octet-stream');
            expect(getMimeType('archive.tar')).toBe('application/octet-stream');
        });

        it('handles paths with directories', () => {
            expect(getMimeType('src/components/App.js')).toBe('application/javascript');
            expect(getMimeType('/usr/local/share/fonts/arial.woff2')).toBe('font/woff2');
        });

        it('is case-insensitive', () => {
            expect(getMimeType('FILE.JS')).toBe('application/javascript');
            expect(getMimeType('STYLE.CSS')).toBe('text/css');
        });
    });

    describe('port constants', () => {
        it('has correct default ports', () => {
            expect(AWEL_PORT).toBe(3001);
            expect(USER_APP_PORT).toBe(3000);
        });
    });

    describe('MIME_TYPES', () => {
        it('contains expected entries', () => {
            expect(Object.keys(MIME_TYPES).length).toBeGreaterThanOrEqual(11);
            expect(MIME_TYPES['js']).toBe('application/javascript');
        });
    });
});
