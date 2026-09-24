import logging
import asyncio
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import httpx
from sqlalchemy.orm import Session
from backend.config import settings
from backend.models import Signal

logger = logging.getLogger("scanner.alerts")

class BaseAlertProvider(ABC):
    """Abstract base class for all notification providers."""

    @abstractmethod
    async def send_alert(self, alert_payload: Dict[str, Any]) -> bool:
        """Dispatches an analytical alert. Must never place orders."""
        pass

class ConsoleAlertProvider(BaseAlertProvider):
    """Logs analytical alerts directly to system console and application log."""

    async def send_alert(self, alert_payload: Dict[str, Any]) -> bool:
        logger.info(
            "🔔 [ALERT - %s] %s | Price: ₹%.2f | Entry: %s | SL: %s | Target: %s | Score: %d/100",
            alert_payload.get("status"),
            alert_payload.get("symbol"),
            alert_payload.get("current_price", 0.0),
            alert_payload.get("entry"),
            alert_payload.get("stop_loss"),
            alert_payload.get("target"),
            alert_payload.get("signal_strength", 0)
        )
        return True

class TelegramAlertProvider(BaseAlertProvider):
    """Sends analytical signals to a configured Telegram channel or bot chat."""

    def __init__(self, bot_token: Optional[str] = None, chat_id: Optional[str] = None):
        self.bot_token = bot_token or settings.TELEGRAM_BOT_TOKEN
        self.chat_id = chat_id or settings.TELEGRAM_CHAT_ID

    async def send_alert(self, alert_payload: Dict[str, Any]) -> bool:
        if not self.bot_token or not self.chat_id:
            return False

        msg = (
            f"🎯 *NSE SEMI-ALGO ALERT ({alert_payload.get('status')})*\n\n"
            f"• *Symbol:* `{alert_payload.get('symbol')}`\n"
            f"• *Company:* {alert_payload.get('company')}\n"
            f"• *Timeframe:* {alert_payload.get('timeframe', '10m')}\n"
            f"• *Current Price:* ₹{alert_payload.get('current_price', 0.0):.2f}\n"
            f"• *Entry:* ₹{alert_payload.get('entry')}\n"
            f"• *Stop Loss:* ₹{alert_payload.get('stop_loss')}\n"
            f"• *Target / Exit:* ₹{alert_payload.get('target')}\n"
            f"• *Risk:Reward:* {alert_payload.get('risk_reward')}\n\n"
            f"• *SMA 6 / SMA 30:* {alert_payload.get('sma6')} / {alert_payload.get('sma30')}\n"
            f"• *Volume Ratio:* {alert_payload.get('volume_ratio')}x\n"
            f"• *Momentum:* {alert_payload.get('momentum_percent'):+.2f}%\n"
            f"• *Daily Trend:* {alert_payload.get('daily_trend')}\n"
            f"• *RS vs NIFTY:* {alert_payload.get('relative_strength'):+.2f}%\n"
            f"• *Signal Strength:* {alert_payload.get('signal_strength')}/100\n\n"
            f"⚠️ _Analysis only — no orders are placed automatically._"
        )

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.post(url, json={
                    "chat_id": self.chat_id,
                    "text": msg,
                    "parse_mode": "Markdown"
                })
                return res.status_code == 200
        except Exception as e:
            logger.warning("Failed to send Telegram alert: %s", e)
            return False

class AlertManager:
    """Manages alert dispatching and duplicate signal prevention."""

    def __init__(self):
        self.providers: List[BaseAlertProvider] = [ConsoleAlertProvider()]
        if settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID:
            self.providers.append(TelegramAlertProvider())

    def is_duplicate(
        self,
        db: Session,
        symbol: str,
        timeframe: str,
        candle_timestamp: str,
        signal_type: str
    ) -> bool:
        """
        Ensures the exact (symbol, timeframe, candle_timestamp, signal_type)
        has not already triggered an alert.
        """
        exists = (
            db.query(Signal)
            .filter(
                Signal.symbol == symbol,
                Signal.timeframe == timeframe,
                Signal.candle_timestamp == candle_timestamp,
                Signal.signal_type == signal_type
            )
            .first()
        )
        return exists is not None

    def record_signal(
        self,
        db: Session,
        symbol: str,
        timeframe: str,
        candle_timestamp: str,
        signal_type: str
    ) -> bool:
        """Records a new signal in database for deduplication."""
        try:
            sig = Signal(
                symbol=symbol,
                timeframe=timeframe,
                candle_timestamp=candle_timestamp,
                signal_type=signal_type
            )
            db.add(sig)
            db.commit()
            return True
        except Exception as e:
            db.rollback()
            logger.debug("Signal already recorded or database error: %s", e)
            return False

    async def dispatch_alert(self, db: Session, payload: Dict[str, Any]) -> bool:
        """
        Validates duplicate constraint, records signal, and dispatches to providers.
        Only dispatches for BUY, SELL, or WATCH.
        """
        status = payload.get("status")
        if status not in ("BUY", "SELL", "WATCH"):
            return False

        symbol = payload.get("symbol", "")
        timeframe = payload.get("timeframe", "10m")
        candle_ts = payload.get("signal_time") or payload.get("crossover_time") or "now"

        # Duplicate check
        if self.is_duplicate(db, symbol, timeframe, candle_ts, status):
            logger.debug("Duplicate alert prevented for %s %s %s %s", symbol, timeframe, candle_ts, status)
            return False

        # Record in DB
        self.record_signal(db, symbol, timeframe, candle_ts, status)

        # Dispatch concurrently to all active providers
        tasks = [provider.send_alert(payload) for provider in self.providers]
        await asyncio.gather(*tasks, return_exceptions=True)
        return True

alert_manager = AlertManager()
