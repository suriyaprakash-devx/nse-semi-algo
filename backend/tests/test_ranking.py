import pytest
from backend.ranking import rank_stocks

def test_ranking_priority_groups():
    results = [
        {"symbol": "NO_SIG", "status": "NO SIGNAL", "signal_strength": 90, "crossover_time": "2026-09-24 10:00"},
        {"symbol": "WATCH_STK", "status": "WATCH", "signal_strength": 70, "crossover_time": "2026-09-24 10:10"},
        {"symbol": "BUY_STK", "status": "BUY", "signal_strength": 85, "crossover_time": "2026-09-24 10:20"},
        {"symbol": "SELL_STK", "status": "SELL", "signal_strength": 80, "crossover_time": "2026-09-24 10:15"},
    ]

    ranked = rank_stocks(results)
    assert len(ranked) == 4

    # BUY_STK and SELL_STK must be Ranks 1 and 2
    assert ranked[0]["symbol"] in ("BUY_STK", "SELL_STK")
    assert ranked[1]["symbol"] in ("BUY_STK", "SELL_STK")
    # Higher signal strength between BUY (85) and SELL (80) gives BUY Rank 1
    assert ranked[0]["symbol"] == "BUY_STK"
    assert ranked[0]["rank"] == 1
    assert ranked[1]["symbol"] == "SELL_STK"
    assert ranked[1]["rank"] == 2

    # WATCH_STK must be Rank 3
    assert ranked[2]["symbol"] == "WATCH_STK"
    assert ranked[2]["rank"] == 3

    # NO_SIG must be Rank 4 despite high score because no setup exists
    assert ranked[3]["symbol"] == "NO_SIG"
    assert ranked[3]["rank"] == 4

def test_ranking_crossover_recency():
    # Two BUY setups with equal signal strength: most recent crossover must rank higher
    results = [
        {"symbol": "OLDER", "status": "BUY", "signal_strength": 80, "crossover_time": "2026-09-24 09:30", "volume_ratio": 1.8},
        {"symbol": "NEWER", "status": "BUY", "signal_strength": 80, "crossover_time": "2026-09-24 11:20", "volume_ratio": 1.8},
    ]

    ranked = rank_stocks(results)
    assert ranked[0]["symbol"] == "NEWER"
    assert ranked[0]["rank"] == 1
    assert ranked[1]["symbol"] == "OLDER"
    assert ranked[1]["rank"] == 2
