// ─── Shared Constants, Types & Utilities ──────────────────────

export const AWEL_PORT = 3001;
export const DASHBOARD_URL = `http://localhost:${AWEL_PORT}/_awel/dashboard`;
export const SIDEBAR_STATE_KEY = 'awel-sidebar-open';

export const CONSOLE_MAX_ENTRIES = 50;
export const CONSOLE_MSG_MAX = 500;
export const CONSOLE_STACK_MAX = 1000;

export const INSPECTOR_WHEEL_THRESHOLD = 80;

// ─── Theme State ─────────────────────────────────────────────

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem('awel-theme');
    if (stored === 'light' || stored === 'dark') return stored;
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export let resolvedTheme: 'light' | 'dark' = getInitialTheme();

export function setResolvedTheme(t: 'light' | 'dark'): void {
  resolvedTheme = t;
  const host = document.getElementById('awel-host');
  if (host) host.dataset.theme = t;
}

// ─── Types ────────────────────────────────────────────────────

export interface SourceFrame {
  source: string;
  line?: number;
  column?: number;
}

export interface ConsoleEntry {
  id: string;
  level: 'error' | 'warning';
  message: string;
  source?: string;
  line?: number;
  column?: number;
  sourceTrace?: SourceFrame[];
  stack?: string;
  timestamp: number;
  count: number;
}

export interface RawFrame {
  file: string;
  methodName: string;
  line: number;
  column: number;
}

// ─── Shared Utility ───────────────────────────────────────────

export function isAwelElement(el: Element | null): boolean {
  while (el) {
    const id = (el as HTMLElement).id;
    if (id === 'awel-host' || id === 'awel-sidebar') return true;
    el = el.parentElement;
  }
  return false;
}
