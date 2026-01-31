// ─── Prefixed Logger ─────────────────────────────────────────
// Colored [awel] / [next] prefixes for terminal output so the
// user can distinguish Awel's messages from the Next.js app's.

import type { ResultPromise } from 'execa';
import { createInterface } from 'readline';

// ANSI 256-color helpers — darker shades that stay visible on light backgrounds
const cyan = (s: string) => `\x1b[38;5;30m${s}\x1b[39m`;
const magenta = (s: string) => `\x1b[38;5;127m${s}\x1b[39m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[22m`;

const AWEL_PREFIX = bold(cyan('[awel]'));
const NEXT_PREFIX = bold(magenta('[next]'));

function prefixedWriter(prefix: string, stream: NodeJS.WriteStream) {
    return (...args: unknown[]) => {
        const message = args.map(String).join(' ');
        for (const line of message.split('\n')) {
            stream.write(`${prefix} ${line}\n`);
        }
    };
}

export const awel = {
    log: prefixedWriter(AWEL_PREFIX, process.stdout),
    error: prefixedWriter(AWEL_PREFIX, process.stderr),
};

/**
 * Pipe a child process's stdout/stderr line-by-line, prefixing
 * each line with the magenta [next] tag.
 */
export function pipeChildOutput(child: ResultPromise): void {
    if (child.stdout) {
        const rl = createInterface({ input: child.stdout });
        rl.on('line', (line) => {
            process.stdout.write(`${NEXT_PREFIX} ${line}\n`);
        });
    }

    if (child.stderr) {
        const rl = createInterface({ input: child.stderr });
        rl.on('line', (line) => {
            process.stderr.write(`${NEXT_PREFIX} ${line}\n`);
        });
    }
}
