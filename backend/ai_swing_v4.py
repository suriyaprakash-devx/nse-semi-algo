# =========================================================
# AI SWING TRADING SYSTEM v4.0
# =========================================================
# pip install yfinance ta xgboost scikit-learn joblib
# =========================================================

import yfinance as yf
import pandas as pd
import numpy as np
import datetime

from ta.momentum  import RSIIndicator, StochasticOscillator
from ta.trend     import EMAIndicator, MACD, ADXIndicator
from ta.volatility import AverageTrueRange, BollingerBands

from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics         import accuracy_score
from xgboost                 import XGBClassifier

# =========================================================
# SETTINGS
# =========================================================

SWING_DAYS       = 5      # Predict rise over next N trading days
BUY_PROB_MIN     = 65     # Min AI confidence to consider BUY
AVOID_PROB_MAX   = 38     # Below this = AVOID
MIN_RR           = 1.8    # Minimum Risk/Reward ratio
ATR_SL_MULT      = 1.5    # Stoploss  = ATR * this
ATR_TG_MULT      = 3.0    # Target    = ATR * this
N_SPLITS         = 5      # TimeSeriesSplit folds

# =========================================================
# INPUT
# =========================================================

print("\n======== AI SWING TRADING SYSTEM v4.0 ========\n")
print("Examples: RELIANCE  TCS  HDFCBANK  INFY  ICICIBANK\n")

company = input("Enter NSE Symbol: ").upper()
stock   = company + ".NS"

# =========================================================
# DOWNLOAD DATA
# =========================================================

print("\nDownloading data...\n")

try:
    df     = yf.download(stock,  period="5y", interval="1d", auto_adjust=True, progress=False)
    nifty  = yf.download("^NSEI", period="5y", interval="1d", auto_adjust=True, progress=False)
    df_wk  = yf.download(stock,  period="5y", interval="1wk", auto_adjust=True, progress=False)
except Exception as e:
    print("Download Error:", e)
    exit()

for label, frame in [("Stock Daily", df), ("NIFTY", nifty), ("Stock Weekly", df_wk)]:
    if frame.empty:
        print(f"{label} data not found. Exiting.")
        exit()

# =========================================================
# FIX COLUMNS
# =========================================================

df.columns     = df.columns.get_level_values(0)
nifty.columns  = nifty.columns.get_level_values(0)
df_wk.columns  = df_wk.columns.get_level_values(0)

# =========================================================
# MAIN SERIES
# =========================================================

close  = df["Close"].squeeze()
high   = df["High"].squeeze()
low    = df["Low"].squeeze()
volume = df["Volume"].squeeze()

# =========================================================
# RSI
# =========================================================

df["RSI"] = RSIIndicator(close, window=14).rsi()

# =========================================================
# EMA  —  store raw for signal checks
# =========================================================

df["EMA20"]  = EMAIndicator(close, window=20).ema_indicator()
df["EMA50"]  = EMAIndicator(close, window=50).ema_indicator()
df["EMA200"] = EMAIndicator(close, window=200).ema_indicator()

# EMA distance % — normalized, much better as ML features
df["DIST_EMA20"]  = (close - df["EMA20"])  / df["EMA20"]  * 100
df["DIST_EMA50"]  = (close - df["EMA50"])  / df["EMA50"]  * 100
df["DIST_EMA200"] = (close - df["EMA200"]) / df["EMA200"] * 100

# =========================================================
# MACD
# =========================================================

macd          = MACD(close)
df["MACD"]    = macd.macd()
df["MACDH"]   = macd.macd_diff()
df["MACDS"]   = macd.macd_signal()

# =========================================================
# ADX  (+DI / -DI for directional bias)
# =========================================================

adx_ind        = ADXIndicator(high, low, close, window=14)
df["ADX"]      = adx_ind.adx()
df["ADX_POS"]  = adx_ind.adx_pos()
df["ADX_NEG"]  = adx_ind.adx_neg()

# =========================================================
# ATR
# =========================================================

df["ATR"] = AverageTrueRange(high, low, close, window=14).average_true_range()

# =========================================================
# BOLLINGER BANDS
# =========================================================

bb              = BollingerBands(close, window=20, window_dev=2)
df["BB_WIDTH"]  = (bb.bollinger_hband() - bb.bollinger_lband()) / bb.bollinger_mavg() * 100
df["BB_POS"]    = (close - bb.bollinger_lband()) / (bb.bollinger_hband() - bb.bollinger_lband())

# =========================================================
# STOCHASTIC
# =========================================================

stoch          = StochasticOscillator(high, low, close, window=14, smooth_window=3)
df["STOCH_K"]  = stoch.stoch()
df["STOCH_D"]  = stoch.stoch_signal()

# =========================================================
# VOLUME FEATURES
# =========================================================

df["VOL_AVG20"] = volume.rolling(20).mean()
df["VOL_RATIO"] = volume / df["VOL_AVG20"]   # >1.5 = volume surge

# =========================================================
# RELATIVE STRENGTH vs NIFTY  (aligned safely)
# =========================================================

nifty_close = nifty["Close"].squeeze().reindex(df.index, method="ffill")

df["RS_20"]  = close.pct_change(20)  - nifty_close.pct_change(20)
df["RS_5"]   = close.pct_change(5)   - nifty_close.pct_change(5)

# =========================================================
# MOMENTUM
# =========================================================

df["MOM_5"]  = close.pct_change(5)
df["MOM_20"] = close.pct_change(20)

# =========================================================
# SUPERTREND  (proper implementation)
# =========================================================

def supertrend(df, period=10, multiplier=3):
    hl2  = (df["High"] + df["Low"]) / 2
    atr  = AverageTrueRange(
        high=df["High"], low=df["Low"], close=df["Close"], window=period
    ).average_true_range()

    upper = hl2 + multiplier * atr
    lower = hl2 - multiplier * atr

    st = [True]  # True = bullish
    for i in range(1, len(df)):
        c = df["Close"].iloc[i]
        if   c > upper.iloc[i - 1]: st.append(True)
        elif c < lower.iloc[i - 1]: st.append(False)
        else:                        st.append(st[i - 1])

    return pd.Series(st, index=df.index, dtype=int)  # 1=bull, 0=bear

df["SUPERTREND"] = supertrend(df)

# =========================================================
# WEEKLY TREND  (multi-timeframe)
# =========================================================

wk_close = df_wk["Close"].squeeze()
df_wk["EMA20"] = EMAIndicator(wk_close, window=20).ema_indicator()
df_wk["EMA50"] = EMAIndicator(wk_close, window=50).ema_indicator()
df_wk.dropna(inplace=True)

weekly_trend = "BULLISH" if df_wk["EMA20"].iloc[-1] > df_wk["EMA50"].iloc[-1] else "BEARISH"

# =========================================================
# TARGET  (did price rise in next SWING_DAYS?)
# =========================================================

df["Target"] = (close.shift(-SWING_DAYS) > close).astype(int)

# =========================================================
# CLEAN
# =========================================================

df.dropna(inplace=True)

# =========================================================
# FEATURE SET
# =========================================================

FEATURES = [
    "RSI",
    "DIST_EMA20", "DIST_EMA50", "DIST_EMA200",   # normalized EMAs
    "MACD", "MACDH", "MACDS",
    "ADX", "ADX_POS", "ADX_NEG",
    "ATR",
    "BB_WIDTH", "BB_POS",
    "STOCH_K", "STOCH_D",
    "VOL_RATIO",
    "RS_20", "RS_5",
    "MOM_5", "MOM_20",
    "SUPERTREND"
]

X = df[FEATURES]
y = df["Target"]

# =========================================================
# TIMESERIES CROSS-VALIDATION
# =========================================================

print("Running TimeSeriesSplit cross-validation...\n")

tscv = TimeSeriesSplit(n_splits=N_SPLITS)

model = XGBClassifier(
    n_estimators      = 200,
    max_depth         = 3,        # shallow = less overfit
    learning_rate     = 0.03,
    subsample         = 0.8,
    colsample_bytree  = 0.8,
    min_child_weight  = 5,        # prevents learning noise
    gamma             = 0.2,      # extra regularization
    random_state      = 42,
    eval_metric       = "logloss"
)

fold_scores = []

for fold, (train_idx, test_idx) in enumerate(tscv.split(X), 1):
    model.fit(
        X.iloc[train_idx], y.iloc[train_idx],
        eval_set=[(X.iloc[test_idx], y.iloc[test_idx])],
        verbose=False
    )
    pred = model.predict(X.iloc[test_idx])
    sc   = accuracy_score(y.iloc[test_idx], pred)
    fold_scores.append(sc)
    print(f"  Fold {fold} Accuracy: {sc*100:.2f}%")

avg_accuracy = np.mean(fold_scores)
std_accuracy = np.std(fold_scores)

# Final fit on all data
model.fit(X, y)

# =========================================================
# BACKTESTING  (walk-forward on last 20% of data)
# =========================================================

backtest_start = int(len(df) * 0.80)
bt_df          = df.iloc[backtest_start:].copy()
bt_X           = X.iloc[backtest_start:]
bt_probs       = model.predict_proba(bt_X)[:, 1] * 100

bt_df["BT_PROB"]   = bt_probs
bt_df["BT_SIGNAL"] = np.where(bt_df["BT_PROB"] > BUY_PROB_MIN, 1, 0)

# Simulate trades
wins, losses, profits = 0, 0, []

for i in range(len(bt_df) - SWING_DAYS):
    if bt_df["BT_SIGNAL"].iloc[i] == 1:
        entry  = float(bt_df["Close"].iloc[i])
        future = float(bt_df["Close"].iloc[i + SWING_DAYS])
        ret    = (future - entry) / entry * 100
        profits.append(ret)
        if future > entry: wins  += 1
        else:              losses += 1

total_trades  = wins + losses
win_rate      = (wins / total_trades * 100) if total_trades > 0 else 0
avg_profit    = np.mean(profits)             if profits else 0
avg_win       = np.mean([p for p in profits if p > 0]) if any(p > 0 for p in profits) else 0
avg_loss      = np.mean([p for p in profits if p < 0]) if any(p < 0 for p in profits) else 0
profit_factor = abs(avg_win / avg_loss)     if avg_loss != 0 else 0

# Max Drawdown
cum_returns   = np.cumsum(profits)
peak          = np.maximum.accumulate(cum_returns)
drawdowns     = cum_returns - peak
max_drawdown  = float(np.min(drawdowns)) if len(drawdowns) > 0 else 0

# =========================================================
# LATEST PREDICTION
# =========================================================

latest       = X.iloc[-1:]
prob         = float(model.predict_proba(latest)[0][1] * 100)

price        = float(close.iloc[-1])
atr_val      = float(df["ATR"].iloc[-1])
rsi_val      = float(df["RSI"].iloc[-1])
adx_val      = float(df["ADX"].iloc[-1])
ema20_val    = float(df["EMA20"].iloc[-1])
ema50_val    = float(df["EMA50"].iloc[-1])
ema200_val   = float(df["EMA200"].iloc[-1])
st_bull      = bool(df["SUPERTREND"].iloc[-1])
vol_ratio    = float(df["VOL_RATIO"].iloc[-1])
rs_20        = float(df["RS_20"].iloc[-1])
macdh_val    = float(df["MACDH"].iloc[-1])

sl  = price - (ATR_SL_MULT * atr_val)
tg  = price + (ATR_TG_MULT * atr_val)
rr  = (tg - price) / (price - sl) if (price - sl) > 0 else 0

# =========================================================
# SIGNAL LOGIC  (multi-condition confirmation)
# =========================================================

signal = "WAIT"

# --- BUY conditions ---
buy_conditions = [
    prob > BUY_PROB_MIN,             # AI confident
    rr   > MIN_RR,                   # Good risk/reward
    adx_val > 20,                    # Trend exists
    rsi_val > 45 and rsi_val < 72,  # Not overbought
    st_bull,                         # Supertrend bullish
    macdh_val > 0,                   # MACD momentum positive
    weekly_trend == "BULLISH",       # Weekly aligned
    price > ema20_val,               # Above short EMA
]

# --- AVOID conditions ---
avoid_conditions = [
    prob < AVOID_PROB_MAX,
    price < ema200_val,              # Below 200 EMA = danger zone
    adx_val < 15,                    # No trend at all
    weekly_trend == "BEARISH",
]

buy_score    = sum(buy_conditions)
avoid_score  = sum(avoid_conditions)

if buy_score >= 6:        signal = "STRONG BUY"
elif buy_score >= 4:      signal = "BUY"
elif avoid_score >= 3:    signal = "AVOID"
else:                     signal = "WAIT"

# Hold period estimate
if   adx_val > 40: hold_days = 3
elif adx_val > 25: hold_days = 5
else:              hold_days = 8

# =========================================================
# OUTPUT
# =========================================================

print(f"\n{'='*50}")
print(f"  SWING ANALYSIS: {company}")
print(f"{'='*50}")
print(f"  Date          : {datetime.date.today()}")
print(f"  Price         : {price:.2f}")

print(f"\n--- AI SIGNAL ---")
print(f"  Probability   : {prob:.2f}%")
print(f"  Signal        : {signal}")
print(f"  Buy Checks    : {buy_score}/8 passed")

print(f"\n--- TRADE PLAN ---")
print(f"  Entry         : {price:.2f}")
print(f"  Target        : {tg:.2f}  (+{((tg-price)/price*100):.2f}%)")
print(f"  Stoploss      : {sl:.2f}  (-{((price-sl)/price*100):.2f}%)")
print(f"  Risk/Reward   : 1 : {rr:.2f}")
print(f"  Hold Period   : ~{hold_days} trading days")

print(f"\n--- INDICATORS ---")
print(f"  RSI           : {rsi_val:.2f}  {'⚠ OVERBOUGHT' if rsi_val>70 else ('⚠ OVERSOLD' if rsi_val<30 else 'OK')}")
print(f"  ADX           : {adx_val:.2f}  {'STRONG' if adx_val>25 else 'WEAK'}")
print(f"  ATR           : {atr_val:.2f}")
print(f"  EMA 20/50/200 : {ema20_val:.2f} / {ema50_val:.2f} / {ema200_val:.2f}")
print(f"  Supertrend    : {'BULLISH' if st_bull else 'BEARISH'}")
print(f"  MACD Hist     : {macdh_val:.2f}  {'POSITIVE' if macdh_val>0 else 'NEGATIVE'}")
print(f"  Vol Ratio     : {vol_ratio:.2f}x  {'SURGE' if vol_ratio>1.5 else 'NORMAL'}")
print(f"  RS vs NIFTY   : {rs_20*100:.2f}%  {'OUTPERFORMING' if rs_20>0 else 'UNDERPERFORMING'}")

print(f"\n--- MULTI TIMEFRAME ---")
print(f"  Weekly Trend  : {weekly_trend}")
print(f"  Above EMA200  : {'YES' if price > ema200_val else 'NO — HIGH RISK'}")

print(f"\n--- MODEL QUALITY ---")
print(f"  CV Accuracy   : {avg_accuracy*100:.2f}% ± {std_accuracy*100:.2f}%")

print(f"\n--- BACKTEST (last 20% data) ---")
print(f"  Total Trades  : {total_trades}")
print(f"  Win Rate      : {win_rate:.2f}%")
print(f"  Avg Profit    : {avg_profit:.2f}%")
print(f"  Profit Factor : {profit_factor:.2f}  {'GOOD' if profit_factor>1.5 else 'MARGINAL'}")
print(f"  Max Drawdown  : {max_drawdown:.2f}%")

if rr < MIN_RR:
    print(f"\n  ⚠ R/R {rr:.2f} below minimum {MIN_RR} — skip trade")
if std_accuracy > 0.08:
    print(f"  ⚠ High CV variance — model may be unstable on this stock")
if total_trades < 10:
    print(f"  ⚠ Too few backtest trades — treat results with caution")

print(f"\n{'='*50}\n")
