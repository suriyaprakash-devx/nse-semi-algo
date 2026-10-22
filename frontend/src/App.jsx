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
  Square
} from 'lucide-react'
import './App.css'
import AlgoSignals from './AlgoSignals'

// Dynamic API Base URL configuration for Render deployment (supports both unified and separate services)
const RAW_API_URL = import.meta.env.VITE_API_URL || ''
const API_BASE = RAW_API_URL
  ? (RAW_API_URL.startsWith('http') ? RAW_API_URL : `https://${RAW_API_URL}`).replace(/\/+$/, '')
  : ''

const SESSION_STORAGE_KEY = 'upstox_session_id'

export const getSessionId = () => {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export const setStoredSessionId = (id) => {
  try {
    if (id) {
      localStorage.setItem(SESSION_STORAGE_KEY, id)
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {}
}

export const authFetch = (url, options = {}) => {
  const sessionId = getSessionId()
  const headers = {
    ...(options.headers || {}),
    ...(sessionId ? { 'X-Session-ID': sessionId, 'Authorization': `Bearer ${sessionId}` } : {})
  }
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers
  })
}

export default function App() {
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

  // Navigation: 'scanner' (App 1) vs 'screener' (App 2) vs 'scorer' (App 3)
  const [activeApp, setActiveApp] = useState('scanner')

  const [authStatus, setAuthStatus] = useState({
    loading: true,
    authenticated: false,
    configured: true,
    user_id: null,
    user_name: null,
    message: null
  })

  // Direct Token state
  const [directToken, setDirectToken] = useState('')
  const [isSubmittingToken, setIsSubmittingToken] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [authTab, setAuthTab] = useState('token') // 'token' or 'oauth'
  const [showUpdateModal, setShowUpdateModal] = useState(false)
  const [updateTokenInput, setUpdateTokenInput] = useState('')
  const [showUpdateToken, setShowUpdateToken] = useState(false)

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

  // Screener & Double Confirmation state (App 2)
  const [screenerSymbol, setScreenerSymbol] = useState('RELIANCE')
  const [screenerInput, setScreenerInput] = useState('RELIANCE')
  const [screenerData, setScreenerData] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [screenerError, setScreenerError] = useState(null)

  // Stock Perfection Engine state (App 3)
  const [scorerSymbol, setScorerSymbol] = useState('RELIANCE')
  const [scorerInput, setScorerInput] = useState('RELIANCE')
  const [scorerData, setScorerData] = useState(null)
  const [isScoring, setIsScoring] = useState(false)
  const [scorerError, setScorerError] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(false)
  const [leaderboardFilter, setLeaderboardFilter] = useState('ALL') // ALL, PERFECT, BULLISH
  const [algoSymbol, setAlgoSymbol] = useState('RELIANCE')

  const POPULAR_STOCKS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'SBIN', 'ITC', 'BHARTIARTL', 'LT', 'ICICIBANK']

  // 1. Check Authentication Status on mount
  const checkAuth = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/auth/status`)
      if (!res.ok) {
        setStoredSessionId(null)
        setAuthStatus(prev => ({ ...prev, loading: false, authenticated: false }))
        return
      }
      const data = await res.json()
      if (data.authenticated) {
        if (data.session_id) setStoredSessionId(data.session_id)
        setAuthStatus({
          loading: false,
          authenticated: true,
          configured: data.configured !== false,
          user_id: data.user_id,
          user_name: data.user_name,
          email: data.email,
          broker: data.broker,
          expires_at: data.expires_at,
          message: data.message
        })
        fetchResults()
        loadStockAnalysis('RELIANCE')
        loadStockPerfection('RELIANCE')
        loadLeaderboard()
      } else {
        setStoredSessionId(null)
        setAuthStatus({
          loading: false,
          authenticated: false,
          configured: data.configured !== false,
          user_id: null,
          user_name: null,
          message: data.message
        })
      }
    } catch (err) {
      console.error('Failed to fetch auth status:', err)
      setAuthStatus({
        loading: false,
        authenticated: false,
        configured: true,
        user_id: null,
        user_name: null,
        message: 'Could not connect to backend service.'
      })
    }
  }

  useEffect(() => {
    // Handle URL search params (OAuth callback redirect)
    const params = new URLSearchParams(window.location.search)
    const urlSessionId = params.get('session_id')
    if (urlSessionId) {
      setStoredSessionId(urlSessionId)
    }
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    const authError = params.get('auth_error')
    if (authError) {
      setErrorMessage(`Upstox login error: ${params.get('error_desc') || authError}`)
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    checkAuth()
  }, [])

  // 2. Fetch Latest Results (App 1)
  const fetchResults = async () => {
    setIsRefreshing(true)
    try {
      const res = await authFetch(`${API_BASE}/api/scanner/results`)
      if (res.status === 401) {
        setStoredSessionId(null)
        setAuthStatus(prev => ({ ...prev, authenticated: false, message: 'Upstox authentication expired. Please re-enter your access token.' }))
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
          const res = await authFetch(`${API_BASE}/api/scanner/status`)
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
      const res = await authFetch(`${API_BASE}/api/scanner/run`, { method: 'POST' })
      if (res.status === 401) {
        setErrorMessage('Upstox authentication expired. Please reconnect or enter your latest access token.')
        setStoredSessionId(null)
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
      const res = await authFetch(`${API_BASE}/api/scanner/stop`, { method: 'POST' })
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

  // 5. Connect via Direct Access Token
  const handleConnectWithToken = async (tokenString) => {
    let token = (tokenString || directToken).trim()
    if (!token) {
      setErrorMessage('Please paste your Upstox access token.')
      return
    }
    if (token.toLowerCase().startsWith('bearer ')) {
      token = token.slice(7).trim()
    }

    setIsSubmittingToken(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetch(`${API_BASE}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ access_token: token })
      })
      let data = {}
      try {
        data = await res.json()
      } catch {
        const text = await res.text()
        data = { detail: text }
      }
      if (!res.ok) {
        throw new Error(data.detail || data.message || 'Failed to verify Upstox access token')
      }

      // Store private session ID locally for this browser session
      if (data.session_id) {
        setStoredSessionId(data.session_id)
      }

      setAuthStatus({
        loading: false,
        authenticated: true,
        configured: true,
        user_id: data.user_id,
        user_name: data.user_name,
        email: data.email,
        broker: data.broker || 'UPSTOX',
        expires_at: data.expires_at,
        message: data.message
      })
      setDirectToken('')
      setUpdateTokenInput('')
      setShowUpdateModal(false)
      setSuccessMessage(data.message || `Connected to Upstox successfully as ${data.user_name || data.user_id}!`)
      fetchResults()
      loadStockAnalysis('RELIANCE')
      loadStockPerfection('RELIANCE')
      loadLeaderboard()
    } catch (err) {
      setErrorMessage(err.message)
    } finally {
      setIsSubmittingToken(false)
    }
  }

  // Quick Offline Preview Mode (explore UI without live Upstox session)
  const handleEnterDemoMode = () => {
    setAuthStatus({
      loading: false,
      authenticated: true,
      configured: true,
      user_id: 'PREVIEW_USER',
      user_name: 'Offline Simulation Mode',
      message: 'Active in Offline Simulation Mode'
    })
    setSuccessMessage('Launched in Offline Simulation Mode with cached NSE data.')
    fetchResults()
    loadStockAnalysis('RELIANCE')
    loadStockPerfection('RELIANCE')
    loadLeaderboard()
  }

  // 6. Upstox OAuth Login Flow (Alternative)
  const handleConnectUpstoxOAuth = async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/auth/login`)
      const data = await res.json()
      if (!res.ok) {
        setErrorMessage(data.detail || `Server error (${res.status})`)
        return
      }
      if (data.auth_url) {
        window.location.href = data.auth_url
      } else {
        setErrorMessage(data.detail || 'No authentication URL received from server.')
      }
    } catch (err) {
      setErrorMessage(`Login initialization failed: ${err.message}`)
    }
  }

  // 7. Logout
  const handleLogout = async () => {
    try {
      await authFetch(`${API_BASE}/api/auth/logout`, { method: 'POST' })
    } catch (err) {
      console.warn('Logout error:', err)
    } finally {
      setStoredSessionId(null)
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

  // 8. Screener & Double Confirmation API (App 2)
  const loadStockAnalysis = async (symbol) => {
    const sym = (symbol || screenerSymbol).trim().toUpperCase()
    if (!sym) return
    setIsAnalyzing(true)
    setScreenerError(null)
    setScreenerSymbol(sym)
    setScreenerInput(sym)

    try {
      const res = await authFetch(`${API_BASE}/api/analysis/${encodeURIComponent(sym)}`)
      if (!res.ok) {
        let errDetail = 'Unable to fetch fundamental data'
        try {
          const errData = await res.json()
          errDetail = errData.detail || errDetail
        } catch {
          const text = await res.text()
          errDetail = text || errDetail
        }
        throw new Error(errDetail)
      }
      const data = await res.json()
      setScreenerData(data)
    } catch (err) {
      setScreenerError(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const navigateToAnalysis = (symbol) => {
    setActiveApp('screener')
    loadStockAnalysis(symbol)
  }

  // 9. Stock Perfection Score API (App 3)
  const loadStockPerfection = async (symbol) => {
    const sym = (symbol || scorerSymbol).trim().toUpperCase()
    if (!sym) return
    setIsScoring(true)
    setScorerError(null)
    setScorerSymbol(sym)
    setScorerInput(sym)

    try {
      const res = await authFetch(`${API_BASE}/api/analysis/${encodeURIComponent(sym)}`)
      if (!res.ok) {
        let errDetail = 'Unable to compute stock perfection score'
        try {
          const errData = await res.json()
          errDetail = errData.detail || errDetail
        } catch {
          const text = await res.text()
          errDetail = text || errDetail
        }
        throw new Error(errDetail)
      }
      const data = await res.json()
      setScorerData(data)
    } catch (err) {
      setScorerError(err.message)
    } finally {
      setIsScoring(false)
    }
  }

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true)
    try {
      const res = await authFetch(`${API_BASE}/api/scoring/leaderboard`)
      if (res.ok) {
        const data = await res.json()
        if (data && data.leaderboard) {
          setLeaderboard(data.leaderboard)
        }
      }
    } catch (err) {
      console.warn('Leaderboard fetch warning:', err)
    } finally {
      setLeaderboardLoading(false)
    }
  }

  const navigateToPerfection = (symbol) => {
    setActiveApp('scorer')
    loadStockPerfection(symbol)
  }

  const navigateToAlgoSignals = (symbol) => {
    setAlgoSymbol(symbol)
    setActiveApp('algo_signals')
  }

  const filteredLeaderboard = useMemo(() => {
    let list = [...leaderboard]
    if (leaderboardFilter === 'PERFECT') {
      list = list.filter(item => (item.perfection_score || 0) >= 75)
    } else if (leaderboardFilter === 'BULLISH') {
      list = list.filter(item => item.technical_signal === 'BULLISH')
    }
    return list
  }, [leaderboard, leaderboardFilter])

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
    link.setAttribute('download', `upstox_sma_scan_${new Date().toISOString().slice(0, 10)}.csv`)
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
          Establishing Upstox v2 WebSocket Gateway Session
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
              <span style={{ color: 'var(--bearish-text)', fontWeight: 600 }}>Upstox Disconnected</span>
            </div>
          </div>
        </header>

        <main className="login-wrap">
          <div className="login-card glass-panel">
            <div className="login-badge">
              <Key size={14} />
              <span>Upstox API v2 Direct Authentication Gateway</span>
            </div>

            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.85rem', fontWeight: 800, lineHeight: 1.2 }}>
              Institutional Crossover Scanner
            </h1>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '440px', lineHeight: 1.5 }}>
              Precision SMA 6 & 30 crossover signals for NIFTY 100/200 equities. Connect with your Upstox Daily Access Token for live market streams and real-time execution support.
            </p>

            {errorMessage && (
              <div className="alert-box alert-danger" style={{ width: '100%' }}>
                <AlertCircle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Authentication Method Tabs */}
            <div className="auth-method-tabs">
              <button
                className={`auth-tab-btn ${authTab === 'token' ? 'active' : ''}`}
                onClick={() => setAuthTab('token')}
              >
                <Key size={15} />
                <span>Daily Access Token</span>
              </button>
              <button
                className={`auth-tab-btn ${authTab === 'oauth' ? 'active' : ''}`}
                onClick={() => setAuthTab('oauth')}
              >
                <Shield size={15} />
                <span>Upstox SSO / OAuth</span>
              </button>
            </div>

            {/* Method 1: Direct Token Input */}
            {authTab === 'token' && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* 3-Step Quick Guide */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  background: 'rgba(0, 210, 255, 0.05)',
                  border: '1px solid rgba(0, 210, 255, 0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)'
                }}>
                  <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={13} />
                    <span>How to get your Upstox Access Token:</span>
                  </div>
                  <div>1. Go to <a href="https://developer.upstox.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-cyan)', textDecoration: 'underline' }}>developer.upstox.com</a> and open your App.</div>
                  <div>2. Click <strong>Generate Token</strong> / copy today's active 24-hr Access Token.</div>
                  <div>3. Paste token below and click <strong>Log In to Terminal</strong>.</div>
                </div>

                <div className="token-input-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    <span>PASTE UPSTOX ACCESS TOKEN</span>
                    <a
                      href="https://developer.upstox.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-cyan)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>Developer Console</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <div className="token-input-wrapper">
                    <input
                      id="input-access-token"
                      type={showToken ? 'text' : 'password'}
                      className="token-input"
                      placeholder="Paste your Upstox access token (eyJhbGci...)"
                      value={directToken}
                      onChange={(e) => setDirectToken(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleConnectWithToken()}
                    />
                    <button
                      type="button"
                      className="token-visibility-btn"
                      onClick={() => setShowToken(!showToken)}
                      title={showToken ? 'Hide token' : 'Show token'}
                    >
                      {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
                    Tokens are cryptographically encrypted per browser session and never shared with other users.
                  </span>
                </div>

                <button
                  id="btn-connect-token"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: '0.92rem' }}
                  onClick={() => handleConnectWithToken()}
                  disabled={isSubmittingToken || !directToken.trim()}
                >
                  {isSubmittingToken ? (
                    <>
                      <RotateCw className="animate-spin" size={16} />
                      <span>Verifying with Upstox API...</span>
                    </>
                  ) : (
                    <>
                      <span>Log In to Terminal Session</span>
                      <ChevronRight size={18} />
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Method 2: OAuth 2.0 Flow */}
            {authTab === 'oauth' && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '6px' }}>
                {!authStatus.configured && (
                  <div className="alert-box alert-warning" style={{ width: '100%' }}>
                    <AlertCircle size={18} />
                    <span>Client ID/Secret not set in environment. Use the <strong>Daily Access Token</strong> tab.</span>
                  </div>
                )}
                <button
                  id="btn-connect-upstox"
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: '0.92rem' }}
                  onClick={handleConnectUpstoxOAuth}
                  disabled={!authStatus.configured}
                >
                  <span>Authorize via Upstox SSO</span>
                  <ChevronRight size={18} />
                </button>
              </div>
            )}

            {/* Offline Simulation / Preview Mode */}
            <div style={{ width: '100%', marginTop: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '8px 0', gap: '8px' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-glass-card)' }} />
                <span style={{ fontSize: '0.70rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>or offline simulation</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border-glass-card)' }} />
              </div>
              <button
                id="btn-demo-mode"
                type="button"
                className="btn btn-secondary"
                style={{
                  width: '100%',
                  padding: '10px',
                  fontSize: '0.84rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: 'var(--bg-surface-card)',
                  border: '1px solid var(--border-glass-card)'
                }}
                onClick={handleEnterDemoMode}
              >
                <Sparkles size={15} style={{ color: 'var(--accent-cyan)' }} />
                <span>Explore in Offline Simulation Mode (Historical Cache)</span>
              </button>
            </div>

            <div className="feature-list">
              <div className="feature-item">
                <CheckCircle2 size={15} color="var(--bullish-text)" />
                <span>Confirmed SMA 6 & 30 Signals</span>
              </div>
              <div className="feature-item">
                <CheckCircle2 size={15} color="var(--bullish-text)" />
                <span>Double Confirmation Engine</span>
              </div>
              <div className="feature-item">
                <CheckCircle2 size={15} color="var(--bullish-text)" />
                <span>NIFTY 100 + 200 Universe</span>
              </div>
              <div className="feature-item">
                <CheckCircle2 size={15} color="var(--bullish-text)" />
                <span>Spread & Volume Analytics</span>
              </div>
            </div>

            <div style={{ fontSize: '0.74rem', color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Shield size={13} />
              <span>Strictly analytical semi-algo decision support. No automated execution orders placed.</span>
            </div>
          </div>
        </main>
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
            <span style={{ color: 'var(--bullish-text)', fontWeight: 600 }}>Upstox Connected</span>
            {authStatus.user_name && (
              <span style={{ color: 'var(--text-muted)', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '8px' }}>
                {authStatus.user_name}
              </span>
            )}
          </div>

          {/* Quick Update Token Button */}
          <button
            id="btn-update-token"
            className="btn btn-secondary"
            onClick={() => setShowUpdateModal(true)}
            title="Update daily Upstox access token"
            style={{ padding: '7px 12px', fontSize: '0.78rem' }}
          >
            <Key size={14} style={{ color: 'var(--accent-cyan)' }} />
            <span>Update Token</span>
          </button>

          {/* Logout Button */}
          <button
            id="btn-logout"
            className="btn btn-danger"
            onClick={handleLogout}
            title="Disconnect Upstox session"
            style={{ padding: '7px 12px', fontSize: '0.78rem' }}
          >
            <LogOut size={14} />
            <span>Disconnect</span>
          </button>
        </div>
      </header>

      {/* Triple App Workflow Mode Navigation */}
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
          className={`app-mode-btn ${activeApp === 'screener' ? 'active' : ''}`}
          onClick={() => setActiveApp('screener')}
        >
          <Microscope size={16} />
          <span>2️⃣ Stock Screener Analysis</span>
          <span className="app-mode-badge cyan">Fundamentals</span>
        </button>
        <button
          className={`app-mode-btn ${activeApp === 'scorer' ? 'active' : ''}`}
          onClick={() => {
            setActiveApp('scorer')
            if (!scorerData) loadStockPerfection(scorerSymbol)
            if (!leaderboard.length) loadLeaderboard()
          }}
        >
          <Award size={16} />
          <span>3️⃣ Stock Perfection Score</span>
          <span className="app-mode-badge gold">100-Pt Quant Engine</span>
        </button>
        <button
          className={`app-mode-btn ${activeApp === 'algo_signals' ? 'active' : ''}`}
          onClick={() => setActiveApp('algo_signals')}
        >
          <Zap size={16} />
          <span>4️⃣ Algo Signals</span>
          <span className="app-mode-badge gold">AI Swing v4.0</span>
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
                                onClick={() => navigateToAnalysis(item.Symbol)}
                                title="Deep Fundamental & Double Confirmation Analysis (Step 2)"
                              >
                                <Microscope size={13} style={{ color: 'var(--accent-cyan)' }} />
                              </button>
                              <button
                                className="action-icon-btn"
                                onClick={() => navigateToPerfection(item.Symbol)}
                                title="Inspect 100-Point Stock Perfection Score (Step 3)"
                              >
                                <Award size={13} style={{ color: '#fbbf24' }} />
                              </button>
                              <button
                                className="action-icon-btn"
                                onClick={() => navigateToAlgoSignals(item.Symbol)}
                                title="AI Swing Trading System v4.0 (Step 4)"
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
      {/* APP 2: SCREENER FUNDAMENTAL & DOUBLE CONFIRMATION ANALYZER                */}
      {/* ========================================================================= */}
      {activeApp === 'screener' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Search Header Bar */}
          <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  Stock Quality & Double Confirmation Analyzer
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Screener-style Strengths, Weaknesses, EPS, P/E, Debt leverage & Technical Crossover Synthesis
                </div>
              </div>

              {/* Symbol Search Form */}
              <form
                onSubmit={(e) => { e.preventDefault(); loadStockAnalysis(screenerInput); }}
                style={{ display: 'flex', gap: '8px', minWidth: '320px', flex: 1, maxWidth: '460px' }}
              >
                <div className="search-box" style={{ flex: 1, maxWidth: 'none' }}>
                  <Search className="search-icon" size={16} />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Enter NSE symbol (e.g. RELIANCE, TCS, INFY)..."
                    value={screenerInput}
                    onChange={(e) => setScreenerInput(e.target.value.toUpperCase())}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.82rem' }} disabled={isAnalyzing}>
                  {isAnalyzing ? <RotateCw className="animate-spin" size={15} /> : <span>Analyze</span>}
                </button>
              </form>
            </div>

            {/* Quick Click Chips */}
            <div className="quick-chips-strip">
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Quick Stocks:</span>
              {POPULAR_STOCKS.map((sym) => (
                <button
                  key={sym}
                  className={`quick-chip ${screenerSymbol === sym ? 'active' : ''}`}
                  onClick={() => loadStockAnalysis(sym)}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {screenerError && (
            <div className="alert-box alert-danger">
              <AlertCircle size={18} />
              <span>{screenerError}</span>
            </div>
          )}

          {isAnalyzing && (
            <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <RotateCw className="animate-spin" size={32} style={{ color: 'var(--accent-cyan)' }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>Analyzing {screenerSymbol} Fundamentals & Cross Status...</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '480px' }}>
                Fetching balance sheet metrics, EPS trajectory, valuation ratios, and corroborating with SMA 6 & 30 trend direction.
              </div>
            </div>
          )}

          {/* Analysis Content */}
          {!isAnalyzing && screenerData && (
            <>
              {/* Double Confirmation Verdict Card */}
              {(() => {
                const dc = screenerData.double_confirmation
                let heroClass = 'neutral'
                if (dc.signal === 'STRONG_BUY' || dc.signal === 'CAUTION_BUY') heroClass = 'bullish'
                else if (dc.signal === 'STRONG_SELL' || dc.signal === 'AVOID') heroClass = 'bearish'

                return (
                  <div className={`verdict-banner ${heroClass} glass-panel`}>
                    <div style={{ flex: 1, minWidth: '280px' }}>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        DOUBLE CONFIRMATION SYNTHESIS VERDICT
                      </div>
                      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.9rem', margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{screenerData.company}</span>
                        <span className="font-mono" style={{ fontSize: '0.95rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>({screenerData.symbol})</span>
                      </h1>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {screenerData.sector} • {screenerData.industry}
                      </div>
                    </div>

                    {/* Recommendation Badge */}
                    <div className="verdict-score-badge" style={{ background: dc.color, color: '#051424', borderColor: dc.color }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={20} />
                        <span>{dc.badge_text}</span>
                      </div>
                    </div>

                    {/* Technical vs Fundamental Comparison Pillar */}
                    <div style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', background: 'rgba(5, 14, 26, 0.6)', padding: '14px 18px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>1st Confirmation: Technical</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                          <span className={`signal-pill ${screenerData.technical_signal === 'BULLISH' ? 'bullish' : 'bearish'}`}>
                            {screenerData.technical_signal === 'BULLISH' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                            <span>SMA 6 & 30: {screenerData.technical_signal}</span>
                          </span>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>2nd Confirmation: Fundamental</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                          <span className="font-mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: screenerData.verdict_color === 'bullish' ? 'var(--bullish-text)' : 'var(--bearish-text)' }}>
                            {screenerData.fundamental_score} / 10 • {screenerData.fundamental_verdict}
                          </span>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>Current Market Price</div>
                        <div className="font-mono" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#ffffff', marginTop: '4px' }}>
                          ₹{screenerData.current_price?.toFixed(2)}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>3rd Confirmation: Perfection Score</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                          <span className="font-mono" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#fbbf24' }}>
                            {screenerData.perfection_score || 0} / 100
                          </span>
                          <button
                            className="btn btn-secondary"
                            onClick={() => navigateToPerfection(screenerData.symbol)}
                            style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '4px' }}
                            title="Inspect 100-Point Stock Perfection Breakdown"
                          >
                            <Award size={12} color="#fbbf24" />
                            <span>Scorecard</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Synthesis explanation */}
                    <div style={{ width: '100%', fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: 1.5, background: 'rgba(255,255,255,0.03)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                      <strong style={{ color: '#ffffff' }}>Quant Strategy Synthesis:</strong> {dc.summary}
                    </div>
                  </div>
                )
              })()}

              {/* Fundamental Bento Grid */}
              <div className="glass-panel" style={{ padding: '18px 20px' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
                  KEY FINANCIAL METRICS (SCREENER OVERVIEW)
                </div>
                <div className="fundamental-grid">
                  <div className="fundamental-card">
                    <span className="fundamental-label">Market Cap</span>
                    <span className="fundamental-val">₹{screenerData.market_cap_cr ? screenerData.market_cap_cr.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'} Cr</span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Stock P/E</span>
                    <span className="fundamental-val">{screenerData.trailing_pe ? screenerData.trailing_pe.toFixed(2) : '—'}x</span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Price to Book (P/B)</span>
                    <span className="fundamental-val">{screenerData.price_to_book ? screenerData.price_to_book.toFixed(2) : '—'}x</span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Return on Equity (ROE)</span>
                    <span className="fundamental-val" style={{ color: (screenerData.roe || 0) > 15 ? 'var(--bullish-text)' : '#ffffff' }}>
                      {screenerData.roe ? (screenerData.roe * 100).toFixed(2) + '%' : '—'}
                    </span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Trailing EPS</span>
                    <span className="fundamental-val">₹{screenerData.eps ? screenerData.eps.toFixed(2) : '—'}</span>
                  </div>

                  <div className="fundamental-card">
                    <span className="fundamental-label">Debt to Equity</span>
                    <span className="fundamental-val" style={{ color: (screenerData.debt_to_equity || 0) < 0.5 ? 'var(--bullish-text)' : '#ffffff' }}>
                      {screenerData.debt_to_equity ? screenerData.debt_to_equity.toFixed(2) : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pros vs Cons Split */}
              <div className="pros-cons-grid">
                {/* Pros Panel */}
                <div className="pros-panel glass-panel">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--bullish-text)', fontWeight: 700, fontSize: '0.88rem' }}>
                    <CheckCircle2 size={18} />
                    <span>Company Strengths & Pros ({screenerData.pros?.length || 0})</span>
                  </div>
                  <div className="pros-cons-list">
                    {screenerData.pros && screenerData.pros.length > 0 ? (
                      screenerData.pros.map((p, idx) => (
                        <div key={idx} className="pros-cons-item">
                          <Check size={15} style={{ color: 'var(--bullish-text)', flexShrink: 0, marginTop: '2px' }} />
                          <span>{p}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-faint)' }}>No standout positive qualitative factors identified.</div>
                    )}
                  </div>
                </div>

                {/* Cons Panel */}
                <div className="cons-panel glass-panel">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--bearish-text)', fontWeight: 700, fontSize: '0.88rem' }}>
                    <AlertTriangle size={18} />
                    <span>Company Limitations & Cons ({screenerData.cons?.length || 0})</span>
                  </div>
                  <div className="pros-cons-list">
                    {screenerData.cons && screenerData.cons.length > 0 ? (
                      screenerData.cons.map((c, idx) => (
                        <div key={idx} className="pros-cons-item">
                          <X size={15} style={{ color: 'var(--bearish-text)', flexShrink: 0, marginTop: '2px' }} />
                          <span>{c}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-faint)' }}>No major red flags or balance sheet warnings identified.</div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {/* ========================================================================= */}
      {/* APP 3: 100-POINT STOCK PERFECTION SCORE ENGINE                           */}
      {/* ========================================================================= */}
      {activeApp === 'scorer' && (
        <section className="perfection-engine-wrap">
          {/* Search Header Bar */}
          <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Award size={22} style={{ color: '#fbbf24' }} />
                  <span>Stock Perfection Scoring Engine</span>
                  <span className="app-mode-badge gold">100-Point Quant Algorithm</span>
                </h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Multi-factor quantitative audit: Technical SMA Momentum (25 pts), Balance Sheet Solvency (25 pts), ROE Quality (25 pts), Valuation & EPS Growth (25 pts)
                </div>
              </div>

              {/* Symbol Search Form */}
              <form
                onSubmit={(e) => { e.preventDefault(); loadStockPerfection(scorerInput); }}
                style={{ display: 'flex', gap: '8px', minWidth: '320px', flex: 1, maxWidth: '460px' }}
              >
                <div className="search-box" style={{ flex: 1, maxWidth: 'none' }}>
                  <Search className="search-icon" size={16} />
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search stock to score (e.g. RELIANCE, TCS)..."
                    value={scorerInput}
                    onChange={(e) => setScorerInput(e.target.value.toUpperCase())}
                  />
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.82rem' }} disabled={isScoring}>
                  {isScoring ? <RotateCw className="animate-spin" size={15} /> : <span>Score Stock</span>}
                </button>
              </form>
            </div>

            {/* Quick Click Chips */}
            <div className="quick-chips-strip">
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>Quick Stocks:</span>
              {POPULAR_STOCKS.map((sym) => (
                <button
                  key={sym}
                  className={`quick-chip ${scorerSymbol === sym ? 'active' : ''}`}
                  onClick={() => loadStockPerfection(sym)}
                >
                  {sym}
                </button>
              ))}
            </div>
          </div>

          {scorerError && (
            <div className="alert-box alert-danger">
              <AlertCircle size={18} />
              <span>{scorerError}</span>
            </div>
          )}

          {isScoring && (
            <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
              <RotateCw className="animate-spin" size={32} style={{ color: '#fbbf24' }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#ffffff' }}>Computing 100-Point Perfection Score for {scorerSymbol}...</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', maxWidth: '480px' }}>
                Auditing 8-point criteria: SMA 6&30 golden cross, D/E leverage, capital efficiency (ROE), operating margins, valuation multiple, and EPS trajectory.
              </div>
            </div>
          )}

          {/* Scorer Content */}
          {!isScoring && scorerData && (() => {
            const perf = scorerData.perfection_details || {}
            const totalScore = perf.total_score ?? scorerData.perfection_score ?? 0
            const pillars = perf.pillars || {}
            const checklist = perf.checklist || []
            const passedCount = perf.passed_criteria_count ?? 0
            const totalCount = perf.total_criteria_count ?? checklist.length ?? 8
            const grade = perf.grade || scorerData.perfection_grade || 'B'
            const badgeText = perf.badge_text || 'EVALUATED'
            const isBullish = scorerData.technical_signal === 'BULLISH'

            // Radial gauge math (circumference = 2 * PI * r; with r=50 => 314.16)
            const radius = 50
            const circumference = 2 * Math.PI * radius
            const strokeDashoffset = circumference - (circumference * totalScore) / 100

            // Color palette according to score
            let gaugeColor = 'var(--bearish-neon)'
            if (totalScore >= 80) gaugeColor = 'var(--bullish-neon)'
            else if (totalScore >= 65) gaugeColor = 'var(--accent-cyan)'
            else if (totalScore >= 50) gaugeColor = '#fbbf24'

            return (
              <>
                {/* Hero Showcase Card */}
                <div className="perfection-hero-card">
                  <div className="specular-edge" />
                  <div className="perfection-hero-top">
                    {/* Stock Identity */}
                    <div className="perfection-stock-identity">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="font-mono" style={{ fontSize: '0.74rem', color: 'var(--accent-cyan)', fontWeight: 700, letterSpacing: '0.08em' }}>
                          STEP 3 QUANT AUDIT
                        </span>
                        <span style={{ color: 'var(--border-medium)' }}>•</span>
                        <span className={`signal-pill ${isBullish ? 'bullish' : 'bearish'}`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                          {isBullish ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          <span>SMA: {scorerData.technical_signal}</span>
                        </span>
                        <span style={{ color: 'var(--border-medium)' }}>•</span>
                        <span className="font-mono" style={{ fontSize: '0.7rem', color: totalScore >= 75 ? 'var(--bullish-text)' : 'var(--text-muted)' }}>
                          {totalScore >= 80 ? '★ TOP 3.2% NSE' : totalScore >= 65 ? 'TOP DECILE' : 'BROAD MARKET'}
                        </span>
                      </div>
                      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', margin: '4px 0 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{scorerData.company}</span>
                        <span className="font-mono" style={{ fontSize: '1rem', color: 'var(--accent-cyan)' }}>({scorerData.symbol})</span>
                      </h1>
                      <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                        {scorerData.sector} • {scorerData.industry} • LTP: <strong className="font-mono" style={{ color: 'var(--text-main)' }}>₹{scorerData.current_price?.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                          onClick={() => navigateToAnalysis(scorerData.symbol)}
                        >
                          <Microscope size={13} />
                          <span>View Screener Fundamentals</span>
                        </button>
                        <a
                          className="btn btn-secondary"
                          href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(scorerData.symbol)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                        >
                          <ExternalLink size={13} />
                          <span>Chart</span>
                        </a>
                      </div>
                    </div>

                    {/* Radial Score Meter & Verdict */}
                    <div className="perfection-score-showcase">
                      <div className="radial-score-gauge">
                        <svg className="radial-score-svg" viewBox="0 0 120 120">
                          <defs>
                            <linearGradient id="score-arc-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="var(--accent-cyan)" />
                              <stop offset="100%" stopColor={gaugeColor} />
                            </linearGradient>
                          </defs>
                          <circle
                            className="radial-score-circle-bg"
                            cx="60"
                            cy="60"
                            r={radius}
                          />
                          <circle
                            className="radial-score-circle-val"
                            cx="60"
                            cy="60"
                            r={radius}
                            stroke="url(#score-arc-grad)"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            style={{ filter: `drop-shadow(0 0 10px ${gaugeColor}70)` }}
                          />
                        </svg>
                        <div className="radial-score-content">
                          <span className="radial-score-number">{totalScore}</span>
                          <span className="radial-score-max">/ 100 PTS</span>
                        </div>
                      </div>

                      <div className="score-badge-block">
                        <div
                          className="score-grade-tag"
                          style={{
                            background: `${gaugeColor}15`,
                            color: gaugeColor,
                            border: `1px solid ${gaugeColor}40`
                          }}
                        >
                          <Award size={14} />
                          <span>GRADE: {grade}</span>
                        </div>
                        <h3 className="score-verdict-title">{badgeText}</h3>
                        <div className="score-criteria-chip">
                          <CheckCircle2 size={13} color="var(--bullish-text)" />
                          <span><strong>{passedCount} of {totalCount}</strong> Perfection Criteria Satisfied</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quant Summary Box */}
                  <div style={{ background: 'rgba(5, 14, 26, 0.6)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '14px 18px', fontSize: '0.86rem', color: 'var(--text-sub)', lineHeight: 1.5 }}>
                    <strong style={{ color: '#ffffff' }}>Perfection Assessment: </strong>
                    {perf.rating_description || "Comprehensive quantitative rating synthesizing technical breakout timing with underlying corporate health."}
                  </div>
                </div>

                {/* 4 Pillars Breakdown Grid */}
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Layers size={14} />
                    <span>4-PILLAR QUANTITATIVE BREAKDOWN (25 PTS EACH)</span>
                  </div>

                  <div className="pillars-grid">
                    {/* Pillar 1: Technical & Momentum */}
                    {(() => {
                      const p = pillars.technical || { score: 0, max: 25, percentage: 0, details: [] }
                      return (
                        <div className="pillar-card">
                          <div className="pillar-header">
                            <div className="pillar-title-wrap">
                              <TrendingUp size={16} color="var(--bullish-text)" />
                              <span className="pillar-title">Technical Momentum</span>
                            </div>
                            <span className="pillar-score-badge font-mono">{p.score} / 25</span>
                          </div>
                          <div className="pillar-bar-track">
                            <div className="pillar-bar-fill" style={{ width: `${p.percentage}%`, background: 'var(--bullish-neon)' }} />
                          </div>
                          <div className="pillar-details-list">
                            {p.details && p.details.map((d, i) => (
                              <div key={i} className="pillar-detail-bullet">
                                <span style={{ color: 'var(--bullish-text)' }}>•</span>
                                <span>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Pillar 2: Balance Sheet & Solvency */}
                    {(() => {
                      const p = pillars.financial_health || { score: 0, max: 25, percentage: 0, details: [] }
                      return (
                        <div className="pillar-card">
                          <div className="pillar-header">
                            <div className="pillar-title-wrap">
                              <Shield size={16} color="var(--accent-cyan)" />
                              <span className="pillar-title">Balance Sheet Solvency</span>
                            </div>
                            <span className="pillar-score-badge font-mono">{p.score} / 25</span>
                          </div>
                          <div className="pillar-bar-track">
                            <div className="pillar-bar-fill" style={{ width: `${p.percentage}%`, background: 'var(--accent-cyan)' }} />
                          </div>
                          <div className="pillar-details-list">
                            {p.details && p.details.map((d, i) => (
                              <div key={i} className="pillar-detail-bullet">
                                <span style={{ color: 'var(--accent-cyan)' }}>•</span>
                                <span>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Pillar 3: Profitability & ROE */}
                    {(() => {
                      const p = pillars.profitability || { score: 0, max: 25, percentage: 0, details: [] }
                      return (
                        <div className="pillar-card">
                          <div className="pillar-header">
                            <div className="pillar-title-wrap">
                              <BarChart3 size={16} color="#fbbf24" />
                              <span className="pillar-title">ROE & Profit Margins</span>
                            </div>
                            <span className="pillar-score-badge font-mono">{p.score} / 25</span>
                          </div>
                          <div className="pillar-bar-track">
                            <div className="pillar-bar-fill" style={{ width: `${p.percentage}%`, background: '#fbbf24' }} />
                          </div>
                          <div className="pillar-details-list">
                            {p.details && p.details.map((d, i) => (
                              <div key={i} className="pillar-detail-bullet">
                                <span style={{ color: '#fbbf24' }}>•</span>
                                <span>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* Pillar 4: Valuation & EPS Growth */}
                    {(() => {
                      const p = pillars.valuation_growth || { score: 0, max: 25, percentage: 0, details: [] }
                      return (
                        <div className="pillar-card">
                          <div className="pillar-header">
                            <div className="pillar-title-wrap">
                              <Sparkles size={16} color="#a855f7" />
                              <span className="pillar-title">Valuation & Growth</span>
                            </div>
                            <span className="pillar-score-badge font-mono">{p.score} / 25</span>
                          </div>
                          <div className="pillar-bar-track">
                            <div className="pillar-bar-fill" style={{ width: `${p.percentage}%`, background: '#a855f7' }} />
                          </div>
                          <div className="pillar-details-list">
                            {p.details && p.details.map((d, i) => (
                              <div key={i} className="pillar-detail-bullet">
                                <span style={{ color: '#a855f7' }}>•</span>
                                <span>{d}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* 8-Point Perfection Checklist */}
                <div className="glass-panel checklist-section-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={14} color="var(--bullish-text)" />
                      <span>8-POINT INSTITUTIONAL PERFECTION CHECKLIST</span>
                    </div>
                    <span className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--bullish-text)', fontWeight: 700 }}>
                      {passedCount} / {totalCount} Criteria Satisfied ({Math.round((passedCount / totalCount) * 100)}%)
                    </span>
                  </div>

                  <div className="checklist-grid">
                    {checklist.map((item) => (
                      <div key={item.id} className={`checklist-item-card ${item.passed ? 'passed' : 'failed'}`}>
                        <div className={`checklist-icon-box ${item.passed ? 'passed' : 'failed'}`}>
                          {item.passed ? <Check size={16} /> : <X size={16} />}
                        </div>
                        <div className="checklist-content-wrap">
                          <div className="checklist-content-header">
                            <span className="checklist-item-title">{item.title}</span>
                            <span className="checklist-tag">{item.badge}</span>
                          </div>
                          <div className="checklist-item-detail">{item.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Market Perfection Leaderboard */}
                <div className="table-surface-card glass-panel" style={{ marginTop: '4px' }}>
                  <div className="table-header-strip" style={{ flexWrap: 'wrap', gap: '10px' }}>
                    <div className="table-header-strip-title">
                      <Award size={15} color="#fbbf24" />
                      <span>MARKET PERFECTION LEADERBOARD</span>
                      <span style={{ color: 'var(--border-medium)' }}>•</span>
                      <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>RANKED BY 100-PT COMPOSITE SCORE</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Filter Pills */}
                      <button
                        className={`filter-pill ${leaderboardFilter === 'ALL' ? 'active' : ''}`}
                        onClick={() => setLeaderboardFilter('ALL')}
                        style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                      >
                        All Candidates ({leaderboard.length})
                      </button>
                      <button
                        className={`filter-pill ${leaderboardFilter === 'PERFECT' ? 'active bullish' : ''}`}
                        onClick={() => setLeaderboardFilter('PERFECT')}
                        style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                      >
                        Top Quality (75+)
                      </button>
                      <button
                        className={`filter-pill ${leaderboardFilter === 'BULLISH' ? 'active bullish' : ''}`}
                        onClick={() => setLeaderboardFilter('BULLISH')}
                        style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                      >
                        Golden Cross Only
                      </button>

                      <button
                        className="btn btn-secondary"
                        onClick={loadLeaderboard}
                        disabled={leaderboardLoading}
                        style={{ padding: '4px 10px', fontSize: '0.72rem', gap: '4px' }}
                        title="Recompute leaderboard"
                      >
                        <RotateCw className={leaderboardLoading ? 'animate-spin' : ''} size={12} />
                        <span>Refresh</span>
                      </button>
                    </div>
                  </div>

                  <div className="table-wrapper">
                    <table className="scanner-table">
                      <thead>
                        <tr>
                          <th style={{ width: '56px' }}>Rank</th>
                          <th>Symbol & Company</th>
                          <th style={{ textAlign: 'center' }}>Perfection Score</th>
                          <th>Grade</th>
                          <th>SMA 6 & 30</th>
                          <th style={{ textAlign: 'right' }}>LTP (₹)</th>
                          <th style={{ textAlign: 'right' }}>Stock P/E</th>
                          <th style={{ textAlign: 'right' }}>ROE</th>
                          <th style={{ textAlign: 'center' }}>Verdict</th>
                          <th style={{ textAlign: 'right', width: '110px' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeaderboard.length === 0 ? (
                          <tr>
                            <td colSpan={10} style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                              {leaderboardLoading ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                  <RotateCw className="animate-spin" size={16} color="var(--accent-cyan)" />
                                  <span>Calculating Perfection Scores for Market Candidates...</span>
                                </div>
                              ) : (
                                <span>No candidate stocks in leaderboard. Click "Refresh" or execute an SMA scan.</span>
                              )}
                            </td>
                          </tr>
                        ) : (
                          filteredLeaderboard.map((item, idx) => {
                            const isRowBullish = item.technical_signal === 'BULLISH'
                            const scoreVal = item.perfection_score || 0
                            let scoreBadgeColor = 'var(--bearish-neon)'
                            if (scoreVal >= 80) scoreBadgeColor = 'var(--bullish-neon)'
                            else if (scoreVal >= 65) scoreBadgeColor = 'var(--accent-cyan)'
                            else if (scoreVal >= 50) scoreBadgeColor = '#fbbf24'

                            return (
                              <tr
                                key={item.symbol}
                                onClick={() => loadStockPerfection(item.symbol)}
                                style={{ cursor: 'pointer' }}
                                title="Click to inspect 100-Point Perfection Breakdown"
                              >
                                <td className="rank-badge">#{item.rank || idx + 1}</td>
                                <td>
                                  <div className="symbol-cell">
                                    <span className="symbol-name">{item.symbol}</span>
                                    <span className="exchange-chip">NSE</span>
                                  </div>
                                  <div className="company-subname">{item.company}</div>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span
                                    className="leaderboard-score-pill"
                                    style={{
                                      background: `${scoreBadgeColor}15`,
                                      color: scoreBadgeColor,
                                      border: `1px solid ${scoreBadgeColor}35`
                                    }}
                                  >
                                    <Award size={13} />
                                    <span>{scoreVal} / 100</span>
                                  </span>
                                </td>
                                <td>
                                  <span className="font-mono" style={{ fontWeight: 700, fontSize: '0.8rem', color: '#ffffff' }}>
                                    {item.perfection_grade || 'N/A'}
                                  </span>
                                </td>
                                <td>
                                  <span className={`signal-pill ${isRowBullish ? 'bullish' : 'bearish'}`}>
                                    {isRowBullish ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                                    <span>{item.technical_signal || 'NONE'}</span>
                                  </span>
                                </td>
                                <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: '#ffffff' }}>
                                  ₹{item.current_price ? item.current_price.toFixed(2) : '—'}
                                </td>
                                <td className="font-mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>
                                  {item.pe ? `${item.pe.toFixed(1)}x` : '—'}
                                </td>
                                <td className="font-mono" style={{ textAlign: 'right', color: (item.roe || 0) > 0.14 ? 'var(--bullish-text)' : 'var(--text-sub)' }}>
                                  {item.roe ? `${(item.roe * 100).toFixed(1)}%` : '—'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <span
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      color: scoreBadgeColor,
                                      fontFamily: 'var(--font-mono)'
                                    }}
                                  >
                                    {item.perfection_details?.badge_text || 'EVALUATED'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button
                                    className="btn btn-secondary"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      loadStockPerfection(item.symbol)
                                    }}
                                    style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '3px' }}
                                    title="Inspect Perfection Score"
                                  >
                                    <Award size={12} color="#fbbf24" />
                                    <span>Audit</span>
                                  </button>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          })()}
        </section>
      )}

      {/* ========================================================================= */}
      {/* APP 4: ALGO SIGNALS (AI SWING TRADING SYSTEM v4.0)                        */}
      {/* ========================================================================= */}
      {activeApp === 'algo_signals' && (
        <AlgoSignals apiBase={API_BASE} initialSymbol={algoSymbol} />
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
                  style={{ flex: 1 }}
                  onClick={() => {
                    const sym = selectedStock.Symbol
                    setSelectedStock(null)
                    navigateToAnalysis(sym)
                  }}
                >
                  <Microscope size={15} />
                  <span>Screener Analysis (Step 2)</span>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ gap: '6px' }}
                  onClick={() => {
                    const sym = selectedStock.Symbol
                    setSelectedStock(null)
                    navigateToPerfection(sym)
                  }}
                  title="Inspect Stock Perfection Score"
                >
                  <Award size={15} style={{ color: '#fbbf24' }} />
                  <span>Perfection Score (Step 3)</span>
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ gap: '6px' }}
                  onClick={() => {
                    const sym = selectedStock.Symbol
                    setSelectedStock(null)
                    navigateToAlgoSignals(sym)
                  }}
                  title="Run AI Swing Trading Model v4.0"
                >
                  <Zap size={15} style={{ color: 'var(--bullish-neon)' }} />
                  <span>AI Swing (Step 4)</span>
                </button>
                <a
                  className="btn btn-secondary"
                  href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(selectedStock.Symbol)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: '8px 14px' }}
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
      {/* MODAL 2: UPDATE ACCESS TOKEN SLIDEOUT / DIALOG                            */}
      {/* ========================================================================= */}
      {showUpdateModal && (
        <div className="modal-overlay" onClick={() => setShowUpdateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '4px', background: 'rgba(0, 210, 255, 0.1)', border: '1px solid rgba(0, 210, 255, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-cyan)' }}>
                  <Key size={15} />
                </div>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.05rem', color: '#ffffff' }}>
                  Update Upstox Access Token
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowUpdateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Upstox market access tokens expire daily at 03:30 AM IST. Paste your fresh daily token to re-authenticate live market streams.
              </div>

              <div className="token-input-container">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  <span>NEW UPSTOX ACCESS TOKEN</span>
                  <a
                    href="https://developer.upstox.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent-cyan)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px' }}
                  >
                    <span>Developer Portal</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
                <div className="token-input-wrapper">
                  <input
                    type={showUpdateToken ? 'text' : 'password'}
                    className="token-input"
                    placeholder="Paste new Upstox access token..."
                    value={updateTokenInput}
                    onChange={(e) => setUpdateTokenInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnectWithToken(updateTokenInput)}
                  />
                  <button
                    type="button"
                    className="token-visibility-btn"
                    onClick={() => setShowUpdateToken(!showUpdateToken)}
                  >
                    {showUpdateToken ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowUpdateModal(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleConnectWithToken(updateTokenInput)}
                  disabled={isSubmittingToken || !updateTokenInput.trim()}
                >
                  {isSubmittingToken ? (
                    <>
                      <RotateCw className="animate-spin" size={14} />
                      <span>Validating Token...</span>
                    </>
                  ) : (
                    <>
                      <span>Validate & Update Session</span>
                    </>
                  )}
                </button>
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
          <span>Upstox WebSocket V2 Protocol</span>
          <span style={{ color: 'var(--border-medium)' }}>•</span>
          <span style={{ color: 'var(--accent-cyan)' }}>Quant Engine Online</span>
        </div>
        <div className="footer-right">
          Scanner Algorithm: <span style={{ color: '#ffffff' }}>SMA 6 vs SMA 30 Dual Confirmed Cross (NSE Equities)</span>
        </div>
      </footer>
    </div>
  )
}
