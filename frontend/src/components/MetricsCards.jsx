import React from 'react';
import { Target, TrendingUp, TrendingDown, Eye, CheckCircle2, Clock } from 'lucide-react';

export default function MetricsCards({
  scanStatus,
  results,
  summaryCounts,
  lastCompletedAt,
}) {
  const stocksSelected = scanStatus?.stocks_selected || 200;
  const stocksScanned = scanStatus?.stocks_scanned || 0;

  const buyCount = summaryCounts?.buy ?? results.filter((r) => r.status === 'BUY').length;
  const sellCount = summaryCounts?.sell ?? results.filter((r) => r.status === 'SELL').length;
  const watchCount = summaryCounts?.watch ?? results.filter((r) => r.status === 'WATCH').length;
  const noSignalCount = summaryCounts?.no_signal ?? results.filter((r) => r.status === 'NO SIGNAL').length;

  const lastScanText = scanStatus?.last_scan_ist || (lastCompletedAt ? new Date(lastCompletedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' IST' : 'Never');

  return (
    <div className="metrics-grid" id="metrics-summary-grid">
      {/* 1. Stocks Selected & Scanned */}
      <div className="metric-card" id="card-stocks-scanned">
        <div className="metric-icon-box cyan">
          <Target size={22} />
        </div>
        <div className="metric-info">
          <span className="metric-label">Stocks Selected</span>
          <span className="metric-value">{stocksSelected}</span>
          <span className="metric-sub">
            {scanStatus?.is_running
              ? `Scanned: ${stocksScanned} / ${stocksSelected}`
              : `Scanned: ${stocksScanned || stocksSelected} / ${stocksSelected}`}
          </span>
        </div>
      </div>

      {/* 2. BUY Signals */}
      <div className="metric-card buy-card" id="card-buy-count">
        <div className="metric-icon-box green">
          <TrendingUp size={22} />
        </div>
        <div className="metric-info">
          <span className="metric-label">BUY Signals</span>
          <span className="metric-value highlight-buy">{buyCount}</span>
          <span className="metric-sub">Confirmed SMA Breakout</span>
        </div>
      </div>

      {/* 3. SELL Signals */}
      <div className="metric-card sell-card" id="card-sell-count">
        <div className="metric-icon-box red">
          <TrendingDown size={22} />
        </div>
        <div className="metric-info">
          <span className="metric-label">SELL Signals</span>
          <span className="metric-value highlight-sell">{sellCount}</span>
          <span className="metric-sub">Confirmed SMA Breakdown</span>
        </div>
      </div>

      {/* 4. WATCH Setups */}
      <div className="metric-card watch-card" id="card-watch-count">
        <div className="metric-icon-box amber">
          <Eye size={22} />
        </div>
        <div className="metric-info">
          <span className="metric-label">WATCH Setups</span>
          <span className="metric-value highlight-watch">{watchCount}</span>
          <span className="metric-sub">Developing Opportunities</span>
        </div>
      </div>

      {/* 5. NO SIGNAL */}
      <div className="metric-card" id="card-no-signal-count">
        <div className="metric-icon-box gray">
          <CheckCircle2 size={22} />
        </div>
        <div className="metric-info">
          <span className="metric-label">NO SIGNAL</span>
          <span className="metric-value highlight-neutral">{noSignalCount}</span>
          <span className="metric-sub">No confirmed setup</span>
        </div>
      </div>

      {/* 6. Last Scan Time */}
      <div className="metric-card" id="card-last-scan">
        <div className="metric-icon-box purple">
          <Clock size={22} />
        </div>
        <div className="metric-info">
          <span className="metric-label">Last Scan</span>
          <span className="metric-value" style={{ fontSize: '1.25rem' }}>{lastScanText}</span>
          <span className="metric-sub">
            {scanStatus?.is_running ? 'Scanner active...' : 'Interval: 10m'}
          </span>
        </div>
      </div>
    </div>
  );
}
