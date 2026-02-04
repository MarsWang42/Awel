// ─── Inspector Mode ───────────────────────────────────────────

import { AWEL_PORT, INSPECTOR_WHEEL_THRESHOLD, isAwelElement, resolvedTheme } from './state.js';
import { isSidebarVisible } from './overlay.js';
import { isPascalCase, parsePixelValue, getSourceLocFromAttribute, getElementLabel } from './inspectorUtils.js';

// ─── State ────────────────────────────────────────────────────

let inspectorActive = false;
let highlightOverlay: HTMLDivElement | null = null;
export let lastSelectedElement: HTMLElement | null = null;
let hoverHighlightOverlay: HTMLDivElement | null = null;
let sidebarWasOpen = false;
let inspectorToast: HTMLDivElement | null = null;

// Scroll-wheel depth navigation state
let inspectorDepthOffset = 0;
let inspectorNaturalTarget: HTMLElement | null = null;
let inspectorCurrentTarget: HTMLElement | null = null;
let inspectorLabel: HTMLDivElement | null = null;
let inspectorWheelAccumulator = 0;

// Hold-to-inspect state (Option+Shift)
let holdInspectActive = false;
let holdInspectElementSelected = false;

// Attach-mode inspector (triggered from dashboard input)
export let inspectorAttachMode = false;

// Comment popup state
let commentPopupIframe: HTMLIFrameElement | null = null;
export let pendingInspectorPayload: Record<string, unknown> | null = null;
let commentPopupEscHandler: ((e: KeyboardEvent) => void) | null = null;
let commentPopupClickOutsideHandler: ((e: MouseEvent) => void) | null = null;

// ─── Exported getters/setters for mutable state ───────────────

export function getInspectorActive(): boolean {
  return inspectorActive;
}

export function setInspectorAttachMode(value: boolean): void {
  inspectorAttachMode = value;
}

export function setLastSelectedElement(el: HTMLElement | null): void {
  lastSelectedElement = el;
}

export function setPendingInspectorPayload(payload: Record<string, unknown> | null): void {
  pendingInspectorPayload = payload;
}

// ─── Source Detection (data- attributes) ──────────────────────

// getSourceLocFromAttribute moved to inspectorUtils.ts

function getComponentFromAttribute(element: HTMLElement): string | null {
  return element.getAttribute('data-source-component') || null;
}

function getComponentChainFromAttributes(element: HTMLElement): string[] | null {
  const own = getComponentFromAttribute(element);
  const chain: string[] = [];
  const seen = new Set<string>();
  if (own) seen.add(own);
  let el: HTMLElement | null = element.parentElement;
  while (el && chain.length < 10) {
    const comp = el.getAttribute('data-source-component');
    if (comp && !seen.has(comp)) {
      seen.add(comp);
      chain.push(comp);
    }
    el = el.parentElement;
  }
  return chain.length > 0 ? chain : null;
}

// ─── React Fiber ──────────────────────────────────────────────

function getFiberFromElement(element: HTMLElement): Record<string, unknown> | null {
  for (const key of Object.keys(element)) {
    if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
      return (element as Record<string, unknown>)[key] as Record<string, unknown> | null;
    }
  }
  return null;
}

function getFiberProps(element: HTMLElement): Record<string, string> | null {
  let current = getFiberFromElement(element);
  if (!current) return null;

  while (current) {
    if (typeof current.type === 'function') {
      const memoizedProps = current.memoizedProps as Record<string, unknown> | undefined;
      if (!memoizedProps || typeof memoizedProps !== 'object') return null;

      const result: Record<string, string> = {};
      let count = 0;
      for (const [key, value] of Object.entries(memoizedProps)) {
        if (key === 'children') continue;
        if (count >= 15) break;
        if (value === undefined) result[key] = 'undefined';
        else if (value === null) result[key] = 'null';
        else if (typeof value === 'function') result[key] = 'function';
        else if (typeof value === 'object') result[key] = 'object';
        else if (typeof value === 'string') result[key] = `string: ${value.length > 50 ? value.slice(0, 50) + '...' : value}`;
        else if (typeof value === 'number' || typeof value === 'boolean') result[key] = String(value);
        else result[key] = typeof value;
        count++;
      }
      return Object.keys(result).length > 0 ? result : null;
    }
    current = current.return as Record<string, unknown> | null;
  }
  return null;
}

function getSourceLocFromFiber(element: HTMLElement): { fileName: string; line: number; column: number } | null {
  let current = getFiberFromElement(element);
  while (current) {
    const debugSource = current._debugSource as { fileName?: string; lineNumber?: number; columnNumber?: number } | undefined;
    if (debugSource && debugSource.fileName && typeof debugSource.lineNumber === 'number') {
      return {
        fileName: debugSource.fileName,
        line: debugSource.lineNumber,
        column: typeof debugSource.columnNumber === 'number' ? debugSource.columnNumber : 0,
      };
    }
    current = current.return as Record<string, unknown> | null;
  }
  return null;
}

// isPascalCase moved to inspectorUtils.ts

// Only treat a component as user-defined if its _debugSource points to
// a project file (not node_modules, not a synthetic/internal path).
// If _debugSource is absent we can't confirm it's user code, so skip it.
// This avoids maintaining a fragile blocklist of React/Next.js internals.
function isUserComponent(fiber: Record<string, unknown>): string | null {
  if (typeof fiber.type !== 'function') return null;
  const fn = fiber.type as { displayName?: string; name?: string };
  const name = fn.displayName || fn.name;
  if (!name || !isPascalCase(name)) return null;

  const src = fiber._debugSource as { fileName?: string } | undefined;
  // No debug source -> can't verify it's user code, skip
  if (!src?.fileName) return null;
  // Anything from node_modules is framework/library code
  if (/node_modules/.test(src.fileName)) return null;

  return name;
}

function getComponentFromFiber(element: HTMLElement): string | null {
  let current = getFiberFromElement(element);
  while (current) {
    const name = isUserComponent(current);
    if (name) return name;
    current = current.return as Record<string, unknown> | null;
  }
  return null;
}

function getComponentChainFromFiber(element: HTMLElement): string[] | null {
  const own = getComponentFromFiber(element);
  const chain: string[] = [];
  const seen = new Set<string>();
  if (own) seen.add(own);

  // Start from the fiber and skip the first user component (own)
  let current = getFiberFromElement(element);
  let skippedOwn = false;
  while (current && chain.length < 10) {
    const name = isUserComponent(current);
    if (name) {
      if (!skippedOwn) {
        skippedOwn = true;
      } else if (!seen.has(name)) {
        seen.add(name);
        chain.push(name);
      }
    }
    current = current.return as Record<string, unknown> | null;
  }
  return chain.length > 0 ? chain : null;
}

// ─── Highlight & Click ────────────────────────────────────────

// parsePixelValue moved to inspectorUtils.ts

function createBoxModelOverlay(id?: string): HTMLDivElement {
  // container > margin > border > padding > content
  const container = document.createElement('div');
  container.id = id || 'awel-highlight';
  container.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 999998;
    outline: 2px solid #f43f5e;
    outline-offset: -1px;
    transition: top 0.1s ease, left 0.1s ease, width 0.1s ease, height 0.1s ease;
  `;

  const layers: Array<{ name: string; color: string }> = [
    { name: 'margin', color: 'rgba(246, 178, 107, 0.66)' },
    { name: 'border', color: 'rgba(255, 229, 153, 0.66)' },
    { name: 'padding', color: 'rgba(147, 196, 125, 0.55)' },
    { name: 'content', color: 'rgba(111, 168, 220, 0.66)' },
  ];

  let parent = container;
  for (const layer of layers) {
    const div = document.createElement('div');
    div.dataset.boxLayer = layer.name;
    div.style.cssText = `
      position: absolute;
      background: ${layer.color};
    `;
    parent.appendChild(div);
    parent = div;
  }

  document.body.appendChild(container);
  return container;
}

function updateBoxModelOverlay(element: HTMLElement, container: HTMLDivElement): DOMRect {
  const rect = element.getBoundingClientRect();
  const cs = getComputedStyle(element);

  const mt = parsePixelValue(cs.marginTop);
  const mr = parsePixelValue(cs.marginRight);
  const mb = parsePixelValue(cs.marginBottom);
  const ml = parsePixelValue(cs.marginLeft);

  const bt = parsePixelValue(cs.borderTopWidth);
  const br = parsePixelValue(cs.borderRightWidth);
  const bb = parsePixelValue(cs.borderBottomWidth);
  const bl = parsePixelValue(cs.borderLeftWidth);

  const pt = parsePixelValue(cs.paddingTop);
  const pr = parsePixelValue(cs.paddingRight);
  const pb = parsePixelValue(cs.paddingBottom);
  const pl = parsePixelValue(cs.paddingLeft);

  // Position container at the margin-box origin
  const marginBoxTop = rect.top - mt;
  const marginBoxLeft = rect.left - ml;
  const marginBoxWidth = ml + rect.width + mr;
  const marginBoxHeight = mt + rect.height + mb;

  container.style.top = `${marginBoxTop}px`;
  container.style.left = `${marginBoxLeft}px`;
  container.style.width = `${marginBoxWidth}px`;
  container.style.height = `${marginBoxHeight}px`;
  container.style.display = 'block';

  // Margin layer fills the entire container
  const marginLayer = container.firstElementChild as HTMLDivElement;
  marginLayer.style.inset = '0';

  // Border layer is inset by margins
  const borderLayer = marginLayer.firstElementChild as HTMLDivElement;
  borderLayer.style.top = `${mt}px`;
  borderLayer.style.left = `${ml}px`;
  borderLayer.style.right = `${mr}px`;
  borderLayer.style.bottom = `${mb}px`;

  // Padding layer is inset by borders
  const paddingLayer = borderLayer.firstElementChild as HTMLDivElement;
  paddingLayer.style.top = `${bt}px`;
  paddingLayer.style.left = `${bl}px`;
  paddingLayer.style.right = `${br}px`;
  paddingLayer.style.bottom = `${bb}px`;

  // Content layer is inset by padding
  const contentLayer = paddingLayer.firstElementChild as HTMLDivElement;
  contentLayer.style.top = `${pt}px`;
  contentLayer.style.left = `${pl}px`;
  contentLayer.style.right = `${pr}px`;
  contentLayer.style.bottom = `${pb}px`;

  return rect;
}

function getAncestorAtDepth(element: HTMLElement, depth: number): HTMLElement {
  let current = element;
  for (let i = 0; i < depth; i++) {
    let parent = current.parentElement;
    // Skip Awel elements when walking up
    while (parent && isAwelElement(parent)) {
      parent = parent.parentElement;
    }
    if (!parent) break;
    current = parent;
  }
  return current;
}

// getElementLabel moved to inspectorUtils.ts

function updateInspectorLabel(rect: DOMRect): void {
  if (!inspectorCurrentTarget) return;

  if (!inspectorLabel) {
    inspectorLabel = document.createElement('div');
    inspectorLabel.id = 'awel-inspector-label';
    inspectorLabel.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 999999;
      background: #18181b;
      border: 1px solid #3f3f46;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      font-weight: 500;
      padding: 3px 8px;
      border-radius: 4px;
      white-space: nowrap;
    `;
    document.body.appendChild(inspectorLabel);
  }

  inspectorLabel.textContent = getElementLabel(inspectorCurrentTarget);

  // Position just above the top-left of the highlight
  let top = rect.top - 24;
  let left = rect.left;

  // If it would go off-screen at the top, place it below the highlight instead
  if (top < 4) {
    top = rect.bottom + 4;
  }
  // Clamp left to viewport
  left = Math.max(4, left);

  inspectorLabel.style.top = `${top}px`;
  inspectorLabel.style.left = `${left}px`;
  inspectorLabel.style.display = 'block';
}

function handleInspectorMove(e: MouseEvent): void {
  if (!inspectorActive) return;
  const target = e.target as HTMLElement;
  if (!target || isAwelElement(target)) {
    if (highlightOverlay) highlightOverlay.style.display = 'none';
    if (inspectorLabel) inspectorLabel.style.display = 'none';
    return;
  }

  // Reset depth when the natural target changes
  if (target !== inspectorNaturalTarget) {
    inspectorDepthOffset = 0;
    inspectorWheelAccumulator = 0;
    inspectorNaturalTarget = target;
  }

  inspectorCurrentTarget = getAncestorAtDepth(target, inspectorDepthOffset);

  if (!highlightOverlay) {
    highlightOverlay = createBoxModelOverlay();
  }

  const rect = updateBoxModelOverlay(inspectorCurrentTarget, highlightOverlay);
  updateInspectorLabel(rect);
}

function handleInspectorWheel(e: WheelEvent): void {
  if (!inspectorActive || !inspectorNaturalTarget) return;

  e.preventDefault();

  inspectorWheelAccumulator += e.deltaY;

  // Only change depth once the accumulated delta crosses the threshold
  if (Math.abs(inspectorWheelAccumulator) < INSPECTOR_WHEEL_THRESHOLD) return;

  if (inspectorWheelAccumulator < 0) {
    // Scroll up -> go toward parent
    inspectorDepthOffset++;
  } else {
    // Scroll down -> go back toward child
    inspectorDepthOffset = Math.max(0, inspectorDepthOffset - 1);
  }

  inspectorWheelAccumulator = 0;

  inspectorCurrentTarget = getAncestorAtDepth(inspectorNaturalTarget, inspectorDepthOffset);

  if (!highlightOverlay) {
    highlightOverlay = createBoxModelOverlay();
  }

  const rect = updateBoxModelOverlay(inspectorCurrentTarget, highlightOverlay);
  updateInspectorLabel(rect);
}

function handleInspectorClick(e: MouseEvent): void {
  if (!inspectorActive) return;
  const target = (inspectorCurrentTarget || e.target) as HTMLElement;
  if (!target || isAwelElement(target)) return;

  e.preventDefault();
  e.stopPropagation();

  // Prevent hold-to-inspect keyup from deactivating after element selection
  holdInspectElementSelected = true;

  const attrSource = getSourceLocFromAttribute(target);
  const fiberSource = attrSource ? null : getSourceLocFromFiber(target);
  const source = attrSource || fiberSource;

  const attrComponent = getComponentFromAttribute(target);
  const component = attrComponent || getComponentFromFiber(target);

  const attrChain = getComponentChainFromAttributes(target);
  const componentChain = attrChain || getComponentChainFromFiber(target);

  const props = getFiberProps(target);

  // Collect HTML attributes of the selected tag (skip Awel injections)
  const attributes: Record<string, string> = {};
  for (const attr of Array.from(target.attributes)) {
    if (attr.name.startsWith('data-source-')) continue;
    attributes[attr.name] = attr.value.slice(0, 200);
  }

  const payload = {
    tag: target.tagName.toLowerCase(),
    component,
    source: source?.fileName || null,
    line: source?.line || null,
    column: source?.column || null,
    text: target.innerText?.slice(0, 100) || '',
    className: target.className || '',
    props,
    componentChain,
    attributes,
  };

  console.group('[Awel Inspector] Selected element');
  console.log('DOM element:', target);
  console.log('tag:', target.tagName.toLowerCase());
  console.log('data-source-loc:', target.getAttribute('data-source-loc'));
  console.log('data-source-component:', target.getAttribute('data-source-component'));
  console.log('attrSource:', attrSource);
  console.log('fiberSource:', fiberSource);
  console.log('attrComponent:', attrComponent);
  console.log('fiberComponent:', attrComponent ? '(skipped)' : getComponentFromFiber(target));
  console.log('resolved source:', source);
  console.log('resolved component:', component);
  console.log('componentChain:', componentChain);
  console.log('payload:', payload);
  console.groupEnd();

  // -- Attach mode: skip comment popup, POST with mode:'attach', deactivate --
  if (inspectorAttachMode) {
    inspectorAttachMode = false;
    const attachPayload = { ...payload, mode: 'attach' };

    fetch('/api/inspector/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attachPayload),
    }).catch(() => { });

    setInspectorActive(false);
    return;
  }

  // Keep a reference to the selected DOM element for hover-highlighting
  lastSelectedElement = target;

  // Store payload for when user submits a comment
  pendingInspectorPayload = payload;

  // Capture the element rect before deactivating inspector
  const targetRect = target.getBoundingClientRect();

  // Deactivate inspector (restores Awel UI) but keep highlight visible
  inspectorActive = false;
  const hostEl = document.getElementById('awel-host');
  const sidebarEl = document.getElementById('awel-sidebar');
  if (hostEl) hostEl.style.display = '';
  // Keep sidebar hidden while comment popup is open
  document.body.style.cursor = '';
  document.removeEventListener('mousemove', handleInspectorMove, true);
  document.removeEventListener('click', handleInspectorClick, true);
  document.removeEventListener('keydown', handleInspectorKeydown, true);
  document.removeEventListener('wheel', handleInspectorWheel, true);
  // Clean up depth navigation state
  inspectorDepthOffset = 0;
  inspectorWheelAccumulator = 0;
  inspectorNaturalTarget = null;
  inspectorCurrentTarget = null;
  if (inspectorLabel) {
    inspectorLabel.remove();
    inspectorLabel = null;
  }
  // Note: we intentionally do NOT remove highlightOverlay here

  // Build element description for the popup
  const displayName = `<${payload.tag}>`;
  const sourceFile = payload.source?.split('/').pop() || null;
  const fileLoc = sourceFile
    ? payload.line ? `${sourceFile}:${payload.line}` : sourceFile
    : null;

  // Show the comment popup next to the selected element
  showCommentPopup(targetRect, displayName, fileLoc);
}

function handleInspectorKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    setInspectorActive(false);
  }
}

// ─── Hold-to-inspect ──────────────────────────────────────────

export function handleHoldInspectKeydown(e: KeyboardEvent): void {
  // Activate inspector on Alt+Shift hold (Option+Shift on Mac)
  if (!e.altKey || !e.shiftKey) return;
  if (inspectorActive) return;

  // Skip if user is typing in an input field
  const active = document.activeElement;
  if (active && (
    active.tagName === 'INPUT' ||
    active.tagName === 'TEXTAREA' ||
    (active as HTMLElement).isContentEditable
  )) return;

  holdInspectActive = true;
  holdInspectElementSelected = false;
  setInspectorActive(true);
}

export function handleHoldInspectKeyup(e: KeyboardEvent): void {
  if (!holdInspectActive) return;

  // Deactivate when either Alt or Shift is released, unless an element was selected
  if (e.key === 'Alt' || e.key === 'Shift') {
    if (!holdInspectElementSelected) {
      setInspectorActive(false);
    }
    holdInspectActive = false;
    holdInspectElementSelected = false;
  }
}

export function handleHoldInspectBlur(): void {
  // Clean up if user Alt-Tabs away during hold
  if (holdInspectActive) {
    setInspectorActive(false);
    holdInspectActive = false;
    holdInspectElementSelected = false;
  }
}

// ─── Toast ────────────────────────────────────────────────────

function showInspectorToast(): void {
  if (inspectorToast) return;
  inspectorToast = document.createElement('div');
  inspectorToast.id = 'awel-inspector-toast';
  inspectorToast.textContent = 'Click to select \u00B7 Scroll to change depth \u00B7 Esc to cancel';
  inspectorToast.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%) translateY(-4px);
    z-index: 999999;
    pointer-events: none;
    background: #18181b;
    border: 1px solid #3f3f46;
    color: #d1d5db;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    opacity: 0;
    transition: opacity 0.15s ease, transform 0.15s ease;
  `;
  document.body.appendChild(inspectorToast);
  requestAnimationFrame(() => {
    if (inspectorToast) {
      inspectorToast.style.opacity = '1';
      inspectorToast.style.transform = 'translateX(-50%) translateY(0)';
    }
  });
  setTimeout(() => {
    if (!inspectorToast) return;
    const el = inspectorToast;
    inspectorToast = null;
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-4px)';
    setTimeout(() => el.remove(), 150);
  }, 5000);
}

// ─── Comment Popup ────────────────────────────────────────────

function showCommentPopup(targetRect: DOMRect, displayName: string, fileLoc: string | null): void {
  removeCommentPopup();

  const lang = navigator.language.startsWith('zh') ? 'zh' : 'en';
  const theme = resolvedTheme;
  const params = new URLSearchParams({ name: displayName, lang, theme });
  if (fileLoc) params.set('file', fileLoc);

  const iframe = document.createElement('iframe');
  iframe.src = `http://localhost:${AWEL_PORT}/_awel/comment-popup?${params.toString()}`;
  iframe.id = 'awel-comment-popup';

  const width = 300;
  const height = 180;
  const gap = 8;

  // Smart positioning: prefer right, fall back to left, then below
  let top = targetRect.top;
  let left = targetRect.right + gap;

  if (left + width > window.innerWidth) {
    left = targetRect.left - width - gap;
  }
  if (left < 0) {
    left = targetRect.left;
    top = targetRect.bottom + gap;
  }

  // Clamp to viewport
  left = Math.max(4, Math.min(left, window.innerWidth - width - 4));
  top = Math.max(4, Math.min(top, window.innerHeight - height - 4));

  const isDark = theme === 'dark';
  iframe.style.cssText = `
    position: fixed;
    top: ${top}px;
    left: ${left}px;
    width: ${width}px;
    height: ${height}px;
    z-index: 999999;
    border: 1px solid ${isDark ? '#27272a' : '#d4d4d8'};
    border-radius: 10px;
    box-shadow: 0 8px 32px ${isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.15)'};
    background: ${isDark ? '#18181b' : '#ffffff'};
  `;

  commentPopupEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      cancelCommentPopup();
    }
  };
  document.addEventListener('keydown', commentPopupEscHandler, true);

  commentPopupIframe = iframe;
  document.body.appendChild(iframe);

  // Close when clicking outside the popup
  commentPopupClickOutsideHandler = (e: MouseEvent) => {
    if (commentPopupIframe && e.target !== commentPopupIframe) {
      cancelCommentPopup();
    }
  };
  // Use setTimeout so the current click event doesn't immediately trigger it
  setTimeout(() => {
    if (commentPopupClickOutsideHandler) {
      document.addEventListener('mousedown', commentPopupClickOutsideHandler, true);
    }
  }, 0);
}

export function removeCommentPopup(): void {
  if (commentPopupIframe) {
    commentPopupIframe.remove();
    commentPopupIframe = null;
  }
  if (commentPopupEscHandler) {
    document.removeEventListener('keydown', commentPopupEscHandler, true);
    commentPopupEscHandler = null;
  }
  if (commentPopupClickOutsideHandler) {
    document.removeEventListener('mousedown', commentPopupClickOutsideHandler, true);
    commentPopupClickOutsideHandler = null;
  }
  // Remove the highlight overlay that was kept visible during popup
  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }
}

/** Cancel the comment popup and restore sidebar if it was open before inspector. */
export function cancelCommentPopup(): void {
  removeCommentPopup();
  pendingInspectorPayload = null;
  lastSelectedElement = null;
  // Restore sidebar if it was open before inspector was activated
  const sidebarEl = document.getElementById('awel-sidebar');
  if (sidebarEl && sidebarWasOpen) sidebarEl.style.display = '';
}

// ─── Hover Highlight (triggered from dashboard pill) ──────────

export function showHoverHighlight(): void {
  if (!lastSelectedElement || !document.body.contains(lastSelectedElement)) return;

  if (!hoverHighlightOverlay) {
    hoverHighlightOverlay = createBoxModelOverlay('awel-hover-highlight');
  }

  updateBoxModelOverlay(lastSelectedElement, hoverHighlightOverlay);
}

export function hideHoverHighlight(): void {
  if (hoverHighlightOverlay) {
    hoverHighlightOverlay.remove();
    hoverHighlightOverlay = null;
  }
}

// ─── Core: setInspectorActive ─────────────────────────────────

let comparisonOverlayWasVisible = false;

export function setInspectorActive(active: boolean): void {
  inspectorActive = active;

  const hostEl = document.getElementById('awel-host');
  const sidebarEl = document.getElementById('awel-sidebar');
  const comparisonHostEl = document.getElementById('awel-comparison-host');
  const comparisonOverlayEl = document.getElementById('awel-comparison-overlay');

  if (active) {
    // Remember whether sidebar/overlay was open so we can restore it
    sidebarWasOpen = isSidebarVisible();
    comparisonOverlayWasVisible = !!(comparisonOverlayEl && comparisonOverlayEl.style.display !== 'none' && comparisonOverlayEl.classList.contains('visible'));

    // Hide Awel UI so user can click any element
    if (hostEl) hostEl.style.display = 'none';
    if (sidebarEl) sidebarEl.style.display = 'none';
    if (comparisonHostEl) comparisonHostEl.style.display = 'none';
    if (comparisonOverlayEl) {
      comparisonOverlayEl.classList.remove('visible');
      comparisonOverlayEl.style.display = 'none';
    }

    showInspectorToast();

    document.body.style.cursor = 'crosshair';
    document.addEventListener('mousemove', handleInspectorMove, true);
    document.addEventListener('click', handleInspectorClick, true);
    document.addEventListener('keydown', handleInspectorKeydown, true);
    document.addEventListener('wheel', handleInspectorWheel, { passive: false, capture: true });
  } else {
    // Show Awel UI again
    if (hostEl) hostEl.style.display = '';
    if (sidebarEl && sidebarWasOpen) sidebarEl.style.display = '';
    if (comparisonHostEl) comparisonHostEl.style.display = '';
    if (comparisonOverlayEl && comparisonOverlayWasVisible) {
      comparisonOverlayEl.style.display = '';
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          comparisonOverlayEl.classList.add('visible');
        });
      });
    }

    document.body.style.cursor = '';
    document.removeEventListener('mousemove', handleInspectorMove, true);
    document.removeEventListener('click', handleInspectorClick, true);
    document.removeEventListener('keydown', handleInspectorKeydown, true);
    document.removeEventListener('wheel', handleInspectorWheel, true);

    // Clean up depth navigation state
    inspectorDepthOffset = 0;
    inspectorNaturalTarget = null;
    inspectorCurrentTarget = null;
    if (inspectorLabel) {
      inspectorLabel.remove();
      inspectorLabel = null;
    }

    if (highlightOverlay) {
      highlightOverlay.remove();
      highlightOverlay = null;
    }

    // Reset hold-to-inspect and attach-mode state
    holdInspectActive = false;
    holdInspectElementSelected = false;
    inspectorAttachMode = false;
  }
}
