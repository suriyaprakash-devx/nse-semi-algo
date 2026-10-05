# Upstox Semi-Algo NSE Stock Scanner (SMA 6 & 30)

A production-ready semi-automated algorithmic stock scanner for NSE equities (NIFTY 100 & NIFTY 200 universe) using the official **Upstox API v2**, **FastAPI**, **React + Vite**, and **PostgreSQL**.

> **Important Safety Notice**: This application is strictly an analytical scanner and semi-algo decision support system. It **does NOT place automated buy or sell orders**.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |   React + Vite Frontend (Static Site) |
                      |    - Dashboard, Filters, Sorters      |
                      |    - Real-Time Progress, CSV Export   |
                      +-------------------+-------------------+
                                          |
                                HTTP / REST API
                                          |
                                          v
                      +---------------------------------------+
                      |     Python FastAPI Web Service        |
                      |   - Upstox OAuth 2.0 Token Flow       |
                      |   - Dynamic NIFTY 100+200 Universe    |
                      |   - Pandas SMA 6 & SMA 30 Crossover   |
                      |   - Rate-Limited Async HTTP Workers   |
                      +----------+-----------------+----------+
                                 |                 |
                   SQLAlchemy    |                 | Upstox API v2
                                 v                 v
                 +---------------+----+   +--------+------------------+
                 | PostgreSQL (Render)|   | Upstox Market APIs        |
                 | - scan_runs        |   | - Official Instrument JSON|
                 | - scan_results     |   | - Historical Daily Candles|
                 | - oauth_sessions   |   | - Current Day Live Candle |
                 +--------------------+   +---------------------------+
```

---

## Key Features

1. **Official Upstox API v2 Integration (No Zerodha Kite)**:
   - Uses Upstox `instrument_key` (e.g. `NSE_EQ|INE002A01018`) instead of Kite tokens.
   - Downloads and caches the official daily Upstox NSE instrument master JSON (`segment = 'NSE_EQ'`, `instrument_type = 'EQ'`).
   - Automatically filters out BSE, derivatives, ETFs, indices, and delisted instruments.

2. **Deduplicated NIFTY 100 + NIFTY 200 Universe**:
   - Dynamically obtains constituents from official NSE/NiftyIndices indices.
   - Merges and deduplicates symbols automatically into the top 200 NSE equities.
   - Maps symbols to active Upstox `instrument_key`s on each scan.

3. **Accurate SMA 6 & SMA 30 Crossover Detection**:
   - Calculates 6-period and 30-period Simple Moving Averages on completed daily candles.
   - **Current-Day Candle Integration**: Automatically incorporates today's current daily candle (synthesized from Upstox intraday ticks/quotes) so scans run with the latest market data.
   - **Confirmed Crossover Only**:
     - **BULLISH**: Previous Candle `SMA6 <= SMA30` **AND** Current Candle `SMA6 > SMA30`.
     - **BEARISH**: Previous Candle `SMA6 >= SMA30` **AND** Current Candle `SMA6 < SMA30`.
     - Does *not* trigger simply because SMA6 is above or below SMA30.

4. **Chronological Ranking & Pandas DataFrame Output**:
   - Ranks stocks strictly by `crossover_date DESC`, showing the freshest crossovers first.
   - Exact specified DataFrame schema:
     `Rank`, `Symbol`, `Company`, `Signal Type`, `Crossover Date`, `Close`, `SMA 6`, `SMA 30`.
   - Prices and SMA formatted to 2 decimal places.

5. **Flexible Authentication (Direct Access Token + OAuth 2.0)**:
   - **Direct Access Token Entry (Fastest)**: Directly paste your daily Upstox access token on the UI page. The backend verifies it immediately against Upstox profile API and saves the session.
   - **Official OAuth 2.0 Dialog**: Alternative full OAuth redirect authorization flow if you have developer credentials configured.
   - Access tokens are Fernet-encrypted at rest in PostgreSQL (`oauth_sessions`).
   - Quick **Update Token** modal on the dashboard allows seamless daily token refreshes without logging out.

6. **Render Deployment Ready**:
   - Full `render.yaml` Blueprint deploying FastAPI backend, React static site, and managed PostgreSQL.
   - Configurable scan retention policy (`DELETE_RESULTS_AFTER_SCAN=true/false`).

---

## Project Structure

```
.
├── backend/
│   ├── main.py            # FastAPI app, endpoints, and CORS
│   ├── scanner.py         # SMA 6 & 30 crossover detection & ranking
│   ├── universe.py        # NIFTY 100 + 200 constituents builder
│   ├── upstox_client.py   # Upstox SDK & REST client with caching & rate limits
│   ├── auth.py            # Upstox OAuth 2.0 authorization & session encryption
│   ├── config.py          # Pydantic Settings
│   ├── database.py        # SQLAlchemy engine (Postgres/SQLite)
│   ├── models.py          # scan_runs, scan_results, oauth_sessions
│   └── requirements.txt   # Backend Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # React Dashboard & Login UI
│   │   ├── App.css        # Dashboard styling & components
│   │   ├── index.css      # Design system, glassmorphism, animations
│   │   └── main.jsx       # React entry point
│   ├── package.json       # Frontend scripts and packages
│   └── vite.config.js     # Vite configuration with API proxy
├── Dockerfile             # Multi-stage Docker build (Vite + FastAPI SPA)
├── docker-compose.yml     # Local/Production Docker Compose definition
├── .dockerignore          # Docker build exclusion rules
├── .env.example           # Environment template
├── render.yaml            # Render Blueprint deployment
└── README.md
```

---

## Upstox Developer App Setup

1. Log in to [Upstox Developer Portal](https://developer.upstox.com/).
2. Create a new app (e.g., `Upstox Semi-Algo Scanner`).
3. Note your **API Key** (`UPSTOX_CLIENT_ID`) and **API Secret** (`UPSTOX_CLIENT_SECRET`).
4. Set the **Redirect URI**:
   - For local development: `http://localhost:8000/api/auth/callback`
   - For Render production: `https://<your-render-backend-url>/api/auth/callback`

---

## Local Development Setup

### 1. Clone & Configure Environment

```bash
git clone <repo-url>
cd "sma 6&30"

# Copy example env
cp .env.example .env
```

Edit `.env` with your Upstox credentials:
```env
UPSTOX_CLIENT_ID=your_client_id
UPSTOX_CLIENT_SECRET=your_client_secret
UPSTOX_REDIRECT_URI=http://localhost:8000/api/auth/callback
DATABASE_URL=sqlite:///./scanner.db
FRONTEND_URL=http://localhost:5173
```

### 2. Run Backend (FastAPI)

```bash
# Create and activate virtual environment
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI server
uvicorn backend.main:app --reload --port 8000
```

FastAPI Swagger documentation will be available at: `http://localhost:8000/docs`

### 3. Run Frontend (React + Vite)

In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```

Open your browser at: `http://localhost:5173`

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/auth/login` | Initiates official Upstox OAuth 2.0 flow |
| `GET` | `/api/auth/callback` | Exchanges authorization code for access token |
| `GET` | `/api/auth/status` | Returns active authentication state (no secrets) |
| `POST` | `/api/auth/logout` | Disconnects session and invalidates token |
| `POST` | `/api/scanner/run` | Triggers background semi-algo scan on universe |
| `GET` | `/api/scanner/status` | Real-time progress percentage and scanned count |
| `GET` | `/api/scanner/results` | Returns ranked DataFrame results |
| `GET` | `/health` | Service health status |

---

## Render Deployment

This project includes a ready-to-deploy `render.yaml` Blueprint file:

1. Push your code to a GitHub repository.
2. In the [Render Dashboard](https://dashboard.render.com/), click **New +** -> **Blueprint**.
3. Connect your repository.
4. Render will automatically configure:
   - **PostgreSQL Database** (`upstox-scanner-db`)
   - **FastAPI Web Service** (`upstox-scanner-backend`)
   - **React Static Site** (`upstox-scanner-frontend`)
5. In the Render Dashboard, fill in the secret environment variables:
   - `UPSTOX_CLIENT_ID`
   - `UPSTOX_CLIENT_SECRET`
   - `UPSTOX_REDIRECT_URI`: Set to `https://<backend-render-url>/api/auth/callback`
   - `FRONTEND_URL`: Set to `https://<frontend-render-url>`
6. Update your Redirect URI in the Upstox Developer Portal to match your Render backend callback URL.
7. Click **Deploy**.

---

## Docker Deployment

This project includes a multi-stage `Dockerfile` and `docker-compose.yml` for unified, containerized deployment. In the container, the React frontend is compiled into production assets and served directly by the high-performance FastAPI server on a single port (`8000`).

### 1. Build & Run with Docker Compose

```bash
# Build the image and start container in the background
docker-compose up --build -d

# Check container status & health
docker-compose ps

# View real-time application logs
docker-compose logs -f
```

Access the dashboard at `http://localhost:8000`.

### 2. Build & Run Standalone Docker Container

```bash
# Build Docker image
docker build -t nse-semi-algo:latest .

# Run container with environment configuration
docker run -d \
  -p 8000:8000 \
  --name nse-scanner \
  -e UPSTOX_CLIENT_ID="your_upstox_client_id" \
  -e UPSTOX_CLIENT_SECRET="your_upstox_client_secret" \
  -e UPSTOX_REDIRECT_URI="http://localhost:8000/api/auth/callback" \
  nse-semi-algo:latest
```

---

## License

MIT License. Designed for algorithmic equity research and decision support.
