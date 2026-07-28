/** Helpers for nhx CLI browser login callback. */

const STORAGE_KEY = 'nhx_callback'

export function captureNhxCallbackFromUrl(): void {
  const q = new URLSearchParams(window.location.search)
  const cb = q.get('nhx_callback')
  if (cb && isSafeNhxCallback(cb)) {
    sessionStorage.setItem(STORAGE_KEY, cb)
  }
}

export function getNhxCallback(): string | null {
  captureNhxCallbackFromUrl()
  const cb = sessionStorage.getItem(STORAGE_KEY)
  if (cb && isSafeNhxCallback(cb)) return cb
  return null
}

export function clearNhxCallback(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

export function isSafeNhxCallback(cb: string): boolean {
  try {
    const u = new URL(cb)
    return (
      (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === '127.0.0.1' || u.hostname === 'localhost') &&
      u.pathname.includes('callback')
    )
  } catch {
    return false
  }
}

/** If nhx CLI callback is pending, redirect token to local callback URL. */
export function redirectToNhxCallback(token: string, username: string): boolean {
  const cb = getNhxCallback()
  if (!cb) return false
  const u = new URL(cb)
  u.searchParams.set('token', token)
  u.searchParams.set('username', username)
  clearNhxCallback()
  window.location.href = u.toString()
  return true
}

export function registerLinkWithCallback(path: string): string {
  const cb = getNhxCallback()
  if (!cb) return path
  return `${path}?nhx_callback=${encodeURIComponent(cb)}`
}
