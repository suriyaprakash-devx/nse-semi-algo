import pytest
import pandas as pd
from datetime import datetime, timezone
import pytz
from unittest.mock import patch, MagicMock

from backend.market_data import MarketDataClient

KOLKATA_TZ = pytz.timezone("Asia/Kolkata")

def test_market_status():
    client = MarketDataClient()
    status = client.get_market_status()
    assert "is_open" in status
    assert "status" in status
    assert status["status"] in ("OPEN", "CLOSED")
    assert "09:15" in status["market_hours"]
    assert status["timezone"] == "Asia/Kolkata"

def test_resample_to_10m():
    client = MarketDataClient()
    # 5-minute bars starting at 09:15
    dates = pd.date_range("2026-09-24 09:15:00", periods=70, freq="5min", tz="Asia/Kolkata")
    df = pd.DataFrame({
        "Open": [100.0 + i for i in range(70)],
        "High": [105.0 + i for i in range(70)],
        "Low": [95.0 + i for i in range(70)],
        "Close": [101.0 + i for i in range(70)],
        "Volume": [1000] * 70
    }, index=dates)

    candles_10m = client._resample_to_10m(df)
    assert len(candles_10m) == 35  # 70 5-min bars -> 35 10-min candles
    assert candles_10m[0]["volume"] == 2000  # Sum of two 5-min volumes

@patch("yfinance.download")
def test_fetch_batch_candles_mocked(mock_yf_download):
    # Mock yfinance return
    dates = pd.date_range("2026-09-24 09:15:00", periods=70, freq="5min", tz="Asia/Kolkata")
    mock_df = pd.DataFrame({
        "Open": [100.0] * 70,
        "High": [105.0] * 70,
        "Low": [95.0] * 70,
        "Close": [102.0] * 70,
        "Volume": [1000] * 70
    }, index=dates)

    mock_yf_download.return_value = mock_df

    client = MarketDataClient()
    res = client._download_sync(["RELIANCE.NS"], period="7d", interval="10m")
    assert "RELIANCE.NS" in res
    assert len(res["RELIANCE.NS"]) == 35
