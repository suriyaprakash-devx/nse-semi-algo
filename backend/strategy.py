import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

from backend.indicators import (
    calculate_sma,
    calculate_volume_metrics,
    calculate_intraday_momentum,
    calculate_swing_levels,
    calculate_daily_trend,
    calculate_relative_strength,
    calculate_day_change_percent
)

logger = logging.getLogger("scanner.strategy")

def validate_candles(candles: List[Dict[str, Any]], min_required: int = 31) -> Optional[pd.DataFrame]:
    """
    Validates candle data:
    - OHLCV columns exist
    - Numeric values are valid and positive
    - Enough completed candles exist for SMA30
    - Chronologically sorted
    - No NaN in critical columns
    """
    if not candles or len(candles) < min_required:
        return None

    try:
        df = pd.DataFrame(candles)
        required_cols = {"timestamp", "open", "high", "low", "close", "volume"}
        if not required_cols.issubset(df.columns):
            return None

        # Convert numeric
        for col in ["open", "high", "low", "close"]:
            df[col] = pd.to_numeric(df[col], errors="coerce")
            if (df[col] <= 0).any():
                # Filter out rows with zero or negative price
                df = df[df[col] > 0]

        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0)
        df["dt"] = pd.to_datetime(df["timestamp"])
        df = df.sort_values(by="dt", ascending=True).reset_index(drop=True)

        # Drop duplicates on timestamp
        df = df.drop_duplicates(subset=["timestamp"]).reset_index(drop=True)

        if len(df) < min_required:
            return None

        return df
    except Exception as e:
        logger.debug("Candle validation failed: %s", e)
        return None

def find_crossover_events(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Detects all genuine SMA 6 / SMA 30 crossovers in chronological order:
    - Bullish: prev SMA6 <= prev SMA30 AND curr SMA6 > curr SMA30
    - Bearish: prev SMA6 >= prev SMA30 AND curr SMA6 < curr SMA30
    Never classifies SMA6 > SMA30 alone as a crossover.
    Never classifies SMA6 < SMA30 alone as a crossover.
    """
    if len(df) < 31:
        return []

    df = df.copy()
    df["sma6"] = calculate_sma(df["close"], 6)
    df["sma30"] = calculate_sma(df["close"], 30)

    # Filter where both SMAs are available
    valid_mask = df["sma6"].notna() & df["sma30"].notna()
    valid_indices = df[valid_mask].index.tolist()

    if len(valid_indices) < 2:
        return []

    crossovers = []
    for k in range(1, len(valid_indices)):
        prev_idx = valid_indices[k - 1]
        curr_idx = valid_indices[k]

        prev_sma6 = float(df.at[prev_idx, "sma6"])
        prev_sma30 = float(df.at[prev_idx, "sma30"])
        curr_sma6 = float(df.at[curr_idx, "sma6"])
        curr_sma30 = float(df.at[curr_idx, "sma30"])
        curr_close = float(df.at[curr_idx, "close"])
        crossover_dt = df.at[curr_idx, "dt"]

        ts_str = df.at[curr_idx, "timestamp"]
        if hasattr(crossover_dt, "strftime"):
            if crossover_dt.hour == 0 and crossover_dt.minute == 0:
                time_str = crossover_dt.strftime("%Y-%m-%d")
            else:
                time_str = crossover_dt.strftime("%Y-%m-%d %H:%M")
        else:
            time_str = str(ts_str)

        # Bullish Crossover
        if prev_sma6 <= prev_sma30 and curr_sma6 > curr_sma30:
            crossovers.append({
                "type": "BULLISH",
                "index": curr_idx,
                "timestamp": time_str,
                "close": round(curr_close, 2),
                "sma6": round(curr_sma6, 2),
                "sma30": round(curr_sma30, 2),
                "is_latest_candle": (curr_idx == len(df) - 1)
            })
        # Bearish Crossover
        elif prev_sma6 >= prev_sma30 and curr_sma6 < curr_sma30:
            crossovers.append({
                "type": "BEARISH",
                "index": curr_idx,
                "timestamp": time_str,
                "close": round(curr_close, 2),
                "sma6": round(curr_sma6, 2),
                "sma30": round(curr_sma30, 2),
                "is_latest_candle": (curr_idx == len(df) - 1)
            })

    return crossovers

def evaluate_stock_strategy(
    candles: List[Dict[str, Any]],
    symbol: str,
    company: str,
    daily_candles: Optional[List[Dict[str, Any]]] = None,
    benchmark_candles: Optional[List[Dict[str, Any]]] = None,
    volume_multiplier: float = 1.5,
    risk_reward_ratio: float = 2.0,
    timeframe: str = "10m",
    is_top_active: bool = False
) -> Dict[str, Any]:
    """
    Evaluates SMA 6/30 strategy for a stock on completed candles:
    - Primary status: BUY, SELL, WATCH, or NO SIGNAL.
    - Analytical trade levels: Entry, SL, Target / Exit.
    - Signal Strength: 0 to 100 with contributing breakdown.
    - Context: Daily trend, Relative Strength vs NIFTY, Intraday Momentum.
    """
    df = validate_candles(candles, min_required=31)
    if df is None:
        return {
            "symbol": symbol,
            "company": company,
            "status": "NO SIGNAL",
            "potential_direction": None,
            "current_price": 0.0,
            "day_change_percent": 0.0,
            "entry": None,
            "stop_loss": None,
            "target": None,
            "risk_reward": f"1:{risk_reward_ratio:g}",
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
            "reason": "Insufficient completed candles for analysis."
        }

    # Calculate SMAs
    df["sma6"] = calculate_sma(df["close"], 6)
    df["sma30"] = calculate_sma(df["close"], 30)

    latest_candle = df.iloc[-1]
    prev_candle = df.iloc[-2]

    curr_close = float(latest_candle["close"])
    curr_sma6 = float(latest_candle["sma6"])
    curr_sma30 = float(latest_candle["sma30"])
    prev_sma6 = float(prev_candle["sma6"])
    prev_sma30 = float(prev_candle["sma30"])

    latest_ts_raw = latest_candle["timestamp"]
    if hasattr(latest_candle["dt"], "strftime"):
        signal_time = latest_candle["dt"].strftime("%Y-%m-%d %H:%M")
    else:
        signal_time = str(latest_ts_raw)

    # 1. Indicator calculations
    vol_metrics = calculate_volume_metrics(df, lookback=20)
    momentum_pct, ref_price = calculate_intraday_momentum(df)
    swing_levels = calculate_swing_levels(df, lookback=15)
    day_pct = calculate_day_change_percent(df)

    # Daily trend calculation
    daily_trend_info = {"daily_trend": "NEUTRAL", "daily_sma6": 0.0, "daily_sma30": 0.0}
    if daily_candles and len(daily_candles) >= 30:
        daily_df = validate_candles(daily_candles, min_required=30)
        if daily_df is not None:
            daily_trend_info = calculate_daily_trend(daily_df)

    # Relative strength vs NIFTY
    rel_strength = 0.0
    if benchmark_candles and len(benchmark_candles) >= 2:
        benchmark_df = validate_candles(benchmark_candles, min_required=2)
        if benchmark_df is not None:
            rel_strength = calculate_relative_strength(df, benchmark_df)

    # Crossover detection across historical completed candles
    crossovers = find_crossover_events(df)
    latest_crossover = crossovers[-1] if crossovers else None
    crossover_time = latest_crossover["timestamp"] if latest_crossover else None

    # Check if a genuine crossover occurred on the latest completed candle
    latest_crossover_is_bullish = (prev_sma6 <= prev_sma30 and curr_sma6 > curr_sma30)
    latest_crossover_is_bearish = (prev_sma6 >= prev_sma30 and curr_sma6 < curr_sma30)

    # Or if a recent crossover occurred in the current session (last 5 candles)
    recent_crossover_type = None
    if crossovers:
        crossover_idx = latest_crossover["index"]
        candles_since_crossover = len(df) - 1 - crossover_idx
        if candles_since_crossover <= 5:
            recent_crossover_type = latest_crossover["type"]

    is_bullish_crossover = latest_crossover_is_bullish or (recent_crossover_type == "BULLISH" and curr_sma6 > curr_sma30)
    is_bearish_crossover = latest_crossover_is_bearish or (recent_crossover_type == "BEARISH" and curr_sma6 < curr_sma30)

    # Intraday trend determination
    if curr_sma6 > curr_sma30:
        intraday_trend = "BULLISH"
    elif curr_sma6 < curr_sma30:
        intraday_trend = "BEARISH"
    else:
        intraday_trend = "NEUTRAL"

    # Price action confirmation
    prev_high = float(prev_candle["high"])
    prev_low = float(prev_candle["low"])
    swing_high = swing_levels["swing_high"]
    swing_low = swing_levels["swing_low"]

    bullish_price_action = (curr_close > prev_high) or (curr_close >= swing_high)
    bearish_price_action = (curr_close < prev_low) or (curr_close <= swing_low)

    # Volume confirmation
    volume_ratio = vol_metrics["volume_ratio"]
    volume_confirmed = volume_ratio >= volume_multiplier

    # Momentum confirmation
    bullish_momentum = momentum_pct > 0.0
    bearish_momentum = momentum_pct < 0.0

    # Price above / below SMA30
    price_above_sma30 = curr_close > curr_sma30
    price_below_sma30 = curr_close < curr_sma30

    # ----------------- Condition Evaluation -----------------
    status = "NO SIGNAL"
    potential_direction = None
    reason = "No confirmed crossover or setup developing."
    score = 0
    contributing_factors: List[str] = []

    # BUY Check (All 5 conditions)
    if is_bullish_crossover and price_above_sma30 and bullish_momentum and volume_confirmed and bullish_price_action:
        status = "BUY"
        potential_direction = "BUY"
        reason = (
            f"Confirmed BUY setup: Bullish SMA crossover, Price > SMA30, "
            f"Momentum +{momentum_pct:.2f}%, Volume {volume_ratio:.2f}x (>= {volume_multiplier}x), "
            f"Price action confirmed (Close ₹{curr_close:.2f} > Prev High ₹{prev_high:.2f})."
        )
    # SELL Check (All 5 conditions)
    elif is_bearish_crossover and price_below_sma30 and bearish_momentum and volume_confirmed and bearish_price_action:
        status = "SELL"
        potential_direction = "SELL"
        reason = (
            f"Confirmed SELL setup: Bearish SMA crossover, Price < SMA30, "
            f"Momentum {momentum_pct:.2f}%, Volume {volume_ratio:.2f}x (>= {volume_multiplier}x), "
            f"Price action confirmed (Close ₹{curr_close:.2f} < Prev Low ₹{prev_low:.2f})."
        )
    # WATCH Setup: Bullish Developing
    elif is_bullish_crossover and price_above_sma30 and bullish_momentum:
        status = "WATCH"
        potential_direction = "BUY"
        missing_reasons = []
        if not volume_confirmed:
            missing_reasons.append(
                f"Waiting for volume confirmation (Required: {volume_multiplier:.2f}x, Current: {volume_ratio:.2f}x)"
            )
        if not bullish_price_action:
            missing_reasons.append(
                f"Waiting for breakout confirmation (Close ₹{curr_close:.2f} <= Prev High ₹{prev_high:.2f})"
            )
        reason = "Potential BUY: " + "; ".join(missing_reasons)
    # WATCH Setup: Bearish Developing
    elif is_bearish_crossover and price_below_sma30 and bearish_momentum:
        status = "WATCH"
        potential_direction = "SELL"
        missing_reasons = []
        if not volume_confirmed:
            missing_reasons.append(
                f"Waiting for volume confirmation (Required: {volume_multiplier:.2f}x, Current: {volume_ratio:.2f}x)"
            )
        if not bearish_price_action:
            missing_reasons.append(
                f"Waiting for breakdown confirmation (Close ₹{curr_close:.2f} >= Prev Low ₹{prev_low:.2f})"
            )
        reason = "Potential SELL: " + "; ".join(missing_reasons)

    # ----------------- Analytical Levels (Entry, SL, Target) -----------------
    entry: Optional[float] = None
    stop_loss: Optional[float] = None
    target: Optional[float] = None

    if status == "BUY" or (status == "WATCH" and potential_direction == "BUY"):
        # Entry level: Previous Candle High or current close breakout
        entry = round(max(prev_high, curr_close), 2)
        # Stop loss: Swing low with buffer
        stop_loss = round(swing_levels["sl_buy"], 2)
        if stop_loss >= entry:
            # Fallback to 0.75% below entry if swing low is at or above entry
            stop_loss = round(entry * 0.9925, 2)
        risk = max(entry - stop_loss, entry * 0.005)
        target = round(entry + (risk * risk_reward_ratio), 2)

    elif status == "SELL" or (status == "WATCH" and potential_direction == "SELL"):
        # Entry level: Previous Candle Low
        entry = round(min(prev_low, curr_close), 2)
        # Stop loss: Swing high with buffer
        stop_loss = round(swing_levels["sl_sell"], 2)
        if stop_loss <= entry:
            stop_loss = round(entry * 1.0075, 2)
        risk = max(stop_loss - entry, entry * 0.005)
        target = round(entry - (risk * risk_reward_ratio), 2)

    # ----------------- Signal Strength Scoring (0 to 100) -----------------
    # Objective weights:
    # Bullish/Bearish SMA crossover:       +20
    # Price confirmed vs SMA30:            +15
    # Volume >= multiplier:                +20
    # Positive/negative momentum:          +15
    # Price-action confirmation:           +15
    # Daily trend alignment:               +10
    # Relative strength alignment:          +5
    # Total =                             100

    if potential_direction == "BUY" or (intraday_trend == "BULLISH" and status == "NO SIGNAL"):
        if is_bullish_crossover:
            score += 20
            contributing_factors.append("Bullish Crossover (+20)")
        if price_above_sma30:
            score += 15
            contributing_factors.append("Price > SMA30 (+15)")
        if volume_confirmed:
            score += 20
            contributing_factors.append(f"Volume {volume_ratio:.2f}x >= {volume_multiplier}x (+20)")
        if bullish_momentum:
            score += 15
            contributing_factors.append(f"Positive Momentum +{momentum_pct:.2f}% (+15)")
        if bullish_price_action:
            score += 15
            contributing_factors.append("Breakout Confirmed (+15)")
        if daily_trend_info["daily_trend"] == "BULLISH":
            score += 10
            contributing_factors.append("Daily Trend Bullish (+10)")
        if rel_strength > 0:
            score += 5
            contributing_factors.append(f"Outperforming NIFTY +{rel_strength:.2f}% (+5)")

    elif potential_direction == "SELL" or (intraday_trend == "BEARISH" and status == "NO SIGNAL"):
        if is_bearish_crossover:
            score += 20
            contributing_factors.append("Bearish Crossover (+20)")
        if price_below_sma30:
            score += 15
            contributing_factors.append("Price < SMA30 (+15)")
        if volume_confirmed:
            score += 20
            contributing_factors.append(f"Volume {volume_ratio:.2f}x >= {volume_multiplier}x (+20)")
        if bearish_momentum:
            score += 15
            contributing_factors.append(f"Negative Momentum {momentum_pct:.2f}% (+15)")
        if bearish_price_action:
            score += 15
            contributing_factors.append("Breakdown Confirmed (+15)")
        if daily_trend_info["daily_trend"] == "BEARISH":
            score += 10
            contributing_factors.append("Daily Trend Bearish (+10)")
        if rel_strength < 0:
            score += 5
            contributing_factors.append(f"Underperforming NIFTY {rel_strength:.2f}% (+5)")

    # Bound score
    score = max(0, min(100, score))

    return {
        "symbol": symbol,
        "company": company,
        "status": status,
        "potential_direction": potential_direction,
        "current_price": round(curr_close, 2),
        "day_change_percent": day_pct,
        "entry": entry,
        "stop_loss": stop_loss,
        "target": target,
        "risk_reward": f"1:{risk_reward_ratio:g}",
        "signal_strength": score,
        "sma6": round(curr_sma6, 2),
        "sma30": round(curr_sma30, 2),
        "volume": vol_metrics["current_volume"],
        "average_volume": vol_metrics["average_volume"],
        "volume_ratio": volume_ratio,
        "momentum_percent": momentum_pct,
        "daily_trend": daily_trend_info["daily_trend"],
        "intraday_trend": intraday_trend,
        "relative_strength": rel_strength,
        "crossover_time": crossover_time,
        "signal_time": signal_time,
        "reason": reason,
        "contributing_factors": contributing_factors,
        "is_top_active": is_top_active
    }
