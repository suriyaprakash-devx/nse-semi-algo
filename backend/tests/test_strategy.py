import pytest
from datetime import datetime, timedelta
import pandas as pd
from backend.strategy import (
    validate_candles,
    find_crossover_events,
    evaluate_stock_strategy
)

def make_candles(count: int = 35, start_price: float = 100.0, trend: str = "flat", surge_last: bool = False, surge_dir: str = "up", high_volume_last: bool = False):
    base_time = datetime(2026, 9, 24, 9, 15)
    candles = []
    curr_price = start_price

    for i in range(count):
        ts = (base_time + timedelta(minutes=10 * i)).strftime("%Y-%m-%d %H:%M")
        if trend == "down":
            curr_price = start_price - (i * 0.2)
        elif trend == "up":
            curr_price = start_price + (i * 0.2)

        # Sharp move in last 5 candles to create crossover
        if surge_last and i >= count - 5:
            step = (i - (count - 6))
            if surge_dir == "up":
                curr_price = start_price + (step * 8.0)
            else:
                curr_price = start_price - (step * 8.0)

        vol = 10000
        if high_volume_last and i == count - 1:
            vol = 25000  # 2.5x volume

        candles.append({
            "timestamp": ts,
            "open": round(curr_price - 0.5, 2),
            "high": round(curr_price + 2.0, 2),
            "low": round(curr_price - 2.0, 2),
            "close": round(curr_price, 2),
            "volume": vol
        })
    return candles

def test_validate_candles_rejections():
    # Insufficient candles
    short_candles = make_candles(count=20)
    assert validate_candles(short_candles, min_required=31) is None

    # Missing OHLCV columns
    invalid_candles = [{"timestamp": "2026-09-24 09:15", "close": 100}] * 35
    assert validate_candles(invalid_candles, min_required=31) is None

    # Negative prices
    neg_candles = make_candles(count=35)
    neg_candles[5]["close"] = -50.0
    # Negative row gets filtered out, if remaining < 31 returns None
    short_neg = make_candles(count=31)
    short_neg[5]["close"] = -10.0
    assert validate_candles(short_neg, min_required=31) is None

def test_find_crossover_events_bullish():
    candles = make_candles(count=35, start_price=100.0, trend="down", surge_last=True, surge_dir="up")
    df = validate_candles(candles)
    crossovers = find_crossover_events(df)
    assert len(crossovers) > 0
    latest = crossovers[-1]
    assert latest["type"] == "BULLISH"
    assert latest["sma6"] > latest["sma30"]

def test_find_crossover_events_bearish():
    candles = make_candles(count=35, start_price=200.0, trend="up", surge_last=True, surge_dir="down")
    df = validate_candles(candles)
    crossovers = find_crossover_events(df)
    assert len(crossovers) > 0
    latest = crossovers[-1]
    assert latest["type"] == "BEARISH"
    assert latest["sma6"] < latest["sma30"]

def test_no_crossover_when_steady():
    candles = make_candles(count=35, start_price=100.0, trend="flat")
    df = validate_candles(candles)
    crossovers = find_crossover_events(df)
    assert len(crossovers) == 0

def test_confirmed_buy_setup():
    # Bullish crossover + Price > SMA30 + Momentum > 0 + Volume 2.5x + Bullish price action
    candles = make_candles(
        count=35, start_price=100.0, trend="down",
        surge_last=True, surge_dir="up", high_volume_last=True
    )
    # Ensure current close > previous high
    prev_high = candles[-2]["high"]
    candles[-1]["close"] = prev_high + 5.0
    candles[-1]["high"] = prev_high + 7.0

    daily_c = make_candles(count=35, start_price=80.0, trend="up")
    benchmark_c = make_candles(count=35, start_price=1000.0, trend="flat")

    res = evaluate_stock_strategy(
        candles=candles,
        symbol="RELIANCE",
        company="Reliance Industries Ltd",
        daily_candles=daily_c,
        benchmark_candles=benchmark_c,
        volume_multiplier=1.5,
        risk_reward_ratio=2.0,
        timeframe="10m"
    )

    assert res["status"] == "BUY"
    assert res["potential_direction"] == "BUY"
    assert res["entry"] is not None
    assert res["stop_loss"] is not None
    assert res["target"] is not None
    assert res["target"] > res["entry"]
    assert res["entry"] > res["stop_loss"]
    assert res["signal_strength"] >= 70

def test_confirmed_sell_setup():
    # Bearish crossover + Price < SMA30 + Momentum < 0 + Volume 2.5x + Bearish price action
    candles = make_candles(
        count=35, start_price=200.0, trend="up",
        surge_last=True, surge_dir="down", high_volume_last=True
    )
    # Ensure current close < previous low
    prev_low = candles[-2]["low"]
    candles[-1]["close"] = prev_low - 5.0
    candles[-1]["low"] = prev_low - 7.0

    daily_c = make_candles(count=35, start_price=250.0, trend="down")
    benchmark_c = make_candles(count=35, start_price=1000.0, trend="flat")

    res = evaluate_stock_strategy(
        candles=candles,
        symbol="TCS",
        company="Tata Consultancy Services Ltd",
        daily_candles=daily_c,
        benchmark_candles=benchmark_c,
        volume_multiplier=1.5,
        risk_reward_ratio=2.0,
        timeframe="10m"
    )

    assert res["status"] == "SELL"
    assert res["potential_direction"] == "SELL"
    assert res["entry"] is not None
    assert res["stop_loss"] is not None
    assert res["target"] is not None
    assert res["target"] < res["entry"]
    assert res["entry"] < res["stop_loss"]
    assert res["signal_strength"] >= 70

def test_watch_setup_missing_volume():
    # Bullish crossover + Price > SMA30 + Momentum > 0, BUT Volume Ratio is only 1.1x (< 1.5x)
    candles = make_candles(
        count=35, start_price=100.0, trend="down",
        surge_last=True, surge_dir="up", high_volume_last=False
    )
    candles[-1]["volume"] = 11000  # 1.1x vs 10000 average

    res = evaluate_stock_strategy(
        candles=candles,
        symbol="INFY",
        company="Infosys Ltd",
        volume_multiplier=1.5,
        risk_reward_ratio=2.0,
        timeframe="10m"
    )

    assert res["status"] == "WATCH"
    assert res["potential_direction"] == "BUY"
    assert "volume confirmation" in res["reason"].lower()
    # WATCH setups must have analytical entry, SL, and target levels
    assert res["entry"] is not None
    assert res["stop_loss"] is not None
    assert res["target"] is not None

def test_no_signal_no_fabricated_levels():
    # Steady flat candles: no setup
    candles = make_candles(count=35, start_price=100.0, trend="flat")

    res = evaluate_stock_strategy(
        candles=candles,
        symbol="FLAT",
        company="Flat Stock Ltd",
        volume_multiplier=1.5,
        risk_reward_ratio=2.0
    )

    assert res["status"] == "NO SIGNAL"
    assert res["potential_direction"] is None
    # Trade levels MUST BE None for NO SIGNAL (never fabricate)
    assert res["entry"] is None
    assert res["stop_loss"] is None
    assert res["target"] is None

def test_risk_reward_calculation():
    # Verify R:R calculation for 1:1.5 and 1:3
    candles = make_candles(
        count=35, start_price=100.0, trend="down",
        surge_last=True, surge_dir="up", high_volume_last=True
    )
    res_1_5 = evaluate_stock_strategy(candles=candles, symbol="S1", company="C1", risk_reward_ratio=1.5)
    res_3_0 = evaluate_stock_strategy(candles=candles, symbol="S2", company="C2", risk_reward_ratio=3.0)

    risk_1_5 = res_1_5["entry"] - res_1_5["stop_loss"]
    expected_target_1_5 = round(res_1_5["entry"] + risk_1_5 * 1.5, 2)
    assert res_1_5["target"] == pytest.approx(expected_target_1_5, abs=0.05)

    risk_3_0 = res_3_0["entry"] - res_3_0["stop_loss"]
    expected_target_3_0 = round(res_3_0["entry"] + risk_3_0 * 3.0, 2)
    assert res_3_0["target"] == pytest.approx(expected_target_3_0, abs=0.05)
