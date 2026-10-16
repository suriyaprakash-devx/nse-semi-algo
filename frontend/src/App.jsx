import React, { useState, useEffect, useMemo } from 'react'
import {
  TrendingUp,
  TrendingDown,
  Play,
  RotateCw,
  LogOut,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Layers,
  ArrowUpDown,
  Download,
  Key,
  Eye,
  EyeOff,
  ChevronRight,
  ExternalLink,
  Sparkles,
  BarChart3,
  Microscope,
  Award,
  AlertTriangle,
  Check,
  X,
  Zap,
  Maximize2,
  Sun,
  Moon,
  Square,
  Server,
  Wifi,
  WifiOff,
  User,
  Lock
} from 'lucide-react'
import './App.css'
import AlgoSignals from './AlgoSignals'
import BestStocksRadar from './BestStocksRadar'
import { apiFetch } from './apiClient'

// Default Production Server URL
const DEFAULT_SERVER_URL = 'https://nse-semi-algo-1.onrender.com'

// Resolve API Base URL with priority: Custom runtime override > VITE_API_BASE_URL > VITE_API_URL > Default Production URL
const getInitialApiBase = () => {
  try {
    const custom = typeof window !== 'undefined' ? localStorage.getItem('upstox_custom_api_url') : null
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '')
    }
  } catch {}
  const envUrl = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || DEFAULT_SERVER_URL).trim()
  if (envUrl) {
    return (envUrl.startsWith('http') ? envUrl : `https://${envUrl}`).replace(/\/+$/, '')
  }
  return DEFAULT_SERVER_URL
}

export default function App() {
  const [apiBase, setApiBase] = useState(getInitialApiBase)
  const API_BASE = apiBase

  // Mobile / Server Configuration modal state
  const [showServerModal, setShowServerModal] = useState(false)
  const [serverUrlInput, setServerUrlInput] = useState(() => getInitialApiBase() || DEFAULT_SERVER_URL)
  const [serverTestStatus, setServerTestStatus] = useState(null) // null | 'testing' | 'success' | 'failed'
  const [serverTestError, setServerTestError] = useState(null)
  const [backendOffline, setBackendOffline] = useState(false)
  // Theme state: 'dark' (Black Obsidian Glass) vs 'light' (White Crystal Glass)
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('upstox_glass_theme') || 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('upstox_glass_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  // Navigation: 'scanner' (App 1) vs 'algo_signals' (App 2)
  const [activeApp, setActiveApp] = useState('scanner')

  const [authStatus, setAuthStatus] = useState({
    loading: true,
    authenticated: false,
    configured: true,
    user_id: null,
    user_name: null,
    message: null
  })

  // Single User Authentication state (username: suriyaprakash, password: master730)
  const [loginUsername, setLoginUsername] = useState('suriyaprakash')
  const [loginPassword, setLoginPassword] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loginError, setLoginError] = useState(null)

  // Scanner state (App 1)
  const [scanStatus, setScanStatus] = useState({
    status: 'idle',
    is_running: false,
    progress_message: 'Ready to scan.',
    stocks_scanned: 0,
    total_stocks: 0,
    signals_found: 0,
    error: null
  })

  const [results, setResults] = useState([])
  const [lastScanTime, setLastScanTime] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [signalFilter, setSignalFilter] = useState('ALL') // ALL, BULLISH, BEARISH, FRESH
  const [sortField, setSortField] = useState('Rank')
  const [sortDirection, setSortDirection] = useState('asc') // asc, desc
  const [selectedStock, setSelectedStock] = useState(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [errorMessage, setErrorMessage] = useState(null)
  const [successMessage, setSuccessMessage] = useState(null)

  // Real-time clock for telemetry
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const [algoSymbol, setAlgoSymbol] = useState('RELIANCE')

  const POPULAR_STOCKS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'SBIN', 'ITC', 'BHARTIARTL', 'LT', 'ICICIBANK']

  // Server connection handlers for Android & local/cloud testing
  const handleTestServerConnection = async (testUrl) => {
    setServerTestStatus('testing')
    setServerTestError(null)
    const cleanUrl = (testUrl || serverUrlInput || '').trim().replace(/\/+$/, '')
    if (!cleanUrl) {
      setServerTestStatus('failed')
      setServerTestError('Please enter a server URL (e.g. http://192.168.1.10:8000 or https://your-server.onrender.com)')
      return
    }
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      const res = await apiFetch(`${cleanUrl}/health`, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (res.ok) {
        setServerTestStatus('success')
        setBackendOffline(false)
      } else {
        setServerTestStatus('failed')
        setServerTestError(`Server responded with HTTP ${res.status}`)
      }
    } catch (err) {
      setServerTestStatus('failed')
      setServerTestError(
        err.name === 'AbortError'
          ? 'Connection timed out (30s). If using Render free tier, server was sleeping - please retry in 10 seconds.'
          : (err.message || 'Network error')
      )
    }
  }

  const handleSaveServerUrl = () => {
    const cleanUrl = serverUrlInput.trim().replace(/\/+$/, '')
    try {
      localStorage.setItem('upstox_custom_api_url', cleanUrl)
    } catch {}
    setApiBase(cleanUrl)
    setShowServerModal(false)
    setBackendOffline(false)
  }

  const handleResetServerUrl = () => {
    try {
      localStorage.removeItem('upstox_custom_api_url')
    } catch {}
    const envUrl = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || DEFAULT_SERVER_URL).trim()
    const defaultUrl = envUrl ? (envUrl.startsWith('http') ? envUrl : `https://${envUrl}`).replace(/\/+$/, '') : DEFAULT_SERVER_URL
    setServerUrlInput(defaultUrl)
    setApiBase(defaultUrl)
    setShowServerModal(false)
    setBackendOffline(false)
  }

  // Render Server API Configuration Modal (for mobile & dev)
  const renderServerModal = () => {
    if (!showServerModal) return null
    return (
      <div className="modal-backdrop" onClick={() => setShowServerModal(false)}>
        <div className="modal-card glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '490px', width: '92%' }}>
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Server size={18} style={{ color: 'var(--accent-cyan)' }} />
              <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>
                Backend API Server Settings
              </span>
            </div>
            <button
              className="btn-icon-subtle"
              onClick={() => setShowServerModal(false)}
              title="Close modal"
            >
              <X size={16} />
            </button>
          </div>

          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '10px' }}>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)', lineHeight: 1.5 }}>
              Configure the Python FastAPI backend URL for this web terminal.
            </div>

            <div className="token-input-container">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                <span>API BASE URL</span>
                <span className="font-mono" style={{ color: 'var(--accent-cyan)', fontSize: '0.7rem' }}>
                  {apiBase || '(Relative proxy)'}
                </span>
              </div>
              <input
                type="text"
                className="token-input"
                style={{ width: '100%', marginTop: '6px' }}
                placeholder="https://nse-semi-algo-1.onrender.com or http://192.168.1.15:8000"
                value={serverUrlInput}
                onChange={(e) => {
                  setServerUrlInput(e.target.value)
                  setServerTestStatus(null)
                  setServerTestError(null)
                }}
              />
            </div>

            {/* Status / Test feedback */}
            {serverTestStatus === 'testing' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--accent-cyan)' }}>
                <RotateCw className="animate-spin" size={13} />
                <span>Checking {serverUrlInput || 'server'}/health ...</span>
              </div>
            )}
            {serverTestStatus === 'success' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--bullish-text)' }}>
                <CheckCircle2 size={14} />
                <span>Backend reachable! Health check OK.</span>
              </div>
            )}
            {serverTestStatus === 'failed' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: 'var(--bearish-text)' }}>
                <AlertCircle size={14} />
                <span>{serverTestError || 'Could not connect. Check URL, port, and network.'}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResetServerUrl}
                style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                title="Reset to build environment default"
              >
                Reset Default
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleTestServerConnection(serverUrlInput)}
                  disabled={serverTestStatus === 'testing' || !serverUrlInput.trim()}
                  style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                >
                  Test Health
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveServerUrl}
                  style={{ fontSize: '0.78rem', padding: '6px 14px' }}
                >
                  Save & Connect
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Android Hardware & Gesture Back Button Handling
  useEffect(() => {
    let backHandle = null
    const registerBackButton = async () => {
      try {
        backHandle = await CapApp.addListener('backButton', () => {
          if (showServerModal) {
            setShowServerModal(false)
          } else if (activeApp !== 'scanner') {
            setActiveApp('scanner')
          } else {
            CapApp.exitApp()
          }
        })
      } catch (e) {
        // Safe fallback in standard web browser
      }
    }
    registerBackButton()
    return () => {
      if (backHandle && backHandle.remove) {
        backHandle.remove()
      }
    }
  }, [showServerModal, activeApp])


  // 1. Check Authentication Status on mount and whenever apiBase changes
  const checkAuth = async () => {
    try {
      const targetUrl = apiBase ? `${apiBase}/api/auth/status` : '/api/auth/status'
      const res = await apiFetch(targetUrl)
      if (!res.ok) {
        setAuthStatus(prev => ({ ...prev, loading: false, authenticated: false }))
        return
      }
      const data = await res.json()
      setBackendOffline(false)
      setAuthStatus({
        loading: false,
        authenticated: data.authenticated,
        configured: true,
        user_id: data.user_id,
        user_name: data.user_name,
        message: data.message
      })
      if (data.authenticated) {
        fetchResults()
      }
    } catch (err) {
      console.error('Failed to fetch auth status:', err)
      setBackendOffline(true)
      try {
        const token = localStorage.getItem('sma_auth_token')
        const user = localStorage.getItem('sma_user')
        if (token && user) {
          setAuthStatus({
            loading: false,
            authenticated: true,
            configured: true,
            user_id: user,
            user_name: user,
            message: 'Active session'
          })
          fetchResults()
        } else {
          setAuthStatus({
            loading: false,
            authenticated: false,
            configured: true,
            user_id: null,
            user_name: null,
            message: 'Could not connect to backend service.'
          })
        }
      } catch {
        setAuthStatus(prev => ({ ...prev, loading: false, authenticated: false }))
      }
    }
  }

  useEffect(() => {
    checkAuth()
  }, [apiBase])

  // 2. Fetch Latest Results (App 1)
  const fetchResults = async () => {
    setIsRefreshing(true)
    try {
      const res = await apiFetch(`${API_BASE}/api/scanner/results`)
      if (res.status === 401) {
        setAuthStatus(prev => ({ ...prev, authenticated: false, message: 'Session expired. Please sign in again.' }))
        return
      }
      if (!res.ok) return
      const data = await res.json()
      if (data && data.results) {
        setResults(data.results)
        setLastScanTime(new Date())
      }
    } catch (err) {
      console.error('Error fetching scanner results:', err)
    } finally {
      setIsRefreshing(false)
    }
  }

  // 3. Poll Scanner Status while running
  useEffect(() => {
    let intervalId = null
    if (scanStatus.is_running) {
      intervalId = setInterval(async () => {
        try {
          const res = await apiFetch(`${API_BASE}/api/scanner/status`)
          if (!res.ok) return
          const data = await res.json()
          setScanStatus(data)

          if (!data.is_running) {
            clearInterval(intervalId)
            fetchResults()
          }
        } catch (err) {
          console.error('Status poll error:', err)
        }
      }, 1000)
    }
    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [scanStatus.is_running])

  // 4. Trigger Scanner Run
  const handleRunScanner = async () => {
    setErrorMessage(null)
    setSuccessMessage(null)
    try {
      const res = await apiFetch(`${API_BASE}/api/scanner/run`, { method: 'POST' })
      if (res.status === 401) {
        setErrorMessage('Session expired. Please sign in again.')
        setAuthStatus(prev => ({ ...prev, authenticated: false }))
        return
      }
      if (res.status === 409) {
        setScanStatus(prev => ({ ...prev, is_running: true }))
        return
      }
      if (!res.ok) {
        let errDetail = 'Failed to trigger scan'
        try {
          const errorData = await res.json()
          errDetail = errorData.detail || errorData.message || errDetail
        } catch {
          const text = await res.text()
          errDetail = text || errDetail
        }
        throw new Error(errDetail)
      }
      setScanStatus(prev => ({
        ...prev,
        status: 'running',
        is_running: true,
        progress_message: 'Starting scan across NIFTY 100 & 200...',
        stocks_scanned: 0
      }))
    } catch (err) {
      setErrorMessage(err.message)
    }
  }

  // Trigger Scanner Stop
  const handleStopScanner = async () => {
    try {
      const res = await apiFetch(`${API_BASE}/api/scanner/stop`, { method: 'POST' })
      if (res.ok) {
        setSuccessMessage('Scan abort initiated.')
      } else {
        const err = await res.json().catch(() => ({}))
        setErrorMessage(err.message || 'Failed to stop scanner.')
      }
    } catch (err) {
      console.error('Failed to stop scanner:', err)
      setErrorMessage('Failed to send scanner stop request.')
    }
  }

  // 5. Single User Login Handler (suriyaprakash / master730)
  const handleLogin = async (e) => {
    if (e) e.preventDefault()
    const username = loginUsername.trim()
    const password = loginPassword.trim()

    if (!username || !password) {
      setLoginError('Please enter both username and password.')
      return
    }

    setIsLoggingIn(true)
    setLoginError(null)

    try {
      const res = await apiFetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Invalid username or password')
      }

      if (data.token) {
        try { localStorage.setItem('sma_auth_token', data.token) } catch {}
      }
      try { localStorage.setItem('sma_user', data.user_name || username) } catch {}

      setAuthStatus({
        loading: false,
        authenticated: true,
        configured: true,
        user_id: data.user_id || username,
        user_name: data.user_name || username,
        message: data.message
      })
      setSuccessMessage(`Welcome back, ${data.user_name || username}!`)
      fetchResults()
    } catch (err) {
      setLoginError(err.message || 'Login failed. Please verify credentials.')
    } finally {
      setIsLoggingIn(false)
    }
  }

  // 6. Logout Handler
  const handleLogout = async () => {
    try {
      await apiFetch(`${API_BASE}/api/auth/logout`, { method: 'POST' })
    } catch (err) {
      console.warn('Logout warning:', err)
    } finally {
      try {
        localStorage.removeItem('sma_auth_token')
        localStorage.removeItem('sma_user')
      } catch {}
      setAuthStatus({
        loading: false,
        authenticated: false,
        configured: true,
        user_id: null,
        user_name: null,
        message: 'Logged out successfully.'
      })
      setResults([])
    }
  }

  const navigateToAlgoSignals = (symbol) => {
    setAlgoSymbol(symbol)
    setActiveApp('algo_signals')
  }


  // Filter and Sort Results (App 1)
  const filteredAndSortedResults = useMemo(() => {
    let list = [...results]

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(r =>
        r.Symbol.toLowerCase().includes(q) ||
        r.Company.toLowerCase().includes(q)
      )
    }

    if (signalFilter === 'BULLISH' || signalFilter === 'BEARISH') {
      list = list.filter(r => r['Signal Type'] === signalFilter)
    } else if (signalFilter === 'FRESH') {
      // Show crossovers detected today
      const todayStr = new Date().toISOString().slice(0, 10)
      list = list.filter(r => r['Crossover Date']?.includes(todayStr) || r['Crossover Date']?.includes('Today'))
    }

    list.sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      if (typeof valA === 'string') {
        const comp = valA.localeCompare(valB)
        return sortDirection === 'asc' ? comp : -comp
      } else {
        const comp = (valA ?? 0) - (valB ?? 0)
        return sortDirection === 'asc' ? comp : -comp
      }
    })

    return list
  }, [results, searchQuery, signalFilter, sortField, sortDirection])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection(field === 'Crossover Date' || field === 'Close' ? 'desc' : 'asc')
    }
  }

  // Export CSV
  const handleExportCSV = () => {
    if (!filteredAndSortedResults.length) return
    const headers = ['Rank', 'Symbol', 'Company', 'Signal Type', 'Crossover Date', 'Close', 'SMA 6', 'SMA 30', 'Spread (SMA6-SMA30)']
    const csvRows = [headers.join(',')]
    for (const r of filteredAndSortedResults) {
      const spread = (r['SMA 6'] - r['SMA 30']).toFixed(2)
      csvRows.push([
        r.Rank,
        `"${r.Symbol}"`,
        `"${r.Company.replace(/"/g, '""')}"`,
        r['Signal Type'],
        r['Crossover Date'],
        r.Close,
        r['SMA 6'],
        r['SMA 30'],
        spread
      ].join(','))
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `nse_sma_scan_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // Count summaries
  const bullishCount = useMemo(() => results.filter(r => r['Signal Type'] === 'BULLISH').length, [results])
  const bearishCount = useMemo(() => results.filter(r => r['Signal Type'] === 'BEARISH').length, [results])

  const freshBullishCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    return results.filter(r => r['Signal Type'] === 'BULLISH' && (r.Freshness === 'FRESH' || r['Days Ago'] <= 1 || r['Crossover Date'] === todayStr)).length
  }, [results])

  const freshBearishCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    return results.filter(r => r['Signal Type'] === 'BEARISH' && (r.Freshness === 'FRESH' || r['Days Ago'] <= 1 || r['Crossover Date'] === todayStr)).length
  }, [results])

  const freshTotalCount = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    return results.filter(r => r.Freshness === 'FRESH' || r['Days Ago'] <= 1 || r['Crossover Date'] === todayStr).length
  }, [results])

  // Initial loading spinner
  if (authStatus.loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '16px', backgroundColor: 'var(--bg-canvas)' }}>
        <div style={{ position: 'relative' }}>
          <RotateCw className="animate-spin" size={36} style={{ color: 'var(--accent-cyan)' }} />
          <Zap size={18} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'var(--bullish-text)' }} />
        </div>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)' }}>
          Initializing SMA 6 & 30 Quant Terminal...
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
          Connecting to NSE Quant Stream & yfinance Engine
        </div>
      </div>
    )
  }

  // Render Login view if not authenticated
  if (!authStatus.authenticated) {
    return (
      <div className="app-container">
        <header className="app-header glass-panel">
          <div className="brand-section">
            <div className="brand-icon-box">
              <Zap size={20} />
            </div>
            <div className="brand-title-wrap">
              <span className="brand-title">SMA 6 & 30 Cross Scanner</span>
              <span className="brand-version-chip">v2.4 QUANT LIVE</span>
            </div>
          </div>
          <div className="header-actions">
            <button
              id="btn-login-server-config"
              className="btn btn-secondary"
              onClick={() => {
                setServerUrlInput(apiBase || '')
                setServerTestStatus(null)
                setServerTestError(null)
                setShowServerModal(true)
              }}
              title="Configure Backend API Server URL"
              style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '6px' }}
            >
              <Server size={14} style={{ color: backendOffline ? 'var(--bearish-neon)' : 'var(--accent-cyan)' }} />
              <span>Server API</span>
            </button>
            <button
              id="btn-login-theme-toggle"
              className="btn btn-secondary theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to White Crystal Glass mode' : 'Switch to Black Obsidian Glass mode'}
              style={{ padding: '6px 12px', fontSize: '0.78rem', gap: '6px' }}
            >
              {theme === 'dark' ? (
                <>
                  <Sun size={14} style={{ color: '#fbbf24' }} />
                  <span>White Glass</span>
                </>
              ) : (
                <>
                  <Moon size={14} style={{ color: 'var(--accent-cyan)' }} />
                  <span>Black Glass</span>
                </>
              )}
            </button>
            <div className="gateway-status-pill">
              <span className="pulse-beacon" style={{ backgroundColor: 'var(--bearish-neon)' }} />
              <span style={{ color: 'var(--bearish-text)', fontWeight: 600 }}>Terminal Locked</span>
            </div>
          </div>
        </header>

        {backendOffline && (
          <div style={{
            margin: '12px 20px 0',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bearish-bg)',
            border: '1px solid var(--bearish-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', color: 'var(--bearish-text)' }}>
              <WifiOff size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Backend Unreachable:</strong> Cannot connect to FastAPI at <code>{apiBase || 'current host'}</code>.
              </div>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setServerUrlInput(apiBase || '')
                setServerTestStatus(null)
                setServerTestError(null)
                setShowServerModal(true)
              }}
              style={{ padding: '5px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
            >
              Configure Server URL
            </button>
          </div>
        )}

        <main className="login-wrap">
          <div className="login-card glass-panel">
            <div className="login-badge">
              <Shield size={14} />
              <span>Terminal Security Gateway</span>
            </div>

            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.85rem', fontWeight: 800, lineHeight: 1.2 }}>
              Quantitative Stock Terminal
            </h1>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '440px', lineHeight: 1.5 }}>
              NSE Semi-Algo Scanner with SMA 6 & 30 Crossover detection and AI Swing Trading v4.0, powered by <strong>Yahoo Finance</strong>.
            </p>

            {loginError && (
              <div className="alert-box alert-danger" style={{ width: '100%' }}>
                <AlertCircle size={18} />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '6px' }}>
              <div className="token-input-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <User size={13} style={{ color: 'var(--accent-cyan)' }} />
                  <span>USERNAME</span>
                </div>
                <div className="token-input-wrapper">
                  <input
                    id="input-username"
                    type="text"
                    className="token-input"
                    placeholder="Enter username (suriyaprakash)"
                    value={loginUsername}
                    onChange={(e) => {
                      setLoginUsername(e.target.value)
                      setLoginError(null)
                    }}
                    autoComplete="username"
                  />
                </div>
              </div>

              <div className="token-input-container">
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <Lock size={13} style={{ color: 'var(--accent-cyan)' }} />
                  <span>PASSWORD</span>
                </div>
                <div className="token-input-wrapper">
                  <input
                    id="input-password"
                    type={showPassword ? 'text' : 'password'}
                    className="token-input"
                    placeholder="Enter password (master730)"
                    value={loginPassword}
                    onChange={(e) => {
                      setLoginPassword(e.target.value)
                      setLoginError(null)
                    }}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="token-visibility-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                id="btn-login-submit"
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '0.92rem', marginTop: '4px' }}
                disabled={isLoggingIn || !loginUsername.trim() || !loginPassword.trim()}
              >
                {isLoggingIn ? (
                  <>
                    <RotateCw className="animate-spin" size={16} />
                    <span>Authenticating Access...</span>
                  </>
                ) : (
                  <>
                    <Shield size={16} />
                    <span>Sign In to Terminal</span>
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="feature-list">
              <div className="feature-item">
                <CheckCircle2 size={15} color="var(--bullish-text)" />
                <span>Confirmed SMA 6 & 30 Cross</span>
              </div>
              <div className="feature-item">
                <CheckCircle2 size={15} color="var(--bullish-text)" />
                <span>Zero Upstox Dependency (yfinance)</span>
              </div>
              <div className="feature-item">
                <CheckCircle2 size={15} color="var(--bullish-text)" />
                <span>NIFTY 100 + 200 Universe</span>
              </div>
              <div className="feature-item">
                <CheckCircle2 size={15} color="var(--bullish-text)" />
                <span>AI Swing Signals v4.0</span>
              </div>
            </div>

            <div style={{ fontSize: '0.74rem', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={13} />
              <span>Institutional semi-algo quantitative terminal for NSE equities.</span>
            </div>
          </div>
        </main>
        {renderServerModal()}
      </div>
    )
  }

  // Progress Calculation
  const progressPercent = scanStatus.total_stocks > 0
    ? Math.min(100, Math.round((scanStatus.stocks_scanned / scanStatus.total_stocks) * 100))
    : scanStatus.is_running ? 20 : 100

  return (
    <div className="app-container">
      {/* ===================================================================== */}
      {/* TOP NAVIGATION BAR                                                    */}
      {/* ===================================================================== */}
      <header className="app-header glass-panel">
        <div className="specular-edge" />
        <div className="brand-section">
          <div className="brand-icon-box">
            <Zap size={20} />
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">SMA 6 & 30 Cross Scanner</span>
            <span className="brand-version-chip">v2.4 QUANT LIVE</span>
          </div>
        </div>

        {/* Market Status Strip */}
        <div className="market-ticker-strip">
          <div className="market-status-badge">
            <span className="pulse-beacon" style={{ backgroundColor: 'var(--bullish-neon)' }} />
            <span>NSE MARKET HOURS</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>09:15 - 15:30 IST</span>
          </div>
        </div>

        {/* Header Actions */}
        <div className="header-actions">
          {/* Backend API Server Configuration */}
          <button
            id="btn-main-server-config"
            className="btn btn-secondary"
            onClick={() => {
              setServerUrlInput(apiBase || '')
              setServerTestStatus(null)
              setServerTestError(null)
              setShowServerModal(true)
            }}
            title="Configure Backend API Server URL"
            style={{ padding: '7px 12px', fontSize: '0.78rem', gap: '6px' }}
          >
            <Server size={14} style={{ color: backendOffline ? 'var(--bearish-neon)' : 'var(--bullish-neon)' }} />
            <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {apiBase ? apiBase.replace(/^https?:\/\//, '') : 'Server API'}
            </span>
          </button>

          {/* Black (Dark) vs White (Light) Glass Theme Toggle */}
          <button
            id="btn-theme-toggle"
            className="btn btn-secondary theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to White Crystal Glass mode' : 'Switch to Black Obsidian Glass mode'}
            style={{ padding: '7px 12px', fontSize: '0.78rem', gap: '6px' }}
          >
            {theme === 'dark' ? (
              <>
                <Sun size={14} style={{ color: '#fbbf24' }} />
                <span>White Glass</span>
              </>
            ) : (
              <>
                <Moon size={14} style={{ color: 'var(--accent-cyan)' }} />
                <span>Black Glass</span>
              </>
            )}
          </button>

          {/* Connection Status Badge */}
          <div className="gateway-status-pill">
            <span className="pulse-beacon" style={{ backgroundColor: 'var(--bullish-neon)' }} />
            <span style={{ color: 'var(--bullish-text)', fontWeight: 600 }}>Active Terminal</span>
            {authStatus.user_name && (
              <span style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '8px' }}>
                {authStatus.user_name}
              </span>
            )}
          </div>

          {/* Logout Button */}
          <button
            id="btn-logout"
            className="btn btn-danger"
            onClick={handleLogout}
            title="Sign out of terminal session"
            style={{ padding: '7px 12px', fontSize: '0.78rem' }}
          >
            <LogOut size={14} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {backendOffline && (
        <div style={{
          margin: '12px 20px 0',
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bearish-bg)',
          border: '1px solid var(--bearish-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', color: 'var(--bearish-text)' }}>
            <WifiOff size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Backend Disconnected:</strong> Cannot connect to FastAPI backend at <code>{apiBase || 'current host'}</code>.
            </div>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setServerUrlInput(apiBase || '')
              setServerTestStatus(null)
              setServerTestError(null)
              setShowServerModal(true)
            }}
            style={{ padding: '5px 12px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
          >
            Configure Server URL
          </button>
        </div>
      )}

      {/* App Workflow Mode Navigation */}
      <nav className="app-mode-nav">
        <button
          className={`app-mode-btn ${activeApp === 'scanner' ? 'active' : ''}`}
          onClick={() => setActiveApp('scanner')}
        >
          <BarChart3 size={16} />
          <span>1️⃣ SMA Crossover Scanner</span>
          <span className="app-mode-badge bullish">{results.length} Signals</span>
        </button>
        <button
          className={`app-mode-btn ${activeApp === 'algo_signals' ? 'active' : ''}`}
          onClick={() => setActiveApp('algo_signals')}
        >
          <Zap size={16} />
          <span>2️⃣ Algo Signals</span>
          <span className="app-mode-badge gold">AI Swing v4.0</span>
        </button>
        <button
          className={`app-mode-btn ${activeApp === 'best_stocks' ? 'active' : ''}`}
          onClick={() => setActiveApp('best_stocks')}
        >
          <Sparkles size={16} style={{ color: '#fbbf24' }} />
          <span>3️⃣ SMA Bullish AI Radar</span>
          <span className="app-mode-badge gold">AI Probability at Top</span>
        </button>
      </nav>

      {/* Notifications */}
      {successMessage && (
        <div className="alert-box alert-success">
          <CheckCircle2 size={18} />
          <span style={{ flex: 1 }}>{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            ×
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="alert-box alert-danger">
          <AlertCircle size={18} />
          <span style={{ flex: 1 }}>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            ×
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* APP 1: SMA TECHNICAL SCANNER                                              */}
      {/* ========================================================================= */}
      {activeApp === 'scanner' && (
        <>
          {/* Metrics Bento Grid */}
          <section className="stats-grid">
            {/* Card 1: Total Scanned */}
            <div className="stat-card glass-panel">
              <div className="stat-card-header">
                <span className="stat-label">TOTAL SCANNED EQUITIES</span>
                <div className="stat-icon-wrap">
                  <Layers size={16} />
                </div>
              </div>
              <div className="stat-main-metric">
                <span className="stat-value">{scanStatus.stocks_scanned || (results.length ? '200' : '0')}</span>
                <span className="stat-unit">/ 200</span>
              </div>
              <div className="stat-footer-bar">
                <span>NIFTY 100 + 200 Deduplicated Universe</span>
                <span className="font-mono text-cyan">{progressPercent}%</span>
              </div>
              <div className="stat-progress-track">
                <div className="stat-progress-fill" style={{ width: `${progressPercent}%`, background: 'var(--accent-cyan)' }} />
              </div>
            </div>

            {/* Card 2: Bullish Golden Crossovers */}
            <div className="stat-card glass-panel glow-bullish">
              <div className="stat-card-header">
                <span className="stat-label" style={{ color: 'var(--bullish-text)' }}>
                  BULLISH GOLDEN CROSSOVERS
                </span>
                <div className="stat-icon-wrap" style={{ color: 'var(--bullish-text)', background: 'var(--bullish-bg)', borderColor: 'var(--bullish-border)' }}>
                  <TrendingUp size={16} />
                </div>
              </div>
              <div className="stat-main-metric">
                <span className="stat-value" style={{ color: 'var(--bullish-text)' }}>{bullishCount}</span>
                <span className="stat-unit" style={{ color: 'var(--bullish-text)' }}>Signals</span>
              </div>
              <div className="stat-footer-bar">
                <span style={{ color: 'var(--bullish-text)' }}>SMA 6 &gt; SMA 30 Confirmed</span>
                <span className="font-mono" style={{ color: 'var(--bullish-neon)', fontWeight: 600 }}>{freshBullishCount} Fresh (≤ 1d)</span>
              </div>
              <div className="stat-progress-track">
                <div className="stat-progress-fill" style={{ width: `${results.length ? (bullishCount / results.length) * 100 : 0}%`, background: 'var(--bullish-neon)' }} />
              </div>
            </div>

            {/* Card 3: Bearish Death Crossovers */}
            <div className="stat-card glass-panel glow-bearish">
              <div className="stat-card-header">
                <span className="stat-label" style={{ color: 'var(--bearish-text)' }}>
                  BEARISH DEATH CROSSOVERS
                </span>
                <div className="stat-icon-wrap" style={{ color: 'var(--bearish-text)', background: 'var(--bearish-bg)', borderColor: 'var(--bearish-border)' }}>
                  <TrendingDown size={16} />
                </div>
              </div>
              <div className="stat-main-metric">
                <span className="stat-value" style={{ color: 'var(--bearish-text)' }}>{bearishCount}</span>
                <span className="stat-unit" style={{ color: 'var(--bearish-text)' }}>Signals</span>
              </div>
              <div className="stat-footer-bar">
                <span style={{ color: 'var(--bearish-text)' }}>SMA 6 &lt; SMA 30 Confirmed</span>
                <span className="font-mono" style={{ color: 'var(--bearish-neon)', fontWeight: 600 }}>{freshBearishCount} Fresh (≤ 1d)</span>
              </div>
              <div className="stat-progress-track">
                <div className="stat-progress-fill" style={{ width: `${results.length ? (bearishCount / results.length) * 100 : 0}%`, background: 'var(--bearish-neon)' }} />
              </div>
            </div>

            {/* Card 4: Sync Cadence & Next Trigger */}
            <div className="stat-card glass-panel">
              <div className="stat-card-header">
                <span className="stat-label">SYNC CADENCE & CLOCK</span>
                <div className="stat-icon-wrap">
                  <Clock size={16} />
                </div>
              </div>
              <div className="stat-main-metric">
                <span className="stat-value font-mono">
                  {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className="stat-unit">IST</span>
              </div>
              <div className="stat-footer-bar">
                <span>{lastScanTime ? `Last scan: ${lastScanTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Awaiting manual trigger'}</span>
                <span style={{ color: 'var(--accent-cyan)' }}>Live Ticks</span>
              </div>
            </div>
          </section>

          {/* Scanner Live Progress Section */}
          {scanStatus.is_running && (
            <section className="glass-panel progress-panel">
              <div className="progress-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <RotateCw className="animate-spin" size={16} style={{ color: 'var(--accent-cyan)' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.86rem' }}>{scanStatus.progress_message}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span className="font-mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.9rem' }}>
                    {progressPercent}%
                  </span>
                  <button
                    className="btn btn-danger"
                    onClick={handleStopScanner}
                    style={{
                      padding: '4px 12px',
                      fontSize: '0.74rem',
                      background: 'rgba(239, 68, 68, 0.2)',
                      border: '1px solid rgba(239, 68, 68, 0.6)',
                      color: '#ff6b6b',
                      borderRadius: '4px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      cursor: 'pointer'
                    }}
                    title="Stop scan immediately"
                  >
                    <Square size={12} fill="currentColor" />
                    <span>Stop</span>
                  </button>
                </div>
              </div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </section>
          )}

          {/* Action & Filter Control Toolbar */}
          <section className="toolbar-section glass-panel">
            <div className="toolbar-left">
              {/* Primary Run Scan Button */}
              <button
                id="btn-run-scanner"
                className="btn btn-primary"
                onClick={handleRunScanner}
                disabled={scanStatus.is_running}
                style={{ padding: '8px 18px', fontSize: '0.85rem' }}
              >
                {scanStatus.is_running ? (
                  <>
                    <RotateCw className="animate-spin" size={15} />
                    <span>Scanning Universe...</span>
                  </>
                ) : (
                  <>
                    <Play size={15} fill="currentColor" />
                    <span>Run Live Scan</span>
                  </>
                )}
              </button>

              {/* Stop Scan Button */}
              {scanStatus.is_running && (
                <button
                  id="btn-stop-scanner"
                  className="btn btn-danger"
                  onClick={handleStopScanner}
                  style={{
                    padding: '8px 18px',
                    fontSize: '0.85rem',
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.6)',
                    color: '#ff6b6b',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}
                  title="Stop ongoing scanner immediately"
                >
                  <Square size={14} fill="currentColor" />
                  <span>Stop Scan</span>
                </button>
              )}

              {/* Search Box */}
              <div className="search-box">
                <Search className="search-icon" size={16} />
                <input
                  id="search-input"
                  type="text"
                  className="search-input"
                  placeholder="Search symbol or company (e.g. RELIANCE)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Signal Filter Pills */}
              <div className="filter-pills">
                <button
                  className={`filter-pill ${signalFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setSignalFilter('ALL')}
                >
                  All Signals ({results.length})
                </button>
                <button
                  className={`filter-pill ${signalFilter === 'BULLISH' ? 'active bullish' : ''}`}
                  onClick={() => setSignalFilter('BULLISH')}
                >
                  Bullish ({bullishCount})
                </button>
                <button
                  className={`filter-pill ${signalFilter === 'BEARISH' ? 'active bearish' : ''}`}
                  onClick={() => setSignalFilter('BEARISH')}
                >
                  Bearish ({bearishCount})
                </button>
                <button
                  className={`filter-pill ${signalFilter === 'FRESH' ? 'active' : ''}`}
                  onClick={() => setSignalFilter('FRESH')}
                >
                  Fresh Today ({freshTotalCount})
                </button>
              </div>
            </div>

            <div className="toolbar-right">
              {/* Refresh Button */}
              <button
                id="btn-refresh-results"
                className="btn btn-secondary"
                onClick={fetchResults}
                disabled={isRefreshing || scanStatus.is_running}
                title="Refresh latest scan results"
                style={{ padding: '7px 12px', fontSize: '0.78rem' }}
              >
                <RotateCw className={isRefreshing ? 'animate-spin' : ''} size={14} />
                <span>Refresh</span>
              </button>

              {/* CSV Export Button */}
              <button
                className="btn btn-secondary"
                onClick={handleExportCSV}
                disabled={!filteredAndSortedResults.length}
                title="Download results as CSV"
                style={{ padding: '7px 12px', fontSize: '0.78rem' }}
              >
                <Download size={14} />
                <span>CSV</span>
              </button>
            </div>
          </section>

          {/* Confirmed Crossover Data Table */}
          <section className="table-surface-card glass-panel">
            <div className="table-header-strip">
              <div className="table-header-strip-title">
                <Zap size={14} />
                <span>CROSSOVER EXECUTION SURFACE</span>
                <span style={{ color: 'var(--border-medium)' }}>•</span>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>CONFIRMED 3/3 BAR FILTER</span>
              </div>
              <div className="font-mono" style={{ color: 'var(--text-faint)' }}>
                Showing {filteredAndSortedResults.length} of {results.length} verified signals
              </div>
            </div>

            <div className="table-wrapper">
              <table className="scanner-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('Rank')} style={{ width: '56px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>#</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Symbol')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Symbol & Company</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Signal Type')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Signal State</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Crossover Date')}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>Cross Date / Bar</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('Close')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>LTP (₹)</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('SMA 6')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>SMA 6 (₹)</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th className="sortable" onClick={() => handleSort('SMA 30')} style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span>SMA 30 (₹)</span>
                        <ArrowUpDown size={11} />
                      </div>
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      <span>Spread Divergence</span>
                    </th>
                    <th style={{ textAlign: 'right', width: '130px' }}>
                      <span>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedResults.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                          <Layers size={36} style={{ color: 'var(--text-faint)' }} />
                          <div style={{ fontWeight: 600, fontSize: '1rem', color: '#ffffff' }}>
                            {results.length === 0 ? 'No crossover signals in database.' : 'No stocks match the current filter.'}
                          </div>
                          <div style={{ fontSize: '0.82rem', maxWidth: '420px', lineHeight: 1.5 }}>
                            {results.length === 0
                              ? 'Click "Run Live Scan" above to run the SMA 6 & 30 algorithm across all 200 NIFTY equities with today\'s live candle.'
                              : 'Try changing your search term or signal toggle pill to see more equities.'}
                          </div>
                          {results.length === 0 && (
                            <button className="btn btn-primary" onClick={handleRunScanner} disabled={scanStatus.is_running} style={{ marginTop: '8px' }}>
                              <Play size={14} fill="currentColor" />
                              <span>Execute First Scan</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedResults.map((item) => {
                      const isBullish = item['Signal Type'] === 'BULLISH'
                      const spread = item['SMA 6'] - item['SMA 30']
                      const spreadPct = item['SMA 30'] ? ((spread / item['SMA 30']) * 100).toFixed(2) : '0.00'

                      return (
                        <tr
                          key={item.Symbol}
                          onClick={() => setSelectedStock(item)}
                          title="Click to inspect crossover details & double confirmation checklist"
                        >
                          <td className="rank-badge">
                            #{String(item.Rank).padStart(2, '0')}
                          </td>
                          <td>
                            <div className="symbol-cell">
                              <span className="symbol-name">{item.Symbol}</span>
                              <span className="exchange-chip">NSE</span>
                            </div>
                            <div className="company-subname" title={item.Company}>
                              {item.Company}
                            </div>
                          </td>
                          <td>
                            <span className={`signal-pill ${isBullish ? 'bullish' : 'bearish'}`}>
                              {isBullish ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                              <span>{isBullish ? 'GOLDEN CROSS' : 'DEATH CROSS'}</span>
                              <span className="signal-confirmation-tag">3/3</span>
                            </span>
                          </td>
                          <td className="font-mono" style={{ color: 'var(--text-sub)', fontSize: '0.78rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{item['Crossover Date']}</span>
                              {item.Freshness === 'FRESH' || item['Days Ago'] <= 1 ? (
                                <span style={{ background: 'rgba(0, 245, 155, 0.15)', color: 'var(--bullish-neon)', border: '1px solid rgba(0, 245, 155, 0.3)', borderRadius: '4px', padding: '1px 5px', fontSize: '0.66rem', fontWeight: 700 }}>
                                  FRESH
                                </span>
                              ) : item['Days Ago'] ? (
                                <span style={{ fontSize: '0.70rem', color: 'var(--text-faint)' }}>{item['Days Ago']}d ago</span>
                              ) : null}
                            </div>
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: '#ffffff', fontSize: '0.88rem' }}>
                            <div>₹{item.Close.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            {item['Crossover Price'] && item['Crossover Price'] !== item.Close && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-faint)', fontWeight: 400 }}>
                                Cross: ₹{item['Crossover Price'].toFixed(2)}
                              </div>
                            )}
                          </td>
                          <td
                            className="font-mono"
                            style={{
                              textAlign: 'right',
                              color: isBullish ? 'var(--bullish-text)' : 'var(--bearish-text)',
                              fontWeight: 700,
                              fontSize: '0.88rem'
                            }}
                          >
                            ₹{item['SMA 6'].toFixed(2)}
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                            ₹{item['SMA 30'].toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="spread-value" style={{ color: isBullish ? 'var(--bullish-text)' : 'var(--bearish-text)' }}>
                              {spread > 0 ? `+${spread.toFixed(2)}` : spread.toFixed(2)}
                            </div>
                            <div className="spread-pct" style={{ color: isBullish ? 'var(--bullish-text)' : 'var(--bearish-text)' }}>
                              {spread > 0 ? `+${spreadPct}%` : `${spreadPct}%`}
                            </div>
                          </td>
                          <td>
                            <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                              <button
                                className="action-icon-btn"
                                onClick={() => setSelectedStock(item)}
                                title="Inspect SMA 6 & 30 Crossover Breakdown"
                              >
                                <Maximize2 size={13} />
                              </button>
                              <a
                                className="action-icon-btn"
                                href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(item.Symbol)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open in TradingView Chart"
                              >
                                <ExternalLink size={13} />
                              </a>
                              <button
                                className="action-icon-btn"
                                onClick={() => navigateToAlgoSignals(item.Symbol)}
                                title="AI Swing Trading System v4.0"
                              >
                                <Zap size={13} style={{ color: 'var(--bullish-neon)' }} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}


      {/* ========================================================================= */}
      {/* APP 2: ALGO SIGNALS (AI SWING TRADING SYSTEM v4.0)                        */}
      {/* ========================================================================= */}
      {activeApp === 'algo_signals' && (
        <AlgoSignals apiBase={API_BASE} initialSymbol={algoSymbol} />
      )}

      {/* ========================================================================= */}
      {/* APP 3: BEST STOCKS RADAR (TOP QUANT OPPORTUNITIES & ALPHA SCREENER)       */}
      {/* ========================================================================= */}
      {activeApp === 'best_stocks' && (
        <BestStocksRadar
          apiBase={API_BASE}
          onSelectStock={(sym) => {
            setAlgoSymbol(sym)
            setActiveApp('algo_signals')
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: STOCK DETAIL INSPECTOR & CROSSOVER BREAKDOWN                     */}
      {/* ========================================================================= */}
      {selectedStock && (
        <div className="modal-overlay" onClick={() => setSelectedStock(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span className="symbol-name" style={{ fontSize: '1.15rem' }}>{selectedStock.Symbol}</span>
                <span className="exchange-chip">NSE</span>
                <span className={`signal-pill ${selectedStock['Signal Type'] === 'BULLISH' ? 'bullish' : 'bearish'}`}>
                  {selectedStock['Signal Type'] === 'BULLISH' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  <span>{selectedStock['Signal Type']} CROSS</span>
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedStock(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {selectedStock.Company}
              </div>

              {/* Price & Moving Averages Matrix */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div className="fundamental-card">
                  <span className="fundamental-label">Close (LTP)</span>
                  <span className="fundamental-val font-mono">₹{selectedStock.Close.toFixed(2)}</span>
                </div>
                <div className="fundamental-card">
                  <span className="fundamental-label">SMA 6 (Fast)</span>
                  <span className="fundamental-val font-mono" style={{ color: selectedStock['Signal Type'] === 'BULLISH' ? 'var(--bullish-text)' : 'var(--bearish-text)' }}>
                    ₹{selectedStock['SMA 6'].toFixed(2)}
                  </span>
                </div>
                <div className="fundamental-card">
                  <span className="fundamental-label">SMA 30 (Slow)</span>
                  <span className="fundamental-val font-mono" style={{ color: 'var(--text-sub)' }}>
                    ₹{selectedStock['SMA 30'].toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Exact Crossover Confirmation Rule */}
              <div className="inspect-crossover-card">
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--accent-cyan)', textTransform: 'uppercase' }}>
                  CONFIRMED CROSSOVER LOGIC VERIFICATION
                </div>
                <div className="crossover-rule-box">
                  <div className="rule-check-item">
                    <CheckCircle2 size={16} color="var(--bullish-text)" />
                    <div>
                      <strong>Crossover Direction:</strong>{' '}
                      {selectedStock['Signal Type'] === 'BULLISH'
                        ? 'Prior candle SMA 6 ≤ SMA 30 AND Current candle SMA 6 > SMA 30'
                        : 'Prior candle SMA 6 ≥ SMA 30 AND Current candle SMA 6 < SMA 30'}
                    </div>
                  </div>
                  <div className="rule-check-item">
                    <CheckCircle2 size={16} color="var(--bullish-text)" />
                    <div>
                      <strong>Spread Magnitude:</strong>{' '}
                      {(selectedStock['SMA 6'] - selectedStock['SMA 30']).toFixed(2)} pts divergence
                    </div>
                  </div>
                  <div className="rule-check-item">
                    <CheckCircle2 size={16} color="var(--bullish-text)" />
                    <div>
                      <strong>Confirmation Timestamp:</strong> {selectedStock['Crossover Date']}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Jump Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, gap: '8px' }}
                  onClick={() => {
                    const sym = selectedStock.Symbol
                    setSelectedStock(null)
                    navigateToAlgoSignals(sym)
                  }}
                  title="Run AI Swing Trading Model v4.0"
                >
                  <Zap size={16} style={{ color: 'var(--bullish-neon)' }} />
                  <span>AI Swing Analysis</span>
                </button>
                <a
                  className="btn btn-secondary"
                  href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(selectedStock.Symbol)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '8px 14px', gap: '6px' }}
                >
                  <ExternalLink size={15} />
                  <span>Chart</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

{/* ========================================================================= */}
      {/* SYSTEM TELEMETRY & ENGINE STATUS FOOTER                                   */}
      {/* ========================================================================= */}
      <footer className="system-footer">
        <div className="footer-left">
          <span className="pulse-beacon" style={{ backgroundColor: 'var(--bullish-neon)' }} />
          <span>NSE Quant Stream • yfinance Engine</span>
          <span style={{ color: 'var(--border-medium)' }}>•</span>
          <span style={{ color: 'var(--accent-cyan)' }}>Quant Engine Online</span>
        </div>
        <div className="footer-right">
          Scanner Algorithm: <span style={{ color: '#ffffff' }}>SMA 6 vs SMA 30 Dual Confirmed Cross (NSE Equities)</span>
        </div>
      </footer>
      {renderServerModal()}
    </div>
  )
}
