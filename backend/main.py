import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import init_db, get_db
from backend.models import ScanRun, ScanResult, cleanup_old_scans
from backend.auth import (
    router as auth_router,
    get_current_session,
    get_current_session_optional,
    get_active_access_token,
    OAuthSession
)
from backend.scanner import scanner_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("nse_sma_scanner")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database
    logger.info("Initializing NSE Semi-Algo Scanner backend (yfinance engine)...")
    init_db()
    yield
    # Shutdown
    logger.info("Shutting down NSE Semi-Algo Scanner backend...")

app = FastAPI(
    title="NSE Semi-Algo Scanner",
    description="Semi-automated NSE NIFTY 100/200 Stock Scanner with SMA 6 & 30 Crossover Detection (yfinance)",
    version="2.5.0",
    lifespan=lifespan
)

# Configure CORS (Web & Mobile Capacitor)
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
for cap_origin in ["https://localhost", "capacitor://localhost", "http://localhost"]:
    if cap_origin not in origins:
        origins.append(cap_origin)
if settings.FRONTEND_URL and settings.FRONTEND_URL not in origins:
    origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_origin_regex=r"https://.*\.onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Authentication Router
app.include_router(auth_router)

@app.get("/health")
def health_check():
    from datetime import datetime, timezone
    return {
        "status": "healthy",
        "service": "upstox-sma-scanner",
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.post("/api/scanner/run")
async def trigger_scan(
    background_tasks: BackgroundTasks,
    session: Optional[OAuthSession] = Depends(get_current_session_optional)
):
    """
    Trigger the semi-algo scanner powered by yfinance.
    Scans NIFTY 100 + 200 universe, calculates SMA 6 & 30 with current day candle,
    detects confirmed crossovers, ranks by crossover date, and stores results.
    """
    if scanner_manager.is_running:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "status": "running",
                "message": "Scan already in progress.",
                "details": scanner_manager.get_status()
            }
        )

    # Launch scan task in background via yfinance
    asyncio.create_task(scanner_manager.run_scan())

    return {
        "status": "started",
        "message": "Semi-algo scanner execution started via Yahoo Finance (yfinance).",
        "progress": scanner_manager.progress_message
    }

@app.post("/api/scanner/stop")
def stop_scanner():
    """
    Stops an ongoing semi-algo crossover scan immediately.
    """
    if not scanner_manager.is_running:
        return {"status": "not_running", "message": "No scan is currently running."}
    scanner_manager.stop_scan()
    return {"status": "stopping", "message": "Scan abort initiated."}

@app.get("/api/scanner/status")
def get_scanner_status():
    """
    Returns real-time progress and status of the scanner.
    """
    return scanner_manager.get_status()

@app.get("/api/scanner/results")
def get_scanner_results(
    db: Session = Depends(get_db),
    session: Optional[OAuthSession] = Depends(get_current_session_optional)
):
    """
    Returns the latest scan results formatted with:
    Rank, Symbol, Company, Signal Type, Crossover Date, Close, SMA 6, SMA 30.
    """
    # 1. Check in-memory results first
    if scanner_manager.latest_results:
        results = scanner_manager.latest_results
        scan_id = scanner_manager.current_scan_id
    else:
        # 2. Check latest completed scan run from Database
        latest_run = (
            db.query(ScanRun)
            .filter(ScanRun.status == "completed")
            .order_by(ScanRun.id.desc())
            .first()
        )
        if not latest_run:
            return {
                "scan_id": None,
                "status": "no_scans",
                "stocks_scanned": 0,
                "signals_found": 0,
                "results": []
            }

        scan_id = latest_run.id
        results = [
            {
                "Rank": r.rank,
                "Symbol": r.symbol,
                "Company": r.company,
                "Signal Type": r.signal_type,
                "Crossover Date": r.crossover_date,
                "Close": round(r.close, 2),
                "SMA 6": round(r.sma6, 2),
                "SMA 30": round(r.sma30, 2)
            }
            for r in latest_run.results
        ]

    # Handle DELETE_RESULTS_AFTER_SCAN policy if configured
    if settings.DELETE_RESULTS_AFTER_SCAN:
        cleanup_old_scans(db, keep_count=0, delete_all=True)

    return {
        "scan_id": scan_id,
        "status": "completed",
        "stocks_scanned": scanner_manager.stocks_scanned or len(results),
        "signals_found": len(results),
        "results": results
    }


# In-memory leaderboard cache (TTL 300 seconds)
_LEADERBOARD_CACHE: Dict[str, Any] = {"timestamp": 0.0, "data": []}

@app.get("/api/scoring/leaderboard")
async def get_scoring_leaderboard(db: Session = Depends(get_db)):
    """
    Returns stocks ranked by their Stock Perfection Score (0 - 100),
    synthesizing technical SMA 6 & 30 crossovers with fundamental health.
    Cached for high-speed delivery without cloud network latency.
    """
    now = time.time()
    if _LEADERBOARD_CACHE["data"] and (now - _LEADERBOARD_CACHE["timestamp"] < 300):
        return {
            "count": len(_LEADERBOARD_CACHE["data"]),
            "leaderboard": _LEADERBOARD_CACHE["data"]
        }

    from backend.analyzer import get_stock_analysis

    # Retrieve candidate stocks from memory or database or default list
    candidates = []
    if scanner_manager.latest_results:
        candidates = [
            {"symbol": r["Symbol"], "signal_type": r.get("Signal Type", "BULLISH"), "close": r.get("Close"), "company": r.get("Company")}
            for r in scanner_manager.latest_results[:20]
        ]
    else:
        latest_run = (
            db.query(ScanRun)
            .filter(ScanRun.status == "completed")
            .order_by(ScanRun.id.desc())
            .first()
        )
        if latest_run and latest_run.results:
            candidates = [
                {"symbol": r.symbol, "signal_type": r.signal_type, "close": r.close, "company": r.company}
                for r in latest_run.results[:20]
            ]
        else:
            default_symbols = [
                ("RELIANCE", "Reliance Industries Ltd", "BULLISH"),
                ("TCS", "Tata Consultancy Services Ltd", "BULLISH"),
                ("HDFCBANK", "HDFC Bank Ltd", "NEUTRAL"),
                ("INFY", "Infosys Ltd", "BULLISH"),
                ("TATAMOTORS", "Tata Motors Ltd", "BULLISH"),
                ("SBIN", "State Bank of India", "BULLISH"),
                ("ITC", "ITC Ltd", "NEUTRAL"),
                ("BHARTIARTL", "Bharti Airtel Ltd", "BULLISH"),
                ("LT", "Larsen & Toubro Ltd", "BULLISH"),
                ("ICICIBANK", "ICICI Bank Ltd", "BULLISH"),
                ("BAJFINANCE", "Bajaj Finance Ltd", "BULLISH"),
                ("MARUTI", "Maruti Suzuki India Ltd", "BULLISH"),
                ("SUNPHARMA", "Sun Pharmaceutical Industries Ltd", "BULLISH"),
                ("NTPC", "NTPC Ltd", "BULLISH"),
                ("TITAN", "Titan Company Ltd", "BULLISH")
            ]
            candidates = [{"symbol": sym, "company": comp, "signal_type": sig, "close": 0.0} for sym, comp, sig in default_symbols]

    semaphore = asyncio.Semaphore(8)

    async def fetch_score(c):
        async with semaphore:
            try:
                data = await asyncio.to_thread(get_stock_analysis, c["symbol"], c.get("signal_type"))
                return {
                    "symbol": c["symbol"],
                    "company": data.get("company", c.get("company", c["symbol"])),
                    "current_price": data.get("current_price", c.get("close", 0.0)),
                    "technical_signal": data.get("technical_signal", "NONE"),
                    "perfection_score": data.get("perfection_score", 0),
                    "perfection_grade": data.get("perfection_grade", "N/A"),
                    "perfection_details": data.get("perfection_details", {}),
                    "pe": data.get("trailing_pe"),
                    "roe": data.get("roe"),
                    "debt_to_equity": data.get("debt_to_equity"),
                    "double_confirmation": data.get("double_confirmation", {})
                }
            except Exception as e:
                logger.warning(f"Error scoring candidate {c['symbol']}: {e}")
                return None

    tasks = [fetch_score(c) for c in candidates]
    scored = await asyncio.gather(*tasks)
    valid_scored = [s for s in scored if s is not None]

    # Sort descending by perfection_score
    valid_scored.sort(key=lambda s: s["perfection_score"], reverse=True)

    for idx, item in enumerate(valid_scored, start=1):
        item["rank"] = idx

    _LEADERBOARD_CACHE["timestamp"] = now
    _LEADERBOARD_CACHE["data"] = valid_scored

    return {
        "count": len(valid_scored),
        "leaderboard": valid_scored
    }


# ----------------- Algo Signals Endpoints (AI Swing Trading v4.0) -----------------
import json
import random

@app.get("/api/algo/swing-analysis")
@app.get("/api/algo/swing-analysis/{symbol}")
async def get_algo_swing_analysis(
    symbol: str = "RELIANCE",
    refresh: bool = False
):
    """
    Executes AI SWING TRADING SYSTEM v4.0 for requested NSE equity.
    Computes indicators, Supertrend, Relative Strength vs NIFTY,
    TimeSeriesSplit XGBoost cross-validation, walk-forward backtesting,
    probabilistic signal generation (STRONG BUY, BUY, AVOID, WAIT),
    and exact Trade Plan (Entry, Target, Stoploss, R/R).
    """
    from backend.algo_swing import run_ai_swing_analysis
    clean_symbol = symbol.strip().upper()
    try:
        data = await asyncio.to_thread(run_ai_swing_analysis, clean_symbol, force_refresh=refresh)
        return {"status": "success", "data": data}
    except Exception as e:
        logger.error(f"Error in AI Swing Analysis for {clean_symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/algo/best-stocks")
async def get_algo_best_stocks(
    limit: int = 25,
    refresh: bool = False
):
    """
    Ranks top NSE candidate stocks using the AI Swing Trading System v4.0.
    Produces a composite Quantitative Alpha Score (0 - 100), categorization tiers,
    concrete trade plans (Entry, Target, Stoploss, R/R), and bullish catalysts.
    Helps traders instantly spot the highest-conviction swing trade opportunities (Slide 3).
    """
    from backend.algo_swing import get_best_swing_stocks
    try:
        data = await asyncio.to_thread(get_best_swing_stocks, limit=limit, force_refresh=refresh)
        return data
    except Exception as e:
        logger.error(f"Error in Best Stocks Radar: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/scanner-data")
async def get_scanner_data():
    """
    Returns metadata and stocks dataset for High-volume Breakout & Retest scanner.
    Each stock includes symbol, company name, instrument token, Nifty flags, and daily candles.
    """
    cache_path = Path(__file__).resolve().parent.parent / "data" / "scanner_data_cache.json"
    if not cache_path.exists():
        try:
            from data.build_scanner_cache import build_cache
            await asyncio.to_thread(build_cache)
        except Exception as e:
            logger.warning(f"Unable to auto-build scanner cache: {e}")

    if cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data
        except Exception as e:
            logger.error(f"Error reading scanner cache: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to load scanner cache: {e}")

    raise HTTPException(status_code=503, detail="Scanner cache is currently initializing. Please retry in a few moments.")


@app.get("/api/ohlc-snapshot")
async def get_ohlc_snapshot(tokens: Optional[str] = None, symbols: Optional[str] = None):
    """
    Returns real-time live OHLC snapshot for requested symbols or instrument tokens,
    providing true market LTP, day high, day low, day open, and volume.
    """
    from backend.live_feed import get_batch_live_quotes

    requested_tokens = set([t.strip() for t in tokens.split(",") if t.strip()]) if tokens else set()
    requested_symbols = set([s.strip().upper() for s in symbols.split(",") if s.strip()]) if symbols else set()

    cache_path = Path(__file__).resolve().parent.parent / "data" / "scanner_data_cache.json"
    token_to_sym = {}
    sym_to_token = {}

    if cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cdata = json.load(f)
            for s in cdata.get("stocks", []):
                sym = s.get("symbol", "").upper()
                tok = s.get("instrument_token", "")
                if sym and tok:
                    token_to_sym[tok] = sym
                    sym_to_token[sym] = tok
        except Exception as e:
            logger.debug(f"Cache map notice for snapshot: {e}")

    # Determine symbols to query
    query_symbols = set(requested_symbols)
    for tok in requested_tokens:
        if tok in token_to_sym:
            query_symbols.add(token_to_sym[tok])

    # If no specific filter, query all cached stocks
    if not query_symbols and cache_path.exists():
        query_symbols = set(sym_to_token.keys())

    # Fetch real live quotes
    live_quotes = await get_batch_live_quotes(list(query_symbols))
    snapshot = {}

    for sym, q in live_quotes.items():
        tok = sym_to_token.get(sym, "")
        price_info = {
            "symbol": sym,
            "instrument_token": tok,
            "last_price": q.get("last_price", 0.0),
            "open": q.get("open", 0.0),
            "high": q.get("high", 0.0),
            "low": q.get("low", 0.0),
            "close": q.get("close", 0.0),
            "volume": q.get("volume", 0),
            "change": q.get("change", 0.0),
            "change_pct": q.get("change_pct", 0.0),
            "timestamp": q.get("timestamp", int(time.time()))
        }
        snapshot[sym] = price_info
        if tok:
            snapshot[tok] = price_info

    return {"status": "success", "data": snapshot}


@app.websocket("/ws/ticks")
async def websocket_ticks_endpoint(websocket: WebSocket, tokens: Optional[str] = None, mode: Optional[str] = "full"):
    """
    WebSocket endpoint for real-time live price ticks.
    Subscribes to requested instrument tokens and streams real market tick updates.
    """
    await websocket.accept()
    from backend.live_feed import get_batch_live_quotes

    token_list = [t.strip() for t in tokens.split(",") if t.strip()] if tokens else []
    logger.info(f"WebSocket client connected for live ticks: {len(token_list)} tokens, mode={mode}")

    cache_path = Path(__file__).resolve().parent.parent / "data" / "scanner_data_cache.json"
    token_to_sym = {}
    sym_to_token = {}

    if cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                cdata = json.load(f)
            for s in cdata.get("stocks", []):
                sym = s.get("symbol", "").upper()
                tok = s.get("instrument_token", "")
                if sym and tok:
                    token_to_sym[tok] = sym
                    sym_to_token[sym] = tok
        except Exception as e:
            logger.debug(f"Cache map notice for WS: {e}")

    subscribed_symbols = [token_to_sym.get(t, t) for t in token_list]

    # Send initial real live quote snapshot
    initial_ticks = []
    if subscribed_symbols:
        live_quotes = await get_batch_live_quotes(subscribed_symbols)
        for tok in token_list:
            sym = token_to_sym.get(tok, tok)
            q = live_quotes.get(sym)
            if q:
                initial_ticks.append({
                    "token": tok,
                    "symbol": sym,
                    "last_price": q.get("last_price", 0.0),
                    "change": q.get("change", 0.0),
                    "change_pct": q.get("change_pct", 0.0),
                    "volume": q.get("volume", 0),
                    "timestamp": q.get("timestamp", int(time.time()))
                })

    try:
        await websocket.send_json({
            "type": "initial_snapshot",
            "mode": mode,
            "tokens_subscribed": len(token_list),
            "ticks": initial_ticks
        })
    except Exception as e:
        logger.warning(f"WS initial send failed: {e}")
        return

    # Keep track of previous prices to broadcast real price changes
    last_broadcast_prices = {t["symbol"]: t["last_price"] for t in initial_ticks}

    try:
        while True:
            await asyncio.sleep(2.5)
            if not subscribed_symbols:
                continue

            # Fetch fresh real live quotes
            fresh_quotes = await get_batch_live_quotes(subscribed_symbols)
            for tok in token_list:
                sym = token_to_sym.get(tok, tok)
                q = fresh_quotes.get(sym)
                if q:
                    cur_price = q.get("last_price", 0.0)
                    tick_payload = {
                        "type": "tick",
                        "token": tok,
                        "symbol": sym,
                        "last_price": cur_price,
                        "change": q.get("change", 0.0),
                        "change_pct": q.get("change_pct", 0.0),
                        "volume": q.get("volume", 0),
                        "timestamp": q.get("timestamp", int(time.time()))
                    }
                    await websocket.send_json(tick_payload)
                    last_broadcast_prices[sym] = cur_price
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected cleanly.")
    except Exception as e:
        logger.info(f"WebSocket connection closed: {e}")


# ----------------- Serve Frontend Static Build (SPA Fallback) -----------------
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path.startswith("ws") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")

