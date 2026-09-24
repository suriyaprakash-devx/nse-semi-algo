# NSE Intraday Semi-Algo Stock Scanner

A production-ready **NSE intraday semi-algo stock scanner** and decision-support system built with **FastAPI**, **React + Vite**, **Pandas**, **PostgreSQL**, and **Yahoo Finance (`yfinance`)**.

Screens approximately **200 liquid, high-volume NSE equities** using **SMA 6/30 intraday crossovers**, session momentum, volume expansion confirmation, and price action breakout validation.

> [!CAUTION]
> **SAFETY & COMPLIANCE NOTICE**:
> **Analysis only — no orders are placed automatically.**
> This system is strictly an analytical scanner and decision-support dashboard. It does NOT contain broker order placement endpoints, does not use broker credentials, and will never execute trades on your behalf. All calculated trade levels (Entry, Stop-Loss, Target/Exit) are analytical strategy benchmarks and not guarantees of future price movement.

---

## Architecture

```text
Yahoo Finance Market Data
          ↓
       yfinance
          ↓
  Pandas & Indicators Layer
          ↓
    Strategy Engine
 (SMA 6/30, Momentum, Vol, Breakout)
          ↓
   Ranking & Alerts
          ↓
   FastAPI Endpoints
          ↓
React Dashboard (Vite)
```

**Brokerless & Keyless**: Works completely without any Upstox, Zerodha, or other broker API keys or access tokens.

---

## Strategy Rules & Objective Conditions

### 1. Market Hours & Timeframes
- **Market Hours**: 09:15 – 15:30 IST (`Asia/Kolkata` timezone).
- **Timeframe Options**: `5 Minutes`, `10 Minutes` (Default), `15 Minutes`.
- Evaluates only **fully completed candles**. Never generates confirmed signals on in-progress candles.

### 2. SMA 6 / SMA 30 Crossovers
- **Bullish Crossover**: Previous candle `SMA6 <= SMA30` AND current completed candle `SMA6 > SMA30`.
- **Bearish Crossover**: Previous candle `SMA6 >= SMA30` AND current completed candle `SMA6 < SMA30`.
- Never classifies `SMA6 > SMA30` alone as a new crossover.

### 3. Primary Status Evaluation
Every stock receives exactly one primary status:
1. **BUY**:
   - Confirmed bullish SMA crossover
   - Current Close > SMA30
   - Positive intraday momentum: `Momentum % > 0`
   - Volume confirmation: `Volume Ratio >= 1.5x` (20-period rolling average)
   - Price action confirmation: `Current Close > Previous Candle High`
2. **SELL**:
   - Confirmed bearish SMA crossover
   - Current Close < SMA30
   - Negative intraday momentum: `Momentum % < 0`
   - Volume confirmation: `Volume Ratio >= 1.5x`
   - Price action confirmation: `Current Close < Previous Candle Low`
3. **WATCH**:
   - Developing setup where primary crossover direction is present, but confirmation condition(s) are pending (e.g. Volume is 1.2x vs 1.5x required, or awaiting breakout).
   - Clearly displays the exact missing condition and potential trade levels.
4. **NO SIGNAL**:
   - No setup present. Trade levels are `None` (never fabricated).

### 4. Analytical Trade Levels
- **BUY**:
  - `Entry` = Previous Candle High (or breakout level)
  - `Stop-Loss` = Most recent valid intraday swing low - buffer
  - `Target` = `Entry + (Entry - Stop-Loss) × Reward` (Configurable R:R `1:1.5`, `1:2`, `1:3`)
- **SELL**:
  - `Entry` = Previous Candle Low
  - `Stop-Loss` = Most recent valid intraday swing high + buffer
  - `Target` = `Entry - (Stop-Loss - Entry) × Reward`
- **WATCH**:
  - Conditional entry level that would confirm the setup with corresponding SL and target.

### 5. Signal Strength Score (0 to 100)
Transparent additive objective score:
- Bullish/Bearish SMA Crossover: `+20`
- Price confirmed vs SMA30: `+15`
- Volume >= 1.5x: `+20`
- Positive/Negative Momentum: `+15`
- Price Action Confirmation: `+15`
- Daily Trend Alignment (`Daily SMA6 vs SMA30`): `+10`
- Relative Strength vs NIFTY 50 (`^NSEI`): `+5`

### 6. Multi-Factor Transparent Ranking
Stocks are ranked sequentially (1 to N) by:
1. Confirmed BUY/SELL setups first
2. WATCH setups second
3. Signal strength score
4. Recency of confirmed crossover (`crossover_time DESC`)
5. Volume expansion ratio
6. Intraday momentum magnitude
7. Daily trend alignment
8. Relative strength vs NIFTY

---

## Project Structure

```text
my first algo/
├── backend/
│   ├── main.py               # FastAPI REST endpoints, CORS, static serving
│   ├── scanner.py            # Scanner orchestration & progress tracking
│   ├── strategy.py           # SMA crossover, status logic, entry/SL/target & score
│   ├── indicators.py         # SMA, volume metrics, momentum, swing levels, RS
│   ├── market_data.py        # yfinance client, caching, batching, IST market hours
│   ├── universe.py           # Curated 200 NSE stocks mapping
│   ├── ranking.py            # Transparent multi-factor ranking algorithm
│   ├── alerts.py             # Alert provider abstraction & duplicate prevention
│   ├── models.py             # SQLAlchemy models (ScanRun, ScanResult, Signal)
│   ├── database.py           # PostgreSQL/SQLite database manager & retention cleanup
│   ├── config.py             # Application configuration & environment settings
│   └── requirements.txt      # Backend Python dependencies
│
├── frontend/
│   ├── index.html            # Vite HTML template with Google Fonts (Outfit, Inter)
│   ├── package.json          # React 19, Vite, Lucide-react
│   ├── vite.config.js        # Vite config with dev proxy to FastAPI
│   └── src/
│       ├── main.jsx          # React DOM entry point
│       ├── App.jsx           # Main trading dashboard & state manager
│       ├── api.js            # Frontend REST client
│       ├── index.css         # Dark cyber-trading design system & animations
│       └── components/
│           ├── Header.jsx         # Live IST clock, market status, safety disclaimer
│           ├── MetricsCards.jsx   # Selected, Scanned, BUY, SELL, WATCH, NO SIGNAL
│           ├── ScannerControls.jsx# Timeframe, R:R, Vol Multiplier, Run/Stop, Logs
│           ├── FilterBar.jsx      # Status tabs, search, multi-field sort, CSV export
│           └── ResultsTable.jsx   # Analytical table with expandable WATCH details
│
├── tests/
│   ├── test_indicators.py    # SMA, volume metrics, momentum, swings, RS tests
│   ├── test_strategy.py      # BUY, SELL, WATCH, NO SIGNAL, R:R calculation tests
│   ├── test_ranking.py       # Priority ranking and recency sorting tests
│   ├── test_market_data.py   # Resampling, market hours, mocked yfinance tests
│   ├── test_scanner.py       # Duplicate signal prevention & state tests
│   └── test_api.py           # FastAPI REST endpoint integration tests
│
├── .env.example              # Environment variable template
├── render.yaml               # Render Blueprint (Web service, Static site, PostgreSQL)
├── Dockerfile                # Production multi-stage Docker build
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & safety verification |
| `GET` | `/api/market/status` | Current NSE market status (OPEN / CLOSED) & IST clock |
| `GET` | `/api/universe` | List of ~200 NSE universe stocks with ticker mappings |
| `POST` | `/api/scanner/run` | Triggers scanner in background with selected options |
| `POST` | `/api/scanner/stop` | Gracefully stops running scan |
| `GET` | `/api/scanner/status` | Live scanner status, counts, current stock, recent logs |
| `GET` | `/api/scanner/progress` | Lightweight progress endpoint for UI progress bar |
| `GET` | `/api/scanner/results` | Latest scan results with analytical metrics & levels |

---

## Local Development

### 1. Backend Setup
```bash
# Activate virtual environment
python -m venv venv
venv\Scripts\activate       # Windows
# source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r backend/requirements.txt

# Run automated test suite
python -m pytest

# Start FastAPI server
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Running Automated Tests

Run the full automated test suite (mocked market data, zero network requests):

```bash
python -m pytest
```

---

## Deployment on Render

This repository includes a `render.yaml` blueprint defining:
1. `nse-scanner-backend`: Python Web Service running FastAPI.
2. `nse-scanner-frontend`: Static Site serving React + Vite.
3. `nse-scanner-postgres`: Managed PostgreSQL instance.

Deploy directly via Render Blueprint or Docker container.
