import asyncio
import logging
import time
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, status
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
from backend.scanner import scanner_manager, HTTPException_401
from backend.upstox_client import upstox_client_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("upstox_scanner")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database and background preload of instrument master
    logger.info("Initializing Upstox Semi-Algo Scanner backend...")
    init_db()

    # Pre-fetch instrument master asynchronously so initial scan has zero cold-start delay
    asyncio.create_task(prewarm_instrument_cache())
    yield
    # Shutdown
    logger.info("Shutting down Upstox Semi-Algo Scanner backend...")

async def prewarm_instrument_cache():
    try:
        await asyncio.sleep(1)
        logger.info("Pre-warming Upstox NSE instrument master...")
        await upstox_client_manager.get_nse_instruments()
    except Exception as e:
        logger.warning(f"Background instrument preload warning: {e}")

app = FastAPI(
    title="Upstox Semi-Algo NSE Scanner",
    description="Semi-automated NSE NIFTY 100/200 Stock Scanner with SMA 6 & 30 Crossover Detection",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
origins = [origin.strip() for origin in settings.ALLOWED_ORIGINS.split(",") if origin.strip()]
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
    session: OAuthSession = Depends(get_current_session)
):
    """
    Trigger the semi-algo scanner.
    Requires an active and valid Upstox OAuth session.
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

    # Get active decrypted access token
    try:
        access_token = get_active_access_token(session)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Upstox authentication expired. Please reconnect your Upstox account."
        )

    # Launch scan task in background
    asyncio.create_task(scanner_manager.run_scan(access_token=access_token))

    return {
        "status": "started",
        "message": "Semi-algo scanner execution started.",
        "progress": scanner_manager.progress_message
    }

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

@app.get("/api/analysis/{symbol}")
def analyze_stock(symbol: str, db: Session = Depends(get_db)):
    """
    Returns deep Screener-style fundamental analysis for an NSE stock,
    including EPS, P/E, P/B, Market Cap, Strengths, Weaknesses,
    Fundamental Rating, and Double Confirmation verdict with SMA 6 & 30.
    """
    clean_sym = symbol.strip().upper()

    # Look up latest technical crossover signal for this stock
    sma_signal = None
    if scanner_manager.latest_results:
        for r in scanner_manager.latest_results:
            if r.get("Symbol") == clean_sym:
                sma_signal = r.get("Signal Type")
                break

    if not sma_signal:
        latest_res = (
            db.query(ScanResult)
            .filter(ScanResult.symbol == clean_sym)
            .order_by(ScanResult.id.desc())
            .first()
        )
        if latest_res:
            sma_signal = latest_res.signal_type

    from backend.analyzer import get_stock_analysis
    return get_stock_analysis(clean_sym, sma_signal=sma_signal)

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


# ----------------- Serve Frontend Static Build (SPA Fallback) -----------------
frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api") or full_path == "health":
            raise HTTPException(status_code=404, detail="Not found")
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")

