import pytest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

from backend.indicators import (
    calculate_sma,
    calculate_volume_metrics,
    calculate_intraday_momentum,
    calculate_swing_levels,
    calculate_daily_trend,
    calculate_relative_strength,
    calculate_day_change_percent
)

def test_sma_calculation():
    series = pd.Series([10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0])
    sma6 = calculate_sma(series, 6)
    assert pd.isna(sma6.iloc[4])
    assert sma6.iloc[5] == pytest.approx((10 + 20 + 30 + 40 + 50 + 60) / 6.0)
    assert sma6.iloc[6] == pytest.approx((20 + 30 + 40 + 50 + 60 + 70) / 6.0)

def test_volume_metrics():
    # 21 candles with volume 1000 each, and last candle with volume 2500
    volumes = [1000] * 20 + [2500]
    df = pd.DataFrame({"volume": volumes})
    metrics = calculate_volume_metrics(df, lookback=20)

    assert metrics["current_volume"] == 2500
    assert metrics["average_volume"] == pytest.approx(1000.0)
    assert metrics["volume_ratio"] == pytest.approx(2.5)
    assert metrics["normalized_by"] == "ROLLING_20"

def test_time_of_day_volume_normalization():
    # 5 trading days with identical time slots (09:15, 09:25, 09:35)
    # Days 1 to 4: 09:25 volume is 10,000, 12,000, 8,000, 10,000 -> Mean at 09:25 = 10,000
    # Day 5 (today): 09:25 volume surges to 25,000 -> Ratio should be 25,000 / 10,000 = 2.5x
    data = []
    base_dates = [
        datetime(2026, 9, 20),
        datetime(2026, 9, 21),
        datetime(2026, 9, 22),
        datetime(2026, 9, 23),
        datetime(2026, 9, 24)
    ]
    historical_925_vols = [10000, 12000, 8000, 10000]

    for day_idx, dt in enumerate(base_dates):
        # 09:15
        data.append({"timestamp": dt.strftime("%Y-%m-%d 09:15"), "volume": 15000})
        # 09:25
        v_925 = historical_925_vols[day_idx] if day_idx < 4 else 25000
        data.append({"timestamp": dt.strftime("%Y-%m-%d 09:25"), "volume": v_925})
        # 09:35 (only for past days)
        if day_idx < 4:
            data.append({"timestamp": dt.strftime("%Y-%m-%d 09:35"), "volume": 5000})

    df = pd.DataFrame(data)
    metrics = calculate_volume_metrics(df, lookback=20, max_tod_days=10)

    assert metrics["current_volume"] == 25000
    assert metrics["average_volume"] == pytest.approx(10000.0)
    assert metrics["volume_ratio"] == pytest.approx(2.5)
    assert metrics["normalized_by"] == "TIME_OF_DAY"

def test_intraday_momentum():
    base = datetime(2026, 9, 24, 9, 15)
    timestamps = [(base + timedelta(minutes=10 * i)).strftime("%Y-%m-%d %H:%M") for i in range(10)]
    closes = [100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0, 108.0, 110.0]
    df = pd.DataFrame({"timestamp": timestamps, "close": closes})

    mom_pct, ref_price = calculate_intraday_momentum(df)
    assert ref_price == pytest.approx(100.0)
    # (110 - 100) / 100 * 100 = +10.0%
    assert mom_pct == pytest.approx(10.0)

def test_swing_levels():
    highs = [105.0, 110.0, 115.0, 112.0, 108.0]
    lows = [95.0, 98.0, 100.0, 99.0, 96.0]
    closes = [100.0, 105.0, 112.0, 110.0, 107.0]
    df = pd.DataFrame({"high": highs, "low": lows, "close": closes})

    swings = calculate_swing_levels(df, lookback=5, min_buffer=1.0)
    assert swings["swing_high"] == pytest.approx(115.0)
    assert swings["swing_low"] == pytest.approx(95.0)
    assert swings["sl_buy"] < 95.0
    assert swings["sl_sell"] > 115.0

def test_daily_trend():
    # 35 daily closes in uptrend
    closes_bullish = [100.0 + (i * 2.0) for i in range(35)]
    df_bull = pd.DataFrame({"close": closes_bullish})
    trend_bull = calculate_daily_trend(df_bull)
    assert trend_bull["daily_trend"] == "BULLISH"
    assert trend_bull["daily_sma6"] > trend_bull["daily_sma30"]

    # 35 daily closes in downtrend
    closes_bearish = [200.0 - (i * 2.0) for i in range(35)]
    df_bear = pd.DataFrame({"close": closes_bearish})
    trend_bear = calculate_daily_trend(df_bear)
    assert trend_bear["daily_trend"] == "BEARISH"
    assert trend_bear["daily_sma6"] < trend_bear["daily_sma30"]

def test_relative_strength():
    # Stock up 5%, Benchmark up 2% -> RS = +3%
    stock_df = pd.DataFrame({"close": [100.0, 105.0]})
    bench_df = pd.DataFrame({"close": [1000.0, 1020.0]})
    rs = calculate_relative_strength(stock_df, bench_df)
    assert rs == pytest.approx(3.0)
