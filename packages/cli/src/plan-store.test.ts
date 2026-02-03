import { describe, it, expect, beforeEach } from 'vitest';
import { storePlan, getActivePlan, approvePlan, clearActivePlan } from './plan-store.js';
import type { StoredPlan } from './plan-store.js';

describe('plan-store', () => {
    const testPlan: StoredPlan = {
        planId: 'plan-1',
        plan: { title: 'Add auth', content: 'Step 1: ...\nStep 2: ...' },
        originalPrompt: 'Add authentication',
        modelId: 'sonnet',
        approved: false,
    };

    beforeEach(() => {
        clearActivePlan();
    });

    it('starts with no active plan', () => {
        expect(getActivePlan()).toBeNull();
    });

    it('stores and retrieves a plan', () => {
        storePlan(testPlan);
        const active = getActivePlan();
        expect(active).toEqual(testPlan);
    });

    it('approves the active plan', () => {
        storePlan(testPlan);
        const result = approvePlan();
        expect(result).toBe(true);
        expect(getActivePlan()!.approved).toBe(true);
    });

    it('returns false when approving with no active plan', () => {
        expect(approvePlan()).toBe(false);
    });

    it('clears the active plan', () => {
        storePlan(testPlan);
        clearActivePlan();
        expect(getActivePlan()).toBeNull();
    });

    it('replaces the active plan when storing a new one', () => {
        storePlan(testPlan);
        const secondPlan: StoredPlan = {
            planId: 'plan-2',
            plan: { title: 'Refactor', content: 'Step 1: ...' },
            originalPrompt: 'Refactor code',
            modelId: 'opus',
            approved: false,
        };
        storePlan(secondPlan);
        expect(getActivePlan()!.planId).toBe('plan-2');
    });
});
