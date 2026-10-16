import React, { useState, useEffect, useMemo } from 'react'
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  RotateCw,
  Search,
  ExternalLink,
  Zap,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Award,
  Layers,
  BarChart3,
  ArrowRight,
  Flame,
  Clock
} from 'lucide-react'
import './BestStocksRadar.css'
import { apiFetch } from './apiClient'

// Formatting helper
const formatNum = (val, decimals = 2, fallback = '—') => {
  if (val === null || val === undefined || isNaN(Number(val))) return fallback
  return Number(val).toFixed(decimals)
}

export default function BestStocksRadar({ apiBase, onSelectStock }) {
  const [stocks, setStocks] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [activeFilter, setActiveFilter] = useState('ALL') // ALL, PRIME, CONVICTION, HIGH_RR, OUTPERFORMING
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState('cards') // 'cards' | 'table'

  const fetchBestStocks = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const url = `${apiBase || ''}/api/algo/best-stocks${isManualRefresh ? '?refresh=true' : ''}`
      const res = await apiFetch(url)
      if (!res.ok) {
        let errDetail = 'Failed to load Best Stocks Radar'
        try {
          const errData = await res.json()
          errDetail = errData.detail || errDetail
        } catch {}
        throw new Error(errDetail)
      }
      const data = await res.json()
      if (data && data.stocks) {
        setStocks(data.stocks)
        setLastUpdated(data.last_updated || new Date().toLocaleTimeString())
      } else {
        throw new Error('No stock data returned from radar engine')
      }
    } catch (err) {
      console.error('Best Stocks Radar error:', err)
      setError(err.message || 'Unable to load best stocks radar.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchBestStocks()
  }, [apiBase])

  // Filtered stocks list
  const filteredStocks = useMemo(() => {
    let list = [...stocks]

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase()
      list = list.filter(s => s.symbol.toUpperCase().includes(q))
    }

    // Category Filter
    if (activeFilter === 'PRIME') {
      list = list.filter(s => s.signal === 'STRONG BUY' || s.alpha_score >= 75)
    } else if (activeFilter === 'CONVICTION') {
      list = list.filter(s => s.signal === 'STRONG BUY' || s.signal === 'BUY')
    } else if (activeFilter === 'HIGH_RR') {
      list = list.filter(s => (s.risk_reward || 0) >= 2.0)
    } else if (activeFilter === 'OUTPERFORMING') {
      list = list.filter(s => (s.rs_vs_nifty_pct || 0) > 0)
    }

    return list
  }, [stocks, searchQuery, activeFilter])

  // Summary Metrics
  const primeCount = useMemo(() => stocks.filter(s => s.signal === 'STRONG BUY' || s.alpha_score >= 75).length, [stocks])
  const convictionCount = useMemo(() => stocks.filter(s => s.signal === 'STRONG BUY' || s.signal === 'BUY').length, [stocks])
  const avgRR = useMemo(() => {
    if (!stocks.length) return '—'
    const total = stocks.reduce((acc, s) => acc + (s.risk_reward || 0), 0)
    return (total / stocks.length).toFixed(2)
  }, [stocks])
  const topStock = useMemo(() => (stocks.length > 0 ? stocks[0] : null), [stocks])

  return (
    <section className="best-stocks-radar-wrap">
      {/* ========================================================================= */}
      {/* RADAR HEADER BANNER                                                       */}
      {/* ========================================================================= */}
      <div className="glass-panel radar-hero-banner">
        <div className="radar-hero-left">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="radar-badge-icon">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="radar-main-title">
                <span>AI Best Stocks Radar</span>
                <span className="app-mode-badge gold">Top Swing Alpha v4.0</span>
              </h2>
              <div className="radar-subtitle">
                Automated multi-factor quantitative ranking across NSE equities. Evaluates XGBoost ML probability, Risk/Reward, Supertrend, Multi-Timeframe Alignment, and relative strength to spot the highest-conviction trades.
              </div>
            </div>
          </div>
        </div>

        <div className="radar-hero-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setViewMode(prev => (prev === 'cards' ? 'table' : 'cards'))}
            title="Toggle Cards vs Dense Table view"
          >
            <Layers size={14} />
            <span>{viewMode === 'cards' ? 'Table View' : 'Card View'}</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => fetchBestStocks(true)}
            disabled={loading || refreshing}
            title="Re-execute multi-stock AI swing scan"
          >
            <RotateCw className={refreshing ? 'animate-spin' : ''} size={14} />
            <span>{refreshing ? 'Scanning NSE...' : 'Refresh Radar'}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RADAR SUMMARY STATS STRIP                                                 */}
      {/* ========================================================================= */}
      <div className="radar-stats-strip">
        <div className="radar-stat-box glass-panel">
          <div className="radar-stat-label">CANDIDATES SCREENED</div>
          <div className="radar-stat-value font-mono">{stocks.length}</div>
          <div className="radar-stat-sub">NSE NIFTY Universe</div>
        </div>

        <div className="radar-stat-box glass-panel highlight-prime">
          <div className="radar-stat-label">👑 PRIME ALPHA (STRONG BUY)</div>
          <div className="radar-stat-value font-mono" style={{ color: 'var(--bullish-neon)' }}>
            {primeCount}
          </div>
          <div className="radar-stat-sub">Score ≥ 75 or Strong Buy</div>
        </div>

        <div className="radar-stat-box glass-panel">
          <div className="radar-stat-label">⭐ HIGH CONVICTION BUYS</div>
          <div className="radar-stat-value font-mono" style={{ color: '#38bdf8' }}>
            {convictionCount}
          </div>
          <div className="radar-stat-sub">Passed Core AI Rules</div>
        </div>

        <div className="radar-stat-box glass-panel">
          <div className="radar-stat-label">AVERAGE RISK / REWARD</div>
          <div className="radar-stat-value font-mono" style={{ color: '#fbbf24' }}>
            1 : {avgRR}
          </div>
          <div className="radar-stat-sub">Minimum threshold ≥ 1.80</div>
        </div>

        {topStock && (
          <div
            className="radar-stat-box glass-panel top-pick-spotlight clickable"
            onClick={() => onSelectStock && onSelectStock(topStock.symbol)}
            title="Click to analyze top pick in AI Swing v4.0"
          >
            <div className="radar-stat-label" style={{ color: 'var(--bullish-neon)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Flame size={13} />
              <span>#1 HIGHEST RANKED OPPORTUNITY</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
                {topStock.symbol}
              </span>
              <span className="font-mono" style={{ color: 'var(--bullish-text)', fontSize: '0.9rem' }}>
                ₹{formatNum(topStock.price, 2)}
              </span>
            </div>
            <div className="radar-stat-sub" style={{ color: 'var(--accent-cyan)' }}>
              Alpha Score: <strong>{topStock.alpha_score}/100</strong> • Click to View Plan →
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* FILTER & SEARCH TOOLBAR                                                   */}
      {/* ========================================================================= */}
      <div className="radar-toolbar glass-panel">
        <div className="radar-filter-pills">
          <button
            className={`radar-pill ${activeFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => setActiveFilter('ALL')}
          >
            All Candidates ({stocks.length})
          </button>
          <button
            className={`radar-pill ${activeFilter === 'PRIME' ? 'active gold' : ''}`}
            onClick={() => setActiveFilter('PRIME')}
          >
            👑 Prime Alpha ({primeCount})
          </button>
          <button
            className={`radar-pill ${activeFilter === 'CONVICTION' ? 'active bullish' : ''}`}
            onClick={() => setActiveFilter('CONVICTION')}
          >
            ⭐ High Conviction ({convictionCount})
          </button>
          <button
            className={`radar-pill ${activeFilter === 'HIGH_RR' ? 'active cyan' : ''}`}
            onClick={() => setActiveFilter('HIGH_RR')}
          >
            🎯 R/R ≥ 2.0
          </button>
          <button
            className={`radar-pill ${activeFilter === 'OUTPERFORMING' ? 'active green' : ''}`}
            onClick={() => setActiveFilter('OUTPERFORMING')}
          >
            🚀 Outperforming NIFTY
          </button>
        </div>

        <div className="search-box radar-search">
          <Search className="search-icon" size={15} />
          <input
            type="text"
            className="search-input"
            placeholder="Search stock (e.g. RELIANCE, TCS)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LOADING / ERROR STATE                                                     */}
      {/* ========================================================================= */}
      {loading && (
        <div className="glass-panel radar-loading-card">
          <RotateCw className="animate-spin" size={36} style={{ color: 'var(--accent-cyan)', margin: '0 auto 12px' }} />
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
            Running AI Swing Radar across NSE Universe...
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Evaluating TimeSeriesSplit XGBoost cross-validation, Supertrend, ATR Targets, and multi-timeframe trends in parallel.
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="alert-box alert-danger" style={{ marginTop: '16px' }}>
          <AlertTriangle size={18} />
          <div style={{ flex: 1 }}>
            <strong>Radar Notice:</strong> {error}
          </div>
          <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => fetchBestStocks(true)}>
            Retry Scan
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GRID CARDS VIEW                                                           */}
      {/* ========================================================================= */}
      {!loading && !error && viewMode === 'cards' && (
        <div className="radar-cards-grid">
          {filteredStocks.length === 0 ? (
            <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No candidate stocks matched the selected filter criteria. Try clicking "All Candidates" or Refresh Radar.
            </div>
          ) : (
            filteredStocks.map((stock) => {
              const isStrongBuy = stock.signal === 'STRONG BUY'
              const isBuy = stock.signal === 'BUY'
              const isPrime = stock.alpha_score >= 75 || isStrongBuy

              return (
                <div
                  key={stock.symbol}
                  className={`radar-stock-card glass-panel ${isPrime ? 'card-prime' : ''}`}
                >
                  {/* Card Header */}
                  <div className="radar-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="radar-rank-chip font-mono">#{stock.rank}</span>
                      <div>
                        <div className="radar-stock-sym font-mono">{stock.symbol}</div>
                        <div className="radar-stock-price font-mono">₹{formatNum(stock.price, 2)}</div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span className={`signal-pill ${isStrongBuy ? 'strong-bullish' : isBuy ? 'bullish' : 'neutral'}`}>
                        {isStrongBuy ? <Flame size={12} /> : isBuy ? <TrendingUp size={12} /> : null}
                        <span>{stock.signal}</span>
                      </span>
                      <div className="radar-tier-sub" style={{ color: stock.alpha_tier_color }}>
                        {stock.alpha_tier_label}
                      </div>
                    </div>
                  </div>

                  {/* Quantitative Score & AI Confidence Matrix */}
                  <div className="radar-score-matrix">
                    <div className="radar-mini-metric">
                      <span className="metric-label">ALPHA SCORE</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                        <span className="font-mono metric-num" style={{ color: stock.alpha_tier_color }}>
                          {stock.alpha_score}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>/100</span>
                      </div>
                    </div>

                    <div className="radar-mini-metric">
                      <span className="metric-label">AI PROBABILITY</span>
                      <span className="font-mono metric-num" style={{ color: stock.ai_probability >= 60 ? 'var(--bullish-text)' : 'var(--text-sub)' }}>
                        {formatNum(stock.ai_probability, 1)}%
                      </span>
                    </div>

                    <div className="radar-mini-metric">
                      <span className="metric-label">RISK / REWARD</span>
                      <span className="font-mono metric-num" style={{ color: (stock.risk_reward || 0) >= 2.0 ? 'var(--bullish-neon)' : '#fbbf24' }}>
                        1 : {formatNum(stock.risk_reward, 2)}
                      </span>
                    </div>

                    <div className="radar-mini-metric">
                      <span className="metric-label">BUY CHECKS</span>
                      <span className="font-mono metric-num" style={{ color: stock.buy_score >= 6 ? 'var(--bullish-text)' : 'var(--text-sub)' }}>
                        {stock.buy_score}/8
                      </span>
                    </div>
                  </div>

                  {/* Concrete Trade Plan Box */}
                  <div className="radar-trade-plan-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                      <span>PREDICTED TRADE PLAN (5-DAY SWING)</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>~{stock.hold_period_days || 5} Days</span>
                    </div>

                    <div className="trade-plan-grid">
                      <div className="tp-item">
                        <span className="tp-label">Entry</span>
                        <span className="tp-val font-mono">₹{formatNum(stock.entry_price, 2)}</span>
                      </div>
                      <div className="tp-item">
                        <span className="tp-label">Target</span>
                        <span className="tp-val font-mono" style={{ color: 'var(--bullish-text)' }}>
                          ₹{formatNum(stock.target_price, 2)}
                          <small style={{ marginLeft: '3px' }}>(+{formatNum(stock.target_pct, 1)}%)</small>
                        </span>
                      </div>
                      <div className="tp-item">
                        <span className="tp-label">Stoploss</span>
                        <span className="tp-val font-mono" style={{ color: 'var(--bearish-text)' }}>
                          ₹{formatNum(stock.stoploss_price, 2)}
                          <small style={{ marginLeft: '3px' }}>(-{formatNum(stock.stoploss_pct, 1)}%)</small>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Key Catalysts & Technical Alignment */}
                  <div className="radar-catalysts-wrap">
                    {stock.catalysts && stock.catalysts.map((cat, i) => (
                      <span key={i} className="catalyst-chip">
                        <CheckCircle2 size={11} style={{ color: 'var(--bullish-neon)' }} />
                        <span>{cat}</span>
                      </span>
                    ))}
                  </div>

                  {/* Action Buttons */}
                  <div className="radar-card-footer">
                    <button
                      className="btn btn-primary"
                      style={{ flex: 1, gap: '6px', fontSize: '0.8rem' }}
                      onClick={() => onSelectStock && onSelectStock(stock.symbol)}
                      title="Inspect full neural indicators and walk-forward backtest"
                    >
                      <Zap size={14} style={{ color: 'var(--bullish-neon)' }} />
                      <span>Inspect in AI Swing</span>
                      <ArrowRight size={13} />
                    </button>

                    <a
                      className="btn btn-secondary"
                      href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(stock.symbol)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ padding: '7px 12px' }}
                      title="Open live chart on TradingView"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* DENSE TABLE VIEW                                                          */}
      {/* ========================================================================= */}
      {!loading && !error && viewMode === 'table' && (
        <div className="glass-panel" style={{ padding: '16px', overflowX: 'auto' }}>
          <table className="scanner-table radar-table">
            <thead>
              <tr>
                <th style={{ width: '45px' }}>Rank</th>
                <th>Stock</th>
                <th>Signal</th>
                <th>Alpha Score</th>
                <th>AI Probability</th>
                <th>LTP</th>
                <th>Target (+%)</th>
                <th>Stoploss (-%)</th>
                <th>R/R</th>
                <th>Supertrend</th>
                <th>Weekly</th>
                <th>RS vs NIFTY</th>
                <th style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStocks.map((stock) => {
                const isStrongBuy = stock.signal === 'STRONG BUY'
                const isBuy = stock.signal === 'BUY'

                return (
                  <tr key={stock.symbol}>
                    <td className="font-mono" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                      #{stock.rank}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="font-mono font-bold" style={{ color: '#ffffff' }}>{stock.symbol}</span>
                        <span className="exchange-chip">NSE</span>
                      </div>
                    </td>
                    <td>
                      <span className={`signal-pill ${isStrongBuy ? 'strong-bullish' : isBuy ? 'bullish' : 'neutral'}`}>
                        <span>{stock.signal}</span>
                      </span>
                    </td>
                    <td>
                      <span className="font-mono font-bold" style={{ color: stock.alpha_tier_color, fontSize: '0.95rem' }}>
                        {stock.alpha_score}
                      </span>
                    </td>
                    <td className="font-mono" style={{ color: stock.ai_probability >= 60 ? 'var(--bullish-text)' : 'var(--text-sub)' }}>
                      {formatNum(stock.ai_probability, 1)}%
                    </td>
                    <td className="font-mono">₹{formatNum(stock.price, 2)}</td>
                    <td className="font-mono" style={{ color: 'var(--bullish-text)' }}>
                      ₹{formatNum(stock.target_price, 2)} (+{formatNum(stock.target_pct, 1)}%)
                    </td>
                    <td className="font-mono" style={{ color: 'var(--bearish-text)' }}>
                      ₹{formatNum(stock.stoploss_price, 2)} (-{formatNum(stock.stoploss_pct, 1)}%)
                    </td>
                    <td className="font-mono" style={{ color: (stock.risk_reward || 0) >= 2.0 ? 'var(--bullish-neon)' : '#fbbf24' }}>
                      1 : {formatNum(stock.risk_reward, 2)}
                    </td>
                    <td>
                      <span style={{ color: stock.supertrend === 'BULLISH' ? 'var(--bullish-text)' : 'var(--bearish-text)', fontSize: '0.78rem', fontWeight: 600 }}>
                        {stock.supertrend || '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: stock.weekly_trend === 'BULLISH' ? 'var(--bullish-text)' : 'var(--bearish-text)', fontSize: '0.78rem', fontWeight: 600 }}>
                        {stock.weekly_trend || '—'}
                      </span>
                    </td>
                    <td className="font-mono" style={{ color: (stock.rs_vs_nifty_pct || 0) > 0 ? 'var(--bullish-text)' : 'var(--text-muted)' }}>
                      {(stock.rs_vs_nifty_pct || 0) > 0 ? `+${formatNum(stock.rs_vs_nifty_pct, 1)}%` : `${formatNum(stock.rs_vs_nifty_pct, 1)}%`}
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
                        <button
                          className="btn btn-primary"
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                          onClick={() => onSelectStock && onSelectStock(stock.symbol)}
                          title="Open AI Swing Analysis"
                        >
                          <Zap size={12} />
                          <span>Analyze</span>
                        </button>
                        <a
                          className="btn btn-secondary"
                          href={`https://in.tradingview.com/chart/?symbol=NSE:${encodeURIComponent(stock.symbol)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ padding: '4px 8px' }}
                          title="View Chart"
                        >
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
