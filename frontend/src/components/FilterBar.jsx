import React from 'react';
import { Search, Download, ArrowUpDown, Filter } from 'lucide-react';

export default function FilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  counts,
  sortField,
  onSortFieldChange,
  sortDirection,
  onToggleSortDirection,
  onExportCsv,
  totalResultsCount,
}) {
  return (
    <div className="filter-bar" id="filter-sorting-bar">
      {/* Search Input */}
      <div className="search-box" id="search-stocks-box">
        <Search size={16} color="var(--text-muted)" />
        <input
          type="text"
          id="search-input"
          placeholder="Search Symbol (e.g. RELIANCE, TCS) or Company..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="clear-search-btn"
            title="Clear search"
          >
            ×
          </button>
        )}
      </div>

      {/* Status Filter Chips */}
      <div className="filter-pills" id="status-filter-pills">
        <button
          className={`filter-chip ${statusFilter === 'ALL' ? 'active' : ''}`}
          onClick={() => onStatusFilterChange('ALL')}
          id="filter-all"
        >
          All ({counts.all || 0})
        </button>

        <button
          className={`filter-chip chip-buy ${statusFilter === 'BUY' ? 'active buy-active' : ''}`}
          onClick={() => onStatusFilterChange('BUY')}
          id="filter-buy"
        >
          BUY ({counts.buy || 0})
        </button>

        <button
          className={`filter-chip chip-sell ${statusFilter === 'SELL' ? 'active sell-active' : ''}`}
          onClick={() => onStatusFilterChange('SELL')}
          id="filter-sell"
        >
          SELL ({counts.sell || 0})
        </button>

        <button
          className={`filter-chip chip-watch ${statusFilter === 'WATCH' ? 'active watch-active' : ''}`}
          onClick={() => onStatusFilterChange('WATCH')}
          id="filter-watch"
        >
          WATCH ({counts.watch || 0})
        </button>

        <button
          className={`filter-chip chip-neutral ${statusFilter === 'NO SIGNAL' ? 'active neutral-active' : ''}`}
          onClick={() => onStatusFilterChange('NO SIGNAL')}
          id="filter-no-signal"
        >
          NO SIGNAL ({counts.no_signal || 0})
        </button>
      </div>

      {/* Sorting Dropdown & Order */}
      <div className="sort-controls-wrapper">
        <span className="sort-label">Sort:</span>
        <select
          id="sort-field-select"
          className="sort-select"
          value={sortField}
          onChange={(e) => onSortFieldChange(e.target.value)}
        >
          <option value="rank">Rank</option>
          <option value="signal_strength">Signal Strength</option>
          <option value="crossover_time">Crossover Time</option>
          <option value="volume_ratio">Volume Ratio</option>
          <option value="day_change_percent">Day %</option>
          <option value="momentum_percent">Momentum %</option>
          <option value="relative_strength">RS vs NIFTY</option>
          <option value="current_price">Price</option>
        </select>

        <button
          onClick={onToggleSortDirection}
          className="btn btn-secondary btn-icon-only"
          title={`Order: ${sortDirection.toUpperCase()}`}
          id="btn-sort-direction"
        >
          <ArrowUpDown size={14} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
            {sortDirection === 'asc' ? 'ASC' : 'DESC'}
          </span>
        </button>
      </div>

      {/* Export to CSV */}
      {totalResultsCount > 0 && (
        <button
          onClick={onExportCsv}
          className="btn btn-secondary btn-sm"
          id="btn-export-csv"
          title="Download Results as CSV"
        >
          <Download size={14} />
          <span>Export CSV</span>
        </button>
      )}
    </div>
  );
}
