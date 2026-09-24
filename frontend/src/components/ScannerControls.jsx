import React, { useState } from 'react';
import { Play, Square, RefreshCw, Terminal, ChevronDown, ChevronUp, AlertCircle, Sliders, Gauge } from 'lucide-react';

export default function ScannerControls({
  scanStatus,
  timeframe,
  onTimeframeChange,
  riskReward,
  onRiskRewardChange,
  volumeMultiplier,
  onVolumeMultiplierChange,
  onRunScan,
  onStopScan,
  onRefreshResults,
}) {
  const [showLogs, setShowLogs] = useState(false);
  const isScanning = scanStatus?.is_running;

  return (
    <div className="scanner-panel" id="scanner-controls-panel">
      {/* Top Bar: Settings & Action Buttons */}
      <div className="scanner-panel-header">
        <div className="scanner-config-group">
          {/* Timeframe Selector */}
          <div className="control-item">
            <label className="control-label" htmlFor="timeframe-select">
              Timeframe:
            </label>
            <select
              id="timeframe-select"
              className="control-select"
              value={timeframe}
              onChange={(e) => onTimeframeChange(e.target.value)}
              disabled={isScanning}
            >
              <option value="5m">5 Minutes</option>
              <option value="10m">10 Minutes (Default)</option>
              <option value="15m">15 Minutes</option>
            </select>
          </div>

          {/* Risk / Reward Selector */}
          <div className="control-item">
            <label className="control-label" htmlFor="risk-reward-select">
              Risk:Reward:
            </label>
            <select
              id="risk-reward-select"
              className="control-select"
              value={riskReward}
              onChange={(e) => onRiskRewardChange(parseFloat(e.target.value))}
              disabled={isScanning}
            >
              <option value={1.5}>1 : 1.5</option>
              <option value={2.0}>1 : 2.0 (Default)</option>
              <option value={3.0}>1 : 3.0</option>
            </select>
          </div>

          {/* Volume Multiplier Input */}
          <div className="control-item">
            <label className="control-label" htmlFor="volume-multiplier-input">
              Volume Multiplier:
            </label>
            <div className="volume-input-wrapper">
              <input
                id="volume-multiplier-input"
                type="number"
                step="0.1"
                min="1.0"
                max="5.0"
                className="control-input"
                value={volumeMultiplier}
                onChange={(e) => onVolumeMultiplierChange(parseFloat(e.target.value) || 1.5)}
                disabled={isScanning}
              />
              <span className="input-suffix">x</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="scanner-actions">
          {isScanning ? (
            <button
              onClick={onStopScan}
              className="btn btn-danger"
              id="btn-stop-scanner"
              title="Stop current scan"
            >
              <Square size={16} fill="currentColor" />
              <span>Stop Scan</span>
            </button>
          ) : (
            <button
              onClick={onRunScan}
              className="btn btn-primary btn-glow"
              id="btn-start-scanner"
              title="Start scanning 200 NSE stocks"
            >
              <Play size={16} fill="currentColor" />
              <span>Start Scanner</span>
            </button>
          )}

          <button
            onClick={onRefreshResults}
            className="btn btn-secondary"
            disabled={isScanning}
            id="btn-refresh-results"
            title="Reload latest scan results"
          >
            <RefreshCw size={15} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setShowLogs(!showLogs)}
            className="btn btn-secondary btn-sm"
            id="btn-toggle-logs"
            title="Toggle Console Logs"
          >
            <Terminal size={14} />
            <span>Logs</span>
            {showLogs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {scanStatus?.error_message && (
        <div className="alert-banner alert-danger" style={{ marginTop: '14px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Scan Notice: </strong>
            <span>{scanStatus.error_message}</span>
          </div>
        </div>
      )}

      {/* Live Scan Progress */}
      {isScanning && (
        <div className="scan-progress-container" id="scan-progress-box">
          <div className="scan-progress-info">
            <span style={{ fontWeight: 600, color: '#38bdf8' }}>
              {scanStatus.stage || 'Scanning...'}
              {scanStatus.current_stock ? ` • Evaluating ${scanStatus.current_stock}` : ''}
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#cbd5e1' }}>
              {scanStatus.stocks_scanned} / {scanStatus.total_stocks} stocks ({scanStatus.progress_pct}%)
            </span>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill animated-glow"
              style={{ width: `${Math.min(scanStatus.progress_pct || 0, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Collapsible Logs Terminal */}
      {showLogs && (
        <div className="log-terminal" id="scanner-logs-terminal">
          <div className="log-terminal-header">
            <span>Scanner Execution Feed</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-scrolling</span>
          </div>
          <div className="log-terminal-body">
            {scanStatus?.logs && scanStatus.logs.length > 0 ? (
              scanStatus.logs.map((log, index) => (
                <div key={index} className="log-entry">
                  {log}
                </div>
              ))
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>No scanner activity logs recorded yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
