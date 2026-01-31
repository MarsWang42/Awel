// ─── Plan Store ──────────────────────────────────────────────
// Module-level singleton storing the active plan proposed by the agent.

export interface StoredPlan {
    planId: string;
    plan: { title: string; content: string };
    originalPrompt: string;
    modelId: string;
    approved: boolean;
}

let activePlan: StoredPlan | null = null;

export function storePlan(plan: StoredPlan): void {
    activePlan = plan;
}

export function getActivePlan(): StoredPlan | null {
    return activePlan;
}

export function approvePlan(): boolean {
    if (!activePlan) return false;
    activePlan.approved = true;
    return true;
}

export function clearActivePlan(): void {
    activePlan = null;
}
