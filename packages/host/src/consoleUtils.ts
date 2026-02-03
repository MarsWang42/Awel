export function consoleDedupeKey(level: string, message: string): string {
    return level + ':' + message.trim().slice(0, 200);
}

export function formatConsoleArgs(args: unknown[]): string {
    return args.map(arg => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
    }).join(' ');
}
