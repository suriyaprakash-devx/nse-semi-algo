import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  BrainCircuit,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  ShieldAlert,
  Sparkles,
  RotateCw,
  Search,
  Award,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  BarChart3,
  Layers,
  Activity,
  Flame,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Info,
  Check,
  X,
  Zap,
  Calculator,
  Sliders,
  Maximize2,
  Calendar,
  DollarSign,
  LineChart,
  Filter,
  History,
  Terminal,
  FileCode
} from 'lucide-react'
import './AlgoSignals.css'
import { apiFetch } from './apiClient'

const POPULAR_SYMBOLS = [
  'RELIANCE',
  'TCS',
  'HDFCBANK',
  'INFY',
  'ICICIBANK',
  'HAL',
  'COALINDIA',
  'TATAMOTORS',
  'SBIN',
  'ITC',
  'BHARTIARTL',
  'LT',
  'BAJFINANCE',
  'TITAN',
  'AXISBANK',
  'SUNPHARMA',
  'MARUTI',
  'BEL'
]

// Number & Currency formatting helpers to guard against null/undefined/.toFixed() runtime crashes
const formatNum = (val, decimals = 2, fallback = '—') => {
  if (val === null || val === undefined || isNaN(Number(val))) return fallback
  return Number(val).toFixed(decimals)
}

const formatCurrency = (val, decimals = 2, fallback = '₹0.00') => {
  if (val === null || val === undefined || isNaN(Number(val))) return fallback
  return `₹${Number(val).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`
}

// =========================================================================
// 1. INTERACTIVE CANDLESTICK & EMA & VOLUME SVG CHART (TOUCH + MOUSE READY)
// =========================================================================
function InteractiveCandleChart({ history = [], currentPrice = 0, symbol = '' }) {
  const [hoverIndex, setHoverIndex] = useState(null)
  const [chartMode, setChartMode] = useState('candles') // 'candles' | 'area'
  const svgRef = useRef(null)

  if (!history || history.length === 0) {
    return (
      <div className="candle-empty-state">
        <Clock size={20} className="text-text-muted" />
        <span>No historical candlestick sessions available</span>
      </div>
    )
  }

  // Dimensions
  const W = 960
  const H = 400
  const pad = { top: 30, right: 65, bottom: 45, left: 20 }
  const priceH = 260
  const volH = 65
  const volTop = pad.top + priceH + 15
  const chartW = W - pad.left - pad.right

  // Price Extents
  const minPrice = Math.min(...history.map(d => Math.min(d.low ?? d.close ?? 1, (d.ema20 != null ? d.ema20 : (d.low ?? d.close ?? 1)), (d.ema50 != null ? d.ema50 : (d.low ?? d.close ?? 1))))) * 0.992
  const maxPrice = Math.max(...history.map(d => Math.max(d.high ?? d.close ?? 1, (d.ema20 != null ? d.ema20 : (d.high ?? d.close ?? 1)), (d.ema50 != null ? d.ema50 : (d.high ?? d.close ?? 1))))) * 1.008
  const priceSpan = Math.max(0.01, maxPrice - minPrice)

  // Volume Extents
  const maxVol = Math.max(1, ...history.map(d => Number(d.volume) || 1))

  // Scalers
  const xAt = (i) => pad.left + (i + 0.5) * (chartW / Math.max(1, history.length))
  const yAtPrice = (p) => pad.top + priceH - ((Number(p) - minPrice) / priceSpan) * priceH
  const yAtVol = (v) => volTop + volH - (Number(v) / maxVol) * volH
  const candleW = Math.max(4, Math.min(14, (chartW / Math.max(1, history.length)) * 0.65))

  // EMA paths (Safely starts with M even if earlier points are null/NaN)
  const ema20Path = useMemo(() => {
    let started = false
    const pts = []
    for (let i = 0; i < history.length; i++) {
      const v = history[i]?.ema20
      if (v != null && !isNaN(v)) {
        pts.push(`${!started ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAtPrice(v).toFixed(1)}`)
        started = true
      }
    }
    return pts.join(' ')
  }, [history, minPrice, priceSpan])

  const ema50Path = useMemo(() => {
    let started = false
    const pts = []
    for (let i = 0; i < history.length; i++) {
      const v = history[i]?.ema50
      if (v != null && !isNaN(v)) {
        pts.push(`${!started ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAtPrice(v).toFixed(1)}`)
        started = true
      }
    }
    return pts.join(' ')
  }, [history, minPrice, priceSpan])

  // Area Path
  const areaPath = useMemo(() => {
    if (history.length === 0) return ''
    const points = history.map((d, i) => `${xAt(i).toFixed(1)} ${yAtPrice(d.close || 0).toFixed(1)}`)
    const firstX = xAt(0).toFixed(1)
    const lastX = xAt(history.length - 1).toFixed(1)
    const baseY = (pad.top + priceH).toFixed(1)
    return `M ${points.join(' L ')} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`
  }, [history, minPrice, priceSpan])

  // Price Gridlines (4 levels)
  const gridLevels = [0.1, 0.35, 0.65, 0.9].map(ratio => {
    const p = minPrice + ratio * priceSpan
    return { price: p, y: yAtPrice(p) }
  })

  // Pointer position tracker (works for both mouse & touch)
  const updatePointer = (clientX) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const mouseX = clientX - rect.left
    const scaledX = (mouseX / rect.width) * W
    const relativeX = scaledX - pad.left
    if (relativeX < 0 || relativeX > chartW) {
      setHoverIndex(null)
      return
    }
    const idx = Math.floor((relativeX / chartW) * history.length)
    if (idx >= 0 && idx < history.length) {
      setHoverIndex(idx)
    } else {
      setHoverIndex(null)
    }
  }

  const handleMouseMove = (e) => updatePointer(e.clientX)
  const handleTouch = (e) => {
    if (e.touches && e.touches.length > 0) {
      updatePointer(e.touches[0].clientX)
    }
  }

  // Active bar resolution with total null safety
  const activeBar = (hoverIndex !== null && history[hoverIndex])
    ? history[hoverIndex]
    : (history[history.length - 1] || {})

  const oVal = Number(activeBar.open) || 0
  const hVal = Number(activeBar.high) || 0
  const lVal = Number(activeBar.low) || 0
  const cVal = Number(activeBar.close) || 0
  const volVal = Number(activeBar.volume) || 0
  const isUpSession = cVal >= oVal
  const sessionChg = cVal - oVal
  const sessionChgPct = oVal > 0 ? (sessionChg / oVal) * 100 : 0

  return (
    <div className="candle-chart-wrapper">
      {/* Chart Control Toolbar */}
      <div className="candle-toolbar">
        <div className="candle-info-hud">
          <div className="hud-symbol-date">
            <span className="hud-sym">{symbol}</span>
            <span className="hud-date font-mono">{activeBar.date || ''}</span>
          </div>
          <div className="hud-ohlc font-mono">
            <span>O: <b className="text-text-main">₹{formatNum(oVal, 2)}</b></span>
            <span>H: <b className="text-bullish-neon">₹{formatNum(hVal, 2)}</b></span>
            <span>L: <b className="text-bearish-neon">₹{formatNum(lVal, 2)}</b></span>
            <span>C: <b className={isUpSession ? 'text-bullish-neon' : 'text-bearish-neon'}>₹{formatNum(cVal, 2)}</b></span>
            <span className={`hud-chg ${isUpSession ? 'text-bullish-neon' : 'text-bearish-neon'}`}>
              ({sessionChg >= 0 ? '+' : ''}{formatNum(sessionChg, 2)} / {sessionChgPct >= 0 ? '+' : ''}{formatNum(sessionChgPct, 2)}%)
            </span>
            <span className="hud-vol text-muted">
              Vol: {volVal >= 1000000 ? `${(volVal / 1000000).toFixed(2)}M` : `${(volVal / 1000).toFixed(1)}k`}
            </span>
          </div>
        </div>

        <div className="candle-actions">
          <div className="chart-legend font-mono">
            <span className="legend-item"><span className="legend-dot dot-ema20" /> EMA 20</span>
            <span className="legend-item"><span className="legend-dot dot-ema50" /> EMA 50</span>
          </div>
          <div className="chart-mode-toggles">
            <button
              className={`mode-btn ${chartMode === 'candles' ? 'active' : ''}`}
              onClick={() => setChartMode('candles')}
              title="Candlestick View"
            >
              Candles
            </button>
            <button
              className={`mode-btn ${chartMode === 'area' ? 'active' : ''}`}
              onClick={() => setChartMode('area')}
              title="Area Line View"
            >
              Line
            </button>
          </div>
        </div>
      </div>

      {/* SVG Canvas with Mouse & Touch Listeners */}
      <div
        className="svg-container"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchStart={handleTouch}
        onTouchMove={handleTouch}
        onTouchEnd={() => setHoverIndex(null)}
      >
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="interactive-candle-svg">
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#00d2ff" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="volUpGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.15" />
            </linearGradient>
            <linearGradient id="volDownGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.15" />
            </linearGradient>
          </defs>

          {/* Gridlines */}
          {gridLevels.map((g, idx) => (
            <g key={idx}>
              <line
                x1={pad.left}
                y1={g.y}
                x2={W - pad.right}
                y2={g.y}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray="4 4"
              />
              <text
                x={W - pad.right + 8}
                y={g.y + 4}
                className="svg-axis-label font-mono"
              >
                ₹{g.price.toFixed(1)}
              </text>
            </g>
          ))}

          {/* Volume baseline */}
          <line
            x1={pad.left}
            y1={volTop}
            x2={W - pad.right}
            y2={volTop}
            stroke="rgba(255, 255, 255, 0.10)"
          />
          <text
            x={W - pad.right + 8}
            y={volTop + 14}
            className="svg-axis-label font-mono"
          >
            VOL
          </text>

          {/* Volume Bars */}
          {history.map((d, i) => {
            const x = xAt(i)
            const yV = yAtVol(d.volume || 1)
            const barH = Math.max(1, volTop + volH - yV)
            const isUp = (d.close || 0) >= (d.open || 0)
            return (
              <rect
                key={`vol-${i}`}
                x={x - candleW / 2}
                y={yV}
                width={candleW}
                height={barH}
                fill={isUp ? 'url(#volUpGrad)' : 'url(#volDownGrad)'}
                rx={1}
              />
            )
          })}

          {/* Candlesticks OR Area */}
          {chartMode === 'area' ? (
            <>
              <path d={areaPath} fill="url(#areaGradient)" />
              <path
                d={history.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAtPrice(d.close || 0).toFixed(1)}`).join(' ')}
                fill="none"
                stroke="#00d2ff"
                strokeWidth={2}
              />
            </>
          ) : (
            history.map((d, i) => {
              const x = xAt(i)
              const yH = yAtPrice(d.high ?? d.close ?? 0)
              const yL = yAtPrice(d.low ?? d.close ?? 0)
              const yO = yAtPrice(d.open ?? d.close ?? 0)
              const yC = yAtPrice(d.close ?? 0)
              const isUp = (d.close || 0) >= (d.open || 0)
              const color = isUp ? '#10b981' : '#ef4444'
              const bodyTop = Math.min(yO, yC)
              const bodyH = Math.max(2, Math.abs(yC - yO))

              return (
                <g key={`candle-${i}`} className="candle-group">
                  {/* Wick */}
                  <line
                    x1={x}
                    y1={yH}
                    x2={x}
                    y2={yL}
                    stroke={color}
                    strokeWidth={1.2}
                    opacity={0.85}
                  />
                  {/* Body */}
                  <rect
                    x={x - candleW / 2}
                    y={bodyTop}
                    width={candleW}
                    height={bodyH}
                    fill={color}
                    rx={1}
                    className="candle-rect"
                  />
                </g>
              )
            })
          )}

          {/* EMA Lines (safely connected) */}
          {ema20Path && (
            <path
              d={ema20Path}
              fill="none"
              stroke="#f59e0b"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          )}
          {ema50Path && (
            <path
              d={ema50Path}
              fill="none"
              stroke="#a855f7"
              strokeWidth={1.8}
              strokeLinecap="round"
            />
          )}

          {/* Interactive Crosshair Tracking */}
          {hoverIndex !== null && history[hoverIndex] && (
            <g className="crosshair-group">
              <line
                x1={xAt(hoverIndex)}
                y1={pad.top}
                x2={xAt(hoverIndex)}
                y2={volTop + volH}
                stroke="rgba(255, 255, 255, 0.45)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <line
                x1={pad.left}
                y1={yAtPrice(history[hoverIndex].close || 0)}
                x2={W - pad.right}
                y2={yAtPrice(history[hoverIndex].close || 0)}
                stroke="rgba(0, 210, 255, 0.45)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <circle
                cx={xAt(hoverIndex)}
                cy={yAtPrice(history[hoverIndex].close || 0)}
                r={4.5}
                fill="#00d2ff"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* Date Axis Ticks (~5 labels) */}
          {history.map((d, i) => {
            const step = Math.floor(history.length / 5) || 1
            if (i % step === 0 || i === history.length - 1) {
              const label = d.date ? String(d.date).slice(5) : ''
              return (
                <text
                  key={`date-${i}`}
                  x={xAt(i)}
                  y={H - 12}
                  textAnchor="middle"
                  className="svg-axis-label font-mono"
                >
                  {label}
                </text>
              )
            }
            return null
          })}
        </svg>
      </div>
    </div>
  )
}

// =========================================================================
// 2. INTERACTIVE WALK-FORWARD CUMULATIVE RETURN SVG CHART
// =========================================================================
function InteractiveEquityCurve({ returns = [] }) {
  const [hoverIndex, setHoverIndex] = useState(null)

  const validReturns = useMemo(() => {
    if (!Array.isArray(returns) || returns.length === 0) return []
    return returns.map(Number).filter(v => !isNaN(v))
  }, [returns])

  if (validReturns.length === 0) {
    return <div className="equity-empty font-mono">No walk-forward curve data available</div>
  }

  const W = 620
  const H = 160
  const pad = { top: 15, right: 20, bottom: 25, left: 45 }
  const chartW = W - pad.left - pad.right
  const chartH = H - pad.top - pad.bottom

  const rawMin = Math.min(0, ...validReturns)
  const rawMax = Math.max(0, ...validReturns)
  const minVal = rawMin < 0 ? rawMin * 1.15 : -0.5
  const maxVal = rawMax > 0 ? rawMax * 1.15 : 0.5
  const valSpan = Math.max(0.1, maxVal - minVal)

  const xAt = (i) => pad.left + (i / Math.max(1, validReturns.length - 1)) * chartW
  const yAt = (v) => pad.top + chartH - ((Number(v) - minVal) / valSpan) * chartH
  const zeroY = Math.max(pad.top, Math.min(pad.top + chartH, yAt(0)))

  const linePath = validReturns
    .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`)
    .join(' ')

  const areaPath = `M ${xAt(0).toFixed(1)} ${zeroY.toFixed(1)} ` +
    validReturns.map((v, i) => `L ${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(' ') +
    ` L ${xAt(validReturns.length - 1).toFixed(1)} ${zeroY.toFixed(1)} Z`

  const finalReturn = validReturns[validReturns.length - 1] ?? 0
  const isPositive = finalReturn >= 0

  const handlePointer = (clientX, rect) => {
    const relX = ((clientX - rect.left) / rect.width) * W - pad.left
    const idx = Math.round((relX / chartW) * (validReturns.length - 1))
    if (idx >= 0 && idx < validReturns.length) {
      setHoverIndex(idx)
    } else {
      setHoverIndex(null)
    }
  }

  return (
    <div className="equity-curve-card">
      <div className="equity-header font-mono">
        <span className="equity-label">Cumulative Out-Of-Sample Return</span>
        <span className={`equity-val ${isPositive ? 'text-bullish-neon' : 'text-bearish-neon'}`}>
          {isPositive ? '+' : ''}{formatNum(finalReturn, 2)}%
        </span>
      </div>

      <div className="equity-svg-wrap">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="equity-svg"
          onMouseMove={(e) => handlePointer(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={() => setHoverIndex(null)}
          onTouchStart={(e) => e.touches?.[0] && handlePointer(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchMove={(e) => e.touches?.[0] && handlePointer(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchEnd={() => setHoverIndex(null)}
        >
          <defs>
            <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity="0.4" />
              <stop offset="100%" stopColor={isPositive ? '#10b981' : '#ef4444'} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Zero reference line */}
          <line
            x1={pad.left}
            y1={zeroY}
            x2={W - pad.right}
            y2={zeroY}
            stroke="rgba(255, 255, 255, 0.2)"
            strokeDasharray="4 4"
          />
          <text x={pad.left - 8} y={zeroY + 4} textAnchor="end" className="svg-axis-label font-mono">
            0%
          </text>

          {/* Area & Line */}
          <path d={areaPath} fill="url(#equityGrad)" />
          <path
            d={linePath}
            fill="none"
            stroke={isPositive ? '#10b981' : '#ef4444'}
            strokeWidth={2}
          />

          {/* Hover indicator */}
          {hoverIndex !== null && validReturns[hoverIndex] !== undefined && (
            <g>
              <line
                x1={xAt(hoverIndex)}
                y1={pad.top}
                x2={xAt(hoverIndex)}
                y2={pad.top + chartH}
                stroke="rgba(255, 255, 255, 0.35)"
                strokeDasharray="2 2"
              />
              <circle
                cx={xAt(hoverIndex)}
                cy={yAt(validReturns[hoverIndex])}
                r={4.5}
                fill={validReturns[hoverIndex] >= 0 ? '#10b981' : '#ef4444'}
                stroke="#fff"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* X ticks */}
          <text x={pad.left} y={H - 6} className="svg-axis-label font-mono">
            Trade 1
          </text>
          <text x={W - pad.right} y={H - 6} textAnchor="end" className="svg-axis-label font-mono">
            Trade {validReturns.length}
          </text>
        </svg>

        {hoverIndex !== null && validReturns[hoverIndex] !== undefined && (
          <div className="equity-hud-tooltip font-mono">
            Trade #{hoverIndex + 1}: <b className={validReturns[hoverIndex] >= 0 ? 'text-bullish-neon' : 'text-bearish-neon'}>
              {validReturns[hoverIndex] >= 0 ? '+' : ''}{formatNum(validReturns[hoverIndex], 2)}%
            </b>
          </div>
        )}
      </div>
    </div>
  )
}

// =========================================================================
// 3. DYNAMIC POSITION SIZING & CAPITAL ALLOCATOR CALCULATOR
// =========================================================================
function PositionSizingCalculator({ entryPrice = 0, stoplossPrice = 0, targetPrice = 0 }) {
  const [capital, setCapital] = useState(100000)
  const [riskPct, setRiskPct] = useState(2.0)
  const [isOpen, setIsOpen] = useState(false)

  const entry = Math.max(0.01, Number(entryPrice) || 0)
  const sl = Number(stoplossPrice) || (entry * 0.95)
  const tg = Number(targetPrice) || (entry * 1.10)

  const riskPerShare = Math.max(0.05, entry > sl ? entry - sl : entry * 0.03)
  const targetPerShare = Math.max(0.05, tg > entry ? tg - entry : entry * 0.06)
  const maxRiskAmount = Math.max(10, (capital * riskPct) / 100)

  // Recommended quantity based on max risk amount allowed
  const suggestedQty = Math.max(1, Math.floor(maxRiskAmount / riskPerShare))
  const totalOutlay = suggestedQty * entry
  const maxCashQty = entry > 0 ? Math.max(1, Math.floor(capital / entry)) : 0
  const totalRiskINR = suggestedQty * riskPerShare
  const totalRewardINR = suggestedQty * targetPerShare
  const netRR = totalRiskINR > 0 ? (totalRewardINR / totalRiskINR).toFixed(2) : '2.00'
  const isExceedingCash = totalOutlay > capital

  return (
    <div className="calc-drawer-wrapper">
      <div
        className="calc-trigger-bar"
        onClick={() => setIsOpen(!isOpen)}
        role="button"
        tabIndex={0}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calculator size={16} className="text-accent-cyan" />
          <span className="calc-title">Trade Position Sizing & Capital Allocator</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="calc-summary font-mono">
            Recommended: <b>{suggestedQty} Qty</b> • Outlay: ₹{totalOutlay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </span>
          <span className="calc-toggle-btn">
            {isOpen ? 'Collapse ▲' : 'Open Calculator ▼'}
          </span>
        </div>
      </div>

      {isOpen && (
        <div className="calc-content-panel">
          <div className="calc-inputs-row">
            <div className="calc-input-group">
              <label>Trading Capital (₹)</label>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Math.max(1000, Number(e.target.value) || 0))}
                className="calc-input font-mono"
                step="10000"
              />
            </div>

            <div className="calc-input-group">
              <label>Max Risk Allowed (% Capital)</label>
              <div className="calc-range-row">
                <input
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.5"
                  value={riskPct}
                  onChange={(e) => setRiskPct(Number(e.target.value))}
                  className="calc-slider"
                />
                <span className="calc-slider-val font-mono">{riskPct}%</span>
              </div>
            </div>
          </div>

          <div className="calc-results-grid">
            <div className="calc-res-card">
              <span className="calc-res-label">RECOMMENDED SHARES</span>
              <span className="calc-res-val font-mono text-accent-cyan">{suggestedQty} Qty</span>
              <span className="calc-res-sub">Based on ₹{maxRiskAmount.toLocaleString('en-IN')} max risk</span>
            </div>

            <div className="calc-res-card">
              <span className="calc-res-label">TOTAL CAPITAL REQUIRED</span>
              <span className="calc-res-val font-mono">₹{totalOutlay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              <span className={`calc-res-sub font-mono ${isExceedingCash ? 'text-warning-text' : ''}`}>
                {isExceedingCash
                  ? `Requires ${(totalOutlay / capital).toFixed(1)}x leverage (Max Cash: ${maxCashQty} Qty)`
                  : `${(totalOutlay / capital * 100).toFixed(1)}% of total portfolio`}
              </span>
            </div>

            <div className="calc-res-card">
              <span className="calc-res-label">MAX STOPLOSS RISK</span>
              <span className="calc-res-val font-mono text-bearish-neon">-₹{totalRiskINR.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              <span className="calc-res-sub font-mono">-₹{riskPerShare.toFixed(2)} / share</span>
            </div>

            <div className="calc-res-card">
              <span className="calc-res-label">PROJECTED PROFIT</span>
              <span className="calc-res-val font-mono text-bullish-neon">+₹{totalRewardINR.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              <span className="calc-res-sub font-mono">Net 1 : {netRR} Risk/Reward</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =========================================================================
// MAIN ALGO SIGNALS COMPONENT
// =========================================================================
export default function AlgoSignals({ apiBase = '', initialSymbol = 'RELIANCE' }) {
  const [symbol, setSymbol] = useState(initialSymbol || 'RELIANCE')
  const [searchInput, setSearchInput] = useState(initialSymbol || 'RELIANCE')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [loadingStep, setLoadingStep] = useState(0)

  // Checklist Filter & Trades Filter
  const [checkFilter, setCheckFilter] = useState('all') // 'all' | 'passed' | 'failed'
  const [tradeFilter, setTradeFilter] = useState('all') // 'all' | 'won' | 'lost'
  const [showConsoleOutput, setShowConsoleOutput] = useState(false)
  const [copiedTerminal, setCopiedTerminal] = useState(false)

  // In-memory client cache to make switching between equities instant
  const analysisCacheRef = useRef(new Map())
  const currentReqId = useRef(0)

  // Recent searches cache
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const stored = localStorage.getItem('algo_recent_searches')
      return stored ? JSON.parse(stored) : ['RELIANCE', 'TCS', 'INFY']
    } catch {
      return ['RELIANCE', 'TCS', 'INFY']
    }
  })

  // Rotating loading messages
  useEffect(() => {
    let interval = null
    if (loading) {
      setLoadingStep(0)
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % 4)
      }, 2000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [loading])

  const fetchAnalysis = async (symToFetch, forceRefresh = false) => {
    const cleanSym = (symToFetch || symbol || 'RELIANCE').trim().toUpperCase().replace('.NS', '')
    if (!cleanSym) return

    // Check fast client-side in-memory cache (5 min TTL)
    const now = Date.now()
    if (!forceRefresh && analysisCacheRef.current.has(cleanSym)) {
      const cached = analysisCacheRef.current.get(cleanSym)
      if (now - cached.timestamp < 300000) {
        setSymbol(cleanSym)
        setSearchInput(cleanSym)
        setData(cached.data)
        setLoading(false)
        setError(null)
        return
      }
    }

    const reqId = ++currentReqId.current
    setLoading(true)
    setError(null)
    setSymbol(cleanSym)
    setSearchInput(cleanSym)

    // Save to recents
    setRecentSearches(prev => {
      const updated = [cleanSym, ...prev.filter(s => s !== cleanSym)].slice(0, 8)
      try { localStorage.setItem('algo_recent_searches', JSON.stringify(updated)) } catch {}
      return updated
    })

    try {
      // Resolve base URL safely with full fallback chain
      const resolvedBase = (apiBase && apiBase.trim())
        || (typeof window !== 'undefined' ? localStorage.getItem('upstox_custom_api_url') : null)
        || (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'https://nse-semi-algo-1.onrender.com').replace(/\/+$/, '')

      const url = `${resolvedBase}/api/algo/swing-analysis?symbol=${encodeURIComponent(cleanSym)}${forceRefresh ? '&refresh=true' : ''}`
      const res = await apiFetch(url)
      if (!res.ok) {
        let errDetail = 'Failed to execute AI Swing Analysis'
        try {
          const errData = await res.json()
          errDetail = errData.detail || errDetail
        } catch {
          const text = await res.text()
          errDetail = text || errDetail
        }
        throw new Error(errDetail)
      }
      const json = await res.json()
      if (reqId !== currentReqId.current) return // Stale response discarded

      if (json.data) {
        setData(json.data)
        analysisCacheRef.current.set(cleanSym, { data: json.data, timestamp: Date.now() })
      } else {
        throw new Error('No analysis data received')
      }
    } catch (err) {
      if (reqId === currentReqId.current) {
        setError(err.message || 'Error executing AI analysis')
      }
    } finally {
      if (reqId === currentReqId.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    fetchAnalysis(initialSymbol || 'RELIANCE')
  }, [initialSymbol])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchInput.trim()) {
      fetchAnalysis(searchInput.trim())
    }
  }

  // Signal color helpers
  const getSignalBadgeClass = (signal) => {
    switch (signal) {
      case 'STRONG BUY':
        return 'signal-strong-buy'
      case 'BUY':
        return 'signal-buy'
      case 'AVOID':
        return 'signal-avoid'
      default:
        return 'signal-wait'
    }
  }

  const getSignalIcon = (signal) => {
    switch (signal) {
      case 'STRONG BUY':
        return <Flame size={20} className="pulse-icon text-bullish-neon" />
      case 'BUY':
        return <TrendingUp size={20} className="text-bullish-base" />
      case 'AVOID':
        return <ShieldAlert size={20} className="pulse-icon text-bearish-neon" />
      default:
        return <Clock size={20} className="text-warning-text" />
    }
  }

  const loadingMessages = [
    'Concurrently downloading 5Y Daily, Weekly & NIFTY 50 Benchmark...',
    'Feature engineering: RSI, MACD, ADX, ATR & Supertrend...',
    'Fitting 5-Fold TimeSeriesSplit with XGBoost Classifier...',
    'Simulating Walk-Forward Out-of-Sample Trades & ATR Targets...'
  ]

  // Filtered Checklist
  const filteredBuyConditions = useMemo(() => {
    if (!data?.buy_conditions) return []
    if (checkFilter === 'passed') return data.buy_conditions.filter(c => c.passed)
    if (checkFilter === 'failed') return data.buy_conditions.filter(c => !c.passed)
    return data.buy_conditions
  }, [data, checkFilter])

  // Filtered Backtest Trades
  const filteredTrades = useMemo(() => {
    if (!data?.backtest?.trades) return []
    if (tradeFilter === 'won') return data.backtest.trades.filter(t => t.won)
    if (tradeFilter === 'lost') return data.backtest.trades.filter(t => !t.won)
    return data.backtest.trades
  }, [data, tradeFilter])

  return (
    <div className="algo-swing-container">
      {/* ===================================================================== */}
      {/* 1. HEADER CONTROLS & SEARCH BAR                                       */}
      {/* ===================================================================== */}
      <section className="glass-panel algo-header-card">
        <div className="algo-header-top">
          <div className="algo-title-block">
            <div className="algo-brand-icon">
              <BrainCircuit size={24} />
            </div>
            <div>
              <div className="algo-title-row">
                <h1 className="algo-main-title">AI SWING TRADING SYSTEM v4.0</h1>
                <span className="algo-version-pill">XGBOOST ML ENGINE</span>
                <span className="algo-horizon-pill">5-DAY SWING HORIZON</span>
              </div>
              <p className="algo-subtitle">
                Supervised machine learning probability classifier with Supertrend, multi-timeframe weekly confirmation, walk-forward backtesting, and automated risk/reward trade execution.
              </p>
            </div>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="algo-search-form">
            <div className="search-box algo-search-box">
              <Search className="search-icon" size={16} />
              <input
                type="text"
                className="search-input"
                placeholder="NSE Symbol (e.g. RELIANCE, TCS)..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
                disabled={loading}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !searchInput.trim()}
              style={{ padding: '9px 18px', fontSize: '0.84rem' }}
            >
              {loading ? (
                <>
                  <RotateCw className="animate-spin" size={14} />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Zap size={14} />
                  <span>Analyze Stock</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fetchAnalysis(symbol, true)}
              disabled={loading}
              title="Force re-run model (bypasses cache)"
              style={{ padding: '9px 12px' }}
            >
              <RotateCw className={loading ? 'animate-spin' : ''} size={14} />
            </button>
          </form>
        </div>

        {/* Quick Tickers & Recent Searches */}
        <div className="algo-quick-strip">
          <span className="algo-quick-label">Equities:</span>
          <div className="algo-chips-wrap">
            {POPULAR_SYMBOLS.map((sym) => (
              <button
                key={sym}
                className={`quick-chip ${symbol === sym ? 'active' : ''}`}
                onClick={() => fetchAnalysis(sym)}
                disabled={loading}
              >
                {sym}
              </button>
            ))}
          </div>

          {recentSearches.length > 0 && (
            <div className="algo-recents-strip">
              <span className="algo-quick-label"><History size={12} /> Recents:</span>
              <div className="algo-chips-wrap">
                {recentSearches.map((sym) => (
                  <button
                    key={`rec-${sym}`}
                    className={`quick-chip chip-recent ${symbol === sym ? 'active' : ''}`}
                    onClick={() => fetchAnalysis(sym)}
                    disabled={loading}
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ERROR NOTICE */}
      {error && (
        <div className="alert-box alert-danger">
          <AlertTriangle size={18} />
          <span style={{ flex: 1 }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1.1rem' }}
          >
            ×
          </button>
        </div>
      )}

      {/* LOADING OVERLAY STATE */}
      {loading && (
        <div className="glass-panel algo-loading-card">
          <div className="loading-orbit">
            <BrainCircuit size={36} className="orbit-icon text-accent-cyan" />
            <div className="orbit-ring animate-spin" />
          </div>
          <div className="loading-text-main">
            Training XGBoost ML Classifier for {symbol}...
          </div>
          <div className="loading-step-msg font-mono">
            {loadingMessages[loadingStep]}
          </div>
          <div className="loading-bar-track">
            <div
              className="loading-bar-fill"
              style={{ width: `${((loadingStep + 1) / loadingMessages.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MAIN AI RESULTS DASHBOARD                                             */}
      {/* ===================================================================== */}
      {!loading && data && (
        <div className="algo-results-layout">
          {/* WARNINGS BANNER */}
          {data.warnings && data.warnings.length > 0 && (
            <div className="alert-box alert-warning">
              <AlertTriangle size={18} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {data.warnings.map((w, idx) => (
                  <span key={idx} style={{ fontSize: '0.84rem' }}>{w}</span>
                ))}
              </div>
            </div>
          )}

          {/* TOP BENTO: AI SIGNAL HERO + TRADE PLAN */}
          <section className="algo-hero-grid">
            {/* HERO 1: AI SIGNAL & PROBABILITY */}
            <div className={`glass-panel algo-hero-signal-card ${getSignalBadgeClass(data.signal)}`}>
              <div className="card-ambient-glow" />
              <div className="hero-signal-top">
                <div className="hero-stock-heading">
                  <span className="stock-sym-badge">{data.symbol || symbol}</span>
                  <span className="stock-exchange-tag">NSE EQUITIES</span>
                  <span className="stock-date-tag font-mono">{data.analysis_date || ''}</span>
                </div>
                <div className="hero-price-display font-mono">
                  <span className="price-label">Current Close (LTP)</span>
                  <span className="price-value">{formatCurrency(data.current_price)}</span>
                </div>
              </div>

              <div className="hero-signal-center">
                <div className="probability-gauge-wrap">
                  <svg className="prob-gauge-svg" viewBox="0 0 100 100">
                    <circle className="gauge-bg" cx="50" cy="50" r="42" />
                    <circle
                      className="gauge-progress"
                      cx="50"
                      cy="50"
                      r="42"
                      style={{
                        strokeDasharray: 264,
                        strokeDashoffset: 264 - (264 * Math.min(100, Math.max(0, Number(data.ai_probability) || 50))) / 100,
                        stroke: (data.ai_probability >= 65) ? 'var(--bullish-neon)' : ((data.ai_probability <= 38) ? 'var(--bearish-neon)' : 'var(--warning-text)')
                      }}
                    />
                  </svg>
                  <div className="prob-gauge-center">
                    <span className="prob-number font-mono">{formatNum(data.ai_probability, 1, '50.0')}%</span>
                    <span className="prob-label">AI PROBABILITY</span>
                  </div>
                </div>

                <div className="signal-verdict-box">
                  <div className="signal-verdict-badge">
                    {getSignalIcon(data.signal)}
                    <span className="signal-text">{data.signal || 'WAIT'}</span>
                  </div>
                  <div className="signal-summary-text">
                    {data.signal === 'STRONG BUY' && 'Institutional conviction confirmed: ≥ 6/8 Buy checks passed.'}
                    {data.signal === 'BUY' && 'Favorable technical & AI alignment: ≥ 4/8 Buy checks passed.'}
                    {data.signal === 'AVOID' && 'High-risk danger zone: ≥ 3 Avoid criteria flagged.'}
                    {data.signal === 'WAIT' && 'Sub-threshold momentum: Awaiting higher conviction trigger.'}
                  </div>
                  <div className="checks-mini-bar font-mono">
                    <span className="checks-pass-pill">
                      <Check size={12} /> {data.buy_score ?? 0}/{data.buy_checks_total ?? 8} Buy Checks
                    </span>
                    {(data.avoid_score ?? 0) > 0 && (
                      <span className="checks-avoid-pill">
                        <AlertTriangle size={12} /> {data.avoid_score} Avoid Flags
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* HERO 2: TRADE PLAN EXECUTION MATRIX */}
            <div className="glass-panel algo-trade-plan-card">
              <div className="trade-plan-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Target size={18} className="text-accent-cyan" />
                  <span className="plan-title">QUANTITATIVE TRADE PLAN</span>
                </div>
                <div className="hold-period-badge font-mono">
                  <Clock size={13} />
                  <span>Est. Hold: ~{data.trade_plan?.hold_period_days ?? 5} Days</span>
                </div>
              </div>

              {/* Price Targets Row */}
              <div className="plan-targets-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                {/* Entry */}
                <div className="plan-target-box entry-box">
                  <span className="box-label">ENTRY PRICE</span>
                  <span className="box-val font-mono">{formatCurrency(data.trade_plan?.entry_price || data.current_price)}</span>
                  <span className="box-sub">Current Market Bar</span>
                </div>

                {/* Target 1 */}
                <div className="plan-target-box target-box">
                  <span className="box-label">TARGET 1 (1.5x ATR)</span>
                  <span className="box-val font-mono text-bullish-neon">{formatCurrency(data.trade_plan?.target_1 || data.trade_plan?.target_price)}</span>
                  <span className="box-sub text-bullish-text font-mono">+{formatNum(data.trade_plan?.target_1_pct ?? (data.trade_plan?.target_pct ? data.trade_plan.target_pct / 2 : 0), 2, '0.00')}%</span>
                </div>

                {/* Target 2 */}
                <div className="plan-target-box target-box" style={{ borderColor: 'var(--bullish-neon)' }}>
                  <span className="box-label">TARGET 2 (3.0x ATR)</span>
                  <span className="box-val font-mono text-bullish-neon" style={{ fontWeight: 800 }}>{formatCurrency(data.trade_plan?.target_2 || data.trade_plan?.target_price)}</span>
                  <span className="box-sub text-bullish-text font-mono">+{formatNum(data.trade_plan?.target_2_pct ?? data.trade_plan?.target_pct, 2, '0.00')}% (Primary)</span>
                </div>

                {/* Target 3 */}
                <div className="plan-target-box target-box">
                  <span className="box-label">TARGET 3 (4.5x ATR)</span>
                  <span className="box-val font-mono text-accent-cyan">{formatCurrency(data.trade_plan?.target_3 || (data.trade_plan?.target_price ? data.trade_plan.target_price * 1.05 : null))}</span>
                  <span className="box-sub text-accent-cyan font-mono">+{formatNum(data.trade_plan?.target_3_pct ?? (data.trade_plan?.target_pct ? data.trade_plan.target_pct * 1.5 : 0), 2, '0.00')}% (Runner)</span>
                </div>

                {/* Stoploss */}
                <div className="plan-target-box sl-box">
                  <span className="box-label">STOPLOSS (1.5x ATR)</span>
                  <span className="box-val font-mono text-bearish-neon">{formatCurrency(data.trade_plan?.stoploss_price)}</span>
                  <span className="box-sub text-bearish-text font-mono">-{formatNum(data.trade_plan?.stoploss_pct, 2, '0.00')}%</span>
                </div>

                {/* Risk / Reward */}
                <div className={`plan-target-box rr-box ${(data.trade_plan?.risk_reward ?? 0) >= 1.8 ? 'rr-good' : 'rr-warn'}`}>
                  <span className="box-label">RISK / REWARD</span>
                  <span className="box-val font-mono">1 : {formatNum(data.trade_plan?.risk_reward, 2, '2.00')}</span>
                  <span className="box-sub">
                    {(data.trade_plan?.risk_reward ?? 0) >= 1.8 ? 'Meets Min 1.8 R/R' : 'Below 1.8 Threshold'}
                  </span>
                </div>
              </div>

              {/* Visual Trade Plan Slider */}
              <div className="plan-slider-wrap">
                <div className="slider-markers-labels font-mono">
                  <span className="sl-marker-label">SL: {formatCurrency(data.trade_plan?.stoploss_price)}</span>
                  <span className="entry-marker-label">Entry: {formatCurrency(data.trade_plan?.entry_price || data.current_price)}</span>
                  <span className="tg-marker-label">T1: {formatCurrency(data.trade_plan?.target_1 || data.trade_plan?.target_price)}</span>
                  <span className="tg-marker-label" style={{ color: 'var(--bullish-neon)', fontWeight: 700 }}>T2: {formatCurrency(data.trade_plan?.target_2 || data.trade_plan?.target_price)}</span>
                  <span className="tg-marker-label" style={{ color: 'var(--accent-cyan)' }}>T3: {formatCurrency(data.trade_plan?.target_3)}</span>
                </div>
                <div className="plan-slider-track">
                  <div className="slider-sl-zone" style={{ width: '25%' }} />
                  <div className="slider-entry-pin" style={{ left: '25%' }} />
                  <div className="slider-tg-zone" style={{ width: '75%' }} />
                </div>
              </div>

              {/* Dynamic Position Sizing Calculator Drawer */}
              <PositionSizingCalculator
                entryPrice={data.trade_plan?.entry_price || data.current_price}
                stoplossPrice={data.trade_plan?.stoploss_price}
                targetPrice={data.trade_plan?.target_price}
              />
            </div>
          </section>

          {/* ===================================================================== */}
          {/* SECTION 2: INTERACTIVE CANDLESTICK & VOLUME CHART                     */}
          {/* ===================================================================== */}
          {data.recent_history && data.recent_history.length > 0 && (
            <section className="glass-panel algo-section-card">
              <div className="section-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <BarChart3 size={18} className="text-accent-cyan" />
                  <h3 className="section-title">Interactive Price Action & Technical Moving Averages</h3>
                </div>
                <span className="section-pill font-mono">
                  {data.recent_history.length} Daily Sessions • EMA 20 & 50 Overlay
                </span>
              </div>

              <InteractiveCandleChart
                history={data.recent_history}
                currentPrice={data.current_price}
                symbol={data.symbol || symbol}
              />
            </section>
          )}

          {/* ===================================================================== */}
          {/* SECTION 3: 8 BUY CONDITIONS & AVOID FLAGS CHECKLIST                   */}
          {/* ===================================================================== */}
          <section className="glass-panel algo-section-card">
            <div className="section-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={18} className="text-bullish-neon" />
                <h3 className="section-title">Multi-Condition Confirmation Engine (8-Pillar Checklist)</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div className="checklist-filter-pills font-mono">
                  <button
                    className={`filter-pill ${checkFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setCheckFilter('all')}
                  >
                    All ({data.buy_checks_total ?? 8})
                  </button>
                  <button
                    className={`filter-pill ${checkFilter === 'passed' ? 'active' : ''}`}
                    onClick={() => setCheckFilter('passed')}
                  >
                    Passed ({data.buy_score ?? 0})
                  </button>
                  <button
                    className={`filter-pill ${checkFilter === 'failed' ? 'active' : ''}`}
                    onClick={() => setCheckFilter('failed')}
                  >
                    Failed ({(data.buy_checks_total ?? 8) - (data.buy_score ?? 0)})
                  </button>
                </div>
                <span className="section-pill font-mono">
                  {data.buy_score ?? 0} / {data.buy_checks_total ?? 8} Criteria Passed
                </span>
              </div>
            </div>

            <div className="checklist-grid">
              {filteredBuyConditions.map((item) => (
                <div
                  key={item.id}
                  className={`check-pill-item ${item.passed ? 'check-passed' : 'check-failed'}`}
                >
                  <div className="check-icon-wrap">
                    {item.passed ? (
                      <CheckCircle2 size={16} className="text-bullish-neon" />
                    ) : (
                      <XCircle size={16} className="text-text-faint" />
                    )}
                  </div>
                  <div className="check-text-content">
                    <span className="check-label">{item.label}</span>
                    <div className="check-meta-row font-mono">
                      <span>Threshold: {item.threshold}</span>
                      <span className="meta-sep">•</span>
                      <span className={item.passed ? 'text-bullish-neon' : 'text-text-muted'}>
                        Actual: {item.actual}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* AVOID CONDITIONS SUB-PANEL */}
            {data.avoid_conditions && data.avoid_conditions.length > 0 && (
              <div className="avoid-flags-container">
                <div className="avoid-flags-header">
                  <AlertTriangle size={15} style={{ color: 'var(--bearish-neon)' }} />
                  <span>Avoid Criteria Monitoring (Triggers AVOID signal if ≥ 3 are active)</span>
                </div>
                <div className="avoid-flags-grid">
                  {data.avoid_conditions.map((av) => (
                    <div
                      key={av.id}
                      className={`avoid-chip ${av.passed ? 'flagged' : 'clear'}`}
                    >
                      <span className="avoid-dot" />
                      <span>{av.label}</span>
                      <span className="avoid-val font-mono">({av.actual})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* ===================================================================== */}
          {/* SECTION 4: TECHNICAL INDICATORS & MULTI-TIMEFRAME                     */}
          {/* ===================================================================== */}
          <section className="algo-two-col-grid">
            {/* TECHNICAL INDICATORS MATRIX */}
            <div className="glass-panel algo-section-card">
              <div className="section-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} className="text-accent-cyan" />
                  <h3 className="section-title">Core Technical Indicators Matrix</h3>
                </div>
                <span className="section-pill font-mono">TA Suite v4.0</span>
              </div>

              <div className="indicators-bento-grid">
                {/* RSI */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">RSI (14)</span>
                    <span className={`ind-badge ${data.indicators?.rsi_status === 'OVERBOUGHT' ? 'badge-danger' : (data.indicators?.rsi_status === 'OVERSOLD' ? 'badge-bullish' : 'badge-neutral')}`}>
                      {data.indicators?.rsi_status || 'OPTIMAL'}
                    </span>
                  </div>
                  <div className="ind-val font-mono">{formatNum(data.indicators?.rsi, 1)}</div>
                  <div className="ind-sub">Optimal swing band: 45 - 72</div>
                </div>

                {/* ADX */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">ADX (14)</span>
                    <span className={`ind-badge ${data.indicators?.adx_status === 'STRONG' ? 'badge-bullish' : 'badge-neutral'}`}>
                      {data.indicators?.adx_status || 'TREND'}
                    </span>
                  </div>
                  <div className="ind-val font-mono">{formatNum(data.indicators?.adx, 1)}</div>
                  <div className="ind-sub">Trend strength filter (&gt;20)</div>
                </div>

                {/* SUPERTREND */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">Supertrend (10, 3)</span>
                    <span className={`ind-badge ${data.indicators?.supertrend === 'BULLISH' ? 'badge-bullish' : 'badge-danger'}`}>
                      {data.indicators?.supertrend || 'NEUTRAL'}
                    </span>
                  </div>
                  <div className="ind-val font-mono" style={{ color: data.indicators?.supertrend === 'BULLISH' ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                    {data.indicators?.supertrend || 'NEUTRAL'}
                  </div>
                  <div className="ind-sub">ATR trailing volatility band</div>
                </div>

                {/* ATR */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">Average True Range (14)</span>
                    <span className="ind-badge badge-neutral">VOLATILITY</span>
                  </div>
                  <div className="ind-val font-mono">{formatCurrency(data.indicators?.atr)}</div>
                  <div className="ind-sub">SL multiplier: 1.5x | Target: 3.0x</div>
                </div>

                {/* MACD HISTOGRAM */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">MACD Histogram</span>
                    <span className={`ind-badge ${data.indicators?.macd_status === 'POSITIVE' ? 'badge-bullish' : 'badge-danger'}`}>
                      {data.indicators?.macd_status || 'NEUTRAL'}
                    </span>
                  </div>
                  <div className="ind-val font-mono" style={{ color: (data.indicators?.macd_hist ?? 0) >= 0 ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                    {(data.indicators?.macd_hist ?? 0) > 0 ? `+${formatNum(data.indicators?.macd_hist, 2)}` : formatNum(data.indicators?.macd_hist, 2)}
                  </div>
                  <div className="ind-sub">12/26/9 MACD momentum spread</div>
                </div>

                {/* VOLUME RATIO */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">Volume Ratio (vs 20D)</span>
                    <span className={`ind-badge ${data.indicators?.vol_status === 'SURGE' ? 'badge-bullish' : 'badge-neutral'}`}>
                      {data.indicators?.vol_status || 'NORMAL'}
                    </span>
                  </div>
                  <div className="ind-val font-mono">{formatNum(data.indicators?.vol_ratio, 2)}x</div>
                  <div className="ind-sub">&gt;1.5x triggers institutional surge</div>
                </div>

                {/* RELATIVE STRENGTH VS NIFTY */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">RS vs NIFTY 50 (20D)</span>
                    <span className={`ind-badge ${data.indicators?.rs_status === 'OUTPERFORMING' ? 'badge-bullish' : 'badge-danger'}`}>
                      {data.indicators?.rs_status || 'ALIGNED'}
                    </span>
                  </div>
                  <div className="ind-val font-mono" style={{ color: (data.indicators?.rs_vs_nifty_pct ?? 0) >= 0 ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                    {(data.indicators?.rs_vs_nifty_pct ?? 0) >= 0 ? `+${formatNum(data.indicators?.rs_vs_nifty_pct, 2)}%` : `${formatNum(data.indicators?.rs_vs_nifty_pct, 2)}%`}
                  </div>
                  <div className="ind-sub">Relative alpha vs benchmark</div>
                </div>

                {/* EMAS MATRIX */}
                <div className="indicator-box">
                  <div className="ind-header">
                    <span className="ind-name">Moving Averages (EMA)</span>
                    <span className="ind-badge badge-neutral">20 / 50 / 200</span>
                  </div>
                  <div className="ind-val font-mono" style={{ fontSize: '0.88rem' }}>
                    {formatCurrency(data.indicators?.ema20, 0)} / {formatCurrency(data.indicators?.ema50, 0)} / {formatCurrency(data.indicators?.ema200, 0)}
                  </div>
                  <div className="ind-sub font-mono" style={{ fontSize: '0.70rem' }}>
                    Dist: {(data.indicators?.dist_ema20_pct ?? 0) > 0 ? `+${formatNum(data.indicators?.dist_ema20_pct, 2)}%` : `${formatNum(data.indicators?.dist_ema20_pct, 2)}%`} vs EMA20
                  </div>
                </div>
              </div>
            </div>

            {/* MULTI-TIMEFRAME & MODEL QUALITY */}
            <div className="glass-panel algo-section-card">
              <div className="section-header-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={18} className="text-accent-cyan" />
                  <h3 className="section-title">Multi-Timeframe & Model Validation</h3>
                </div>
                <span className="section-pill font-mono">{data.model_quality?.n_splits || 5}-Fold TimeSeriesSplit</span>
              </div>

              {/* Multi-Timeframe Alignment */}
              <div className="mtf-cards-row">
                <div className="mtf-card">
                  <span className="mtf-label">WEEKLY HIGHER TIMEFRAME TREND</span>
                  <div className="mtf-status-row">
                    <span className={`mtf-badge ${data.multi_timeframe?.weekly_trend === 'BULLISH' ? 'badge-bullish' : 'badge-danger'}`}>
                      {data.multi_timeframe?.weekly_trend || 'NEUTRAL'}
                    </span>
                    <span className="mtf-detail">Weekly EMA 20 vs EMA 50 alignment</span>
                  </div>
                </div>

                <div className="mtf-card">
                  <span className="mtf-label">LONG-TERM STRUCTURAL REGIME</span>
                  <div className="mtf-status-row">
                    <span className={`mtf-badge ${data.multi_timeframe?.above_ema200 ? 'badge-bullish' : 'badge-danger'}`}>
                      {data.multi_timeframe?.above_ema200 ? 'ABOVE EMA 200' : 'BELOW EMA 200'}
                    </span>
                    <span className="mtf-detail">{data.multi_timeframe?.above_ema200_label || ''}</span>
                  </div>
                </div>
              </div>

              {/* XGBoost Cross Validation */}
              <div className="model-cv-box">
                <div className="cv-header-row">
                  <span className="cv-title">XGBoost Cross-Validation Accuracy</span>
                  <span className="cv-mean-score font-mono">
                    {formatNum(data.model_quality?.avg_accuracy_pct, 2, '0.00')}% ± {formatNum(data.model_quality?.std_accuracy_pct, 2, '0.00')}%
                  </span>
                </div>

                <div className="folds-grid">
                  {(data.model_quality?.fold_scores || []).map((score, fIdx) => (
                    <div key={fIdx} className="fold-box">
                      <span className="fold-name">Fold {fIdx + 1}</span>
                      <span className="fold-val font-mono">{formatNum(score, 1)}%</span>
                      <div className="fold-bar-track">
                        <div className="fold-bar-fill" style={{ width: `${Math.min(100, Math.max(0, Number(score) || 0))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Feature Importances */}
              {data.model_quality?.feature_importances && data.model_quality.feature_importances.length > 0 && (
                <div className="feature-importance-box">
                  <span className="feat-title">Top ML Features Impact:</span>
                  <div className="feat-tags-row">
                    {data.model_quality.feature_importances.map((f, idx) => (
                      <span key={idx} className="feat-tag font-mono">
                        {f.feature} ({formatNum(f.importance, 1)}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ===================================================================== */}
          {/* SECTION 5: WALK-FORWARD BACKTEST & CUMULATIVE RETURN CURVE            */}
          {/* ===================================================================== */}
          <section className="glass-panel algo-section-card">
            <div className="section-header-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Award size={18} className="text-bullish-neon" />
                <h3 className="section-title">Walk-Forward Backtesting (Last 20% Out-Of-Sample Data)</h3>
              </div>
              <span className="section-pill font-mono">
                {data.backtest?.total_trades ?? 0} Simulated Trades
              </span>
            </div>

            {/* Backtest Stats Row */}
            <div className="backtest-stats-grid">
              <div className="bt-stat-card">
                <span className="bt-stat-label">WIN RATE</span>
                <span className="bt-stat-val font-mono text-bullish-neon">{formatNum(data.backtest?.win_rate_pct, 1, '0.0')}%</span>
                <span className="bt-stat-sub font-mono">{data.backtest?.wins ?? 0} Wins / {data.backtest?.losses ?? 0} Losses</span>
              </div>

              <div className="bt-stat-card">
                <span className="bt-stat-label">AVG PROFIT / TRADE</span>
                <span className="bt-stat-val font-mono" style={{ color: (data.backtest?.avg_profit_pct ?? 0) >= 0 ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                  {(data.backtest?.avg_profit_pct ?? 0) >= 0 ? `+${formatNum(data.backtest?.avg_profit_pct, 2)}%` : `${formatNum(data.backtest?.avg_profit_pct, 2)}%`}
                </span>
                <span className="bt-stat-sub">5-day swing horizon</span>
              </div>

              <div className="bt-stat-card">
                <span className="bt-stat-label">PROFIT FACTOR</span>
                <span className="bt-stat-val font-mono text-accent-cyan">
                  {(data.backtest?.profit_factor ?? 0) > 0 ? formatNum(data.backtest?.profit_factor, 2) : 'N/A'}
                </span>
                <span className="bt-stat-sub">{data.backtest?.profit_factor_label || 'GOOD'} Risk-Adjusted Ratio</span>
              </div>

              <div className="bt-stat-card">
                <span className="bt-stat-label">MAX DRAWDOWN</span>
                <span className="bt-stat-val font-mono text-bearish-neon">{formatNum(data.backtest?.max_drawdown_pct, 2, '0.00')}%</span>
                <span className="bt-stat-sub">Peak-to-trough drop</span>
              </div>
            </div>

            {/* Interactive Cumulative Return Curve */}
            {data.backtest?.cumulative_returns && data.backtest.cumulative_returns.length > 0 && (
              <InteractiveEquityCurve returns={data.backtest.cumulative_returns} />
            )}

            {/* Recent Trades Table with Filter Tabs */}
            {data.backtest?.trades && data.backtest.trades.length > 0 && (
              <div className="recent-trades-container">
                <div className="trades-table-header">
                  <div className="trades-table-title">Recent Walk-Forward Trades Log</div>
                  <div className="trade-filter-pills font-mono">
                    <button
                      className={`filter-pill ${tradeFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setTradeFilter('all')}
                    >
                      All ({data.backtest.trades.length})
                    </button>
                    <button
                      className={`filter-pill ${tradeFilter === 'won' ? 'active' : ''}`}
                      onClick={() => setTradeFilter('won')}
                    >
                      Wins ({data.backtest.trades.filter(t => t.won).length})
                    </button>
                    <button
                      className={`filter-pill ${tradeFilter === 'lost' ? 'active' : ''}`}
                      onClick={() => setTradeFilter('lost')}
                    >
                      Losses ({data.backtest.trades.filter(t => !t.won).length})
                    </button>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="algo-trades-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Entry Price</th>
                        <th>Exit Price (5D)</th>
                        <th>AI Probability</th>
                        <th>Outcome</th>
                        <th style={{ textAlign: 'right' }}>Return %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.map((t, idx) => (
                        <tr key={idx}>
                          <td className="font-mono text-muted">{t.date || '—'}</td>
                          <td className="font-mono">{formatCurrency(t.entry)}</td>
                          <td className="font-mono">{formatCurrency(t.exit)}</td>
                          <td className="font-mono">{formatNum(t.ai_prob, 1)}%</td>
                          <td>
                            <span className={`trade-status-chip ${t.won ? 'trade-won' : 'trade-lost'}`}>
                              {t.won ? 'WIN' : 'LOSS'}
                            </span>
                          </td>
                          <td className="font-mono" style={{ textAlign: 'right', fontWeight: 700, color: (t.return_pct ?? 0) >= 0 ? 'var(--bullish-neon)' : 'var(--bearish-neon)' }}>
                            {(t.return_pct ?? 0) >= 0 ? `+${formatNum(t.return_pct, 2)}%` : `${formatNum(t.return_pct, 2)}%`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* ===================================================================== */}
          {/* VERBATIM PYTHON v4.0 SCRIPT & CLI CONSOLE OUTPUT                     */}
          {/* ===================================================================== */}
          {data.raw_cli_output && (
            <div className="glass-panel algo-section-card" style={{ marginTop: '24px' }}>
              <div className="section-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Terminal size={18} className="text-accent-cyan" />
                  <h3 className="section-title">AI Swing Trading System v4.0 • Verbatim Terminal Output</h3>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(data.raw_cli_output)
                      setCopiedTerminal(true)
                      setTimeout(() => setCopiedTerminal(false), 2000)
                    }}
                    style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <FileCode size={14} />
                    <span>{copiedTerminal ? 'Copied CLI Text!' : 'Copy CLI Output'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setShowConsoleOutput(!showConsoleOutput)}
                    style={{ padding: '6px 14px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Terminal size={14} />
                    <span>{showConsoleOutput ? 'Collapse Console ▲' : 'Open Verbatim Console ▼'}</span>
                  </button>
                </div>
              </div>

              <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)', marginTop: '4px', marginBottom: '12px' }}>
                Exact, untouched console output generated by the standalone AI Swing Trading System v4.0 script (<code>ai_swing_v4.py</code>).
              </div>

              {showConsoleOutput && (
                <pre
                  style={{
                    background: 'rgba(5, 10, 20, 0.95)',
                    color: '#00f59b',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 245, 155, 0.25)',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '0.84rem',
                    lineHeight: '1.5',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.7)'
                  }}
                >
                  {data.raw_cli_output}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
