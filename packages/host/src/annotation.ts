// ─── Screenshot Annotation ────────────────────────────────────

import { toPng } from 'html-to-image';
import { isAwelElement } from './state.js';
import { isSidebarVisible, openOverlay } from './overlay.js';

// ─── State ────────────────────────────────────────────────────

let annotationOverlay: HTMLDivElement | null = null;
let annotationCanvas: HTMLCanvasElement | null = null;
let annotationCtx: CanvasRenderingContext2D | null = null;
let annotationBaseImage: HTMLImageElement | null = null;
let annotationCurrentTool: 'arrow' | 'line' | 'circle' | 'rectangle' | 'triangle' | 'text' = 'arrow';
let annotationColor = '#ef4444';
let annotationIsDrawing = false;
let annotationStartX = 0;
let annotationStartY = 0;
let annotationSnapshots: ImageData[] = [];
let annotationTextInput: HTMLInputElement | null = null;

// ─── Entry Point ──────────────────────────────────────────────

export function startScreenshotAnnotation(): void {
  // Hide all Awel UI
  const hostEl = document.getElementById('awel-host');
  const sidebarEl = document.getElementById('awel-sidebar');
  if (hostEl) hostEl.style.display = 'none';
  if (sidebarEl) sidebarEl.style.display = 'none';

  // Wait for render, then capture
  setTimeout(() => {
    toPng(document.body, {
      cacheBust: true,
      pixelRatio: window.devicePixelRatio,
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true;
        const id = node.id;
        return id !== 'awel-host' && id !== 'awel-sidebar';
      },
    }).then((dataUrl) => {
      const img = new Image();
      img.onload = () => {
        showAnnotationOverlay(dataUrl, img.naturalWidth, img.naturalHeight);
      };
      img.src = dataUrl;
    }).catch((err) => {
      console.error('[Awel] Screenshot capture failed:', err);
      // Restore UI on failure
      if (hostEl) hostEl.style.display = '';
      if (sidebarEl) sidebarEl.style.display = '';
    });
  }, 100);
}

// ─── Overlay ──────────────────────────────────────────────────

function showAnnotationOverlay(dataUrl: string, imgWidth: number, imgHeight: number): void {
  annotationOverlay = document.createElement('div');
  annotationOverlay.id = 'awel-annotation-overlay';
  annotationOverlay.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 999999;
    background: rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Toolbar
  const toolbar = createAnnotationToolbar();
  annotationOverlay.appendChild(toolbar);

  // Container for image + canvas
  const container = document.createElement('div');
  container.style.cssText = `
    position: relative;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 80px);
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Scale to fit viewport
  const vw = window.innerWidth - 48;
  const vh = window.innerHeight - 80;
  const scale = Math.min(1, vw / imgWidth, vh / imgHeight);
  const displayW = Math.round(imgWidth * scale);
  const displayH = Math.round(imgHeight * scale);

  // Base image
  annotationBaseImage = document.createElement('img');
  annotationBaseImage.src = dataUrl;
  annotationBaseImage.style.cssText = `
    width: ${displayW}px;
    height: ${displayH}px;
    border-radius: 8px;
    pointer-events: none;
    user-select: none;
  `;
  container.appendChild(annotationBaseImage);

  // Drawing canvas
  annotationCanvas = document.createElement('canvas');
  annotationCanvas.width = displayW * window.devicePixelRatio;
  annotationCanvas.height = displayH * window.devicePixelRatio;
  annotationCanvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${displayW}px;
    height: ${displayH}px;
    border-radius: 8px;
    cursor: crosshair;
  `;
  annotationCtx = annotationCanvas.getContext('2d')!;
  annotationCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  annotationCtx.lineCap = 'round';
  annotationCtx.lineJoin = 'round';

  annotationCanvas.addEventListener('mousedown', handleAnnotationMouseDown);
  annotationCanvas.addEventListener('mousemove', handleAnnotationMouseMove);
  annotationCanvas.addEventListener('mouseup', handleAnnotationMouseUp);

  container.appendChild(annotationCanvas);
  annotationOverlay.appendChild(container);
  document.body.appendChild(annotationOverlay);

  // Reset state
  annotationSnapshots = [];
  annotationIsDrawing = false;
  annotationCurrentTool = 'arrow';
  annotationColor = '#ef4444';

  // Escape to cancel
  document.addEventListener('keydown', handleAnnotationKeydown, true);
}

function handleAnnotationKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    if (annotationTextInput) {
      annotationTextInput.remove();
      annotationTextInput = null;
    } else {
      cleanupAnnotationOverlay();
    }
  }
}

// ─── Toolbar ──────────────────────────────────────────────────

function createAnnotationToolbar(): HTMLDivElement {
  const toolbar = document.createElement('div');
  toolbar.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 10px;
    margin-bottom: 8px;
    background: #18181b;
    border: 1px solid #3f3f46;
    border-radius: 10px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  `;

  const btnStyle = (active = false) => `
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    background: ${active ? '#3f3f46' : 'transparent'};
    color: ${active ? '#fafafa' : '#a1a1aa'};
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    padding: 0;
  `;

  type AnnotationTool = typeof annotationCurrentTool;
  const tools: Array<{ name: AnnotationTool; icon: string; title: string }> = [
    { name: 'arrow', title: 'Arrow', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="19" x2="19" y2="5"/><polyline points="10 5 19 5 19 14"/></svg>' },
    { name: 'line', title: 'Line', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/></svg>' },
    { name: 'circle', title: 'Circle', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="8"/></svg>' },
    { name: 'rectangle', title: 'Rectangle', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>' },
    { name: 'triangle', title: 'Triangle', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 3 22 21 2 21"/></svg>' },
    { name: 'text', title: 'Text', icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg>' },
  ];

  const toolButtons: HTMLButtonElement[] = [];

  tools.forEach((tool) => {
    const btn = document.createElement('button');
    btn.innerHTML = tool.icon;
    btn.title = tool.title;
    btn.style.cssText = btnStyle(tool.name === annotationCurrentTool);
    btn.addEventListener('mouseenter', () => { if (annotationCurrentTool !== tool.name) btn.style.background = '#27272a'; });
    btn.addEventListener('mouseleave', () => { if (annotationCurrentTool !== tool.name) btn.style.background = 'transparent'; });
    btn.addEventListener('click', () => {
      annotationCurrentTool = tool.name;
      toolButtons.forEach((b, i) => {
        const isActive = tools[i].name === tool.name;
        b.style.background = isActive ? '#3f3f46' : 'transparent';
        b.style.color = isActive ? '#fafafa' : '#a1a1aa';
      });
    });
    toolButtons.push(btn);
    toolbar.appendChild(btn);
  });

  // Separator
  const sep1 = document.createElement('div');
  sep1.style.cssText = 'width: 1px; height: 20px; background: #3f3f46; margin: 0 4px;';
  toolbar.appendChild(sep1);

  // Color dots
  const colors = ['#ef4444', '#3b82f6', '#22c55e', '#fafafa', '#eab308'];
  const colorDots: HTMLButtonElement[] = [];
  colors.forEach((color) => {
    const dot = document.createElement('button');
    dot.style.cssText = `
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid ${color === annotationColor ? '#fafafa' : 'transparent'};
      background: ${color};
      cursor: pointer;
      padding: 0;
      transition: border-color 0.1s;
    `;
    dot.addEventListener('click', () => {
      annotationColor = color;
      colorDots.forEach((d, i) => {
        d.style.borderColor = colors[i] === color ? '#fafafa' : 'transparent';
      });
    });
    colorDots.push(dot);
    toolbar.appendChild(dot);
  });

  // Separator
  const sep2 = document.createElement('div');
  sep2.style.cssText = 'width: 1px; height: 20px; background: #3f3f46; margin: 0 4px;';
  toolbar.appendChild(sep2);

  // Undo button
  const undoBtn = document.createElement('button');
  undoBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';
  undoBtn.title = 'Undo';
  undoBtn.style.cssText = btnStyle();
  undoBtn.addEventListener('mouseenter', () => { undoBtn.style.background = '#27272a'; });
  undoBtn.addEventListener('mouseleave', () => { undoBtn.style.background = 'transparent'; });
  undoBtn.addEventListener('click', () => {
    if (annotationSnapshots.length > 0 && annotationCtx) {
      const snapshot = annotationSnapshots.pop()!;
      annotationCtx.putImageData(snapshot, 0, 0);
    }
  });
  toolbar.appendChild(undoBtn);

  // Separator
  const sep3 = document.createElement('div');
  sep3.style.cssText = 'width: 1px; height: 20px; background: #3f3f46; margin: 0 4px;';
  toolbar.appendChild(sep3);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding: 4px 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #a1a1aa;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
  `;
  cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = '#27272a'; });
  cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = 'transparent'; });
  cancelBtn.addEventListener('click', cleanupAnnotationOverlay);
  toolbar.appendChild(cancelBtn);

  // Done button
  const doneBtn = document.createElement('button');
  doneBtn.textContent = 'Done';
  doneBtn.style.cssText = `
    padding: 4px 12px;
    border: none;
    border-radius: 6px;
    background: #e4e4e7;
    color: #18181b;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  `;
  doneBtn.addEventListener('mouseenter', () => { doneBtn.style.background = '#fafafa'; });
  doneBtn.addEventListener('mouseleave', () => { doneBtn.style.background = '#e4e4e7'; });
  doneBtn.addEventListener('click', finishAnnotation);
  toolbar.appendChild(doneBtn);

  return toolbar;
}

// ─── Canvas Mouse Handlers ────────────────────────────────────

function getCanvasCoords(e: MouseEvent): { x: number; y: number } {
  const rect = annotationCanvas!.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function handleAnnotationMouseDown(e: MouseEvent): void {
  if (!annotationCtx || !annotationCanvas) return;

  if (annotationCurrentTool === 'text') {
    const { x, y } = getCanvasCoords(e);
    showAnnotationTextInput(x, y);
    return;
  }

  annotationIsDrawing = true;
  const { x, y } = getCanvasCoords(e);
  annotationStartX = x;
  annotationStartY = y;

  // Save snapshot for preview restore and undo
  const snapshot = annotationCtx.getImageData(
    0, 0,
    annotationCanvas.width,
    annotationCanvas.height
  );
  annotationSnapshots.push(snapshot);
}

function handleAnnotationMouseMove(e: MouseEvent): void {
  if (!annotationIsDrawing || !annotationCtx || !annotationCanvas) return;

  const { x, y } = getCanvasCoords(e);

  // Restore to snapshot for live preview
  if (annotationSnapshots.length > 0) {
    annotationCtx.putImageData(annotationSnapshots[annotationSnapshots.length - 1], 0, 0);
  }

  annotationCtx.strokeStyle = annotationColor;
  annotationCtx.lineWidth = 2;
  annotationCtx.fillStyle = annotationColor;

  switch (annotationCurrentTool) {
    case 'arrow':
      drawArrow(annotationCtx, annotationStartX, annotationStartY, x, y);
      break;
    case 'line':
      drawLine(annotationCtx, annotationStartX, annotationStartY, x, y);
      break;
    case 'circle':
      drawEllipse(annotationCtx, annotationStartX, annotationStartY, x, y);
      break;
    case 'rectangle':
      drawRectangle(annotationCtx, annotationStartX, annotationStartY, x, y);
      break;
    case 'triangle':
      drawTriangle(annotationCtx, annotationStartX, annotationStartY, x, y);
      break;
  }
}

function handleAnnotationMouseUp(_e: MouseEvent): void {
  annotationIsDrawing = false;
}

// ─── Shape Drawing ────────────────────────────────────────────

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const headLen = 12;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawRectangle(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  if (w < 1 || h < 1) return;

  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.stroke();
}

function drawEllipse(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const rx = Math.abs(x2 - x1) / 2;
  const ry = Math.abs(y2 - y1) / 2;
  if (rx < 1 || ry < 1) return;

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTriangle(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const cx = (x1 + x2) / 2;
  ctx.beginPath();
  ctx.moveTo(cx, y1);           // top center
  ctx.lineTo(x2, y2);           // bottom right
  ctx.lineTo(x1, y2);           // bottom left
  ctx.closePath();
  ctx.stroke();
}

// ─── Text Tool ────────────────────────────────────────────────

function showAnnotationTextInput(x: number, y: number): void {
  if (annotationTextInput) {
    annotationTextInput.remove();
    annotationTextInput = null;
  }
  if (!annotationOverlay || !annotationCanvas) return;

  const canvasRect = annotationCanvas.getBoundingClientRect();

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type text...';
  input.style.cssText = `
    position: fixed;
    top: ${canvasRect.top + y}px;
    left: ${canvasRect.left + x}px;
    background: rgba(24, 24, 27, 0.9);
    border: 1px solid #3f3f46;
    border-radius: 4px;
    color: ${annotationColor};
    font-size: 16px;
    font-weight: 600;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 4px 8px;
    outline: none;
    z-index: 1000000;
    min-width: 120px;
  `;

  const textColor = annotationColor;
  const textX = x;
  const textY = y;

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const text = input.value.trim();
      if (text && annotationCtx && annotationCanvas) {
        // Save undo snapshot
        const snapshot = annotationCtx.getImageData(0, 0, annotationCanvas.width, annotationCanvas.height);
        annotationSnapshots.push(snapshot);

        annotationCtx.fillStyle = textColor;
        annotationCtx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        annotationCtx.fillText(text, textX, textY + 16);
      }
      input.remove();
      annotationTextInput = null;
    }
    if (e.key === 'Escape') {
      input.remove();
      annotationTextInput = null;
    }
  });

  annotationOverlay.appendChild(input);
  annotationTextInput = input;
  input.focus();
}

// ─── Finish & Cleanup ─────────────────────────────────────────

function finishAnnotation(): void {
  if (!annotationBaseImage || !annotationCanvas) {
    cleanupAnnotationOverlay();
    return;
  }

  // Composite base image + annotations onto a final canvas
  const finalCanvas = document.createElement('canvas');
  const displayW = annotationBaseImage.naturalWidth || annotationBaseImage.width;
  const displayH = annotationBaseImage.naturalHeight || annotationBaseImage.height;
  finalCanvas.width = displayW;
  finalCanvas.height = displayH;
  const fCtx = finalCanvas.getContext('2d')!;

  // Draw the base screenshot
  fCtx.drawImage(annotationBaseImage, 0, 0, displayW, displayH);

  // Draw annotations scaled from the annotation canvas
  fCtx.drawImage(annotationCanvas, 0, 0, displayW, displayH);

  const finalDataUrl = finalCanvas.toDataURL('image/png');

  // Open sidebar if not already open
  if (!isSidebarVisible()) {
    openOverlay();
  }

  // Wait a tick for the iframe to be available, then send
  setTimeout(() => {
    const sidebar = document.getElementById('awel-sidebar');
    if (sidebar) {
      const iframe = sidebar.querySelector('iframe');
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'AWEL_SCREENSHOT_ANNOTATION',
          dataUrl: finalDataUrl,
        }, '*');
      }
    }
    cleanupAnnotationOverlay();
  }, 300);
}

function cleanupAnnotationOverlay(): void {
  document.removeEventListener('keydown', handleAnnotationKeydown, true);

  if (annotationTextInput) {
    annotationTextInput.remove();
    annotationTextInput = null;
  }
  if (annotationOverlay) {
    annotationOverlay.remove();
    annotationOverlay = null;
  }

  annotationCanvas = null;
  annotationCtx = null;
  annotationBaseImage = null;
  annotationSnapshots = [];
  annotationIsDrawing = false;

  // Restore Awel UI
  const hostEl = document.getElementById('awel-host');
  const sidebarEl = document.getElementById('awel-sidebar');
  if (hostEl) hostEl.style.display = '';
  if (sidebarEl) sidebarEl.style.display = '';
}
