/**
 * Universal Web API Fetch Client.
 * Automatically injects authentication tokens and credentials into fetch requests.
 */
export async function apiFetch(input, init = {}) {
  const webInit = { ...init }
  webInit.credentials = webInit.credentials || 'include'

  try {
    const token = localStorage.getItem('sma_auth_token')
    if (token) {
      const headers = new Headers(webInit.headers || {})
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      webInit.headers = headers
    }
  } catch {}

  const rawFetch = (typeof window !== 'undefined' && window._rawFetch)
    ? window._rawFetch
    : (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch)

  return rawFetch(input, webInit)
}
