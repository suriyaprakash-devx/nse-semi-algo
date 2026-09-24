import logging
from typing import List, Dict, Any
import pandas as pd

logger = logging.getLogger("scanner.ranking")

def rank_stocks(results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Ranks the 200 scanned stocks transparently according to multi-factor priority:
    1. Confirmed BUY/SELL setups first (Status == 'BUY' or 'SELL')
    2. WATCH setups second (Status == 'WATCH')
    3. NO SIGNAL last
    4. Signal strength (DESC)
    5. Most recent crossover timestamp (crossover_time DESC)
    6. Volume expansion / ratio (DESC)
    7. Intraday momentum magnitude (DESC)
    8. Daily trend alignment
    9. Relative strength vs NIFTY (DESC)
    
    Assigns sequential Ranks 1 to N.
    """
    if not results:
        return []

    def sort_key(item: Dict[str, Any]):
        status = item.get("status", "NO SIGNAL")
        # Priority group:
        # BUY/SELL: 3
        # WATCH: 2
        # NO SIGNAL: 1
        if status in ("BUY", "SELL"):
            priority_group = 3
        elif status == "WATCH":
            priority_group = 2
        else:
            priority_group = 1

        signal_strength = item.get("signal_strength", 0)
        crossover_time = str(item.get("crossover_time") or "")
        volume_ratio = float(item.get("volume_ratio") or 0.0)
        abs_momentum = abs(float(item.get("momentum_percent") or 0.0))

        daily_trend = item.get("daily_trend", "NEUTRAL")
        direction = item.get("potential_direction")
        trend_aligned = 0
        if (direction == "BUY" and daily_trend == "BULLISH") or (direction == "SELL" and daily_trend == "BEARISH"):
            trend_aligned = 1

        rs = float(item.get("relative_strength") or 0.0)

        # Python tuple comparison (highest first, so negate or invert)
        return (
            priority_group,
            signal_strength,
            crossover_time,
            volume_ratio,
            abs_momentum,
            trend_aligned,
            rs,
            item.get("symbol", "")
        )

    # Sort descending by key
    sorted_results = sorted(results, key=sort_key, reverse=True)

    # Assign Rank 1 to N
    ranked_list: List[Dict[str, Any]] = []
    for idx, item in enumerate(sorted_results, start=1):
        item_copy = dict(item)
        item_copy["rank"] = idx
        ranked_list.append(item_copy)

    return ranked_list
