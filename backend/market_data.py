import asyncio
import logging
import time
from datetime import datetime, timezone, time as dt_time
from typing import List, Dict, Any, Optional, Tuple
import pytz
import pandas as pd
import yfinance as yf
from backend.config import settings

logger = logging.getLogger("scanner.market_data")
KOLKATA_TZ = pytz.timezone("Asia/Kolkata")

class MarketDataClient:
    """
    Production market-data client for NSE equities and benchmark indices using yfinance.
    - Intraday completed candles: 5m, 10m, 15m
    - Daily completed candles
    - Benchmark ^NSEI data for Relative Strength
    - In-memory caching with configurable TTL
    - Controlled concurrency & batch chunking
    - Robust failure handling and candle validation
    """

    def __init__(self):
        self.semaphore = asyncio.Semaphore(settings.MAX_WORKERS)
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self._cache_ttl = settings.CACHE_TTL_SECONDS

    def get_market_status(self) -> Dict[str, Any]:
        """
        Calculates NSE market status using Asia/Kolkata timezone:
        Trading Hours: Monday to Friday, 09:15 to 15:30 IST.
        """
        now_ist = datetime.now(KOLKATA_TZ)
        is_weekday = now_ist.weekday() < 5  # 0 to 4 are Mon-Fri
        market_open = dt_time(9, 15)
        market_close = dt_time(15, 30)

        curr_time = now_ist.time()
        is_open = is_weekday and (market_open <= curr_time <= market_close)

        time_str = now_ist.strftime("%Y-%m-%d %H:%M:%S IST")
        return {
            "is_open": is_open,
            "status": "OPEN" if is_open else "CLOSED",
            "current_time_ist": time_str,
            "market_hours": "09:15 - 15:30 IST",
            "trading_day": is_weekday,
            "timezone": "Asia/Kolkata",
            "message": "NSE Live Market is OPEN" if is_open else "NSE Market is CLOSED (Regular hours: Mon-Fri 09:15-15:30 IST)"
        }

    def _is_cache_valid(self, cache_key: str) -> bool:
        if cache_key in self._cache:
            timestamp, _ = self._cache[cache_key]
            if time.time() - timestamp < self._cache_ttl:
                return True
        return False

    def _get_from_cache(self, cache_key: str) -> Optional[Any]:
        if self._is_cache_valid(cache_key):
            return self._cache[cache_key][1]
        return None

    def _set_cache(self, cache_key: str, data: Any):
        self._cache[cache_key] = (time.time(), data)

    def _clean_and_sort_df(self, df: pd.DataFrame) -> pd.DataFrame:
        """Cleans, localizes to Asia/Kolkata, and sorts chronologically."""
        if df.empty:
            return df

        clean = df.dropna(subset=["Close"]).copy()
        if clean.empty:
            return clean

        # Convert index to Asia/Kolkata if timezone-aware, or localize
        if hasattr(clean.index, "tz") and clean.index.tz is not None:
            clean.index = clean.index.tz_convert(KOLKATA_TZ)
        else:
            try:
                clean.index = clean.index.tz_localize("UTC").tz_convert(KOLKATA_TZ)
            except Exception:
                pass

        clean = clean.sort_index(ascending=True)
        return clean

    def _resample_to_10m(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Resamples 5-minute bars into 10-minute candles starting from market open (09:15 IST)."""
        clean = self._clean_and_sort_df(df)
        if clean.empty or len(clean) < 31:
            return []

        daily_groups = []
        for date, group in clean.groupby(clean.index.date):
            g_10m = group.resample("10min", origin="start", closed="left", label="left").agg({
                "Open": "first",
                "High": "max",
                "Low": "min",
                "Close": "last",
                "Volume": "sum"
            }).dropna().reset_index()
            daily_groups.append(g_10m)

        if not daily_groups:
            return []

        df_10m = pd.concat(daily_groups, ignore_index=True)
        candles = []
        for _, row in df_10m.iterrows():
            ts = row.iloc[0]
            ts_str = ts.strftime("%Y-%m-%d %H:%M") if hasattr(ts, "strftime") else str(ts)
            candles.append({
                "timestamp": ts_str,
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]) if pd.notna(row["Volume"]) else 0
            })
        return candles

    def _parse_candles(self, df: pd.DataFrame, is_daily: bool = False) -> List[Dict[str, Any]]:
        """Parses standard OHLCV dataframe into candle list."""
        clean = self._clean_and_sort_df(df)
        if clean.empty:
            return []

        candles = []
        for idx, row in clean.iterrows():
            if is_daily:
                ts_str = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)
            else:
                ts_str = idx.strftime("%Y-%m-%d %H:%M") if hasattr(idx, "strftime") else str(idx)

            candles.append({
                "timestamp": ts_str,
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]) if pd.notna(row["Volume"]) else 0
            })
        return candles

    def _download_sync(
        self,
        tickers: List[str],
        period: str = "7d",
        interval: str = "10m"
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Synchronously downloads tickers in batch with caching."""
        result: Dict[str, List[Dict[str, Any]]] = {}
        if not tickers:
            return result

        # Check which tickers are already cached
        missing_tickers = []
        for ticker in tickers:
            cache_key = f"{ticker}_{period}_{interval}"
            cached_data = self._get_from_cache(cache_key)
            if cached_data is not None:
                result[ticker] = cached_data
            else:
                missing_tickers.append(ticker)

        if not missing_tickers:
            return result

        # Map interval for yfinance:
        # yfinance supports '5m', '15m', '1d'. For '10m', fetch '5m' and resample.
        is_10m = interval in ("10m", "10minute")
        yf_interval = "5m" if is_10m else interval
        yf_period = period or ("7d" if yf_interval in ("5m", "15m") else "60d")

        try:
            df = yf.download(
                tickers=missing_tickers,
                period=yf_period,
                interval=yf_interval,
                group_by="ticker",
                threads=True,
                progress=False
            )

            if df.empty:
                return result

            # Single ticker download vs multi-ticker download
            if len(missing_tickers) == 1:
                t = missing_tickers[0]
                if is_10m:
                    candles = self._resample_to_10m(df)
                else:
                    candles = self._parse_candles(df, is_daily=(interval in ("1d", "daily")))
                if candles:
                    result[t] = candles
                    self._set_cache(f"{t}_{period}_{interval}", candles)
                return result

            for t in missing_tickers:
                try:
                    if t in df.columns.levels[0] if isinstance(df.columns, pd.MultiIndex) else t in df:
                        t_df = df[t].dropna(subset=["Close"]) if isinstance(df.columns, pd.MultiIndex) else df
                        if not t_df.empty:
                            if is_10m:
                                candles = self._resample_to_10m(t_df)
                            else:
                                candles = self._parse_candles(t_df, is_daily=(interval in ("1d", "daily")))
                            if candles:
                                result[t] = candles
                                self._set_cache(f"{t}_{period}_{interval}", candles)
                except Exception as e:
                    logger.debug("Error processing ticker %s: %s", t, e)
                    continue

        except Exception as e:
            logger.warning("Batch download failed for %d tickers: %s", len(missing_tickers), e)

        return result

    async def fetch_ticker_candles(
        self,
        symbol: str,
        period: str = "7d",
        interval: str = "10m"
    ) -> List[Dict[str, Any]]:
        """Fetches candles for a single NSE stock or benchmark."""
        ticker = f"{symbol}.NS" if (not symbol.endswith(".NS") and not symbol.startswith("^")) else symbol
        res = await asyncio.to_thread(self._download_sync, [ticker], period, interval)
        return res.get(ticker, [])

    async def fetch_batch_candles(
        self,
        symbols: List[str],
        period: str = "7d",
        interval: str = "10m",
        chunk_size: int = 25
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Fetches candles for multiple symbols concurrently in optimized chunks."""
        tickers_map = {
            f"{s}.NS" if (not s.endswith(".NS") and not s.startswith("^")) else s: s
            for s in symbols
        }
        tickers = list(tickers_map.keys())
        chunks = [tickers[i:i + chunk_size] for i in range(0, len(tickers), chunk_size)]

        all_results: Dict[str, List[Dict[str, Any]]] = {}

        for chunk in chunks:
            async with self.semaphore:
                chunk_res = await asyncio.to_thread(self._download_sync, chunk, period, interval)
                for ticker, candles in chunk_res.items():
                    orig_symbol = tickers_map.get(ticker, ticker)
                    all_results[orig_symbol] = candles

        return all_results

    async def fetch_benchmark_data(
        self,
        timeframe: str = "10m"
    ) -> List[Dict[str, Any]]:
        """Downloads NIFTY 50 (^NSEI) candles for relative strength calculation."""
        benchmark_ticker = settings.BENCHMARK_TICKER
        return await self.fetch_ticker_candles(
            benchmark_ticker,
            period="7d",
            interval=timeframe
        )

market_data_api = MarketDataClient()
