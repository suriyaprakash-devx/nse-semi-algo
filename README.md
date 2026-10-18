# Upstox Semi-Algo NSE Quantitative Stock Terminal

A high-performance, institutional-grade quantitative stock scanner and decision support system for NSE equities (**NIFTY 100 & NIFTY 200 universe**), powered by the official **Upstox API v2**, **Real-Time Live Market Feed**, **FastAPI**, **React + Vite**, and **PostgreSQL**.

> **Safety Notice**: This application is strictly an analytical scanner and decision support system. It **does NOT place automated buy or sell orders**.

---

## System Architecture

```
                      +-------------------------------------------------------+
                      |       React + Vite Frontend (Glassmorphic UI)         |
                      |  - Module 1: SMA 6 & 30 Crossover Scanner             |
                      |  - Module 2: Fundamental Screener & Checklist         |
                      |  - Module 3: 100-Point Stock Perfection Score         |
                      |  - Module 4: High-Volume Breakout & Retest Algo       |
                      |  - Real-Time WebSocket Telemetry & Live LTP Flashes   |
                      +---------------------------+---------------------------+
                                                  |
                                   HTTP / REST API & WebSocket (/ws/ticks)
                                                  |
                                                  v
                      +-------------------------------------------------------+
                      |              Python FastAPI Backend Service           |
                      |  - Upstox OAuth 2.0 & Direct Token Session Flow       |
                      |  - Real-Time Live Market Quote Feed Engine            |
                      |  - Deduplicated NIFTY 100 + 200 Universe Engine       |
                      |  - SMA 6 & 30 Confirmed Crossover Engine              |
                      |  - Rate-Limited Async Concurrent Workers              |
                      +-------------+-----------------------+-----------------+
                                    |                       |
                     SQLAlchemy ORM |                       | Upstox API v2 / Live Feed
                                    v                       v
                   +----------------+----+     +------------+--------------------+
                   | PostgreSQL / SQLite |     | Real-Time Market APIs           |
                   | - scan_runs         |     | - Upstox NSE Instrument Master  |
                   | - scan_results      |     | - Upstox Historical Daily OHLCV |
                   | - oauth_sessions    |     | - Live Market Chart / Quote API |
                   +---------------------+     | - Real-Time Tick WebSocket Feed |
                                               +---------------------------------+
```

---

## 4 Core Quantitative Modules

### 1️⃣ SMA 6 & 30 Crossover Scanner
- **Dual Engine Architecture**: Runs via official **Upstox API v2** when authenticated, and gracefully falls back to the **Real-Time Live Market Feed** if no Upstox token is present.
- **Accurate Current Day Candle**: Automatically synthesizes and appends today's current daily candle (LTP, Open, High, Low, Volume) so moving averages reflect active market conditions.
- **Confirmed Crossover Logic**:
  - **BULLISH Golden Cross**: Previous Bar `SMA 6 <= SMA 30` **AND** Current Bar `SMA 6 > SMA 30`. Verified active only if current `SMA 6 >= SMA 30` (prevents invalidated trend reversals).
  - **BEARISH Death Cross**: Previous Bar `SMA 6 >= SMA 30` **AND** Current Bar `SMA 6 < SMA 30`. Verified active only if current `SMA 6 <= SMA 30`.
- **True Live Metrics**:
  - Reports current live price (`Close` / LTP), `Crossover Price` (historical price at trigger), current `SMA 6`, current `SMA 30`, and `Spread %`.
  - Flags freshness: `FRESH` (≤ 1 day), `RECENT` (2–5 days), or `ACTIVE` (≤ 25 days).
- **Ranking & Export**: Chronologically ranks signals (`crossover_date DESC`), assign ranks 1..N, with single-click CSV export.

### 2️⃣ Fundamental Screener & Double Confirmation
- Comprehensive valuation and balance sheet metrics: Trailing P/E, P/B, EPS, ROE, Debt-to-Equity, Market Cap, 52-Week Range.
- Automated Pros & Cons breakdown (e.g., low debt, strong ROE, healthy earnings).
- **Double Confirmation Verdict**: Synthesizes the technical SMA crossover trend with fundamental health for high-conviction decision making.

### 3️⃣ 100-Point Stock Perfection Quant Score
- Composite algorithmic rating score (0 to 100):
  - Valuation Health (P/E relative to sector, P/B)
  - Profitability & Returns (ROE, ROCE)
  - Balance Sheet Solvency (Debt-to-Equity, leverage safety)
  - Technical Trend Momentum (SMA 6 & 30 alignment and spread)
- High-speed leaderboard with instant sorting and filtering.

### 4️⃣ High-Volume Breakout & Retest Algo Signals
- **Volume Expansion**: Filters for candles with volume expansion (`≥ 2.0x`, `≥ 2.5x`, or `≥ 3.0x` 20-day average volume).
- **Resistance Breakout**: Bullish candle closing cleanly above the previous 20-day high (`Close > prevHigh`).
- **Breakdown Protection**: Rejects failed breakouts where subsequent candles crashed below the breakout candle's low.
- **Retest Zone Defense**: Identifies pullbacks defending the breakout support zone:
  - Midpoint Demand Level: `(cand.high + cand.low) / 2`
  - Breakout Resistance Level: `prevHigh`
  - Configurable tolerance presets: `±1.5% (Strict)`, `±2.5% (Standard)`, `±4.0% (Broad)`.
- **Live WebSocket Telemetry**: Streams real-time market prices, dynamically updating distance from midpoint and trigger status with green/red price flash animations.

---

## Real-Time Live Data Architecture

| Feature | Primary Provider | Fallback Provider | Real-Time Cadence |
|---|---|---|---|
| **Daily Historical Candles** | Upstox API v2 (`historical-candle`) | Authenticated NSE Master Cache | Static + Daily sync |
| **Current Day Candle** | Upstox 1m Intraday / Quotes OHLC | Real-Time NSE Chart v8 Feed | On-demand scan execution |
| **Live LTP & Price Ticks** | Upstox Market Quotes API | Real-Time Async Feed (`backend/live_feed.py`) | Every 2.5s WebSocket broadcast |
| **Company Fundamentals** | Yahoo Finance / Screener Engine | Offline Pre-warmed Fundamental DB | Cached with 1h TTL |

---

## Project Structure

```
.
├── backend/
│   ├── main.py            # FastAPI application, REST endpoints, and WebSocket (/ws/ticks)
│   ├── live_feed.py       # High-speed asynchronous real-time market quote engine
│   ├── scanner.py         # SMA 6 & 30 crossover detection, invalidation checks, and ranking
│   ├── universe.py        # NIFTY 100 + 200 constituents loader and Upstox instrument mapper
│   ├── upstox_client.py   # Upstox SDK & REST client with rate limits and live candle integration
│   ├── analyzer.py        # Fundamental analysis engine and 100-point quant scoring
│   ├── auth.py            # Upstox OAuth 2.0 authorization & token encryption
│   ├── config.py          # Pydantic Settings
│   ├── database.py        # SQLAlchemy engine (Postgres / SQLite)
│   └── models.py          # scan_runs, scan_results, oauth_sessions
├── data/
│   ├── build_scanner_cache.py         # Script to download authentic 6-month NSE daily candles
│   ├── build_fundamentals.py          # Script to prewarm fundamental dataset
│   ├── nse_fundamentals_database.json # Offline fundamental records for NIFTY universe
│   └── scanner_data_cache.json        # Authentic 6-month daily candle cache for top NSE stocks
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # React Dashboard (Scanner, Screener, Perfection Score)
│   │   ├── App.css        # Obsidian Glass styling, ambient glow, and responsive layout
│   │   ├── AlgoSignals.jsx# High-Volume Breakout & Retest Terminal & Anatomy Inspector
│   │   ├── AlgoSignals.css# Algo signals styling, sparklines, and live telemetry badges
│   │   ├── index.css      # Design tokens, color system, and glassmorphism utilities
│   │   └── main.jsx       # React DOM entry point
│   ├── package.json       # Frontend scripts and dependencies
│   └── vite.config.js     # Vite configuration with API & WebSocket reverse proxy
├── Dockerfile             # Multi-stage production container build (Vite + FastAPI SPA)
├── docker-compose.yml     # Local/Production Docker Compose service definition
├── .env.example           # Environment variable template
├── render.yaml            # Render Blueprint deployment specification
├── requirements.txt       # Python backend dependencies
└── README.md              # Project documentation
```

---

## Local Development Setup

### 1. Prerequisites
- Python 3.10+
- Node.js 18+ and npm

### 2. Environment Configuration
Create a `.env` file in the project root:
```env
# Upstox Developer API (Optional for Live Market Feed mode, required for official Upstox trading)
UPSTOX_CLIENT_ID=your_upstox_client_id
UPSTOX_CLIENT_SECRET=your_upstox_client_secret
UPSTOX_REDIRECT_URI=http://localhost:8000/api/auth/callback

# Database & Ports
DATABASE_URL=sqlite:///./scanner.db
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173
SESSION_SECRET_KEY=dev-secret-key-change-in-production-1234567890

# Scanner Settings
DELETE_RESULTS_AFTER_SCAN=false
SCAN_CONCURRENCY=8
INCLUDE_CURRENT_DAY_CANDLE=true
```

### 3. Run Backend (FastAPI)
```bash
# Activate virtual environment
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start backend server
uvicorn backend.main:app --reload --port 8000
```
API Documentation will be available at: `http://localhost:8000/docs`

### 4. Run Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Production Deployment (Render)

This repository includes a `render.yaml` Blueprint configured to deploy:
1. **Python FastAPI Backend Web Service**: Auto-detects port, serves endpoints and WebSockets.
2. **React Static Site**: Compiles frontend assets with SPA routing.
3. **Managed PostgreSQL**: Automatically stores encrypted OAuth sessions and historical scans.

To deploy:
1. Connect this GitHub repository to [Render](https://render.com/).
2. Create a **New Blueprint Instance** and select the repository.
3. Set your `UPSTOX_CLIENT_ID` and `UPSTOX_CLIENT_SECRET` in the Render dashboard.

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check and system uptime |
| `/api/algo/swing-analysis/{symbol}` | GET | Executes AI Swing Trading System v4.0 (XGBoost, Walk-Forward, ATR Plan, 8 Pillars) |
| `/api/algo/swing-analysis` | POST | Batch/custom symbol AI Swing Trading analysis |
| `/api/scanner/run` | POST | Triggers NIFTY 100/200 SMA 6 & 30 crossover scan |
| `/api/scanner/status` | GET | Real-time scan progress (`stocks_scanned / total_stocks`) |
| `/api/scanner/results` | GET | Returns ranked list of confirmed crossovers |
| `/api/analysis/{symbol}` | GET | Screener fundamentals & double confirmation checklist |
| `/api/scoring/leaderboard` | GET | 100-Point Stock Perfection Score leaderboard |
| `/api/scanner-data` | GET | Dataset of daily candles for Breakout & Retest scanner |
| `/api/ohlc-snapshot` | GET | Real-time live OHLC snapshot for requested symbols/tokens |
| `/ws/ticks` | WebSocket | Real-time tick stream for subscribed instruments |

---

## License
MIT License. Strictly for analytical, educational, and decision support purposes.
