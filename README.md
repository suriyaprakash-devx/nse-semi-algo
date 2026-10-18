# NSE Semi-Algo Quantitative Stock Terminal

A high-performance, institutional-grade quantitative stock scanner and decision support web application for NSE equities (**NIFTY 100 & NIFTY 200 universe**), powered exclusively by **Yahoo Finance (yfinance)**, **Real-Time Live Market Feed**, **FastAPI**, and **React + Vite**.

> **Safety Notice**: This application is strictly an analytical scanner and decision support system. It **does NOT place automated buy or sell orders**.

---

## Key Highlights

- **Zero Upstox Dependency**: Completely decoupled from Upstox OAuth, API tokens, and developer portal logins.
- **Yahoo Finance Engine**: All historical and live OHLCV data for NSE equities is fetched via `yfinance` in parallel asynchronous batches.
- **Single-User Authentication**: Secure terminal access with username `suriyaprakash` and password `master730`.
- **Streamlined Workflow**: Focused on 3 institutional high-conviction decision support modules:
  1. **1️⃣ SMA 6 & 30 Confirmed Crossover Scanner**
  2. **2️⃣ Algo Signals (AI Swing Trading System v4.0)**
  3. **3️⃣ SMA Bullish AI Radar (AI Probability at Top)**
- **Modern Responsive Web Terminal**: Production-ready Web Application (React 19 + Vite + Glassmorphic Obsidian/Crystal Theme) designed for seamless desktop and mobile web experiences.

---

## System Architecture

```
                      +-------------------------------------------------------+
                      |       React + Vite Frontend (Glassmorphic UI)         |
                      |  - Slide 1: SMA 6 & 30 Crossover Scanner (yfinance)   |
                      |  - Slide 2: Algo Signals (AI Swing Trading v4.0)      |
                      |  - Slide 3: SMA Bullish AI Radar (AI Prob at Top)     |
                      |  - Single User Auth (suriyaprakash / master730)        |
                      |  - Desktop & Mobile Web Browser SPA                   |
                      +---------------------------+---------------------------+
                                                  |
                                   HTTP / REST API & WebSocket (/ws/ticks)
                                                  |
                                                  v
                      +-------------------------------------------------------+
                      |              Python FastAPI Backend Service           |
                      |  - Single-User Credential Authentication & Sessions   |
                      |  - Yahoo Finance (yfinance) Batch Equities Downloader |
                      |  - Real-Time Live Market Quote Feed Engine            |
                      |  - Deduplicated NIFTY 100 + 200 Universe Engine       |
                      |  - SMA 6 & 30 Confirmed Crossover Engine              |
                      |  - AI Swing v4.0 Multi-Threaded Alpha Radar Engine    |
                      +-------------+-----------------------+-----------------+
                                    |                       |
                     SQLAlchemy ORM |                       | yfinance / Yahoo Chart API
                                    v                       v
                   +----------------+----+     +------------+--------------------+
                   | PostgreSQL / SQLite |     | Real-Time Market APIs           |
                   | - scan_runs         |     | - Yahoo Finance (yfinance)      |
                   | - scan_results      |     | - Real-Time NSE Chart v8 Feed   |
                   | - oauth_sessions    |     | - Real-Time Tick WebSocket Feed |
                   +---------------------+     +---------------------------------+
```

---

## 3 Core Quantitative Modules

### 1️⃣ SMA 6 & 30 Crossover Scanner
- **Powered by yfinance**: Downloads 6-month historical OHLCV data directly in concurrent batches of 25 equities with automatic individual fallbacks.
- **Accurate Current Day Candle**: Automatically synthesizes and appends today's current daily candle (LTP, Open, High, Low, Volume) so moving averages reflect active market conditions.
- **Confirmed Crossover Logic**:
  - **BULLISH Golden Cross**: Previous Bar `SMA 6 <= SMA 30` **AND** Current Bar `SMA 6 > SMA 30`. Verified active only if current `SMA 6 >= SMA 30` (prevents invalidated trend reversals).
  - **BEARISH Death Cross**: Previous Bar `SMA 6 >= SMA 30` **AND** Current Bar `SMA 6 < SMA 30`. Verified active only if current `SMA 6 <= SMA 30`.
- **True Live Metrics**:
  - Reports current live price (`Close` / LTP), `Crossover Price` (historical price at trigger), current `SMA 6`, current `SMA 30`, and `Spread %`.
  - Flags freshness: `FRESH` (≤ 1 day), `RECENT` (2–5 days), or `ACTIVE` (≤ 25 days).
- **Ranking & Export**: Chronologically ranks signals (`crossover_date DESC`), assign ranks 1..N, with single-click CSV export (`nse_sma_scan_YYYY-MM-DD.csv`).
- **Direct Drill-down**: Click any stock to view crossover breakdown, jump directly to AI Swing Trading Model v4.0, or view the live TradingView chart.

### 2️⃣ Algo Signals (AI Swing Trading System v4.0)
- **Probabilistic Machine Learning Engine**: TimeSeriesSplit (5 folds) XGBoost classifier combined with Supertrend and Relative Strength vs NIFTY 50.
- **21 Engineered Features**: Normalized EMA distances (20/50/200), MACD, MACDH, ADX (+DI / -DI), ATR, Bollinger Band Width & Position, Stochastics, Volume Surge Ratio, Momentum (5d/20d), and Supertrend.
- **Walk-Forward Validation**: Simulates out-of-sample trades on the last 20% of data to report real win rate, profit factor, average profit, and maximum drawdown.
- **Interactive Tooling**:
  - Live SVG Candlestick & EMA 20/50 chart with crosshair tooltips.
  - Interactive cumulative return equity curve.
  - Dynamic Position Sizing & Capital Allocator calculator (customizable portfolio size & risk % per trade).

### 3️⃣ Best Stocks Radar (Top Swing Alpha Screener)
- **Market-Wide Automated Screening**: Continuously evaluates top liquid NSE candidates through the exact v4.0 quantitative rules and ranks them using an institutional 0-100 **Alpha Score**.
- **Alpha Tiers**:
  - `👑 Prime Alpha` (Score ≥ 75 or Strong Buy)
  - `⭐ High Conviction` (Passed core AI & confirmation rules)
  - `🟡 Watchlist Setup` (Developing setups near trigger)
  - `⚠️ Avoid` (High risk or negative momentum)
- **Immediate Actionability**:
  - Exact Entry, Stoploss (1.5x ATR), Target 1 (3.0x ATR), Target 2 (4.5x ATR), and Risk/Reward ratio.
  - Expected holding period (3 to 8 trading days based on ADX trend strength).
  - Bullish catalyst breakdown (e.g. Volume surge, Supertrend bullish, Outperforming NIFTY 50).
  - Single-click CSV export (`nse_best_swing_stocks_YYYY-MM-DD.csv`).
  - Seamless jump into Slide 2 to inspect full model breakdown.

---

## Authentication

The terminal uses single-user authentication:
- **Username**: `suriyaprakash`
- **Password**: `master730`

Authentication tokens are validated locally and stored in encrypted local storage (`sma_auth_token`), automatically attached via `Authorization: Bearer <token>` to all HTTP requests on web and native mobile platforms.

---

## Building & Running

### 1. Backend Service (FastAPI)
```bash
# Windows
.\venv\Scripts\activate
# Start backend server
uvicorn backend.main:app --reload --port 8000
```
Interactive API documentation is available at `http://localhost:8000/docs`.

### 2. Frontend Web Application
```bash
cd frontend
npm install
npm run build      # Compiles production web bundle to frontend/dist
npm run dev        # Starts Vite local development server
```

Access the web application at `http://localhost:5173` on desktop or mobile browser.

### 3. Standalone AI Swing Trading System v4.0 Script
You can also run the exact, untouched Python CLI script directly:
```bash
python ai_swing_v4.py
# Enter NSE Symbol when prompted: RELIANCE, TCS, INFY, etc.
```

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health check and system uptime |
| `/api/auth/login` | POST | Single-user authentication (`suriyaprakash` / `master730`) |
| `/api/auth/status` | GET | Current session validation status |
| `/api/auth/logout` | POST | Terminate session |
| `/api/scanner/run` | POST | Triggers NIFTY 100/200 SMA 6 & 30 crossover scan via `yfinance` |
| `/api/scanner/status` | GET | Real-time scan progress (`stocks_scanned / total_stocks`) |
| `/api/scanner/results` | GET | Returns ranked list of confirmed crossovers |
| `/api/algo/swing-analysis/{symbol}` | GET | Executes AI Swing Trading System v4.0 |
| `/api/ohlc-snapshot` | GET | Real-time live OHLC snapshot for requested symbols |
| `/ws/ticks` | WebSocket | Real-time tick stream for subscribed instruments |

---

## License
MIT License. Strictly for analytical, educational, and decision support purposes.
