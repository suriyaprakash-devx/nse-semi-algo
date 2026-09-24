import logging
from typing import Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np

logger = logging.getLogger("scanner.indicators")

def calculate_sma(series: pd.Series, window: int) -> pd.Series:
    """
    Calculates Simple Moving Average (SMA) for a given pandas Series.
    Requires at least `window` periods.
    """
    if series.empty or len(series) < window:
        return pd.Series(np.nan, index=series.index)
    return series.rolling(window=window, min_periods=window).mean()

def calculate_volume_metrics(df: pd.DataFrame, lookback: int = 20) -> Dict[str, float]:
    """
    Calculates volume metrics using completed candles:
    - Average Volume: rolling mean of previous `lookback` completed candles (excluding current).
    - Current Volume: volume of the latest completed candle.
    - Volume Ratio: Current Volume / Average Volume.
    """
    if df.empty or "volume" not in df.columns:
        return {"current_volume": 0, "average_volume": 0.0, "volume_ratio": 1.0}

    vol_series = pd.to_numeric(df["volume"], errors="coerce").fillna(0)
    current_vol = float(vol_series.iloc[-1])

    if len(vol_series) < 2:
        return {"current_volume": current_vol, "average_volume": current_vol, "volume_ratio": 1.0}

    # Use prior completed candles for the average
    prior_vols = vol_series.iloc[:-1]
    lookback_window = min(lookback, len(prior_vols))
    if lookback_window == 0:
        return {"current_volume": current_vol, "average_volume": current_vol, "volume_ratio": 1.0}

    avg_vol = float(prior_vols.tail(lookback_window).mean())
    if avg_vol <= 0:
        avg_vol = 1.0

    vol_ratio = round(current_vol / avg_vol, 2)
    return {
        "current_volume": int(current_vol),
        "average_volume": round(avg_vol, 2),
        "volume_ratio": vol_ratio
    }

def calculate_intraday_momentum(df: pd.DataFrame) -> Tuple[float, float]:
    """
    Calculates intraday momentum % relative to the first valid completed candle of the current session:
    Momentum % = (Current Close - Reference Price) / Reference Price * 100.
    Returns: (momentum_percent, reference_price)
    """
    if df.empty or "close" not in df.columns:
        return 0.0, 0.0

    closes = pd.to_numeric(df["close"], errors="coerce").dropna()
    if closes.empty:
        return 0.0, 0.0

    current_close = float(closes.iloc[-1])

    # If timestamps have date information, locate first candle of today's date
    ref_price = float(closes.iloc[0])
    if "timestamp" in df.columns:
        try:
            df_ts = pd.to_datetime(df["timestamp"])
            last_date = df_ts.iloc[-1].date()
            today_mask = df_ts.dt.date == last_date
            today_candles = df[today_mask]
            if not today_candles.empty:
                # Use open or close of first candle of the session
                ref_price = float(today_candles["close"].iloc[0])
        except Exception as e:
            logger.debug("Failed to extract session reference price: %s", e)

    if ref_price <= 0:
        return 0.0, current_close

    momentum_pct = round(((current_close - ref_price) / ref_price) * 100.0, 2)
    return momentum_pct, ref_price

def calculate_swing_levels(
    df: pd.DataFrame,
    lookback: int = 15,
    min_buffer: float = 1.0,
    buffer_pct: float = 0.001
) -> Dict[str, float]:
    """
    Calculates intraday swing high and swing low from recent completed candles.
    Applies configurable buffer for deterministic analytical Stop-Loss.
    """
    if df.empty or len(df) < 2:
        return {"swing_high": 0.0, "swing_low": 0.0, "sl_buy": 0.0, "sl_sell": 0.0}

    # Evaluate recent prior completed candles
    window_df = df.iloc[-min(lookback, len(df)):]
    highs = pd.to_numeric(window_df["high"], errors="coerce").dropna()
    lows = pd.to_numeric(window_df["low"], errors="coerce").dropna()
    closes = pd.to_numeric(window_df["close"], errors="coerce").dropna()

    if highs.empty or lows.empty or closes.empty:
        return {"swing_high": 0.0, "swing_low": 0.0, "sl_buy": 0.0, "sl_sell": 0.0}

    curr_close = float(closes.iloc[-1])
    swing_high = float(highs.max())
    swing_low = float(lows.min())

    # Analytical buffer: at least ₹0.50 or min_buffer or 0.1% of price
    buffer_amt = max(min_buffer, curr_close * buffer_pct, 0.5)

    sl_buy = round(max(0.0, swing_low - buffer_amt), 2)
    sl_sell = round(swing_high + buffer_amt, 2)

    return {
        "swing_high": round(swing_high, 2),
        "swing_low": round(swing_low, 2),
        "sl_buy": sl_buy,
        "sl_sell": sl_sell
    }

def calculate_daily_trend(daily_df: pd.DataFrame) -> Dict[str, Any]:
    """
    Calculates Daily SMA6 vs Daily SMA30:
    - Daily SMA6 > Daily SMA30 -> BULLISH
    - Daily SMA6 < Daily SMA30 -> BEARISH
    - Otherwise -> NEUTRAL
    """
    if daily_df.empty or len(daily_df) < 30:
        return {
            "daily_trend": "NEUTRAL",
            "daily_sma6": 0.0,
            "daily_sma30": 0.0
        }

    closes = pd.to_numeric(daily_df["close"], errors="coerce").dropna()
    if len(closes) < 30:
        return {
            "daily_trend": "NEUTRAL",
            "daily_sma6": 0.0,
            "daily_sma30": 0.0
        }

    sma6 = float(closes.rolling(6).mean().iloc[-1])
    sma30 = float(closes.rolling(30).mean().iloc[-1])

    if sma6 > sma30:
        trend = "BULLISH"
    elif sma6 < sma30:
        trend = "BEARISH"
    else:
        trend = "NEUTRAL"

    return {
        "daily_trend": trend,
        "daily_sma6": round(sma6, 2),
        "daily_sma30": round(sma30, 2)
    }

def calculate_relative_strength(
    stock_df: pd.DataFrame,
    benchmark_df: pd.DataFrame
) -> float:
    """
    Calculates Relative Strength vs NIFTY benchmark (^NSEI):
    Stock Return % - NIFTY Return %.
    Positive: Outperforming NIFTY.
    Negative: Underperforming NIFTY.
    """
    if stock_df.empty or benchmark_df.empty:
        return 0.0

    try:
        stock_closes = pd.to_numeric(stock_df["close"], errors="coerce").dropna()
        nifty_closes = pd.to_numeric(benchmark_df["close"], errors="coerce").dropna()

        if len(stock_closes) < 2 or len(nifty_closes) < 2:
            return 0.0

        # Session or lookback return
        stock_ret = ((float(stock_closes.iloc[-1]) - float(stock_closes.iloc[0])) / float(stock_closes.iloc[0])) * 100.0
        nifty_ret = ((float(nifty_closes.iloc[-1]) - float(nifty_closes.iloc[0])) / float(nifty_closes.iloc[0])) * 100.0

        return round(stock_ret - nifty_ret, 2)
    except Exception as e:
        logger.debug("Error calculating relative strength: %s", e)
        return 0.0

def calculate_day_change_percent(df: pd.DataFrame) -> float:
    """Calculates intraday session percent change."""
    if df.empty or "close" not in df.columns:
        return 0.0
    try:
        closes = pd.to_numeric(df["close"], errors="coerce").dropna()
        if len(closes) < 2:
            return 0.0
        open_val = float(df["open"].iloc[0]) if "open" in df.columns else float(closes.iloc[0])
        curr_val = float(closes.iloc[-1])
        if open_val <= 0:
            return 0.0
        return round(((curr_val - open_val) / open_val) * 100.0, 2)
    except Exception:
        return 0.0
