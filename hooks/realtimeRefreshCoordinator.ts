/**
 * Coalesces all realtime-triggered router.refresh() calls into one shared
 * debounce, and skips work while the tab is hidden (flushes on visible).
 */

type RefreshRouter = { refresh: () => void }

let sharedTimer: ReturnType<typeof setTimeout> | null = null
let pendingWhileHidden = false
let boundRouter: RefreshRouter | null = null
let visibilityBound = false

const DEFAULT_DEBOUNCE_MS = 600

function flushRefresh() {
  sharedTimer = null
  pendingWhileHidden = false
  boundRouter?.refresh()
}

function ensureVisibilityListener() {
  if (visibilityBound || typeof document === 'undefined') return
  visibilityBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (!pendingWhileHidden) return
    if (sharedTimer) clearTimeout(sharedTimer)
    sharedTimer = setTimeout(flushRefresh, 100)
  })
}

/**
 * Schedule a single shared RSC refresh. Multiple callers within the debounce
 * window collapse into one refresh.
 */
export function scheduleRealtimeRouterRefresh(
  router: RefreshRouter,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): void {
  boundRouter = router
  ensureVisibilityListener()

  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    pendingWhileHidden = true
    if (sharedTimer) {
      clearTimeout(sharedTimer)
      sharedTimer = null
    }
    return
  }

  pendingWhileHidden = false
  if (sharedTimer) clearTimeout(sharedTimer)
  sharedTimer = setTimeout(flushRefresh, debounceMs)
}

export const REALTIME_REFRESH_DEBOUNCE_MS = DEFAULT_DEBOUNCE_MS
