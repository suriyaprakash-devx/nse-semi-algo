import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any, List
from pathlib import Path
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import init_db, get_db
from backend.models import ScanRun, ScanResult
from backend.scanner import scanner_state, execute_scanner
from backend.universe import universe_manager
from backend.market_data import market_data_api

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("scanner.api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database tables...")
    init_db()
    logger.info("Market data provider: Yahoo Finance (yfinance)")
    logger.info("NSE semi-algo scanner ready. No broker credentials required.")
    yield
    logger.info("Application shutting down.")

app = FastAPI(
    title="NSE Intraday Semi-Algo Stock Scanner",
    description=(
        "Production-ready decision-support system screening ~200 NSE liquid equities "
        "using SMA 6/30 crossover, intraday momentum, volume confirmation, and price action. "
        "Strictly analysis only — never places orders automatically."
    ),
    version="3.0.0",
    lifespan=lifespan
)

# CORS configuration
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]
if settings.FRONTEND_URL and settings.FRONTEND_URL not in allowed_origins:
    allowed_origins.append(settings.FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.ENVIRONMENT == "development" else allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Request / Response Models -----------------

class RunScannerRequest(BaseModel):
    timeframe: Optional[str] = Field("10m", description="Candle timeframe: 5m, 10m, or 15m")
    risk_reward: Optional[float] = Field(2.0, description="Risk:Reward ratio: 1.5, 2.0, or 3.0")
    volume_multiplier: Optional[float] = Field(1.5, description="Volume confirmation multiplier: e.g. 1.5")

class ScanRunResponse(BaseModel):
    message: str
    status: str
    timeframe: str
    risk_reward: float
    volume_multiplier: float

# ----------------- Health & Market Endpoints -----------------

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "NSE Intraday Semi-Algo Scanner",
        "market_data_provider": "Yahoo Finance (yfinance)",
        "broker_connection": "None (Analysis Only)",
        "order_placement": "DISABLED (Never places orders)",
        "environment": settings.ENVIRONMENT
    }

@app.get("/api/market/status")
def get_market_status():
    """Returns current NSE market hours status in Asia/Kolkata timezone."""
    return market_data_api.get_market_status()

@app.get("/api/universe")
def get_universe():
    """Returns eligible ~200 NSE stocks with symbol, company, and yfinance_symbol."""
    universe = universe_manager.get_universe()
    return {
        "stocks_selected": len(universe),
        "universe": universe
    }

# ----------------- Scanner Control Endpoints -----------------

@app.post("/api/scanner/run", response_model=ScanRunResponse)
async def run_scanner(
    request: Optional[RunScannerRequest] = None,
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Starts the NSE scanner in background using selected timeframe and parameters."""
    if scanner_state.is_running:
        raise HTTPException(status_code=409, detail="A scan is currently running. Please wait or stop the current scan.")

    req = request or RunScannerRequest()
    tf = req.timeframe if req.timeframe in ("5m", "10m", "15m") else "10m"
    rr = req.risk_reward if req.risk_reward and req.risk_reward > 0 else 2.0
    vm = req.volume_multiplier if req.volume_multiplier and req.volume_multiplier > 0 else 1.5

    background_tasks.add_task(execute_scanner, timeframe=tf, risk_reward=rr, volume_multiplier=vm)

    return ScanRunResponse(
        message="Scanner initiated successfully in background.",
        status="RUNNING",
        timeframe=tf,
        risk_reward=rr,
        volume_multiplier=vm
    )

@app.post("/api/scanner/stop")
def stop_scanner():
    """Gracefully requests the scanner to abort."""
    if not scanner_state.is_running:
        return {"message": "Scanner is not currently running."}
    scanner_state.should_stop = True
    scanner_state.stage = "Stopping scan..."
    return {"message": "Stop signal transmitted to scanner engine."}

@app.get("/api/scanner/status")
def get_scanner_status():
    """Returns real-time progress, counts, current stock, and recent logs."""
    return scanner_state.to_dict()

@app.get("/api/scanner/progress")
def get_scanner_progress():
    """Returns lightweight progress info for rapid polling."""
    return {
        "is_running": scanner_state.is_running,
        "stage": scanner_state.stage,
        "progress_pct": round(scanner_state.progress_pct, 1),
        "stocks_scanned": scanner_state.stocks_scanned,
        "total_stocks": scanner_state.total_stocks,
        "current_stock": scanner_state.current_stock
    }

@app.get("/api/scanner/results")
def get_scanner_results(
    status: Optional[str] = Query(None, description="Filter by BUY, SELL, WATCH, NO SIGNAL"),
    search: Optional[str] = Query(None, description="Search by symbol or company"),
    db: Session = Depends(get_db)
):
    """
    Returns latest scan results formatted with all required analytical columns.
    Reads from in-memory state or database fallback.
    """
    results: List[Dict[str, Any]] = []
    completed_at = None
    timeframe = scanner_state.timeframe

    if scanner_state.latest_results:
        results = scanner_state.latest_results
        completed_at = scanner_state.completed_at.isoformat() if scanner_state.completed_at else None
    else:
        # Fallback to database
        latest_run = (
            db.query(ScanRun)
            .filter(ScanRun.status == "COMPLETED")
            .order_by(ScanRun.id.desc())
            .first()
        )

        if latest_run:
            completed_at = latest_run.completed_at.isoformat() if latest_run.completed_at else None
            timeframe = latest_run.timeframe
            db_results = (
                db.query(ScanResult)
                .filter(ScanResult.scan_id == latest_run.id)
                .order_by(ScanResult.rank.asc())
                .all()
            )
            for r in db_results:
                results.append({
                    "rank": r.rank,
                    "symbol": r.symbol,
                    "company": r.company,
                    "status": r.status,
                    "potential_direction": r.potential_direction,
                    "current_price": r.current_price,
                    "day_change_percent": r.day_change_percent,
                    "entry": r.entry,
                    "stop_loss": r.stop_loss,
                    "target": r.target,
                    "risk_reward": r.risk_reward,
                    "signal_strength": r.signal_strength,
                    "sma6": r.sma6,
                    "sma30": r.sma30,
                    "volume": r.volume,
                    "average_volume": r.average_volume,
                    "volume_ratio": r.volume_ratio,
                    "momentum_percent": r.momentum_percent,
                    "daily_trend": r.daily_trend,
                    "intraday_trend": r.intraday_trend,
                    "relative_strength": r.relative_strength,
                    "crossover_time": r.crossover_time,
                    "signal_time": r.signal_time,
                    "reason": r.reason
                })

    # Apply optional filtering
    filtered = results
    if status and status.upper() != "ALL":
        filtered = [r for r in filtered if r.get("status", "").upper() == status.upper()]

    if search:
        s_lower = search.lower().strip()
        filtered = [
            r for r in filtered
            if s_lower in r.get("symbol", "").lower() or s_lower in r.get("company", "").lower()
        ]

    # Calculate summary counts
    buy_count = sum(1 for r in results if r.get("status") == "BUY")
    sell_count = sum(1 for r in results if r.get("status") == "SELL")
    watch_count = sum(1 for r in results if r.get("status") == "WATCH")
    no_signal_count = sum(1 for r in results if r.get("status") == "NO SIGNAL")

    return {
        "results": filtered,
        "count": len(filtered),
        "total_count": len(results),
        "stocks_selected": scanner_state.stocks_selected or len(results) or 200,
        "timeframe": timeframe,
        "buy_count": buy_count,
        "sell_count": sell_count,
        "watch_count": watch_count,
        "no_signal_count": no_signal_count,
        "completed_at": completed_at,
        "disclaimer": "Analysis only — no orders are placed automatically."
    }

# ----------------- Serve Frontend Static Build -----------------

frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API route not found")
        file_path = frontend_dist / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
