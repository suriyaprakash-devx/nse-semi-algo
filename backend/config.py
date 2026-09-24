import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Application & Environment
    SECRET_KEY: str = "nse_semi_algo_secret_key_32bytes_minimum!"
    FRONTEND_URL: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"

    # Database
    DATABASE_URL: Optional[str] = None
    DELETE_RESULTS_AFTER_SCAN: bool = False

    # Scanner Strategy Configuration
    SCAN_INTERVAL_MINUTES: int = 10
    DEFAULT_TIMEFRAME: str = "10m"  # 5m, 10m, 15m
    DEFAULT_VOLUME_MULTIPLIER: float = 1.5
    DEFAULT_VOLUME_LOOKBACK: int = 20
    DEFAULT_RISK_REWARD: float = 2.0  # 1.5, 2.0, 3.0
    MAX_STOCKS: int = 200
    MAX_WORKERS: int = 5

    # Lookback & Cache settings
    LOOKBACK_DAYS_INTRADAY: str = "7d"
    LOOKBACK_DAYS_DAILY: str = "60d"
    CACHE_TTL_SECONDS: int = 120

    # Optional Telegram Alerts
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None

    # Benchmark ticker
    BENCHMARK_TICKER: str = "^NSEI"

    # Storage paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_DIR: Path = Path(__file__).resolve().parent.parent / "data"

    @property
    def normalized_database_url(self) -> str:
        if not self.DATABASE_URL:
            self.DATA_DIR.mkdir(parents=True, exist_ok=True)
            sqlite_path = self.DATA_DIR / "nse_scanner.db"
            return f"sqlite:///{sqlite_path}"
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url

settings = Settings()
