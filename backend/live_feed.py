import asyncio
import logging
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
import httpx

logger = logging.getLogger("live_feed")

# Symbol mapping overrides for NSE equities
SYMBOL_MAP = {
    "M&M": "M&M.NS",
    "BAJAJ-AUTO": "BAJAJ-AUTO.NS",
    "L&TFH": "LTF.NS",
    "MCDOWELL-N": "UNITDSPR.NS",
    "NAM-INDIA": "NAM-INDIA.NS",
    "TATACONSUM": "TATACONSUM.NS",
    "TATAMOTORS": "TATAMTR.NS",
    "LTIM": "LTIM.NS"
}

def get_yahoo_ticker(symbol: str) -> str:
    clean = symbol.strip().upper()
    if clean in SYMBOL_MAP:
        return SYMBOL_MAP[clean]
    clean_mapped = clean.replace("&", "_")
    return f"{clean_mapped}.NS" if not clean_mapped.endswith(".NS") else clean_mapped

# In-memory quote cache with 3-second TTL
_QUOTE_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TIMESTAMP: float = 0.0
_CACHE_LOCK = asyncio.Lock()

async def fetch_single_live_quote(client: httpx.AsyncClient, symbol: str) -> Optional[Dict[str, Any]]:
    ticker = get_yahoo_ticker(symbol)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=2d"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    try:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            data = resp.json()
            results = data.get("chart", {}).get("result", [])
            if results:
                meta = results[0].get("meta", {})
                last_price = meta.get("regularMarketPrice") or meta.get("chartPreviousClose")
                prev_close = meta.get("chartPreviousClose") or last_price
                if last_price:
                    day_open = meta.get("regularMarketDayOpen") or last_price
                    day_high = meta.get("regularMarketDayHigh") or last_price
                    day_low = meta.get("regularMarketDayLow") or last_price
                    volume = meta.get("regularMarketVolume") or 0
                    change = round(float(last_price) - float(prev_close), 2) if prev_close else 0.0
                    change_pct = round((change / float(prev_close)) * 100, 2) if prev_close else 0.0
                    now_ts = int(time.time())

                    return {
                        "symbol": symbol.upper(),
                        "ticker": ticker,
                        "last_price": round(float(last_price), 2),
                        "open": round(float(day_open), 2),
                        "high": round(float(day_high), 2),
                        "low": round(float(day_low), 2),
                        "close": round(float(prev_close), 2),
                        "volume": int(volume),
                        "change": change,
                        "change_pct": change_pct,
                        "timestamp": now_ts
                    }
    except Exception as e:
        logger.debug(f"Error fetching live quote for {symbol}: {e}")
    return None

async def get_batch_live_quotes(symbols: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Asynchronously retrieves real-time live quotes for a list of symbols.
    Uses in-memory cache to ensure extreme performance and prevent rate limiting.
    """
    global _QUOTE_CACHE, _CACHE_TIMESTAMP

    now = time.time()
    clean_symbols = [s.strip().upper() for s in symbols if s.strip()]
    if not clean_symbols:
        return {}

    # Check if all requested symbols are in cache and still fresh (< 3s)
    missing = [s for s in clean_symbols if s not in _QUOTE_CACHE or (now - _QUOTE_CACHE[s].get("_cached_at", 0)) > 3.0]
    if not missing:
        return {s: _QUOTE_CACHE[s] for s in clean_symbols if s in _QUOTE_CACHE}

    # Fetch missing quotes concurrently
    semaphore = asyncio.Semaphore(12)

    async with httpx.AsyncClient(timeout=4.5) as client:
        async def worker(sym: str):
            async with semaphore:
                quote = await fetch_single_live_quote(client, sym)
                if quote:
                    quote["_cached_at"] = now
                    async with _CACHE_LOCK:
                        _QUOTE_CACHE[sym] = quote

        await asyncio.gather(*[worker(s) for s in missing], return_exceptions=True)

    return {s: _QUOTE_CACHE[s] for s in clean_symbols if s in _QUOTE_CACHE}

async def get_today_live_candle(symbol: str) -> Optional[List[Any]]:
    """
    Synthesizes today's current daily candle for an NSE stock in Upstox candle format:
    [timestamp, open, high, low, close, volume, open_interest]
    """
    quotes = await get_batch_live_quotes([symbol])
    q = quotes.get(symbol.upper())
    if not q:
        return None

    # Compute IST date string
    ist_now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    timestamp = f"{ist_now.strftime('%Y-%m-%d')}T00:00:00+05:30"
    return [
        timestamp,
        q["open"],
        q["high"],
        q["low"],
        q["last_price"],
        q["volume"],
        0
    ]
