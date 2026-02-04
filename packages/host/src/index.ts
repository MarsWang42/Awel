/**
 * Awel Host Script
 *
 * This script creates a Shadow DOM isolated trigger button
 * that opens the Awel dashboard in a full-screen iframe overlay.
 * Includes an inspector mode for selecting elements to provide AI context.
 *
 * Note: This runs in the browser, so we can't import from the CLI package.
 * The port is configured to match the AWEL_PORT in packages/cli/src/config.ts
 */

import { SIDEBAR_STATE_KEY, DASHBOARD_URL, setResolvedTheme } from './state.js';
import {
  consoleEntries,
  consoleHasUnviewed,
  setConsoleEntries,
  setConsoleHasUnviewed,
  updateConsoleDot,
  broadcastConsoleEntries,
  setupConsoleInterception,
} from './console.js';
import {
  isSidebarVisible,
  openOverlay,
  closeOverlay,
  getIframeOverlay,
  createTriggerButton,
} from './overlay.js';
import {
  getInspectorActive,
  setInspectorActive,
  setInspectorAttachMode,
  setLastSelectedElement,
  setPendingInspectorPayload,
  lastSelectedElement,
  pendingInspectorPayload,
  removeCommentPopup,
  cancelCommentPopup,
  showHoverHighlight,
  hideHoverHighlight,
  handleHoldInspectKeydown,
  handleHoldInspectKeyup,
  handleHoldInspectBlur,
} from './inspector.js';
import { startScreenshotAnnotation } from './annotation.js';
import { setupPageContextTracking, broadcastPageContext } from './pageContext.js';

// ─── Comparison Mode ───────────────────────────────────────────

function isComparisonMode(): boolean {
  return !!(window as any).__AWEL_COMPARISON_MODE__;
}

function createComparisonOverlay(): void {
  if (document.getElementById('awel-comparison-overlay')) return;

  if (!document.getElementById('awel-comparison-styles')) {
    const style = document.createElement('style');
    style.id = 'awel-comparison-styles';
    style.textContent = `
      #awel-comparison-overlay {
        position: fixed;
        inset: 0;
        z-index: 999999;
        pointer-events: none;
      }
      #awel-comparison-overlay iframe {
        width: 100%;
        height: 100%;
        border: none;
        pointer-events: auto;
        background: transparent;
      }
    `;
    document.head.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = 'awel-comparison-overlay';

  const iframe = document.createElement('iframe');
  // Pass comparison mode via URL parameter since the iframe has its own window
  iframe.src = DASHBOARD_URL + '?mode=comparison';

  overlay.appendChild(iframe);
  document.documentElement.appendChild(overlay);
}

function closeComparisonOverlay(): void {
  document.getElementById('awel-comparison-overlay')?.remove();
}

function updateComparisonTheme(theme: 'light' | 'dark'): void {
  const iframe = document.querySelector('#awel-comparison-overlay iframe') as HTMLIFrameElement | null;
  iframe?.contentWindow?.postMessage({ type: 'AWEL_THEME', theme }, '*');
}

// ─── Message Handler ──────────────────────────────────────────

window.addEventListener('message', (event) => {
  if (event.data?.type === 'AWEL_CLOSE') {
    closeOverlay();
    closeComparisonOverlay();
  }
  if (event.data?.type === 'AWEL_HIGHLIGHT_ELEMENT') {
    showHoverHighlight();
  }
  if (event.data?.type === 'AWEL_UNHIGHLIGHT_ELEMENT') {
    hideHoverHighlight();
  }
  if (event.data?.type === 'AWEL_CLEAR_ELEMENT') {
    setLastSelectedElement(null);
    hideHoverHighlight();
  }
  if (event.data?.type === 'AWEL_COMMENT_SUBMIT' && pendingInspectorPayload) {
    const comment = event.data.comment as string;
    const payloadWithComment = { ...pendingInspectorPayload, comment };

    // Open sidebar if not already open (normal mode)
    if (!isSidebarVisible()) {
      openOverlay();
    }

    // Send selection + comment to the server
    fetch('/api/inspector/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadWithComment),
    }).catch(() => { });

    removeCommentPopup();
    setPendingInspectorPayload(null);
    setLastSelectedElement(null);
  }
  if (event.data?.type === 'AWEL_COMMENT_CLOSE') {
    cancelCommentPopup();
  }
  if (event.data?.type === 'AWEL_CONSOLE_VIEWED') {
    setConsoleHasUnviewed(false);
    updateConsoleDot();
  }
  if (event.data?.type === 'AWEL_CONSOLE_DISMISS') {
    setConsoleEntries(consoleEntries.filter(e => e.id !== event.data.id));
    updateConsoleDot();
  }
  if (event.data?.type === 'AWEL_CONSOLE_CLEAR') {
    setConsoleEntries([]);
    setConsoleHasUnviewed(false);
    updateConsoleDot();
  }
  if (event.data?.type === 'AWEL_HIDE_CONTROLS') {
    const hostEl = document.getElementById('awel-host');
    if (hostEl) hostEl.style.display = 'none';
    const comparisonOverlay = document.getElementById('awel-comparison-overlay');
    if (comparisonOverlay) comparisonOverlay.style.display = 'none';
  }
  if (event.data?.type === 'AWEL_SHOW_CONTROLS') {
    const hostEl = document.getElementById('awel-host');
    if (hostEl) hostEl.style.display = '';
    const comparisonOverlay = document.getElementById('awel-comparison-overlay');
    if (comparisonOverlay) comparisonOverlay.style.display = '';
  }
  if (event.data?.type === 'AWEL_INSPECT_FOR_ATTACH') {
    setInspectorAttachMode(true);
    setInspectorActive(true);
  }
  if (event.data?.type === 'AWEL_REQUEST_PAGE_CONTEXT') {
    broadcastPageContext();
  }
  if (event.data?.type === 'AWEL_THEME') {
    setResolvedTheme(event.data.theme);
    updateComparisonTheme(event.data.theme);
  }
});

// ─── Init ─────────────────────────────────────────────────────

function init(): void {
  setupConsoleInterception();
  setupPageContextTracking();

  // In comparison mode, show the comparison overlay instead of the normal trigger button
  if (isComparisonMode()) {
    createComparisonOverlay();
    return;
  }

  createTriggerButton({
    onInspectorToggle: () => setInspectorActive(!getInspectorActive()),
    onScreenshot: () => startScreenshotAnnotation(),
  });

  // Hold-to-inspect: Option+Shift keyboard shortcut
  document.addEventListener('keydown', handleHoldInspectKeydown, true);
  document.addEventListener('keyup', handleHoldInspectKeyup, true);
  window.addEventListener('blur', handleHoldInspectBlur);

  // Restore sidebar state after hot reload
  try {
    if (sessionStorage.getItem(SIDEBAR_STATE_KEY) === 'true' && !getIframeOverlay()) {
      openOverlay(true); // Skip animation when restoring
    }
  } catch { /* ignore storage errors */ }

  // Self-healing: watch for Next.js error recovery removing Awel elements.
  // When Next.js encounters a runtime error it may replace the entire body or
  // even parts of documentElement. If our trigger button disappears, re-create it.
  setupSelfHealing();
}

function setupSelfHealing(): void {
  const observer = new MutationObserver(() => {
    // In comparison mode, heal the comparison overlay
    if (isComparisonMode()) {
      if (!document.getElementById('awel-comparison-overlay')) {
        createComparisonOverlay();
      }
      return;
    }

    if (!document.getElementById('awel-host')) {
      // Trigger button was removed — re-create it
      createTriggerButton({
        onInspectorToggle: () => setInspectorActive(!getInspectorActive()),
        onScreenshot: () => startScreenshotAnnotation(),
      });

      // Also restore the sidebar overlay if it was open
      try {
        if (sessionStorage.getItem(SIDEBAR_STATE_KEY) === 'true' && !getIframeOverlay()) {
          openOverlay(true);
        }
      } catch { /* ignore storage errors */ }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
