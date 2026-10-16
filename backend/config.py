import os
import secrets
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field
from cryptography.fernet import Fernet

class Settings(BaseSettings):

    # Admin Single Login Credentials
    ADMIN_USERNAME: str = Field(default="suriyaprakash", description="Admin login username")
    ADMIN_PASSWORD: str = Field(default="master730", description="Admin login password")

    # Database
    DATABASE_URL: str = Field(default="sqlite:///./scanner.db", description="Database connection URL")

    # Security & Sessions
    SESSION_SECRET_KEY: str = Field(default="dev-secret-key-change-in-production-1234567890", description="Cookie session secret")
    ENCRYPTION_KEY: str = Field(default="", description="Fernet 32-byte urlsafe base64 key for encrypting stored access tokens")

    # CORS & Deployment
    FRONTEND_URL: str = Field(default="http://localhost:5173", description="Frontend origin for CORS")
    ALLOWED_ORIGINS: str = Field(
        default="http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,https://localhost,capacitor://localhost,http://localhost",
        description="Comma-separated allowed origins (includes web and Capacitor mobile origins)"
    )

    ENVIRONMENT: str = Field(default="development", description="Application environment")
    DELETE_RESULTS_AFTER_SCAN: bool = Field(default=False, description="Whether to delete older scan results after retrieval")
    SCAN_CONCURRENCY: int = Field(default=8, description="Concurrent API requests for historical candles")
    INCLUDE_CURRENT_DAY_CANDLE: bool = Field(default=True, description="Take current day candle into account")

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

def reload_settings() -> Settings:
    global settings
    settings = Settings()
    if settings.DATABASE_URL.startswith("postgres://"):
        settings.DATABASE_URL = settings.DATABASE_URL.replace("postgres://", "postgresql://", 1)
    return settings

# Normalize PostgreSQL URL for Render (postgres:// -> postgresql://)
if settings.DATABASE_URL.startswith("postgres://"):
    settings.DATABASE_URL = settings.DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Ensure encryption key is valid Fernet key
def get_fernet_cipher() -> Fernet:
    key = settings.ENCRYPTION_KEY.strip()
    if not key:
        # Fallback deterministic key based on SESSION_SECRET_KEY if not provided in dev
        import base64
        import hashlib
        derived = hashlib.sha256(settings.SESSION_SECRET_KEY.encode()).digest()
        key = base64.urlsafe_b64encode(derived).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)
