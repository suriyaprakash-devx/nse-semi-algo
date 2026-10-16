import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { apiFetch } from './apiClient'

import { Capacitor } from '@capacitor/core'

// Preserve raw browser fetch before any proxying
if (typeof window !== 'undefined' && !window._rawFetch) {
  const rawFetch = window.fetch.bind(window)
  window._rawFetch = rawFetch

  // ONLY on Native Android / iOS, proxy network fetch through apiFetch/CapacitorHttp to eliminate CORS
  if (Capacitor.isNativePlatform()) {
    window.fetch = (input, init) => {
      const urlStr = typeof input === 'string' ? input : (input?.url || '')
      // Allow local bundled web assets to be fetched normally
      if (urlStr.startsWith('/') || urlStr.startsWith('./') || urlStr.startsWith('blob:') || urlStr.startsWith('data:')) {
        return rawFetch(input, init)
      }
      return apiFetch(input, init)
    }
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

