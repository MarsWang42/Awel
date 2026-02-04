// ─── Sidebar Overlay & Trigger Button ─────────────────────────

import {
  DASHBOARD_URL,
  SIDEBAR_STATE_KEY,
  resolvedTheme,
} from './state.js';
import {
  consoleEntries,
  setConsoleDotEl,
  setDashboardIframe,
} from './console.js';

// ─── State ────────────────────────────────────────────────────

let iframeOverlay: HTMLDivElement | null = null;

// ─── CSS & Icons ──────────────────────────────────────────────

const triggerStyles = `
  :host {
    all: initial;
  }

  :host([data-theme="dark"]) {
    --bg: #18181b; --border: #27272a; --fg: #fafafa;
    --hover-bg: #27272a; --hover-border: #3f3f46;
    --active-bg: #3f3f46; --active-border: #a1a1aa;
    --shadow: rgba(0, 0, 0, 0.4);
    --dot-ring: #18181b;
  }

  :host([data-theme="light"]) {
    --bg: #ffffff; --border: #d4d4d8; --fg: #18181b;
    --hover-bg: #f4f4f5; --hover-border: #a1a1aa;
    --active-bg: #e4e4e7; --active-border: #71717a;
    --shadow: rgba(0, 0, 0, 0.1);
    --dot-ring: #ffffff;
  }

  .awel-controls {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 1000000;
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .awel-trigger, .awel-inspector-btn, .awel-screenshot-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--bg);
    border: none;
    border-radius: 8px;
    color: var(--fg);
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    box-shadow: 0 4px 12px var(--shadow);
    transition: all 0.15s ease;
  }

  .awel-trigger {
    padding: 10px 16px;
  }

  .awel-inspector-btn {
    padding: 10px 12px;
  }

  .awel-screenshot-btn {
    padding: 10px 12px;
  }

  .awel-trigger:hover, .awel-inspector-btn:hover, .awel-screenshot-btn:hover {
    background: var(--hover-bg);
  }

  .awel-trigger:active, .awel-inspector-btn:active, .awel-screenshot-btn:active {
    transform: scale(0.98);
  }

  .awel-inspector-btn.active {
    background: var(--active-bg);
    color: var(--fg);
  }

  .awel-icon {
    width: 16px;
    height: 16px;
  }

  .awel-trigger {
    position: relative;
  }

  .awel-console-dot {
    position: absolute;
    top: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    border: 2px solid var(--dot-ring);
    pointer-events: none;
    transition: background 0.15s ease;
    display: none;
  }

  .awel-console-dot.error {
    background: #ef4444;
    display: block;
  }

  .awel-console-dot.warning {
    background: #eab308;
    display: block;
  }
`;

const awelIcon = `<span class="awel-icon" style="font-size:14px;line-height:1">🌸</span>`;

const eyeIcon = `
  <svg class="awel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
`;

const cameraIcon = `
  <svg class="awel-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
`;

// ─── Functions ────────────────────────────────────────────────

export function isSidebarVisible(): boolean {
  return !!iframeOverlay && iframeOverlay.isConnected && iframeOverlay.style.display !== 'none';
}

export function toggleOverlay(): void {
  if (isSidebarVisible()) {
    closeOverlay();
  } else {
    openOverlay();
  }
}

export function openOverlay(skipAnimation = false): void {
  // If the iframe already exists and is still in the DOM, show it
  if (iframeOverlay && iframeOverlay.isConnected) {
    iframeOverlay.style.display = '';
    if (!skipAnimation) {
      iframeOverlay.style.animation = 'awel-fade-in 0.2s ease';
    }

    // Persist state
    try {
      sessionStorage.setItem(SIDEBAR_STATE_KEY, 'true');
    } catch { /* ignore storage errors */ }
    return;
  }

  // Clear stale reference if the element was removed from the DOM
  if (iframeOverlay && !iframeOverlay.isConnected) {
    iframeOverlay = null;
  }

  iframeOverlay = document.createElement('div');
  iframeOverlay.id = 'awel-sidebar';
  iframeOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 999999;
    overflow: hidden;
    ${skipAnimation ? '' : 'animation: awel-fade-in 0.2s ease;'}
  `;

  // Add animation keyframes (only if not already added)
  if (!document.getElementById('awel-sidebar-styles')) {
    const animStyle = document.createElement('style');
    animStyle.id = 'awel-sidebar-styles';
    animStyle.textContent = `
      @keyframes awel-fade-in {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(animStyle);
  }

  const iframe = document.createElement('iframe');
  iframe.src = DASHBOARD_URL;
  iframe.setAttribute('allowtransparency', 'true');
  iframe.style.cssText = `
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
  `;

  // Store reference and broadcast console entries when dashboard iframe loads
  iframe.addEventListener('load', () => {
    setDashboardIframe(iframe);
    if (consoleEntries.length > 0 && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'AWEL_CONSOLE_ENTRIES', entries: consoleEntries }, '*');
    }
  });

  iframeOverlay.appendChild(iframe);
  // Append to documentElement (<html>) instead of body so React/Next.js
  // error recovery doesn't remove the overlay when it replaces body content.
  document.documentElement.appendChild(iframeOverlay);

  // Persist state
  try {
    sessionStorage.setItem(SIDEBAR_STATE_KEY, 'true');
  } catch { /* ignore storage errors */ }
}

export function closeOverlay(): void {
  if (iframeOverlay) {
    iframeOverlay.style.display = 'none';
  }

  // Clear persisted state
  try {
    sessionStorage.removeItem(SIDEBAR_STATE_KEY);
  } catch { /* ignore storage errors */ }
}

export function getIframeOverlay(): HTMLDivElement | null {
  return iframeOverlay;
}

export function createTriggerButton(opts: {
  onInspectorToggle: () => void;
  onScreenshot: () => void;
}): void {
  // Check if already initialized
  if (document.getElementById('awel-host')) {
    return;
  }

  // Create shadow host — append to documentElement (<html>) instead of body
  // so React/Next.js error recovery doesn't remove it when replacing body content.
  const host = document.createElement('div');
  host.id = 'awel-host';
  host.dataset.theme = resolvedTheme;
  document.documentElement.appendChild(host);

  // Attach shadow root (store ref for inspector button updates)
  const shadow = host.attachShadow({ mode: 'closed' });
  (host as unknown as { _shadow: ShadowRoot })._shadow = shadow;

  // Add styles
  const style = document.createElement('style');
  style.textContent = triggerStyles;
  shadow.appendChild(style);

  // Create button group
  const controls = document.createElement('div');
  controls.className = 'awel-controls';

  // Main trigger button
  const button = document.createElement('button');
  button.className = 'awel-trigger';
  button.innerHTML = `${awelIcon} <span>Awel</span>`;
  button.addEventListener('click', toggleOverlay);

  // Console error/warning dot indicator
  const dot = document.createElement('div');
  dot.className = 'awel-console-dot';
  button.appendChild(dot);
  setConsoleDotEl(dot);

  // Inspector toggle button
  const inspectBtn = document.createElement('button');
  inspectBtn.className = 'awel-inspector-btn';
  inspectBtn.innerHTML = eyeIcon;
  inspectBtn.title = 'Inspector mode (\u2325\u21E7)';
  inspectBtn.addEventListener('click', opts.onInspectorToggle);

  // Screenshot annotation button
  const screenshotBtn = document.createElement('button');
  screenshotBtn.className = 'awel-screenshot-btn';
  screenshotBtn.innerHTML = cameraIcon;
  screenshotBtn.title = 'Screenshot annotation';
  screenshotBtn.addEventListener('click', opts.onScreenshot);

  controls.appendChild(button);
  controls.appendChild(inspectBtn);
  controls.appendChild(screenshotBtn);
  shadow.appendChild(controls);
}
