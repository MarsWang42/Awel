import { describe, it, expect } from 'vitest';
import { parseSSEData } from './sseParser';

describe('parseSSEData', () => {
    it('parses user event', () => {
        const result = parseSSEData('user', JSON.stringify({ text: 'hello' }));
        expect(result).toEqual({ type: 'user', text: 'hello' });
    });

    it('parses status event', () => {
        const result = parseSSEData('status', JSON.stringify({ message: 'Thinking...' }));
        expect(result).toEqual({ type: 'status', text: 'Thinking...' });
    });

    it('parses text event with assistant message content', () => {
        const data = {
            type: 'assistant',
            message: {
                content: [
                    { type: 'text', text: 'Hello ' },
                    { type: 'text', text: 'world' },
                ],
                model: 'sonnet',
            },
        };
        const result = parseSSEData('text', JSON.stringify(data));
        expect(result).toEqual({ type: 'text', text: 'Hello world', model: 'sonnet' });
    });

    it('parses text event with plain text fallback', () => {
        const result = parseSSEData('text', JSON.stringify({ text: 'simple text' }));
        expect(result).toEqual({ type: 'text', text: 'simple text' });
    });

    it('parses tool_use event', () => {
        const data = { tool: 'Read', input: { file_path: 'src/index.ts' } };
        const result = parseSSEData('tool_use', JSON.stringify(data));
        expect(result).toEqual({
            type: 'tool_use',
            toolName: 'Read',
            toolInput: { file_path: 'src/index.ts' },
        });
    });

    it('parses tool_use event with name field', () => {
        const data = { name: 'Write', input: { file_path: 'out.ts', content: 'code' } };
        const result = parseSSEData('tool_use', JSON.stringify(data));
        expect(result!.toolName).toBe('Write');
    });

    it('parses tool_result event', () => {
        const data = { tool: 'Read', content: 'file contents here', is_error: false };
        const result = parseSSEData('tool_result', JSON.stringify(data));
        expect(result!.type).toBe('tool_result');
        expect(result!.toolName).toBe('Read');
        expect(result!.toolOutput).toBe('file contents here');
        expect(result!.isError).toBeFalsy();
    });

    it('parses tool_result event with object content', () => {
        const data = { tool: 'Glob', content: ['file1.ts', 'file2.ts'] };
        const result = parseSSEData('tool_result', JSON.stringify(data));
        expect(result!.toolOutput).toBe(JSON.stringify(['file1.ts', 'file2.ts']));
    });

    it('parses result event', () => {
        const data = {
            subtype: 'success',
            result: 'Done',
            num_turns: 3,
            duration_ms: 5000,
            total_cost_usd: 0.05,
            file_stats: [{ relativePath: 'src/app.ts', additions: 10, deletions: 2, isNew: false }],
        };
        const result = parseSSEData('result', JSON.stringify(data));
        expect(result!.type).toBe('result');
        expect(result!.resultSubtype).toBe('success');
        expect(result!.resultText).toBe('Done');
        expect(result!.numTurns).toBe(3);
        expect(result!.durationMs).toBe(5000);
        expect(result!.totalCostUsd).toBe(0.05);
        expect(result!.fileStats).toHaveLength(1);
        expect(result!.isError).toBe(false);
    });

    it('parses result event with error subtype', () => {
        const data = { subtype: 'error_max_turns', is_error: true, errors: ['Too many turns'] };
        const result = parseSSEData('result', JSON.stringify(data));
        expect(result!.isError).toBe(true);
        expect(result!.resultErrors).toEqual(['Too many turns']);
    });

    it('parses message event with system init', () => {
        const data = { type: 'system', subtype: 'init', model: 'sonnet', tools: ['Read', 'Write'] };
        const result = parseSSEData('message', JSON.stringify(data));
        expect(result).toEqual({ type: 'system', model: 'sonnet', tools: ['Read', 'Write'] });
    });

    it('parses message event with compact_boundary', () => {
        const data = {
            type: 'system',
            subtype: 'compact_boundary',
            compact_metadata: { trigger: 'auto', pre_tokens: 50000 },
        };
        const result = parseSSEData('message', JSON.stringify(data));
        expect(result!.type).toBe('compact_boundary');
        expect(result!.compactTrigger).toBe('auto');
        expect(result!.preTokens).toBe(50000);
    });

    it('parses message event with result type', () => {
        const data = { type: 'result', subtype: 'success', result: 'All done' };
        const result = parseSSEData('message', JSON.stringify(data));
        expect(result!.type).toBe('result');
        expect(result!.resultText).toBe('All done');
    });

    it('parses message event with content array', () => {
        const data = {
            message: {
                content: [{ type: 'text', text: 'extracted text' }],
            },
        };
        const result = parseSSEData('message', JSON.stringify(data));
        expect(result!.type).toBe('text');
        expect(result!.text).toBe('extracted text');
    });

    it('returns null for unrecognized message event', () => {
        const result = parseSSEData('message', JSON.stringify({ something: 'unknown' }));
        expect(result).toBeNull();
    });

    it('parses plan event', () => {
        const data = { planId: 'p1', planTitle: 'My Plan', planContent: '# Steps\n1. Do X' };
        const result = parseSSEData('plan', JSON.stringify(data));
        expect(result).toEqual({
            type: 'plan',
            planId: 'p1',
            planTitle: 'My Plan',
            planContent: '# Steps\n1. Do X',
        });
    });

    it('parses question event', () => {
        const data = {
            questionId: 'q1',
            questions: [{ question: 'Which DB?', header: 'Database', multiSelect: false, options: [{ label: 'Postgres', description: 'SQL' }] }],
        };
        const result = parseSSEData('question', JSON.stringify(data));
        expect(result!.type).toBe('question');
        expect(result!.questionId).toBe('q1');
        expect(result!.questions).toHaveLength(1);
    });

    it('parses done event', () => {
        const result = parseSSEData('done', JSON.stringify({ message: 'Stream complete' }));
        expect(result).toEqual({ type: 'done', text: 'Stream complete' });
    });

    it('parses error event', () => {
        const result = parseSSEData('error', JSON.stringify({ message: 'Something failed' }));
        expect(result).toEqual({ type: 'error', text: 'Something failed' });
    });

    it('returns null for unknown event type', () => {
        const result = parseSSEData('unknown_type', JSON.stringify({ data: 'test' }));
        expect(result).toBeNull();
    });

    it('falls back to raw text on invalid JSON', () => {
        const result = parseSSEData('text', 'not valid json');
        expect(result).toEqual({ type: 'text', text: 'not valid json' });
    });
});
