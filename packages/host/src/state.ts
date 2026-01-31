// ─── Shared Constants, Types & Utilities ──────────────────────

export const AWEL_PORT = 3001;
export const DASHBOARD_URL = `http://localhost:${AWEL_PORT}/_awel/dashboard`;
export const SIDEBAR_STATE_KEY = 'awel-sidebar-open';

export const CONSOLE_MAX_ENTRIES = 50;
export const CONSOLE_MSG_MAX = 500;
export const CONSOLE_STACK_MAX = 1000;

export const INSPECTOR_WHEEL_THRESHOLD = 80;

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
