# NSE Semi-Algo Quantitative Stock Terminal

A high-performance, institutional-grade quantitative stock scanner and decision support system for NSE equities (**NIFTY 100 & NIFTY 200 universe**), powered exclusively by **Yahoo Finance (yfinance)**, **Real-Time Live Market Feed**, **FastAPI**, **React + Vite**, and **Capacitor Android APK**.

> **Safety Notice**: This application is strictly an analytical scanner and decision support system. It **does NOT place automated buy or sell orders**.

---

## Key Highlights

- **Zero Upstox Dependency**: Completely decoupled from Upstox OAuth, API tokens, and developer portal logins.
- **Yahoo Finance Engine**: All historical and live OHLCV data for NSE equities is fetched via `yfinance` in parallel asynchronous batches.
- **Single-User Authentication**: Secure terminal access with username `suriyaprakash` and password `master730`.
- **Streamlined Workflow**: Completely removed the legacy Stock Screener Analysis module, focusing on high-conviction signals:
  1. **SMA 6 & 30 Confirmed Crossover Scanner**
  2. **Algo Signals (AI Swing Trading System v4.0)**
- **Cross-Platform Delivery**: Production-ready Web Application (React 19 + Vite + Glassmorphic Obsidian/Crystal Theme) and native Android APK container (Capacitor 8).

---

## System Architecture

```
                      +-------------------------------------------------------+
                      |       React + Vite Frontend (Glassmorphic UI)         |
                      |  - Module 1: SMA 6 & 30 Crossover Scanner (yfinance)  |
                      |  - Module 2: Algo Signals (AI Swing Trading v4.0)     |
                      |  - Single User Auth (suriyaprakash / master730)       |
                      |  - Android APK (Capacitor 8) & Web SPA                |
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

## 2 Core Quantitative Modules

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
- **Probabilistic Machine Learning Engine**: TimeSeriesSplit XGBoost cross-validation combined with Supertrend and Relative Strength vs NIFTY 50.
- **Multi-Pillar Quantitative Evaluation**:
  - Technical Trend Momentum & Moving Average Alignment
  - Volatility & Range Expansion (ATR)
  - Volume Anomaly & Order Flow Surge
  - Risk-to-Reward Ratio (Entry, Target 1/2/3, Stoploss)
- **Trade Plan Synthesizer**: Concrete execution plans with exact entry price, invalidation stoploss, and profit targets.

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
npm run build      # Compiles production bundle to frontend/dist
npm run dev        # Starts Vite local development server
```

### 3. Android APK (Capacitor 8)
The Android application is packaged using Capacitor:
```bash
cd frontend
# 1. Build Vite web bundle
npm run build

# 2. Sync web bundle to Android project
node ./node_modules/@capacitor/cli/bin/capacitor sync android

# 3. Assemble debug APK using Gradle
cd android
.\gradlew.bat assembleDebug
```
The compiled APK will be generated at:
`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

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
