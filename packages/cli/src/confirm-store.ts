// ─── Tool Confirmation Store ─────────────────────────────────
// Manages pending confirmations for destructive tool operations.
// Tools emit a 'confirm' SSE event and await a promise that resolves
// when the user approves or rejects via the dashboard.

interface PendingConfirmation {
    resolve: (approved: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingConfirmation>();

// Separate auto-approve flags for bash commands vs file writes (Write/Edit/MultiEdit).
let autoApproveBash = false;
let autoApproveFileWrites = false;

export type AutoApproveCategory = 'bash' | 'fileWrites';

export function setAutoApprove(category: AutoApproveCategory, value: boolean): void {
    if (category === 'bash') autoApproveBash = value;
    else autoApproveFileWrites = value;
}

export function isAutoApproved(category: AutoApproveCategory): boolean {
    return category === 'bash' ? autoApproveBash : autoApproveFileWrites;
}

export function resetAutoApprove(): void {
    autoApproveBash = false;
    autoApproveFileWrites = false;
}

/**
 * Request user confirmation for a tool call.
 * Returns a promise that resolves to `true` (approved) or `false` (rejected/timed out).
 */
export function requestConfirmation(confirmId: string, timeoutMs = 120_000): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
            pending.delete(confirmId);
            resolve(false);
        }, timeoutMs);

        pending.set(confirmId, { resolve, timer });
    });
}

/**
 * Resolve a pending confirmation.
 * Returns `true` if the confirmId existed and was resolved, `false` if not found.
 */
export function resolveConfirmation(confirmId: string, approved: boolean): boolean {
    const entry = pending.get(confirmId);
    if (!entry) return false;

    clearTimeout(entry.timer);
    pending.delete(confirmId);
    entry.resolve(approved);
    return true;
}

/**
 * Reject all pending confirmations (e.g. on stream abort).
 * Each promise resolves as `false`.
 */
export function rejectAllPending(): void {
    for (const [id, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve(false);
        pending.delete(id);
    }
}

/**
 * Approve all pending confirmations (when user clicks "Allow All").
 * Returns the list of confirmIds that were approved.
 */
export function approveAllPending(): string[] {
    const approvedIds: string[] = [];
    for (const [id, entry] of pending) {
        clearTimeout(entry.timer);
        entry.resolve(true);
        pending.delete(id);
        approvedIds.push(id);
    }
    return approvedIds;
}
