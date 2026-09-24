import React, { useState } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronUp,
  Inbox,
  AlertTriangle,
  Info,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity
} from 'lucide-react';

export default function ResultsTable({
  results,
  isLoading,
  sortField,
  sortDirection,
  onSort,
}) {
  const [expandedRows, setExpandedRows] = useState(new Set());

  const toggleExpand = (symbol) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const formatPrice = (val) => {
    if (val === null || val === undefined) return '—';
    const num = parseFloat(val);
    return isNaN(num) ? '—' : `₹${num.toFixed(2)}`;
  };

  const formatPercent = (val) => {
    if (val === null || val === undefined) return '—';
    const num = parseFloat(val);
    if (isNaN(num)) return '—';
    const prefix = num > 0 ? '+' : '';
    return `${prefix}${num.toFixed(2)}%`;
  };

  const formatVolume = (num) => {
    if (!num) return '0';
    if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
    if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)} K`;
    return num.toString();
  };

  return (
    <div className="table-wrapper" id="results-table-container">
      <div className="table-scroll">
        <table className="results-table" id="results-table">
          <thead>
            <tr>
              <th onClick={() => onSort('rank')} className="sortable-th">
                <span>Rank</span>
              </th>
              <th onClick={() => onSort('symbol')} className="sortable-th">
                <span>Stock / Company</span>
              </th>
              <th onClick={() => onSort('status')} className="sortable-th">
                <span>Status & Direction</span>
              </th>
              <th onClick={() => onSort('current_price')} className="sortable-th">
                <span>Price & Day %</span>
              </th>
              <th>Entry</th>
              <th>Stop-Loss</th>
              <th>Target / Exit</th>
              <th>R:R</th>
              <th onClick={() => onSort('signal_strength')} className="sortable-th">
                <span>Signal Strength</span>
              </th>
              <th>SMA 6 / 30</th>
              <th onClick={() => onSort('volume_ratio')} className="sortable-th">
                <span>Vol / Vol Ratio</span>
              </th>
              <th onClick={() => onSort('momentum_percent')} className="sortable-th">
                <span>Momentum</span>
              </th>
              <th>Daily Trend</th>
              <th onClick={() => onSort('relative_strength')} className="sortable-th">
                <span>RS vs NIFTY</span>
              </th>
              <th onClick={() => onSort('crossover_time')} className="sortable-th">
                <span>Crossover Time</span>
              </th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {results.length > 0 ? (
              results.map((row) => {
                const isExpanded = expandedRows.has(row.symbol);
                const status = row.status || 'NO SIGNAL';
                const isBuy = status === 'BUY';
                const isSell = status === 'SELL';
                const isWatch = status === 'WATCH';
                const isNoSignal = status === 'NO SIGNAL';

                const dayPct = parseFloat(row.day_change_percent) || 0;
                const momPct = parseFloat(row.momentum_percent) || 0;
                const rsPct = parseFloat(row.relative_strength) || 0;
                const score = parseInt(row.signal_strength, 10) || 0;

                return (
                  <React.Fragment key={row.symbol}>
                    <tr
                      className={`result-row ${isBuy ? 'row-buy' : ''} ${isSell ? 'row-sell' : ''} ${isWatch ? 'row-watch' : ''} ${isNoSignal ? 'row-neutral' : ''}`}
                      onClick={() => toggleExpand(row.symbol)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Rank */}
                      <td>
                        <span className={`rank-badge ${isBuy ? 'rank-buy' : ''} ${isSell ? 'rank-sell' : ''} ${isWatch ? 'rank-watch' : ''}`}>
                          #{row.rank}
                        </span>
                      </td>

                      {/* Symbol & Company */}
                      <td>
                        <div className="stock-info-cell">
                          <span className="stock-symbol">{row.symbol}</span>
                          <span className="stock-company" title={row.company}>
                            {row.company}
                          </span>
                        </div>
                      </td>

                      {/* Status & Potential Direction */}
                      <td>
                        <div className="status-badge-wrapper">
                          <span className={`status-pill-badge ${status.toLowerCase().replace(' ', '-')}`}>
                            {isBuy && <ArrowUpRight size={13} />}
                            {isSell && <ArrowDownRight size={13} />}
                            {isWatch && <Activity size={13} />}
                            <span>{status}</span>
                          </span>

                          {row.potential_direction && row.potential_direction !== status && (
                            <span className="potential-direction-tag">
                              Potential: {row.potential_direction}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Current Price & Day Change */}
                      <td>
                        <div className="price-cell">
                          <span className="price-main">{formatPrice(row.current_price)}</span>
                          <span className={`day-change ${dayPct >= 0 ? 'text-green' : 'text-red'}`}>
                            {formatPercent(dayPct)}
                          </span>
                        </div>
                      </td>

                      {/* Entry */}
                      <td>
                        <span className="level-val entry-val">
                          {formatPrice(row.entry)}
                        </span>
                      </td>

                      {/* Stop-Loss */}
                      <td>
                        <span className="level-val sl-val">
                          {formatPrice(row.stop_loss)}
                        </span>
                      </td>

                      {/* Target / Exit */}
                      <td>
                        <span className="level-val target-val">
                          {formatPrice(row.target)}
                        </span>
                      </td>

                      {/* Risk:Reward */}
                      <td>
                        <span className="rr-badge">{row.risk_reward || '1:2'}</span>
                      </td>

                      {/* Signal Strength */}
                      <td>
                        <div className="score-cell">
                          <div className="score-bar-track">
                            <div
                              className={`score-bar-fill ${score >= 70 ? 'score-high' : score >= 40 ? 'score-med' : 'score-low'}`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                          <span className="score-text">{score}/100</span>
                        </div>
                      </td>

                      {/* SMA 6 / SMA 30 */}
                      <td>
                        <div className="sma-cell">
                          <span style={{ color: '#38bdf8' }}>{row.sma6 ? row.sma6.toFixed(2) : '—'}</span>
                          <span style={{ color: 'var(--text-muted)' }}>/</span>
                          <span style={{ color: '#c084fc' }}>{row.sma30 ? row.sma30.toFixed(2) : '—'}</span>
                        </div>
                      </td>

                      {/* Volume & Volume Ratio */}
                      <td>
                        <div className="volume-cell">
                          <span className={`vol-ratio ${(row.volume_ratio || 0) >= 1.5 ? 'vol-high' : ''}`}>
                            {row.volume_ratio ? `${row.volume_ratio.toFixed(2)}x` : '—'}
                          </span>
                          <span className="vol-raw">{formatVolume(row.volume)}</span>
                        </div>
                      </td>

                      {/* Momentum % */}
                      <td>
                        <span className={`momentum-val ${momPct > 0 ? 'text-green' : momPct < 0 ? 'text-red' : ''}`}>
                          {formatPercent(momPct)}
                        </span>
                      </td>

                      {/* Daily Trend */}
                      <td>
                        <span className={`trend-pill ${row.daily_trend?.toLowerCase()}`}>
                          {row.daily_trend || 'NEUTRAL'}
                        </span>
                      </td>

                      {/* RS vs NIFTY */}
                      <td>
                        <span className={`rs-val ${rsPct > 0 ? 'text-green' : rsPct < 0 ? 'text-red' : ''}`}>
                          {formatPercent(rsPct)}
                        </span>
                      </td>

                      {/* Crossover Time */}
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {row.crossover_time || '—'}
                      </td>

                      {/* Expand / Details Toggle */}
                      <td>
                        <button
                          className="row-expand-btn"
                          title="View Setup Details"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(row.symbol);
                          }}
                        >
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Details Drawer */}
                    {isExpanded && (
                      <tr className="expanded-details-row">
                        <td colSpan={16}>
                          <div className="setup-detail-card">
                            <div className="detail-header">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Info size={16} style={{ color: isBuy ? '#10b981' : isSell ? '#ef4444' : '#f59e0b' }} />
                                <span style={{ fontWeight: 600, color: '#ffffff' }}>
                                  Setup Analysis: {row.symbol} ({row.company})
                                </span>
                              </div>
                              <span className="decision-disclaimer">
                                Analytical Level Only • No Orders Automatically Placed
                              </span>
                            </div>

                            <div className="detail-grid">
                              {/* Reason & Missing Confirmation for WATCH */}
                              <div className="detail-box">
                                <span className="detail-box-title">Strategy Evaluation</span>
                                <p className="detail-reason-text">{row.reason || 'No setup generated.'}</p>

                                {isWatch && (
                                  <div className="watch-missing-alert">
                                    <AlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />
                                    <span>
                                      <strong>WATCH Setup: </strong>
                                      Entry is conditional and has not triggered. Wait for confirmed completion before considering action.
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* Analytical Levels Breakdown */}
                              <div className="detail-box">
                                <span className="detail-box-title">Strategy Analytical Levels</span>
                                <div className="levels-breakdown-grid">
                                  <div>
                                    <span className="lbl">Current Price</span>
                                    <span className="val">{formatPrice(row.current_price)}</span>
                                  </div>
                                  <div>
                                    <span className="lbl">Analytical Entry</span>
                                    <span className="val entry-val">{formatPrice(row.entry)}</span>
                                  </div>
                                  <div>
                                    <span className="lbl">Stop-Loss (SL)</span>
                                    <span className="val sl-val">{formatPrice(row.stop_loss)}</span>
                                  </div>
                                  <div>
                                    <span className="lbl">Target / Exit</span>
                                    <span className="val target-val">{formatPrice(row.target)}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Technical Indicator Indicators */}
                              <div className="detail-box">
                                <span className="detail-box-title">Indicator Verification</span>
                                <div className="indicators-breakdown-grid">
                                  <div>
                                    <span className="lbl">SMA 6</span>
                                    <span className="val">{row.sma6 ? row.sma6.toFixed(2) : '—'}</span>
                                  </div>
                                  <div>
                                    <span className="lbl">SMA 30</span>
                                    <span className="val">{row.sma30 ? row.sma30.toFixed(2) : '—'}</span>
                                  </div>
                                  <div>
                                    <span className="lbl">Avg Volume (20)</span>
                                    <span className="val">{formatVolume(row.average_volume)}</span>
                                  </div>
                                  <div>
                                    <span className="lbl">Volume Ratio</span>
                                    <span className="val">{row.volume_ratio ? `${row.volume_ratio.toFixed(2)}x` : '—'}</span>
                                  </div>
                                  <div>
                                    <span className="lbl">Intraday Momentum</span>
                                    <span className="val">{formatPercent(row.momentum_percent)}</span>
                                  </div>
                                  <div>
                                    <span className="lbl">RS vs NIFTY 50</span>
                                    <span className="val">{formatPercent(row.relative_strength)}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={16}>
                  <div className="empty-state">
                    <Inbox className="empty-state-icon" />
                    <h3 style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      {isLoading ? 'Scanning in progress...' : 'No Matching Stocks Found'}
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {isLoading
                        ? 'Fetching completed candles and evaluating SMA 6/30 strategy...'
                        : 'Click "Start Scanner" to analyze the 200 NSE stocks universe.'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
