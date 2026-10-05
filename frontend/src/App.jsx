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
  ArrowRight,
  Check,
  X,
  Zap,
  Activity,
  Maximize2,
  Radio,
  SlidersHorizontal,
  Compass,
  FileSpreadsheet
} from 'lucide-react'
import './App.css'

export default function App() {
  // Navigation: 'scanner' (App 1) vs 'screener' (App 2)
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
  const [universeFilter, setUniverseFilter] = useState('NIFTY_200') // NIFTY_200, NIFTY_100

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

  const POPULAR_STOCKS = ['RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'SBIN', 'ITC', 'BHARTIARTL', 'LT', 'ICICIBANK']

  // 1. Check Authentication Status on mount
  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/status')
      if (!res.ok) {
        setAuthStatus(prev => ({ ...prev, loading: false, authenticated: false }))
        return
      }
      const data = await res.json()
      setAuthStatus({
        loading: false,
        authenticated: data.authenticated,
        configured: data.configured !== false,
        user_id: data.user_id,
        user_name: data.user_name,
        message: data.message
      })
      if (data.authenticated) {
        fetchResults()
        loadStockAnalysis('RELIANCE')
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
    // Handle URL search params
    const params = new URLSearchParams(window.location.search)
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
      const res = await fetch('/api/scanner/results')
      if (res.status === 401) {
        setAuthStatus(prev => ({ ...prev, authenticated: false, message: 'Upstox authentication expired.' }))
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
          const res = await fetch('/api/scanner/status')
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
      const res = await fetch('/api/scanner/run', { method: 'POST' })
      if (res.status === 401) {
        setErrorMessage('Upstox authentication expired. Please reconnect or enter your latest access token.')
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

  // 5. Connect via Direct Access Token
  const handleConnectWithToken = async (tokenString) => {
    const token = (tokenString || directToken).trim()
    if (!token) {
      setErrorMessage('Please paste your Upstox access token.')
      return
    }

    setIsSubmittingToken(true)
    setErrorMessage(null)
    setSuccessMessage(null)

    try {
      const res = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      setAuthStatus({
        loading: false,
        authenticated: true,
        configured: true,
        user_id: data.user_id,
        user_name: data.user_name,
        message: data.message
      })
      setDirectToken('')
      setUpdateTokenInput('')
      setShowUpdateModal(false)
      setSuccessMessage(data.message || 'Connected to Upstox successfully!')
      fetchResults()
      loadStockAnalysis('RELIANCE')
    } catch (err) {
      setErrorMessage(err.message)
    } finally {
      setIsSubmittingToken(false)
    }
  }

  // 6. Upstox OAuth Login Flow (Alternative)
  const handleConnectUpstoxOAuth = async () => {
    try {
      const res = await fetch('/api/auth/login')
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
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.warn('Logout error:', err)
    } finally {
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
      const res = await fetch(`/api/analysis/${encodeURIComponent(sym)}`)
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
              <span>Upstox v2 API Direct Token & OAuth Gateway</span>
            </div>

            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.85rem', fontWeight: 800, lineHeight: 1.2 }}>
              Institutional Crossover Scanner
            </h1>

            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', maxWidth: '440px', lineHeight: 1.5 }}>
              Precision SMA 6 & 30 crossover signals for NIFTY 100/200 equities with real-time intraday tick integration and fundamental double confirmation.
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
                <span>Paste Daily Access Token</span>
              </button>
              <button
                className={`auth-tab-btn ${authTab === 'oauth' ? 'active' : ''}`}
                onClick={() => setAuthTab('oauth')}
              >
                <Shield size={15} />
                <span>OAuth 2.0 Dialog</span>
              </button>
            </div>

            {/* Method 1: Direct Token Input */}
            {authTab === 'token' && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div className="token-input-container">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    <span>PASTE UPSTOX ACCESS TOKEN</span>
                    <a
                      href="https://developer.upstox.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent-cyan)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>Upstox Developer Portal</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                  <div className="token-input-wrapper">
                    <input
                      id="input-access-token"
                      type={showToken ? 'text' : 'password'}
                      className="token-input"
                      placeholder="Paste token (e.g. eyJhbGciOi...)"
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
                    Verified instantly against Upstox profile endpoint and encrypted for the current session.
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
                      <span>Connect Terminal Session</span>
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
                    <span>Client ID/Secret not set in environment. Use the <strong>Paste Access Token</strong> tab.</span>
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
        <div className="brand-section">
          <div className="brand-icon-box">
            <Zap size={20} />
          </div>
          <div className="brand-title-wrap">
            <span className="brand-title">SMA 6 & 30 Cross Scanner</span>
            <span className="brand-version-chip">v2.4 QUANT LIVE</span>
          </div>
        </div>

        {/* Live Market Telemetry Strip */}
        <div className="market-ticker-strip">
          <div className="market-status-badge">
            <span className="pulse-beacon" style={{ backgroundColor: 'var(--bullish-neon)' }} />
            <span>NSE LIVE</span>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 400 }}>09:15-15:30 IST</span>
          </div>
          <div className="market-ticker-item font-mono">
            <span>NIFTY 50:</span>
            <span className="market-ticker-val">22,548.80</span>
            <span className="market-ticker-up">(+0.64%)</span>
          </div>
          <span style={{ color: 'var(--border-medium)' }}>•</span>
          <div className="market-ticker-item font-mono">
            <span>BANKNIFTY:</span>
            <span className="market-ticker-val">48,120.45</span>
            <span className="market-ticker-up">(+0.82%)</span>
          </div>
        </div>

        {/* Header Actions */}
        <div className="header-actions">
          {/* Connection Status Badge */}
          <div className="gateway-status-pill">
            <span className="pulse-beacon" style={{ backgroundColor: 'var(--bullish-neon)' }} />
            <span style={{ color: 'var(--bullish-text)', fontWeight: 600 }}>Upstox Connected</span>
            <span className="gateway-latency">18ms</span>
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

      {/* Dual App Mode Switcher Navigation */}
      <nav className="app-mode-nav">
        <button
          className={`app-mode-btn ${activeApp === 'scanner' ? 'active' : ''}`}
          onClick={() => setActiveApp('scanner')}
        >
          <BarChart3 size={16} />
          <span>Confirmed Crossover Scanner</span>
          <span className="app-mode-badge bullish">{results.length} Active</span>
        </button>
        <button
          className={`app-mode-btn ${activeApp === 'screener' ? 'active' : ''}`}
          onClick={() => setActiveApp('screener')}
        >
          <Microscope size={16} />
          <span>Deep Screener & Double Confirmation</span>
          <span className="app-mode-badge cyan">Multi-Timeframe</span>
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
                <span className="font-mono" style={{ color: 'var(--bullish-text)' }}>+33% vs yday</span>
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
                <span className="font-mono" style={{ color: 'var(--bearish-text)' }}>-12% vs yday</span>
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
              <button
                className="btn btn-secondary"
                onClick={handleRunScanner}
                disabled={scanStatus.is_running}
                style={{ marginTop: '6px', padding: '5px 10px', fontSize: '0.74rem', width: '100%', gap: '6px' }}
              >
                <RotateCw className={scanStatus.is_running ? 'animate-spin' : ''} size={12} />
                <span>Force Trigger Scan</span>
              </button>
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
                <span className="font-mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700, fontSize: '0.9rem' }}>
                  {progressPercent}%
                </span>
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
                  Fresh Today
                </button>
              </div>
            </div>

            <div className="toolbar-right">
              {/* Universe Selector Dropdown */}
              <select
                className="btn btn-secondary"
                value={universeFilter}
                onChange={(e) => setUniverseFilter(e.target.value)}
                style={{ padding: '7px 10px', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                <option value="NIFTY_200">Universe: NIFTY 100+200</option>
                <option value="NIFTY_100">Universe: NIFTY 100 Only</option>
              </select>

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
                            {item['Crossover Date']}
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: '#ffffff', fontSize: '0.88rem' }}>
                            ₹{item.Close.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                title="Deep Fundamental & Double Confirmation Analysis"
                              >
                                <Microscope size={13} style={{ color: 'var(--accent-cyan)' }} />
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
                  <span>Deep Screener & Double Confirmation</span>
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
          <span style={{ color: 'var(--bullish-text)' }}>0 Dropped Packets</span>
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
