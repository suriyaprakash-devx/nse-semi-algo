import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import SessionLocal
from backend.models import ScanRun, ScanResult, cleanup_old_scans
from backend.upstox_client import upstox_client_manager, HTTPException_401
from backend.universe import get_combined_stock_universe

logger = logging.getLogger(__name__)

class ScannerManager:
    """
    Manages semi-algo scanner execution, state, progress tracking,
    and crossover signal detection.
    """

    def __init__(self):
        self.is_running: bool = False
        self.status: str = "idle"  # idle, running, completed, failed
        self.progress_message: str = "Ready to scan."
        self.stocks_scanned: int = 0
        self.total_stocks: int = 0
        self.signals_found: int = 0
        self.current_scan_id: Optional[int] = None
        self.error: Optional[str] = None
        self.latest_dataframe: Optional[pd.DataFrame] = None
        self.latest_results: List[Dict[str, Any]] = []
        self.stop_requested: bool = False
        self._lock = asyncio.Lock()

    def stop_scan(self):
        """Signals the running scanner to abort immediately."""
        if self.is_running:
            self.stop_requested = True
            self.progress_message = "Scan stopping..."
            logger.info("Scan stop requested by user.")

    def get_status(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "is_running": self.is_running,
            "progress_message": self.progress_message,
            "stocks_scanned": self.stocks_scanned,
            "total_stocks": self.total_stocks,
            "signals_found": self.signals_found,
            "scan_id": self.current_scan_id,
            "error": self.error
        }

    async def run_scan(self, access_token: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Executes the full NIFTY 100 + NIFTY 200 SMA 6 & 30 crossover scan.
        Supports both official Upstox API v2 and real-time live market feed fallback.
        """
        async with self._lock:
            if self.is_running:
                logger.warning("Scan is already running.")
                return self.latest_results

            self.is_running = True
            self.stop_requested = False
            self.status = "running"
            self.stocks_scanned = 0
            self.total_stocks = 0
            self.signals_found = 0
            self.error = None

        db: Session = SessionLocal()
        scan_run = ScanRun(
            started_at=datetime.now(timezone.utc),
            status="running"
        )
        db.add(scan_run)
        db.commit()
        db.refresh(scan_run)
        self.current_scan_id = scan_run.id

        try:
            # Step 1: Load stock universe
            self.progress_message = "Loading stock universe..."
            logger.info(self.progress_message)
            universe = await get_combined_stock_universe()

            if not universe:
                raise RuntimeError("Failed to build stock universe: No valid stocks found.")

            self.total_stocks = len(universe)
            mode_desc = "Upstox API v2" if access_token else "Real-Time Live Market Feed"
            self.progress_message = f"Scanning {self.total_stocks} stocks via {mode_desc}..."
            logger.info(self.progress_message)

            # Pre-load cache fallback if available
            cache_stocks_map = {}
            from pathlib import Path
            import json
            cache_file = Path("./data/scanner_data_cache.json")
            if cache_file.exists():
                try:
                    with open(cache_file, "r", encoding="utf-8") as f:
                        cdata = json.load(f)
                    for s in cdata.get("stocks", []):
                        sym = s.get("symbol", "").upper()
                        if sym:
                            cache_stocks_map[sym] = s.get("daily_candles", [])
                except Exception as e:
                    logger.debug(f"Cache pre-read notice: {e}")

            # Step 2: Concurrently scan all stocks with semaphore rate-limiting
            semaphore = asyncio.Semaphore(settings.SCAN_CONCURRENCY)
            detected_signals: List[Dict[str, Any]] = []

            async def scan_single_stock(stock: Dict[str, str]):
                symbol = stock["symbol"].upper()
                company = stock["company"]
                instrument_key = stock["instrument_key"]

                async with semaphore:
                    if self.stop_requested:
                        return None

                    try:
                        candles = None
                        if access_token:
                            try:
                                candles = await upstox_client_manager.fetch_historical_daily_candles(
                                    instrument_key=instrument_key,
                                    symbol=symbol,
                                    days_back=120,
                                    access_token=access_token,
                                    include_current_day=settings.INCLUDE_CURRENT_DAY_CANDLE
                                )
                            except HTTPException_401:
                                # Fall through to live feed fallback below
                                candles = None

                        if self.stop_requested:
                            return None

                        # Fallback to cache + live candle if Upstox candles not available
                        if not candles or len(candles) < 31:
                            cached_candles = cache_stocks_map.get(symbol, [])
                            if cached_candles:
                                # Format cached candles into Upstox format [timestamp, open, high, low, close, volume, 0]
                                # Note: cached candles are oldest-to-newest, while Upstox expects newest-first
                                upstox_formatted = []
                                for c in reversed(cached_candles):
                                    dt = c.get("date", "")
                                    upstox_formatted.append([
                                        f"{dt}T00:00:00+05:30",
                                        c.get("open", 0.0),
                                        c.get("high", 0.0),
                                        c.get("low", 0.0),
                                        c.get("close", 0.0),
                                        c.get("volume", 0),
                                        0
                                    ])

                                # Incorporate today's live candle if requested
                                if settings.INCLUDE_CURRENT_DAY_CANDLE:
                                    try:
                                        from backend.live_feed import get_today_live_candle
                                        live_c = await get_today_live_candle(symbol)
                                        if live_c:
                                            # Check if today's date already exists in the candles
                                            today_tag = live_c[0][:10]
                                            if not any(cand[0].startswith(today_tag) for cand in upstox_formatted):
                                                upstox_formatted.insert(0, live_c)
                                    except Exception as e:
                                        logger.debug(f"Live candle fetch notice for {symbol}: {e}")

                                candles = upstox_formatted

                        if self.stop_requested:
                            return None

                        if not candles or len(candles) < 31:
                            logger.debug(f"Insufficient candles for {symbol}. Skipping.")
                            return None

                        # Analyze candles for confirmed SMA 6 & SMA 30 crossover
                        signal_info = self._detect_crossover(symbol, company, candles)
                        return signal_info

                    except Exception as e:
                        logger.warning(f"Unable to retrieve data for {symbol}: {e}. Skipping stock.")
                        return None
                    finally:
                        self.stocks_scanned += 1
                        if self.stop_requested:
                            self.progress_message = f"Scan stopped by user ({self.stocks_scanned} / {self.total_stocks})"
                        elif self.stocks_scanned % 10 == 0 or self.stocks_scanned == self.total_stocks:
                            self.progress_message = f"Scanning {self.stocks_scanned} / {self.total_stocks}"

            tasks = [scan_single_stock(stock) for stock in universe]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for res in results:
                if isinstance(res, Exception):
                    logger.warning(f"Stock scan error: {res}")
                elif res:
                    detected_signals.append(res)

            if self.stop_requested:
                self.status = "stopped"
                self.progress_message = f"Scan stopped by user. Scanned {self.stocks_scanned} stocks, found {len(detected_signals)} crossovers."
                logger.info(self.progress_message)

            # Step 3: Rank by latest crossover date
            self.progress_message = "Ranking signals and generating DataFrame..."
            logger.info(self.progress_message)

            ranked_results, df = self._rank_signals(detected_signals)

            self.latest_dataframe = df
            self.latest_results = ranked_results
            self.signals_found = len(ranked_results)

            # Step 4: Persist results in PostgreSQL / Database
            for item in ranked_results:
                result_entry = ScanResult(
                    scan_id=scan_run.id,
                    rank=item["Rank"],
                    symbol=item["Symbol"],
                    company=item["Company"],
                    signal_type=item["Signal Type"],
                    crossover_date=item["Crossover Date"],
                    close=item["Close"],
                    sma6=item["SMA 6"],
                    sma30=item["SMA 30"]
                )
                db.add(result_entry)

            scan_run.status = "completed"
            scan_run.completed_at = datetime.now(timezone.utc)
            scan_run.stocks_scanned = self.stocks_scanned
            scan_run.signals_found = self.signals_found
            db.commit()

            # Execute cleanup policy
            cleanup_old_scans(db, keep_count=1, delete_all=settings.DELETE_RESULTS_AFTER_SCAN)

            self.status = "completed"
            self.progress_message = f"Completed: Scanned {self.stocks_scanned} stocks, found {self.signals_found} confirmed crossovers."
            logger.info(self.progress_message)
            return self.latest_results

        except Exception as e:
            logger.exception(f"Fatal error during scanner run: {e}")
            self.status = "failed"
            self.error = str(e)
            self.progress_message = f"Scan failed: {e}"
            scan_run.status = "failed"
            scan_run.error_message = str(e)
            db.commit()
            raise

        finally:
            self.is_running = False
            db.close()

    def _detect_crossover(
        self,
        symbol: str,
        company: str,
        candles: List[List[Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Calculates SMA 6 and SMA 30 on daily candles.
        Detects the most recent confirmed crossover:
        - Bullish Golden Cross: prev(SMA6) <= prev(SMA30) and curr(SMA6) > curr(SMA30) -> BULLISH
        - Bearish Death Cross:  prev(SMA6) >= prev(SMA30) and curr(SMA6) < curr(SMA30) -> BEARISH

        Fixes logical errors:
        1. Accurately reports true CURRENT CLOSE (LTP), CURRENT SMA 6, and CURRENT SMA 30.
        2. Validates that current trend has not reversed (invalidation check).
        3. Enforces an active lookback window (up to 25 trading days) to eliminate stale ancient crossovers.
        4. Provides Crossover Price, Days Ago, Freshness, and Spread %.
        """
        # Upstox returns candles [timestamp, open, high, low, close, volume, oi] with newest first
        # Reverse to chronological order (oldest to newest)
        chronological_candles = candles[::-1]

        df = pd.DataFrame(chronological_candles, columns=["timestamp", "open", "high", "low", "close", "volume", "oi"])
        df["close"] = pd.to_numeric(df["close"], errors="coerce")
        df["timestamp"] = pd.to_datetime(df["timestamp"])

        # Calculate SMA 6 and SMA 30
        df["sma6"] = df["close"].rolling(window=6).mean()
        df["sma30"] = df["close"].rolling(window=30).mean()

        n = len(df)
        if n < 31:
            return None

        # Latest live market values
        latest_close = float(df.at[n - 1, "close"])
        latest_sma6 = float(df.at[n - 1, "sma6"])
        latest_sma30 = float(df.at[n - 1, "sma30"])

        if pd.isna(latest_close) or pd.isna(latest_sma6) or pd.isna(latest_sma30):
            return None

        # Lookback limit of 25 trading days
        min_lookback = max(29, n - 26)

        for i in range(n - 1, min_lookback, -1):
            prev_s6 = df.at[i - 1, "sma6"]
            prev_s30 = df.at[i - 1, "sma30"]
            curr_s6 = df.at[i, "sma6"]
            curr_s30 = df.at[i, "sma30"]

            if pd.isna(prev_s6) or pd.isna(prev_s30) or pd.isna(curr_s6) or pd.isna(curr_s30):
                continue

            days_ago = (n - 1) - i

            # Bullish Golden Crossover
            if prev_s6 <= prev_s30 and curr_s6 > curr_s30:
                # Invalidation check: Today's SMA6 must still be >= SMA30 for trend to remain active
                if latest_sma6 < latest_sma30:
                    continue
                # Accuracy check: Current price must not be collapsed below SMA 30 (whipsaw filter)
                if latest_close < latest_sma30 * 0.97:
                    continue

                crossover_date = df.at[i, "timestamp"].strftime("%Y-%m-%d")
                crossover_price = round(float(df.at[i, "close"]), 2)
                spread_pct = round(((latest_sma6 - latest_sma30) / latest_sma30) * 100, 2)
                freshness = "FRESH" if days_ago <= 1 else ("RECENT" if days_ago <= 5 else "ACTIVE")

                return {
                    "Symbol": symbol,
                    "Company": company,
                    "Signal Type": "BULLISH",
                    "Crossover Date": crossover_date,
                    "Close": round(latest_close, 2),        # TRUE CURRENT CLOSE (LTP)
                    "SMA 6": round(latest_sma6, 2),          # TRUE CURRENT SMA 6
                    "SMA 30": round(latest_sma30, 2),        # TRUE CURRENT SMA 30
                    "Crossover Price": crossover_price,      # Price at crossover
                    "Days Ago": days_ago,
                    "Freshness": freshness,
                    "Spread Pct": spread_pct,
                    "_sort_date": df.at[i, "timestamp"]
                }

            # Bearish Death Crossover
            if prev_s6 >= prev_s30 and curr_s6 < curr_s30:
                # Invalidation check: Today's SMA6 must still be <= SMA30 for trend to remain active
                if latest_sma6 > latest_sma30:
                    continue
                # Accuracy check: Current price must not be rebounded above SMA 30 (whipsaw filter)
                if latest_close > latest_sma30 * 1.03:
                    continue

                crossover_date = df.at[i, "timestamp"].strftime("%Y-%m-%d")
                crossover_price = round(float(df.at[i, "close"]), 2)
                spread_pct = round(((latest_sma6 - latest_sma30) / latest_sma30) * 100, 2)
                freshness = "FRESH" if days_ago <= 1 else ("RECENT" if days_ago <= 5 else "ACTIVE")

                return {
                    "Symbol": symbol,
                    "Company": company,
                    "Signal Type": "BEARISH",
                    "Crossover Date": crossover_date,
                    "Close": round(latest_close, 2),        # TRUE CURRENT CLOSE (LTP)
                    "SMA 6": round(latest_sma6, 2),          # TRUE CURRENT SMA 6
                    "SMA 30": round(latest_sma30, 2),        # TRUE CURRENT SMA 30
                    "Crossover Price": crossover_price,      # Price at crossover
                    "Days Ago": days_ago,
                    "Freshness": freshness,
                    "Spread Pct": spread_pct,
                    "_sort_date": df.at[i, "timestamp"]
                }

        return None

    def _rank_signals(self, signals: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], pd.DataFrame]:
        """
        Sorts combined bullish & bearish signals by crossover_date DESC,
        assigns ranks 1..N, and returns both list of dicts and formatted Pandas DataFrame.
        """
        if not signals:
            empty_df = pd.DataFrame(columns=[
                "Rank", "Symbol", "Company", "Signal Type", "Crossover Date", "Close", "SMA 6", "SMA 30"
            ])
            return [], empty_df

        # Sort by crossover date DESC, then symbol ASC
        signals.sort(key=lambda s: (s.get("_sort_date", datetime.min), s["Symbol"]), reverse=True)

        ranked: List[Dict[str, Any]] = []
        for idx, item in enumerate(signals, start=1):
            entry = {
                "Rank": idx,
                "Symbol": item["Symbol"],
                "Company": item["Company"],
                "Signal Type": item["Signal Type"],
                "Crossover Date": item["Crossover Date"],
                "Close": item["Close"],
                "SMA 6": item["SMA 6"],
                "SMA 30": item["SMA 30"],
                "Crossover Price": item.get("Crossover Price", item["Close"]),
                "Days Ago": item.get("Days Ago", 0),
                "Freshness": item.get("Freshness", "ACTIVE"),
                "Spread Pct": item.get("Spread Pct", 0.0)
            }
            ranked.append(entry)

        # Output as Pandas DataFrame with the exact specified columns
        df = pd.DataFrame(ranked)
        cols = ["Rank", "Symbol", "Company", "Signal Type", "Crossover Date", "Close", "SMA 6", "SMA 30"]
        df = df[cols]

        return ranked, df

scanner_manager = ScannerManager()

