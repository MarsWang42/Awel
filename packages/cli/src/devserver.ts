import type { Socket } from 'net';

// ─── HMR gate ────────────────────────────────────────────────
// While the agent is streaming we pause the target-side proxy
// sockets so HMR messages are buffered in the kernel rather than
// forwarded to the browser.  The browser-side WebSocket stays
// connected (no disconnection-triggered reload).  When the stream
// ends we resume the sockets — buffered messages flow through and
// the page picks up all changes in a single reload.

let streaming = false;

/** Target-side proxy sockets (the connection *to* the dev server). */
const proxySockets = new Set<Socket>();

/**
 * Register a target-side proxy socket.
 * Called from the http-proxy 'open' event in server.ts.
 */
export function trackProxySocket(socket: Socket): void {
    proxySockets.add(socket);
    socket.once('close', () => proxySockets.delete(socket));

    // If we're already streaming, pause immediately
    if (streaming) {
        socket.pause();
    }
}

/**
 * Called when an agent stream starts.
 * Pauses all target-side sockets so HMR data is buffered, not forwarded.
 */
export function pauseDevServer(_port: number): void {
    streaming = true;
    for (const socket of proxySockets) {
        socket.pause();
    }
}

/**
 * Called when an agent stream ends.
 * Resumes target-side sockets — buffered HMR messages flow through
 * and the browser picks up all accumulated changes at once.
 */
export function resumeDevServer(_port: number): void {
    streaming = false;
    for (const socket of proxySockets) {
        socket.resume();
    }
}
