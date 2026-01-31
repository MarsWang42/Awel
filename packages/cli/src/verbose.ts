// ─── Verbose Mode ────────────────────────────────────────────
// Module-level toggle for CLI verbose logging.

let _verbose = false;

export function setVerbose(enabled: boolean): void {
    _verbose = enabled;
}

export function isVerbose(): boolean {
    return _verbose;
}

// ANSI 256-color helpers — darker shades that stay visible on light backgrounds
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
const cyan = (s: string) => `\x1b[38;5;30m${s}\x1b[39m`;
const yellow = (s: string) => `\x1b[38;5;136m${s}\x1b[39m`;
const green = (s: string) => `\x1b[38;5;34m${s}\x1b[39m`;
const red = (s: string) => `\x1b[38;5;160m${s}\x1b[39m`;
const magenta = (s: string) => `\x1b[38;5;127m${s}\x1b[39m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;

function timestamp(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return dim(`[${h}:${m}:${s}.${ms}]`);
}

function truncate(s: string, max = 120): string {
    const oneLine = s.replace(/\n/g, '\\n');
    if (oneLine.length <= max) return oneLine;
    return oneLine.slice(0, max) + dim('…');
}

function colorForEvent(eventType: string): (s: string) => string {
    if (eventType.startsWith('stream:')) return cyan;
    switch (eventType) {
        case 'text-delta':    return dim;
        case 'tool-call':     return yellow;
        case 'tool-result':   return green;
        case 'plan':          return magenta;
        case 'question':      return magenta;
        case 'finish-step':   return dim;
        case 'error':         return red;
        case 'abort':         return red;
        default:              return (s: string) => s;
    }
}

/**
 * Log a verbose event to the terminal. No-op if verbose mode is off.
 * Outputs human-readable, color-coded lines to stderr.
 */
export function logEvent(eventType: string, detail?: string): void {
    if (!_verbose) return;
    const color = colorForEvent(eventType);
    const tag = color(bold(eventType.padEnd(14)));
    const parts = [timestamp(), tag];
    if (detail) parts.push(truncate(detail, 200));
    process.stderr.write(parts.join(' ') + '\n');
}
