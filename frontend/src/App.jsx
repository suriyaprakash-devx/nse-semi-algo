import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Header from './components/Header';
import MetricsCards from './components/MetricsCards';
import ScannerControls from './components/ScannerControls';
import FilterBar from './components/FilterBar';
import ResultsTable from './components/ResultsTable';
import {
  startScan,
  stopScan,
  fetchScanStatus,
  fetchScanResults,
} from './api';

export default function App() {
  const [scanStatus, setScanStatus] = useState(null);
  const [rawResults, setRawResults] = useState([]);
  const [summaryCounts, setSummaryCounts] = useState({ buy: 0, sell: 0, watch: 0, no_signal: 0 });
  const [lastCompletedAt, setLastCompletedAt] = useState(null);

  // Configuration options
  const [timeframe, setTimeframe] = useState('10m');
  const [riskReward, setRiskReward] = useState(2.0);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1.5);

  // Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'BUY' | 'SELL' | 'WATCH' | 'NO SIGNAL'
  const [sortField, setSortField] = useState('rank');
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'

  const [errorMessage, setErrorMessage] = useState('');

  // 1. Load Scanner Results
  const loadResults = useCallback(async () => {
    try {
      const data = await fetchScanResults();
      setRawResults(data.results || []);
      setSummaryCounts({
        buy: data.buy_count ?? 0,
        sell: data.sell_count ?? 0,
        watch: data.watch_count ?? 0,
        no_signal: data.no_signal_count ?? 0,
      });
      if (data.completed_at) {
        setLastCompletedAt(data.completed_at);
      }
      if (data.timeframe) {
        setTimeframe(data.timeframe);
      }
    } catch (err) {
      console.error('Error loading scanner results:', err);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadResults();
  }, [loadResults]);

  // 2. Status Polling Loop
  useEffect(() => {
    let intervalId = null;

    const checkStatus = async () => {
      try {
        const status = await fetchScanStatus();
        setScanStatus(status);

        // If scan completed, reload results table
        if (!status.is_running && status.stage === 'Scan completed') {
          loadResults();
        }
      } catch (err) {
        console.error('Error polling scan status:', err);
      }
    };

    if (scanStatus?.is_running) {
      intervalId = setInterval(checkStatus, 1500);
    } else {
      intervalId = setInterval(checkStatus, 10000);
    }

    return () => clearInterval(intervalId);
  }, [scanStatus?.is_running, loadResults]);

  // 3. Actions: Run & Stop Scanner
  const handleRunScan = async () => {
    setErrorMessage('');
    try {
      await startScan({
        timeframe,
        risk_reward: riskReward,
        volume_multiplier: volumeMultiplier,
      });
      const status = await fetchScanStatus();
      setScanStatus(status);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to start scanner.');
    }
  };

  const handleStopScan = async () => {
    try {
      await stopScan();
      const status = await fetchScanStatus();
      setScanStatus(status);
    } catch (err) {
      console.error('Error stopping scanner:', err);
    }
  };

  // 4. Filtering and Sorting
  const counts = useMemo(() => {
    return {
      all: rawResults.length,
      buy: rawResults.filter((r) => r.status === 'BUY').length,
      sell: rawResults.filter((r) => r.status === 'SELL').length,
      watch: rawResults.filter((r) => r.status === 'WATCH').length,
      no_signal: rawResults.filter((r) => r.status === 'NO SIGNAL').length,
    };
  }, [rawResults]);

  const filteredAndSortedResults = useMemo(() => {
    let list = rawResults.filter((item) => {
      // Status filter
      if (statusFilter !== 'ALL' && item.status !== statusFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase().trim();
        const symbolMatch = item.symbol?.toLowerCase().includes(query);
        const companyMatch = item.company?.toLowerCase().includes(query);
        if (!symbolMatch && !companyMatch) return false;
      }

      return true;
    });

    // Sort
    list.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      // Handle nulls
      if (valA === null || valA === undefined) valA = -999999;
      if (valB === null || valB === undefined) valB = -999999;

      // Numeric comparison
      if (
        sortField === 'rank' ||
        sortField === 'signal_strength' ||
        sortField === 'current_price' ||
        sortField === 'volume_ratio' ||
        sortField === 'day_change_percent' ||
        sortField === 'momentum_percent' ||
        sortField === 'relative_strength'
      ) {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [rawResults, statusFilter, searchQuery, sortField, sortDirection]);

  // Handle column header sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'rank' ? 'asc' : 'desc');
    }
  };

  // 5. CSV Export
  const handleExportCsv = () => {
    if (filteredAndSortedResults.length === 0) return;

    const headers = [
      'Rank',
      'Symbol',
      'Company',
      'Status',
      'Potential Direction',
      'Current Price',
      'Day Change %',
      'Entry',
      'Stop-Loss',
      'Target',
      'Risk:Reward',
      'Signal Strength',
      'SMA 6',
      'SMA 30',
      'Volume',
      'Average Volume',
      'Volume Ratio',
      'Momentum %',
      'Daily Trend',
      'Intraday Trend',
      'RS vs NIFTY',
      'Crossover Time',
      'Signal Time',
      'Reason',
    ];

    const csvRows = [headers.join(',')];

    filteredAndSortedResults.forEach((row) => {
      const values = [
        row.rank,
        `"${row.symbol}"`,
        `"${(row.company || '').replace(/"/g, '""')}"`,
        `"${row.status}"`,
        `"${row.potential_direction || ''}"`,
        row.current_price,
        row.day_change_percent,
        row.entry !== null ? row.entry : '',
        row.stop_loss !== null ? row.stop_loss : '',
        row.target !== null ? row.target : '',
        `"${row.risk_reward || ''}"`,
        row.signal_strength,
        row.sma6,
        row.sma30,
        row.volume,
        row.average_volume,
        row.volume_ratio,
        row.momentum_percent,
        `"${row.daily_trend}"`,
        `"${row.intraday_trend}"`,
        row.relative_strength,
        `"${row.crossover_time || ''}"`,
        `"${row.signal_time || ''}"`,
        `"${(row.reason || '').replace(/"/g, '""')}"`,
      ];
      csvRows.push(values.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const nowStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `NSE_Semi_Algo_Scan_${nowStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="app-container" id="app-root">
      {/* 1. Header */}
      <Header />

      {/* 2. Metrics Cards */}
      <MetricsCards
        scanStatus={scanStatus}
        results={rawResults}
        summaryCounts={summaryCounts}
        lastCompletedAt={lastCompletedAt}
      />

      {/* 3. Scanner Controls & Progress */}
      <ScannerControls
        scanStatus={scanStatus}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        riskReward={riskReward}
        onRiskRewardChange={setRiskReward}
        volumeMultiplier={volumeMultiplier}
        onVolumeMultiplierChange={setVolumeMultiplier}
        onRunScan={handleRunScan}
        onStopScan={handleStopScan}
        onRefreshResults={loadResults}
      />

      {/* Error Message */}
      {errorMessage && (
        <div className="alert-banner alert-danger" style={{ marginBottom: '16px' }}>
          <strong>Error: </strong>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* 4. Filter & Search Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        counts={counts}
        sortField={sortField}
        onSortFieldChange={setSortField}
        sortDirection={sortDirection}
        onToggleSortDirection={() =>
          setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
        }
        onExportCsv={handleExportCsv}
        totalResultsCount={filteredAndSortedResults.length}
      />

      {/* 5. Comprehensive Results Table */}
      <ResultsTable
        results={filteredAndSortedResults}
        isLoading={scanStatus?.is_running}
        sortField={sortField}
        sortDirection={sortDirection}
        onSort={handleSort}
      />
    </div>
  );
}
