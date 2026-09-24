import pytest
from datetime import datetime, timezone
from backend.database import SessionLocal, init_db
from backend.models import Signal
from backend.alerts import alert_manager
from backend.scanner import scanner_state

def test_duplicate_signal_prevention():
    init_db()
    db = SessionLocal()
    try:
        # First signal should record successfully
        recorded_first = alert_manager.record_signal(
            db=db,
            symbol="INFY",
            timeframe="10m",
            candle_timestamp="2026-09-24 10:30",
            signal_type="BUY"
        )
        assert recorded_first is True

        # Checking duplicate must return True
        is_dup = alert_manager.is_duplicate(
            db=db,
            symbol="INFY",
            timeframe="10m",
            candle_timestamp="2026-09-24 10:30",
            signal_type="BUY"
        )
        assert is_dup is True

        # Second recording attempt with same identity should fail (or return False)
        recorded_second = alert_manager.record_signal(
            db=db,
            symbol="INFY",
            timeframe="10m",
            candle_timestamp="2026-09-24 10:30",
            signal_type="BUY"
        )
        assert recorded_second is False

        # Different timestamp or signal type should not be duplicate
        is_dup_diff_time = alert_manager.is_duplicate(
            db=db,
            symbol="INFY",
            timeframe="10m",
            candle_timestamp="2026-09-24 10:40",
            signal_type="BUY"
        )
        assert is_dup_diff_time is False

    finally:
        # Clean up test entry
        db.query(Signal).filter(Signal.symbol == "INFY").delete()
        db.commit()
        db.close()

def test_scanner_state_to_dict():
    scanner_state.is_running = True
    scanner_state.stage = "Testing"
    scanner_state.stocks_scanned = 50
    scanner_state.total_stocks = 200
    scanner_state.progress_pct = 25.0
    scanner_state.log("Test log entry")

    d = scanner_state.to_dict()
    assert d["is_running"] is True
    assert d["stage"] == "Testing"
    assert d["stocks_scanned"] == 50
    assert d["total_stocks"] == 200
    assert d["progress_pct"] == 25.0
    assert len(d["logs"]) > 0

    # Reset
    scanner_state.is_running = False
    scanner_state.stage = "Idle"
