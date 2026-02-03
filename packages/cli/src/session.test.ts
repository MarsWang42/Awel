import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./providers/registry.js', () => ({
    resolveProvider: vi.fn((modelId: string, modelProvider: string) => ({
        provider: { streamChat: vi.fn() },
        modelProvider,
    })),
}));

import {
    getOrCreateSession,
    getSessionMessages,
    appendUserMessage,
    appendResponseMessages,
    resetSession,
} from './session.js';

describe('session', () => {
    beforeEach(() => {
        resetSession();
    });

    describe('getOrCreateSession', () => {
        it('creates a new session on first call', () => {
            const { provider } = getOrCreateSession('sonnet', 'claude-code');
            expect(provider).toBeDefined();
        });

        it('reuses session for same model', () => {
            const first = getOrCreateSession('sonnet', 'claude-code');
            const second = getOrCreateSession('sonnet', 'claude-code');
            expect(first.provider).toBe(second.provider);
        });

        it('creates new provider on model switch', () => {
            getOrCreateSession('sonnet', 'claude-code');
            const second = getOrCreateSession('opus', 'claude-code');
            expect(second.provider).toBeDefined();
        });
    });

    describe('getSessionMessages', () => {
        it('returns just the user message when no session', () => {
            const messages = getSessionMessages('hello');
            expect(messages).toEqual([{ role: 'user', content: 'hello' }]);
        });

        it('includes history after a session is created', () => {
            getOrCreateSession('sonnet', 'anthropic');
            appendUserMessage('first');
            appendResponseMessages([{ role: 'assistant', content: 'response' }]);
            const messages = getSessionMessages('second');
            expect(messages).toHaveLength(3);
            expect(messages[0]).toEqual({ role: 'user', content: 'first' });
            expect(messages[1]).toEqual({ role: 'assistant', content: 'response' });
            expect(messages[2]).toEqual({ role: 'user', content: 'second' });
        });
    });

    describe('orphan stripping', () => {
        it('strips trailing orphan user messages', () => {
            getOrCreateSession('sonnet', 'anthropic');
            appendUserMessage('orphan1');
            appendUserMessage('orphan2');
            const messages = getSessionMessages('new');
            // Orphans should be stripped, only the new message remains
            expect(messages).toEqual([{ role: 'user', content: 'new' }]);
        });
    });

    describe('model switch', () => {
        it('preserves messages when switching between non-claude-code providers', () => {
            getOrCreateSession('sonnet', 'anthropic');
            appendUserMessage('hello');
            appendResponseMessages([{ role: 'assistant', content: 'hi' }]);

            getOrCreateSession('gpt-5.2-codex', 'openai');
            const messages = getSessionMessages('test');
            // History preserved: user + assistant + new user
            expect(messages).toHaveLength(3);
        });

        it('resets messages when switching to claude-code', () => {
            getOrCreateSession('sonnet', 'anthropic');
            appendUserMessage('hello');
            appendResponseMessages([{ role: 'assistant', content: 'hi' }]);

            getOrCreateSession('sonnet', 'claude-code');
            const messages = getSessionMessages('test');
            // History reset, only new user message
            expect(messages).toEqual([{ role: 'user', content: 'test' }]);
        });

        it('resets messages when switching from claude-code', () => {
            getOrCreateSession('sonnet', 'claude-code');
            appendUserMessage('hello');
            appendResponseMessages([{ role: 'assistant', content: 'hi' }]);

            getOrCreateSession('sonnet', 'anthropic');
            const messages = getSessionMessages('test');
            expect(messages).toEqual([{ role: 'user', content: 'test' }]);
        });
    });

    describe('resetSession', () => {
        it('clears the session', () => {
            getOrCreateSession('sonnet', 'anthropic');
            appendUserMessage('hello');
            resetSession();
            const messages = getSessionMessages('after reset');
            expect(messages).toEqual([{ role: 'user', content: 'after reset' }]);
        });
    });
});
