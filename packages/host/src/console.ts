// ─── Console Capture & Interception ───────────────────────────

import {
  CONSOLE_MAX_ENTRIES,
  CONSOLE_MSG_MAX,
  CONSOLE_STACK_MAX,
  type ConsoleEntry,
  type SourceFrame,
  type RawFrame,
} from './state.js';

// ─── State ────────────────────────────────────────────────────

export let consoleEntries: ConsoleEntry[] = [];
export let consoleHasUnviewed = false;
export let consoleDotEl: HTMLDivElement | null = null;

export function setConsoleDotEl(el: HTMLDivElement | null): void {
  consoleDotEl = el;
}

export function setConsoleEntries(entries: ConsoleEntry[]): void {
  consoleEntries = entries;
}

export function setConsoleHasUnviewed(value: boolean): void {
  consoleHasUnviewed = value;
}

// ─── Functions ────────────────────────────────────────────────

function consoleDedupeKey(level: string, message: string): string {
  return level + ':' + message.trim().slice(0, 200);
}

export function broadcastConsoleEntries(): void {
  const sidebar = document.getElementById('awel-sidebar');
  if (!sidebar) return;
  const iframe = sidebar.querySelector('iframe');
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage({ type: 'AWEL_CONSOLE_ENTRIES', entries: consoleEntries }, '*');
}

export function updateConsoleDot(): void {
  if (!consoleDotEl) return;
  consoleDotEl.classList.remove('error', 'warning');
  if (!consoleHasUnviewed || consoleEntries.length === 0) return;
  if (consoleEntries.some(e => e.level === 'error')) {
    consoleDotEl.classList.add('error');
  } else if (consoleEntries.some(e => e.level === 'warning')) {
    consoleDotEl.classList.add('warning');
  }
}

function addConsoleEntry(
  entry: Omit<ConsoleEntry, 'id' | 'count'>,
  resolveSource?: () => Promise<SourceFrame[] | null>,
): void {
  const key = consoleDedupeKey(entry.level, entry.message);
  const existing = consoleEntries.find(e => consoleDedupeKey(e.level, e.message) === key);
  if (existing) {
    existing.count++;
    existing.timestamp = entry.timestamp;
  } else {
    const newEntry: ConsoleEntry = {
      ...entry,
      id: Math.random().toString(36).slice(2) + Date.now().toString(36),
      count: 1,
    };
    consoleEntries.push(newEntry);
    if (consoleEntries.length > CONSOLE_MAX_ENTRIES) {
      consoleEntries = consoleEntries.slice(-CONSOLE_MAX_ENTRIES);
    }
    // Async source resolution: update the entry once resolved, then re-broadcast
    if (resolveSource) {
      resolveSource().then(frames => {
        if (frames && frames.length > 0) {
          newEntry.source = frames[0].source;
          newEntry.line = frames[0].line;
          newEntry.column = frames[0].column;
          newEntry.sourceTrace = frames;
          broadcastConsoleEntries();
        }
      }).catch(() => { });
    }
  }
  consoleHasUnviewed = true;
  updateConsoleDot();
  broadcastConsoleEntries();
}

// ─── Stack Parsing & Source Resolution ────────────────────────

// Extract all non-Awel frames from the call stack.
// We resolve them all via source maps, then pick the first user-code frame.
function captureCallerFrames(limit = 15): RawFrame[] {
  const err = new Error();
  if (!err.stack) return [];
  const frames: RawFrame[] = [];
  for (const line of err.stack.split('\n')) {
    if (frames.length >= limit) break;
    if (!line.includes('at ')) continue;
    if (line.includes('/_awel/')) continue;
    if (line.includes('<anonymous>')) continue;

    const m1 = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    if (m1) { frames.push({ methodName: m1[1], file: m1[2], line: +m1[3], column: +m1[4] }); continue; }

    const m2 = line.match(/at\s+(.+?):(\d+):(\d+)/);
    if (m2) { frames.push({ methodName: '', file: m2[1], line: +m2[2], column: +m2[3] }); continue; }
  }
  return frames;
}

// Ask Next.js dev server to source-map bundled locations back to
// original files. Sends all captured frames, returns all that
// resolve to user code (not node_modules / framework).
async function resolveOriginalSource(rawFrames: RawFrame[]): Promise<SourceFrame[] | null> {
  const projectCwd = (window as unknown as Record<string, unknown>).__AWEL_PROJECT_CWD__ as string | undefined;

  // Try Next.js Turbopack endpoint (POST /__nextjs_original-stack-frames)
  if (projectCwd && rawFrames.length > 0) {
    try {
      const frames = rawFrames.map(raw => {
        let fileUrl = raw.file;
        const match = raw.file.match(/^https?:\/\/[^/]+\/_next\/(.+)$/);
        if (match) {
          fileUrl = `file://${projectCwd}/.next/dev/${match[1]}`;
        }
        return {
          file: fileUrl,
          line1: raw.line,
          column1: raw.column,
          methodName: raw.methodName,
          arguments: [],
        };
      });

      const res = await fetch('/__nextjs_original-stack-frames', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames,
          isServer: false,
          isEdgeServer: false,
          isAppDirectory: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const resolved = Array.isArray(data) ? data : [];
        const userFrames: SourceFrame[] = [];
        // Response format: { status: 'fulfilled', value: { originalStackFrame, originalCodeFrame } }
        for (const entry of resolved) {
          if (entry?.status !== 'fulfilled') continue;
          const frame = entry.value?.originalStackFrame;
          if (!frame?.file) continue;
          if (frame.ignored) continue;
          let source = String(frame.file);
          source = source.replace(/^file:\/\//, '');
          if (source.startsWith(projectCwd)) {
            source = source.slice(projectCwd.length).replace(/^\//, '');
          }
          source = source.replace(/^\.\//, '');
          if (source.startsWith('node_modules/') || source.includes('/node_modules/')) continue;
          userFrames.push({ source, line: frame.line1 ?? undefined, column: frame.column1 ?? undefined });
        }
        if (userFrames.length > 0) return userFrames;
      }
    } catch { /* not Next.js or endpoint unavailable */ }
  }

  // Fallback: use the first raw frame and strip URL boilerplate
  const raw = rawFrames[0];
  if (!raw) return null;
  let source = raw.file;
  source = source.replace(/^webpack-internal:\/\/\/(\.\/?)?/, '');
  source = source.replace(/^\[project\]\//, '');
  source = source.replace(/^https?:\/\/[^/]+\//, '');
  if (source.includes('_next/static/')) return null;
  if (!source || source.startsWith('native')) return null;
  return [{ source, line: raw.line, column: raw.column }];
}

// ─── Console Interception Setup ───────────────────────────────

function formatConsoleArgs(args: unknown[]): string {
  return args.map(arg => {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === 'string') return arg;
    try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
  }).join(' ');
}

export function setupConsoleInterception(): void {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = function (...args: unknown[]) {
    originalError.apply(console, args);
    const message = formatConsoleArgs(args).slice(0, CONSOLE_MSG_MAX);
    if (message.startsWith('[Awel')) return;
    let stack: string | undefined;
    if (args[0] instanceof Error && args[0].stack) {
      stack = args[0].stack.slice(0, CONSOLE_STACK_MAX);
    }
    const frames = captureCallerFrames();
    addConsoleEntry(
      { level: 'error', message, stack, timestamp: Date.now() },
      frames.length > 0 ? () => resolveOriginalSource(frames) : undefined,
    );
  };

  console.warn = function (...args: unknown[]) {
    originalWarn.apply(console, args);
    const message = formatConsoleArgs(args).slice(0, CONSOLE_MSG_MAX);
    if (message.startsWith('[Awel')) return;
    const frames = captureCallerFrames();
    addConsoleEntry(
      { level: 'warning', message, timestamp: Date.now() },
      frames.length > 0 ? () => resolveOriginalSource(frames) : undefined,
    );
  };

  window.addEventListener('error', (event) => {
    if (event.filename?.includes('/_awel/')) return;
    const message = (event.message || 'Unknown error').slice(0, CONSOLE_MSG_MAX);
    if (message.startsWith('[Awel')) return;
    let stack: string | undefined;
    if (event.error instanceof Error && event.error.stack) {
      stack = event.error.stack.slice(0, CONSOLE_STACK_MAX);
    }
    const frames: RawFrame[] = event.filename
      ? [{ file: event.filename, methodName: '', line: event.lineno || 0, column: event.colno || 0 }]
      : [];
    addConsoleEntry(
      { level: 'error', message, stack, timestamp: Date.now() },
      frames.length > 0 ? () => resolveOriginalSource(frames) : undefined,
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    let message: string;
    let stack: string | undefined;
    if (reason instanceof Error) {
      message = (reason.message || 'Unhandled promise rejection').slice(0, CONSOLE_MSG_MAX);
      if (reason.stack) stack = reason.stack.slice(0, CONSOLE_STACK_MAX);
    } else if (typeof reason === 'string') {
      message = reason.slice(0, CONSOLE_MSG_MAX);
    } else {
      try { message = JSON.stringify(reason).slice(0, CONSOLE_MSG_MAX); } catch { message = 'Unhandled promise rejection'; }
    }
    if (message.startsWith('[Awel')) return;
    const frames = captureCallerFrames();
    addConsoleEntry(
      { level: 'error', message: `Unhandled rejection: ${message}`, stack, timestamp: Date.now() },
      frames.length > 0 ? () => resolveOriginalSource(frames) : undefined,
    );
  });
}
