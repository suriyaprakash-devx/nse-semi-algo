import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import pandas as pd
import numpy as np
import yfinance as yf
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import SessionLocal
from backend.models import ScanRun, ScanResult, cleanup_old_scans
from backend.universe import get_combined_stock_universe, get_yahoo_ticker

logger = logging.getLogger(__name__)

class HTTPException_401(Exception):
    pass

class ScannerManager:
    """
    Manages semi-algo quantitative scanner execution, state, progress tracking,
    and crossover signal detection powered purely by yfinance (NSE Equities).
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
        Executes the full NIFTY 100 + NIFTY 200 SMA 6 & 30 crossover scan
        powered entirely by Yahoo Finance (yfinance) without broker dependencies.
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
            self.progress_message = "Loading NIFTY stock universe..."
            logger.info(self.progress_message)
            universe = await get_combined_stock_universe()

            if not universe:
                raise RuntimeError("Failed to build stock universe: No valid stocks found.")

            self.total_stocks = len(universe)
            self.progress_message = f"Scanning {self.total_stocks} stocks via Yahoo Finance..."
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

            detected_signals: List[Dict[str, Any]] = []

            # Step 2: Batch download daily candles using yfinance
            # Download in batches of 20 stocks for high throughput and resilience
            batch_size = 25
            batches = [universe[i:i + batch_size] for i in range(0, len(universe), batch_size)]

            for batch_idx, batch in enumerate(batches):
                if self.stop_requested:
                    break

                tickers = [s.get("yahoo_symbol") or get_yahoo_ticker(s["symbol"]) for s in batch]
                sym_map = {s.get("yahoo_symbol") or get_yahoo_ticker(s["symbol"]): s for s in batch}

                # Download batch asynchronously in thread pool
                batch_df = None
                try:
                    batch_df = await asyncio.to_thread(
                        yf.download,
                        tickers=tickers,
                        period="6mo",
                        interval="1d",
                        group_by="ticker",
                        threads=True,
                        progress=False,
                        auto_adjust=True
                    )
                except Exception as e:
                    logger.warning(f"Batch yfinance download notice: {e}")

                # Process each stock in the current batch
                for s in batch:
                    if self.stop_requested:
                        break

                    sym = s["symbol"].upper()
                    comp = s["company"]
                    yticker = s.get("yahoo_symbol") or get_yahoo_ticker(sym)

                    candles_df = None
                    # 1. Extract from batch download
                    if batch_df is not None and not batch_df.empty:
                        try:
                            if len(tickers) == 1:
                                candles_df = batch_df.copy()
                            elif yticker in batch_df:
                                candles_df = batch_df[yticker].dropna(subset=["Close"]).copy()
                        except Exception as e:
                            logger.debug(f"Error extracting {yticker} from batch: {e}")

                    # 2. Individual fallback if batch extraction was insufficient
                    if candles_df is None or len(candles_df) < 31:
                        try:
                            candles_df = await asyncio.to_thread(
                                yf.download,
                                tickers=yticker,
                                period="6mo",
                                interval="1d",
                                threads=False,
                                progress=False,
                                auto_adjust=True
                            )
                            if candles_df is not None:
                                candles_df = candles_df.dropna(subset=["Close"]).copy()
                        except Exception as e:
                            logger.debug(f"Individual yfinance fallback error for {sym}: {e}")

                    # 3. Fallback to cache if still missing
                    if (candles_df is None or len(candles_df) < 31) and sym in cache_stocks_map:
                        cached = cache_stocks_map[sym]
                        if len(cached) >= 31:
                            candles_df = pd.DataFrame(cached)
                            if "date" in candles_df.columns:
                                candles_df["Date"] = pd.to_datetime(candles_df["date"])
                                candles_df.set_index("Date", inplace=True)
                            for col in ["open", "high", "low", "close", "volume"]:
                                if col in candles_df.columns:
                                    candles_df[col.capitalize()] = pd.to_numeric(candles_df[col], errors="coerce")

                    if candles_df is not None and len(candles_df) >= 31:
                        # Append today's live candle if available and today's bar isn't already included
                        if settings.INCLUDE_CURRENT_DAY_CANDLE:
                            try:
                                from backend.live_feed import get_today_live_candle
                                live_c = await get_today_live_candle(sym)
                                if live_c:
                                    live_dt_str = live_c[0][:10]
                                    last_idx_str = str(candles_df.index[-1])[:10]
                                    if live_dt_str != last_idx_str:
                                        new_row = pd.DataFrame([{
                                            "Open": float(live_c[1]),
                                            "High": float(live_c[2]),
                                            "Low": float(live_c[3]),
                                            "Close": float(live_c[4]),
                                            "Volume": float(live_c[5])
                                        }], index=[pd.to_datetime(live_dt_str)])
                                        candles_df = pd.concat([candles_df, new_row])
                            except Exception as e:
                                logger.debug(f"Live candle synthesis notice for {sym}: {e}")

                        # Detect SMA 6 & 30 Crossover
                        sig = self._detect_crossover_df(sym, comp, candles_df)
                        if sig:
                            detected_signals.append(sig)

                    self.stocks_scanned += 1
                    if self.stocks_scanned % 10 == 0 or self.stocks_scanned == self.total_stocks:
                        self.progress_message = f"Scanning {self.stocks_scanned} / {self.total_stocks} via yfinance..."

            if self.stop_requested:
                self.status = "stopped"
                self.progress_message = f"Scan stopped by user. Scanned {self.stocks_scanned} stocks, found {len(detected_signals)} crossovers."
                logger.info(self.progress_message)

            # Step 3: Rank signals by latest crossover date
            self.progress_message = "Ranking signals..."
            ranked_results, df = self._rank_signals(detected_signals)

            self.latest_dataframe = df
            self.latest_results = ranked_results
            self.signals_found = len(ranked_results)

            # Step 4: Persist results in Database
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

            cleanup_old_scans(db, keep_count=1, delete_all=settings.DELETE_RESULTS_AFTER_SCAN)

            self.status = "completed"
            self.progress_message = f"Completed: Scanned {self.stocks_scanned} stocks via yfinance, found {self.signals_found} confirmed crossovers."
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

    def _detect_crossover_df(
        self,
        symbol: str,
        company: str,
        df: pd.DataFrame
    ) -> Optional[Dict[str, Any]]:
        """
        Calculates SMA 6 and SMA 30 from DataFrame candles.
        Detects the most recent confirmed crossover:
        - Bullish Golden Cross: prev(SMA6) <= prev(SMA30) and curr(SMA6) > curr(SMA30) -> BULLISH
        - Bearish Death Cross:  prev(SMA6) >= prev(SMA30) and curr(SMA6) < curr(SMA30) -> BEARISH
        """
        # Ensure Close column is numeric and sorted oldest-to-newest
        if "Close" not in df.columns:
            return None

        # Handle potential MultiIndex column names from yfinance
        close_series = df["Close"]
        if isinstance(close_series, pd.DataFrame):
            close_series = close_series.iloc[:, 0]

        calc_df = pd.DataFrame({
            "close": pd.to_numeric(close_series, errors="coerce")
        }, index=df.index).dropna()

        calc_df["sma6"] = calc_df["close"].rolling(window=6).mean()
        calc_df["sma30"] = calc_df["close"].rolling(window=30).mean()

        n = len(calc_df)
        if n < 31:
            return None

        latest_close = float(calc_df.iloc[-1]["close"])
        latest_sma6 = float(calc_df.iloc[-1]["sma6"])
        latest_sma30 = float(calc_df.iloc[-1]["sma30"])

        if pd.isna(latest_close) or pd.isna(latest_sma6) or pd.isna(latest_sma30):
            return None

        # Lookback limit of 25 trading days
        min_lookback = max(29, n - 26)

        for i in range(n - 1, min_lookback, -1):
            prev_s6 = calc_df.iloc[i - 1]["sma6"]
            prev_s30 = calc_df.iloc[i - 1]["sma30"]
            curr_s6 = calc_df.iloc[i]["sma6"]
            curr_s30 = calc_df.iloc[i]["sma30"]

            if pd.isna(prev_s6) or pd.isna(prev_s30) or pd.isna(curr_s6) or pd.isna(curr_s30):
                continue

            days_ago = (n - 1) - i
            idx_val = calc_df.index[i]
            crossover_date = idx_val.strftime("%Y-%m-%d") if hasattr(idx_val, "strftime") else str(idx_val)[:10]

            # Bullish Golden Crossover
            if prev_s6 <= prev_s30 and curr_s6 > curr_s30:
                if latest_sma6 < latest_sma30:
                    continue
                if latest_close < latest_sma30 * 0.97:
                    continue

                crossover_price = round(float(calc_df.iloc[i]["close"]), 2)
                spread_pct = round(((latest_sma6 - latest_sma30) / latest_sma30) * 100, 2)
                freshness = "FRESH" if days_ago <= 1 else ("RECENT" if days_ago <= 5 else "ACTIVE")

                return {
                    "Symbol": symbol,
                    "Company": company,
                    "Signal Type": "BULLISH",
                    "Crossover Date": crossover_date,
                    "Close": round(latest_close, 2),
                    "SMA 6": round(latest_sma6, 2),
                    "SMA 30": round(latest_sma30, 2),
                    "Crossover Price": crossover_price,
                    "Days Ago": days_ago,
                    "Freshness": freshness,
                    "Spread Pct": spread_pct,
                    "_sort_date": pd.to_datetime(crossover_date)
                }

            # Bearish Death Crossover
            if prev_s6 >= prev_s30 and curr_s6 < curr_s30:
                if latest_sma6 > latest_sma30:
                    continue
                if latest_close > latest_sma30 * 1.03:
                    continue

                crossover_price = round(float(calc_df.iloc[i]["close"]), 2)
                spread_pct = round(((latest_sma6 - latest_sma30) / latest_sma30) * 100, 2)
                freshness = "FRESH" if days_ago <= 1 else ("RECENT" if days_ago <= 5 else "ACTIVE")

                return {
                    "Symbol": symbol,
                    "Company": company,
                    "Signal Type": "BEARISH",
                    "Crossover Date": crossover_date,
                    "Close": round(latest_close, 2),
                    "SMA 6": round(latest_sma6, 2),
                    "SMA 30": round(latest_sma30, 2),
                    "Crossover Price": crossover_price,
                    "Days Ago": days_ago,
                    "Freshness": freshness,
                    "Spread Pct": spread_pct,
                    "_sort_date": pd.to_datetime(crossover_date)
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

        df = pd.DataFrame(ranked)
        cols = ["Rank", "Symbol", "Company", "Signal Type", "Crossover Date", "Close", "SMA 6", "SMA 30"]
        df = df[cols]

        return ranked, df

scanner_manager = ScannerManager()
