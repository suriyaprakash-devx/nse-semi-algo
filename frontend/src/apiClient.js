import { Capacitor, CapacitorHttp } from '@capacitor/core'

/**
 * Universal API Fetch Client for Web & Android Native.
 * On Native Android (Capacitor), routes network requests via CapacitorHttp native Java client.
 * This completely eliminates browser WebView CORS restrictions (disallowed CORS origin)
 * and bypasses mobile browser security blocks.
 */
export async function apiFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : (input?.url || String(input))

  // If running inside Capacitor Native Android/iOS
  if (Capacitor.isNativePlatform()) {
    const method = (init.method || 'GET').toUpperCase()

    // Normalize headers to a plain object
    const headers = {}
    if (init.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((val, key) => {
          headers[key] = val
        })
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => {
          headers[k] = v
        })
      } else if (typeof init.headers === 'object') {
        Object.assign(headers, init.headers)
      }
    }

    // Attach Authorization header if session token exists in localStorage
    try {
      const token = localStorage.getItem('sma_auth_token')
      if (token && !headers['Authorization'] && !headers['authorization']) {
        headers['Authorization'] = `Bearer ${token}`
      }
    } catch {}

    // Explicitly delete browser Origin & Referer headers so remote backend CORS never rejects the request
    delete headers['Origin']
    delete headers['origin']
    delete headers['Referer']
    delete headers['referer']

    let data = init.body
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        // Plain string body (non-JSON)
      }
    }

    // Handle AbortSignal if caller passed one
    let abortListener = null
    let aborted = false
    if (init.signal) {
      if (init.signal.aborted) {
        const err = new Error('The user aborted a request.')
        err.name = 'AbortError'
        throw err
      }
      abortListener = () => {
        aborted = true
      }
      init.signal.addEventListener('abort', abortListener)
    }

    try {
      const response = await CapacitorHttp.request({
        url,
        method,
        headers,
        data,
        connectTimeout: 25000,
        readTimeout: 35000,
      })

      if (aborted || (init.signal && init.signal.aborted)) {
        const err = new Error('The user aborted a request.')
        err.name = 'AbortError'
        throw err
      }

      const status = response.status
      const isOk = status >= 200 && status < 300
      const respData = response.data

      return {
        ok: isOk,
        status,
        statusText: isOk ? 'OK' : `Status ${status}`,
        headers: new Headers(response.headers || {}),
        json: async () => (typeof respData === 'string' ? JSON.parse(respData) : respData),
        text: async () => (typeof respData === 'string' ? respData : JSON.stringify(respData)),
        data: respData
      }
    } catch (err) {
      if (aborted || (init.signal && init.signal.aborted)) {
        const abortErr = new Error('The user aborted a request.')
        abortErr.name = 'AbortError'
        throw abortErr
      }
      console.error(`Native API fetch failed [${method} ${url}]:`, err)
      throw err
    } finally {
      if (init.signal && abortListener) {
        init.signal.removeEventListener('abort', abortListener)
      }
    }
  }

  // Web Browser fallback: ALWAYS invoke un-proxied native fetch to prevent recursive call loops
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
