import React, { useState, useEffect } from 'react';
import { Activity, Clock, ShieldAlert, Zap, Radio } from 'lucide-react';
import { fetchMarketStatus } from '../api';

export default function Header() {
  const [marketStatus, setMarketStatus] = useState(null);
  const [currentTime, setCurrentTime] = useState('');

  // Fetch market status periodically
  useEffect(() => {
    const checkMarket = async () => {
      try {
        const data = await fetchMarketStatus();
        setMarketStatus(data);
      } catch (e) {
        console.error('Market status fetch failed:', e);
      }
    };

    checkMarket();
    const interval = setInterval(checkMarket, 30000);
    return () => clearInterval(interval);
  }, []);

  // Live IST Clock
  useEffect(() => {
    const updateClock = () => {
      try {
        const now = new Date();
        const istStr = now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        });
        setCurrentTime(`${istStr} IST`);
      } catch {
        setCurrentTime(new Date().toLocaleTimeString());
      }
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const isOpen = marketStatus?.is_open ?? false;

  return (
    <header className="app-header" id="app-header">
      <div className="brand-section">
        <div className="brand-icon-wrapper">
          <Activity size={26} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="brand-title">NSE SEMI-ALGO SCANNER</h1>
            <span className="live-clock-badge">
              <Clock size={12} />
              <span>{currentTime}</span>
            </span>
          </div>
          <p className="brand-subtitle">
            ~200 Liquid NSE Equities • SMA 6/30 • Intraday Momentum • Volume Confirmation
          </p>
        </div>
      </div>

      <div className="header-actions">
        {/* Market Status Badge */}
        <div
          className={`status-pill ${isOpen ? 'market-open' : 'market-closed'}`}
          title={marketStatus?.message || 'NSE Market Hours (09:15 - 15:30 IST)'}
          id="market-status-pill"
        >
          <span className={`status-indicator-dot ${isOpen ? 'connected' : 'closed'}`} />
          <span>Market: {isOpen ? 'OPEN' : 'CLOSED'}</span>
        </div>

        {/* Free Market Data Feed */}
        <div className="status-pill connected" title="Direct Yahoo Finance Feed">
          <Radio size={14} style={{ color: '#06b6d4' }} />
          <span>Feed: Online</span>
        </div>

        {/* Mandatory Regulatory / Operational Notice */}
        <div className="disclaimer-badge" id="regulatory-disclaimer-badge">
          <ShieldAlert size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <span>Analysis only — no orders are placed automatically.</span>
        </div>
      </div>
    </header>
  );
}
