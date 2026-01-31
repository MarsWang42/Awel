// ─── Page Context Capture & Broadcast ─────────────────────────

export interface PageContext {
  url: string;
  title: string;
  routeComponent?: string;
}

// ─── State ────────────────────────────────────────────────────

let currentPageContext: PageContext | null = null;

// ─── Functions ────────────────────────────────────────────────

export function broadcastPageContext(): void {
  if (!currentPageContext) return;
  const sidebar = document.getElementById('awel-sidebar');
  if (!sidebar) return;
  const iframe = sidebar.querySelector('iframe');
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage({ type: 'AWEL_PAGE_CONTEXT', context: currentPageContext }, '*');
}

/**
 * Walk the React fiber tree from the app root to find the first user component.
 * Reuses the same heuristic as inspector.ts: PascalCase name + _debugSource
 * pointing to a non-node_modules file.
 */
function findRouteComponent(): string | undefined {
  const root = document.getElementById('__next') || document.getElementById('root');
  if (!root) return undefined;

  // Find the fiber key on the root DOM node
  let fiberKey: string | undefined;
  for (const key of Object.keys(root)) {
    if (key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')) {
      fiberKey = key;
      break;
    }
  }
  if (!fiberKey) return undefined;

  let fiber = (root as Record<string, unknown>)[fiberKey] as Record<string, unknown> | null;
  while (fiber) {
    if (typeof fiber.type === 'function') {
      const fn = fiber.type as { displayName?: string; name?: string };
      const name = fn.displayName || fn.name;
      if (name && /^[A-Z][a-zA-Z0-9]*$/.test(name)) {
        const src = fiber._debugSource as { fileName?: string } | undefined;
        if (src?.fileName && !/node_modules/.test(src.fileName)) {
          return name;
        }
      }
    }
    // Walk down via child, not up via return
    fiber = (fiber.child as Record<string, unknown> | null);
  }
  return undefined;
}

function capturePageContext(): void {
  currentPageContext = {
    url: location.pathname + location.search,
    title: document.title,
    routeComponent: findRouteComponent(),
  };
}

// ─── Setup ────────────────────────────────────────────────────

export function setupPageContextTracking(): void {
  capturePageContext();

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  function onNavigation() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      capturePageContext();
      broadcastPageContext();
    }, 100);
  }

  // Monkey-patch pushState / replaceState for SPA navigation
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    originalPushState(...args);
    onNavigation();
  };

  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    originalReplaceState(...args);
    onNavigation();
  };

  // Back/forward navigation
  window.addEventListener('popstate', onNavigation);
}
