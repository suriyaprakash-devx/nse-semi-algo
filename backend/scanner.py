import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import pytz
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import ScanRun, ScanResult
from backend.database import SessionLocal, cleanup_old_scans
from backend.universe import universe_manager
from backend.market_data import market_data_api
from backend.strategy import evaluate_stock_strategy
from backend.ranking import rank_stocks
from backend.alerts import alert_manager

logger = logging.getLogger("scanner.orchestrator")
KOLKATA_TZ = pytz.timezone("Asia/Kolkata")

class ScannerState:
    """Holds real-time scanner state and metrics for the frontend."""
    def __init__(self):
        self.is_running: bool = False
        self.should_stop: bool = False
        self.stage: str = "Idle"
        self.timeframe: str = settings.DEFAULT_TIMEFRAME
        self.risk_reward: float = settings.DEFAULT_RISK_REWARD
        self.volume_multiplier: float = settings.DEFAULT_VOLUME_MULTIPLIER
        self.stocks_selected: int = 200
        self.stocks_scanned: int = 0
        self.total_stocks: int = 200
        self.buy_count: int = 0
        self.sell_count: int = 0
        self.watch_count: int = 0
        self.no_signal_count: int = 0
        self.progress_pct: float = 0.0
        self.current_stock: str = ""
        self.error_message: Optional[str] = None
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.last_scan_ist: Optional[str] = None
        self.logs: List[str] = []
        self.latest_results: List[Dict[str, Any]] = []

    def log(self, message: str):
        now_ist = datetime.now(KOLKATA_TZ).strftime("%H:%M:%S")
        entry = f"[{now_ist} IST] {message}"
        self.logs.append(entry)
        if len(self.logs) > 100:
            self.logs.pop(0)
        logger.info(message)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "stage": self.stage,
            "timeframe": self.timeframe,
            "risk_reward": self.risk_reward,
            "volume_multiplier": self.volume_multiplier,
            "stocks_selected": self.stocks_selected,
            "stocks_scanned": self.stocks_scanned,
            "total_stocks": self.total_stocks,
            "buy_count": self.buy_count,
            "sell_count": self.sell_count,
            "watch_count": self.watch_count,
            "no_signal_count": self.no_signal_count,
            "progress_pct": round(self.progress_pct, 1),
            "current_stock": self.current_stock,
            "error_message": self.error_message,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "last_scan_ist": self.last_scan_ist,
            "logs": self.logs[-25:],
            "results_count": len(self.latest_results)
        }

scanner_state = ScannerState()

async def execute_scanner(
    timeframe: Optional[str] = None,
    risk_reward: Optional[float] = None,
    volume_multiplier: Optional[float] = None
):
    """
    Main semi-algo scanner execution:
    1. Loads ~200 NSE stock universe.
    2. Downloads NIFTY 50 (^NSEI) benchmark candles.
    3. Downloads Daily candles for daily trend alignment (SMA6 vs SMA30).
    4. Downloads Intraday completed candles for selected timeframe (5m, 10m, 15m).
    5. Evaluates SMA 6/30 crossover, momentum, volume, price action confirmation.
    6. Identifies BUY, SELL, WATCH, or NO SIGNAL.
    7. Calculates deterministic analytical Entry, SL, Target.
    8. Dispatches analytical alerts for new setups.
    9. Transparently ranks all 200 stocks.
    10. Persists run and results to database.
    """
    tf = timeframe or settings.DEFAULT_TIMEFRAME
    rr = risk_reward or settings.DEFAULT_RISK_REWARD
    vm = volume_multiplier or settings.DEFAULT_VOLUME_MULTIPLIER

    scanner_state.is_running = True
    scanner_state.should_stop = False
    scanner_state.error_message = None
    scanner_state.timeframe = tf
    scanner_state.risk_reward = rr
    scanner_state.volume_multiplier = vm
    scanner_state.started_at = datetime.now(timezone.utc)
    scanner_state.completed_at = None
    scanner_state.stocks_scanned = 0
    scanner_state.buy_count = 0
    scanner_state.sell_count = 0
    scanner_state.watch_count = 0
    scanner_state.no_signal_count = 0
    scanner_state.progress_pct = 0.0
    scanner_state.current_stock = ""
    scanner_state.logs.clear()

    db: Session = SessionLocal()
    scan_run = ScanRun(
        started_at=datetime.now(timezone.utc),
        timeframe=tf,
        stocks_selected=200,
        stocks_scanned=0,
        status="RUNNING"
    )
    db.add(scan_run)
    db.commit()
    db.refresh(scan_run)

    try:
        # Step 1: Universe
        scanner_state.stage = "Loading stock universe..."
        scanner_state.log("Loading ~200 NSE liquid active stock universe...")
        universe = universe_manager.get_universe()

        if not universe:
            raise RuntimeError("Failed to load stock universe.")

        scanner_state.total_stocks = len(universe)
        scanner_state.stocks_selected = len(universe)
        scan_run.stocks_selected = len(universe)
        db.commit()

        scanner_state.log(f"Stocks Selected: {len(universe)} NSE equities (Timeframe: {tf}, R:R: 1:{rr:g}, Vol: {vm}x).")

        # Step 2: Benchmark Data
        scanner_state.stage = "Preparing NIFTY benchmark..."
        scanner_state.log("Downloading NIFTY 50 (^NSEI) benchmark for Relative Strength...")
        benchmark_candles = await market_data_api.fetch_benchmark_data(timeframe=tf)

        # Step 3: Batch Daily Candles for Daily Trend
        scanner_state.stage = "Preparing daily trend data..."
        scanner_state.log("Downloading daily candles for daily trend filter...")
        symbols = [item["symbol"] for item in universe]
        daily_candles_map = await market_data_api.fetch_batch_candles(
            symbols,
            period=settings.LOOKBACK_DAYS_DAILY,
            interval="1d",
            chunk_size=30
        )

        # Step 4: Batch Intraday Scanning
        scanner_state.stage = "Preparing Yahoo Finance data..."
        scanner_state.log(f"Fetching intraday completed candles for timeframe {tf}...")

        chunk_size = 25
        chunks = [universe[i:i + chunk_size] for i in range(0, len(universe), chunk_size)]
        raw_results: List[Dict[str, Any]] = []

        for chunk_idx, chunk in enumerate(chunks, start=1):
            if scanner_state.should_stop:
                scanner_state.log("Scan stopped by user.")
                break

            chunk_symbols = [s["symbol"] for s in chunk]
            scanner_state.stage = f"Scanning {scanner_state.stocks_scanned} / {scanner_state.total_stocks}"

            intraday_candles_map = await market_data_api.fetch_batch_candles(
                chunk_symbols,
                period=settings.LOOKBACK_DAYS_INTRADAY,
                interval=tf,
                chunk_size=chunk_size
            )

            for stock in chunk:
                if scanner_state.should_stop:
                    break

                symbol = stock["symbol"]
                company = stock["company"]
                scanner_state.current_stock = symbol

                candles = intraday_candles_map.get(symbol, [])
                daily_c = daily_candles_map.get(symbol, [])

                if not candles or len(candles) < 31:
                    scanner_state.log(f"Insufficient {tf} historical candles for {symbol}. Skipping stock.")
                    result = {
                        "symbol": symbol,
                        "company": company,
                        "status": "NO SIGNAL",
                        "potential_direction": None,
                        "current_price": 0.0,
                        "day_change_percent": 0.0,
                        "entry": None,
                        "stop_loss": None,
                        "target": None,
                        "risk_reward": f"1:{rr:g}",
                        "signal_strength": 0,
                        "sma6": 0.0,
                        "sma30": 0.0,
                        "volume": 0,
                        "average_volume": 0.0,
                        "volume_ratio": 1.0,
                        "momentum_percent": 0.0,
                        "daily_trend": "NEUTRAL",
                        "intraday_trend": "NEUTRAL",
                        "relative_strength": 0.0,
                        "crossover_time": None,
                        "signal_time": "",
                        "reason": f"Insufficient {tf} data from market feed.",
                        "contributing_factors": []
                    }
                else:
                    result = evaluate_stock_strategy(
                        candles=candles,
                        symbol=symbol,
                        company=company,
                        daily_candles=daily_c,
                        benchmark_candles=benchmark_candles,
                        volume_multiplier=vm,
                        risk_reward_ratio=rr,
                        timeframe=tf
                    )

                raw_results.append(result)

                # Update live counts
                if result["status"] == "BUY":
                    scanner_state.buy_count += 1
                    scanner_state.log(
                        f"🚨 BUY SIGNAL: {symbol} @ ₹{result['current_price']} "
                        f"(Entry ₹{result['entry']}, SL ₹{result['stop_loss']}, Target ₹{result['target']}, Score {result['signal_strength']}/100)"
                    )
                    await alert_manager.dispatch_alert(db, {**result, "timeframe": tf})

                elif result["status"] == "SELL":
                    scanner_state.sell_count += 1
                    scanner_state.log(
                        f"🚨 SELL SIGNAL: {symbol} @ ₹{result['current_price']} "
                        f"(Entry ₹{result['entry']}, SL ₹{result['stop_loss']}, Target ₹{result['target']}, Score {result['signal_strength']}/100)"
                    )
                    await alert_manager.dispatch_alert(db, {**result, "timeframe": tf})

                elif result["status"] == "WATCH":
                    scanner_state.watch_count += 1
                    scanner_state.log(
                        f"👀 WATCH SETUP ({result['potential_direction']}): {symbol} - {result['reason']}"
                    )
                    await alert_manager.dispatch_alert(db, {**result, "timeframe": tf})

                else:
                    scanner_state.no_signal_count += 1

                scanner_state.stocks_scanned += 1
                if scanner_state.total_stocks > 0:
                    scanner_state.progress_pct = (scanner_state.stocks_scanned / scanner_state.total_stocks) * 100

                # Yield control briefly to ensure responsive event loop
                await asyncio.sleep(0.005)

        if scanner_state.should_stop:
            scan_run.status = "STOPPED"
            scan_run.stocks_scanned = scanner_state.stocks_scanned
            db.commit()
            scanner_state.stage = "Stopped"
            scanner_state.log("Scan execution stopped.")
            return

        # Step 5: Ranking
        scanner_state.stage = "Ranking 200 stocks..."
        scanner_state.log("Ranking stocks by confirmed setups, signal strength, recency, and volume...")
        ranked_results = rank_stocks(raw_results)
        scanner_state.latest_results = ranked_results

        # Step 6: Save Run and Results to Database
        now_utc = datetime.now(timezone.utc)
        scan_run.completed_at = now_utc
        scan_run.stocks_scanned = scanner_state.stocks_scanned
        scan_run.buy_count = scanner_state.buy_count
        scan_run.sell_count = scanner_state.sell_count
        scan_run.watch_count = scanner_state.watch_count
        scan_run.no_signal_count = scanner_state.no_signal_count
        scan_run.status = "COMPLETED"

        for item in ranked_results:
            db_res = ScanResult(
                scan_id=scan_run.id,
                rank=item["rank"],
                symbol=item["symbol"],
                company=item["company"],
                status=item["status"],
                potential_direction=item.get("potential_direction"),
                current_price=item["current_price"],
                day_change_percent=item.get("day_change_percent", 0.0),
                entry=item.get("entry"),
                stop_loss=item.get("stop_loss"),
                target=item.get("target"),
                risk_reward=item.get("risk_reward", f"1:{rr:g}"),
                signal_strength=item.get("signal_strength", 0),
                sma6=item.get("sma6", 0.0),
                sma30=item.get("sma30", 0.0),
                volume=item.get("volume", 0),
                average_volume=item.get("average_volume", 0.0),
                volume_ratio=item.get("volume_ratio", 0.0),
                momentum_percent=item.get("momentum_percent", 0.0),
                daily_trend=item.get("daily_trend", "NEUTRAL"),
                intraday_trend=item.get("intraday_trend", "NEUTRAL"),
                relative_strength=item.get("relative_strength", 0.0),
                crossover_time=item.get("crossover_time"),
                signal_time=item.get("signal_time", ""),
                reason=item.get("reason", "")
            )
            db.add(db_res)

        db.commit()

        ist_now = datetime.now(KOLKATA_TZ).strftime("%H:%M IST")
        scanner_state.last_scan_ist = ist_now
        scanner_state.stage = "Scan completed"
        scanner_state.log(
            f"Scan completed at {ist_now}. Scanned: {scanner_state.stocks_scanned}/{scanner_state.total_stocks} | "
            f"BUY: {scanner_state.buy_count} | SELL: {scanner_state.sell_count} | "
            f"WATCH: {scanner_state.watch_count} | NO SIGNAL: {scanner_state.no_signal_count}"
        )

        # Cleanup old scans
        cleanup_old_scans(db, keep_latest=5)

    except Exception as e:
        logger.exception("Scanner execution failed: %s", e)
        scanner_state.error_message = str(e)
        scanner_state.stage = "Failed"
        scan_run.status = "FAILED"
        scan_run.error_message = str(e)
        db.commit()
    finally:
        scanner_state.is_running = False
        scanner_state.completed_at = datetime.now(timezone.utc)
        db.close()
