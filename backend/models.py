from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, ForeignKey, Index, Text, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class ScanRun(Base):
    __tablename__ = "scan_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime, nullable=True)
    timeframe = Column(String(16), default="10m", nullable=False)
    stocks_selected = Column(Integer, default=200, nullable=False)
    stocks_scanned = Column(Integer, default=0, nullable=False)
    buy_count = Column(Integer, default=0, nullable=False)
    sell_count = Column(Integer, default=0, nullable=False)
    watch_count = Column(Integer, default=0, nullable=False)
    no_signal_count = Column(Integer, default=0, nullable=False)
    status = Column(String(32), default="RUNNING", nullable=False)  # RUNNING, COMPLETED, STOPPED, FAILED
    error_message = Column(Text, nullable=True)

    results = relationship("ScanResult", back_populates="scan_run", cascade="all, delete-orphan")

class ScanResult(Base):
    __tablename__ = "scan_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scan_id = Column(Integer, ForeignKey("scan_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    rank = Column(Integer, nullable=False)
    symbol = Column(String(32), index=True, nullable=False)
    company = Column(String(256), nullable=False)
    status = Column(String(16), nullable=False)  # BUY, SELL, WATCH, NO SIGNAL
    potential_direction = Column(String(16), nullable=True)  # BUY, SELL, or None
    current_price = Column(Float, nullable=False)
    day_change_percent = Column(Float, default=0.0, nullable=False)
    entry = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    target = Column(Float, nullable=True)
    risk_reward = Column(String(16), default="1:2", nullable=False)
    signal_strength = Column(Integer, default=0, nullable=False)
    sma6 = Column(Float, nullable=False)
    sma30 = Column(Float, nullable=False)
    volume = Column(Integer, default=0, nullable=False)
    average_volume = Column(Float, default=0.0, nullable=False)
    volume_ratio = Column(Float, default=0.0, nullable=False)
    momentum_percent = Column(Float, default=0.0, nullable=False)
    daily_trend = Column(String(16), default="NEUTRAL", nullable=False)  # BULLISH, BEARISH, NEUTRAL
    intraday_trend = Column(String(16), default="NEUTRAL", nullable=False)  # BULLISH, BEARISH, NEUTRAL
    relative_strength = Column(Float, default=0.0, nullable=False)  # RS vs NIFTY
    crossover_time = Column(String(32), nullable=True)
    signal_time = Column(String(32), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    scan_run = relationship("ScanRun", back_populates="results")

    __table_args__ = (
        Index("ix_scan_results_scan_rank", "scan_id", "rank"),
    )

class Signal(Base):
    __tablename__ = "signals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(32), nullable=False)
    timeframe = Column(String(16), nullable=False)
    candle_timestamp = Column(String(32), nullable=False)
    signal_type = Column(String(16), nullable=False)  # BUY, SELL, WATCH
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("symbol", "timeframe", "candle_timestamp", "signal_type", name="uq_signal_identity"),
        Index("ix_signals_lookup", "symbol", "timeframe", "candle_timestamp"),
    )
