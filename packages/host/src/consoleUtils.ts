export function consoleDedupeKey(level: string, message: string): string {
    // Normalize message for better deduplication
    let normalized = message.trim();

    // Remove common prefixes that vary between capture methods
    normalized = normalized
        .replace(/^Uncaught /i, '')
        .replace(/^(Error|TypeError|ReferenceError|SyntaxError|RangeError): /i, '')
        .replace(/^Unhandled rejection: /i, '')
        .replace(/^The above error occurred in.+$/m, '') // React dev mode message
        .trim();

    // Extract first meaningful line (ignore stack traces)
    const firstLine = normalized.split('\n')[0] || normalized;

    return level + ':' + firstLine.slice(0, 200);
}

export function formatConsoleArgs(args: unknown[]): string {
    return args.map(arg => {
        if (arg instanceof Error) return arg.stack || arg.message;
        if (typeof arg === 'string') return arg;
        try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
    }).join(' ');
}
