import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

export interface ComparisonRun {
    id: string;
    branchName: string;
    modelId: string;
    modelLabel: string;
    modelProvider: string;
    providerLabel: string;
    status: 'building' | 'success' | 'failed';
    prompt: string;
    createdAt: string;
    duration?: number;
    tokenUsage?: {
        input: number;
        output: number;
    };
}

export type ComparisonPhase = 'initial' | 'building' | 'comparing';

export interface ComparisonState {
    phase: ComparisonPhase;
    baselineRef: string;
    originalPrompt: string;
    runs: ComparisonRun[];
    activeRunId: string | null;
}

const MAX_RUNS = 5;

function getComparisonPath(projectCwd: string): string {
    return join(projectCwd, '.awel', 'comparison.json');
}

export function getComparisonState(projectCwd: string): ComparisonState | null {
    const path = getComparisonPath(projectCwd);
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
        return null;
    }
}

function writeComparisonState(projectCwd: string, state: ComparisonState): void {
    const dir = join(projectCwd, '.awel');
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(getComparisonPath(projectCwd), JSON.stringify(state, null, 2) + '\n', 'utf-8');
}

function deleteComparisonState(projectCwd: string): void {
    const path = getComparisonPath(projectCwd);
    if (existsSync(path)) {
        unlinkSync(path);
    }
}

function execGit(projectCwd: string, args: string): string {
    return execSync(`git ${args}`, { cwd: projectCwd, encoding: 'utf-8' }).trim();
}

function hasUncommittedChanges(projectCwd: string): boolean {
    try {
        const status = execGit(projectCwd, 'status --porcelain');
        return status.length > 0;
    } catch {
        return false;
    }
}

function commitCurrentBranch(projectCwd: string, modelId: string): void {
    if (!hasUncommittedChanges(projectCwd)) return;
    try {
        execGit(projectCwd, 'add -A');
        execGit(projectCwd, `commit -m "Awel: ${modelId}" --allow-empty`);
    } catch {
        // Commit might fail if nothing to commit, that's ok
    }
}

function getCurrentBranch(projectCwd: string): string {
    return execGit(projectCwd, 'rev-parse --abbrev-ref HEAD');
}

function branchExists(projectCwd: string, branchName: string): boolean {
    try {
        execGit(projectCwd, `rev-parse --verify ${branchName}`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Initialize comparison mode by capturing the baseline commit.
 * Called when the first run starts in creation mode.
 */
export function initComparison(
    projectCwd: string,
    prompt: string,
    modelId: string,
    modelLabel: string,
    modelProvider: string,
    providerLabel: string
): ComparisonState {
    // Capture baseline ref before any changes
    const baselineRef = execGit(projectCwd, 'rev-parse HEAD');

    const runId = randomUUID();
    const branchName = `awel-run-${runId.slice(0, 8)}`;

    // Create branch from baseline - if this fails, we haven't written any state yet
    try {
        execGit(projectCwd, `checkout -b ${branchName}`);
    } catch {
        // Branch might already exist from a failed previous run, try to checkout
        try {
            execGit(projectCwd, `checkout ${branchName}`);
        } catch {
            // Try to delete and recreate
            try { execGit(projectCwd, `branch -D ${branchName}`); } catch { /* ignore */ }
            execGit(projectCwd, `checkout -b ${branchName}`);
        }
    }

    const run: ComparisonRun = {
        id: runId,
        branchName,
        modelId,
        modelLabel,
        modelProvider,
        providerLabel,
        status: 'building',
        prompt,
        createdAt: new Date().toISOString(),
    };

    const state: ComparisonState = {
        phase: 'building',
        baselineRef,
        originalPrompt: prompt,
        runs: [run],
        activeRunId: runId,
    };

    writeComparisonState(projectCwd, state);
    return state;
}

/**
 * Create a new comparison run with a different model.
 * Commits the current branch first, then creates a new branch from baseline.
 */
export function createRun(
    projectCwd: string,
    modelId: string,
    modelLabel: string,
    modelProvider: string,
    providerLabel: string
): { state: ComparisonState; run: ComparisonRun } {
    const state = getComparisonState(projectCwd);
    if (!state) {
        throw new Error('No comparison state found');
    }

    if (state.runs.length >= MAX_RUNS) {
        throw new Error(`Maximum of ${MAX_RUNS} runs allowed`);
    }

    // Check if there's a building run
    const buildingRun = state.runs.find(r => r.status === 'building');
    if (buildingRun) {
        throw new Error('Cannot create new run while another is building');
    }

    // Commit current branch before switching
    const activeRun = state.runs.find(r => r.id === state.activeRunId);
    if (activeRun) {
        commitCurrentBranch(projectCwd, activeRun.modelId);
    }

    // Generate unique branch name
    let runId = randomUUID();
    let branchName = `awel-run-${runId.slice(0, 8)}`;
    while (branchExists(projectCwd, branchName)) {
        runId = randomUUID();
        branchName = `awel-run-${runId.slice(0, 8)}`;
    }

    // Create new branch from baseline
    execGit(projectCwd, `checkout -b ${branchName} ${state.baselineRef}`);

    const run: ComparisonRun = {
        id: runId,
        branchName,
        modelId,
        modelLabel,
        modelProvider,
        providerLabel,
        status: 'building',
        prompt: state.originalPrompt,
        createdAt: new Date().toISOString(),
    };

    state.runs.push(run);
    state.activeRunId = runId;
    state.phase = 'building';

    writeComparisonState(projectCwd, state);
    return { state, run };
}

/**
 * Switch to an existing run branch.
 * All branches should already be committed.
 */
export function switchRun(projectCwd: string, runId: string): ComparisonState {
    const state = getComparisonState(projectCwd);
    if (!state) {
        throw new Error('No comparison state found');
    }

    const targetRun = state.runs.find(r => r.id === runId);
    if (!targetRun) {
        throw new Error('Run not found');
    }

    if (targetRun.status === 'building') {
        throw new Error('Cannot switch to a building run');
    }

    // Block switching if current run is building
    const currentRun = state.runs.find(r => r.id === state.activeRunId);
    if (currentRun?.status === 'building') {
        throw new Error('Cannot switch while current run is building');
    }

    // Commit current branch before switching (safety)
    if (currentRun) {
        commitCurrentBranch(projectCwd, currentRun.modelId);
    }

    // Checkout target branch
    execGit(projectCwd, `checkout ${targetRun.branchName}`);

    state.activeRunId = runId;
    writeComparisonState(projectCwd, state);

    return state;
}

/**
 * Mark a run as complete (success or failed).
 */
export function markRunComplete(
    projectCwd: string,
    runId: string,
    success: boolean,
    stats?: { duration?: number; inputTokens?: number; outputTokens?: number }
): ComparisonState {
    const state = getComparisonState(projectCwd);
    if (!state) {
        throw new Error('No comparison state found');
    }

    const run = state.runs.find(r => r.id === runId);
    if (!run) {
        throw new Error('Run not found');
    }

    run.status = success ? 'success' : 'failed';

    // Store duration and token usage if provided
    if (stats?.duration !== undefined) {
        run.duration = stats.duration;
    }
    if (stats?.inputTokens !== undefined || stats?.outputTokens !== undefined) {
        run.tokenUsage = {
            input: stats.inputTokens ?? 0,
            output: stats.outputTokens ?? 0,
        };
    }

    // Commit the final state
    commitCurrentBranch(projectCwd, run.modelId);

    // Transition to comparing phase
    state.phase = 'comparing';

    writeComparisonState(projectCwd, state);
    return state;
}

/**
 * Select a run as the final version.
 * Merges the branch to main and cleans up all comparison branches.
 * This function tries to complete as much as possible even if some steps fail.
 */
export function selectRun(projectCwd: string, runId: string): void {
    const state = getComparisonState(projectCwd);
    if (!state) {
        // No state file - just clean up and return
        return;
    }

    const selectedRun = state.runs.find(r => r.id === runId);
    if (!selectedRun) {
        // Run not found - just clean up state file and return
        deleteComparisonState(projectCwd);
        return;
    }

    // Commit any pending changes on the current branch
    const currentRun = state.runs.find(r => r.id === state.activeRunId);
    if (currentRun) {
        try { commitCurrentBranch(projectCwd, currentRun.modelId); } catch { /* non-critical */ }
    }

    // Checkout main
    try { execGit(projectCwd, 'checkout main'); } catch { /* may already be on main */ }

    // Merge selected branch (prefer theirs in case of conflicts)
    try {
        execGit(projectCwd, `merge ${selectedRun.branchName} -X theirs -m "Awel: Merge ${selectedRun.modelId} build"`);
    } catch {
        // If merge fails, try a more aggressive approach
        try {
            execGit(projectCwd, `merge ${selectedRun.branchName} --strategy-option=theirs -m "Awel: Merge ${selectedRun.modelId} build" --allow-unrelated-histories`);
        } catch { /* merge may have already happened */ }
    }

    // Delete all comparison branches
    for (const run of state.runs) {
        try { execGit(projectCwd, `branch -D ${run.branchName}`); } catch { /* branch may not exist */ }
    }

    // Remove comparison state file
    try { deleteComparisonState(projectCwd); } catch { /* file may not exist */ }
}

/**
 * Delete a specific run and its branch.
 */
export function deleteRun(projectCwd: string, runId: string): ComparisonState {
    const state = getComparisonState(projectCwd);
    if (!state) {
        throw new Error('No comparison state found');
    }

    const runIndex = state.runs.findIndex(r => r.id === runId);
    if (runIndex === -1) {
        throw new Error('Run not found');
    }

    const run = state.runs[runIndex];

    // Don't allow deleting if it's the only run
    if (state.runs.length === 1) {
        throw new Error('Cannot delete the only run');
    }

    // Don't allow deleting if it's currently building
    if (run.status === 'building') {
        throw new Error('Cannot delete a building run');
    }

    // If this is the active run, switch to another one first
    if (state.activeRunId === runId) {
        const otherRun = state.runs.find(r => r.id !== runId && r.status !== 'building');
        if (otherRun) {
            execGit(projectCwd, `checkout ${otherRun.branchName}`);
            state.activeRunId = otherRun.id;
        }
    }

    // Delete the branch
    try {
        execGit(projectCwd, `branch -D ${run.branchName}`);
    } catch {
        // Branch might not exist
    }

    // Remove from state
    state.runs.splice(runIndex, 1);

    writeComparisonState(projectCwd, state);
    return state;
}

/**
 * Resume comparison mode on server restart.
 * Ensures we're on the correct branch. If git operations fail, cleans up stale state.
 */
export function resumeComparison(projectCwd: string): ComparisonState | null {
    const state = getComparisonState(projectCwd);
    if (!state) return null;

    const activeRun = state.runs.find(r => r.id === state.activeRunId);
    if (!activeRun) {
        try { deleteComparisonState(projectCwd); } catch { /* ignore */ }
        return null;
    }

    // Verify the branch exists and we can switch to it
    try {
        const currentBranch = getCurrentBranch(projectCwd);
        if (currentBranch !== activeRun.branchName) {
            try {
                execGit(projectCwd, `rev-parse --verify ${activeRun.branchName}`);
                execGit(projectCwd, `checkout ${activeRun.branchName}`);
            } catch {
                try { deleteComparisonState(projectCwd); } catch { /* ignore */ }
                return null;
            }
        }
    } catch {
        try { deleteComparisonState(projectCwd); } catch { /* ignore */ }
        return null;
    }

    return state;
}

/**
 * Check if we're in comparison mode and return the phase.
 */
export function getComparisonPhase(projectCwd: string): ComparisonPhase | null {
    const state = getComparisonState(projectCwd);
    return state?.phase ?? null;
}

/**
 * Get the active run.
 */
export function getActiveRun(projectCwd: string): ComparisonRun | null {
    const state = getComparisonState(projectCwd);
    if (!state) return null;
    return state.runs.find(r => r.id === state.activeRunId) ?? null;
}
