import logging
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from backend.config import settings
from backend.database import get_db
from backend.models import OAuthSession

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])

SESSION_COOKIE_NAME = "sma_session_id"

def is_expired(dt: Optional[datetime]) -> bool:
    if not dt:
        return False
    if dt.tzinfo is not None:
        return dt < datetime.now(timezone.utc)
    return dt < datetime.now(timezone.utc).replace(tzinfo=None)

def get_session_id_from_request(request: Request) -> Optional[str]:
    # 1. Check HTTP-only cookie
    session_id = request.cookies.get(SESSION_COOKIE_NAME)
    if session_id:
        return session_id
    # 2. Check X-Session-ID header
    session_id = request.headers.get("X-Session-ID")
    if session_id:
        return session_id
    # 3. Check Authorization Bearer header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1].strip()
    # 4. Check query param if provided
    return request.query_params.get("session_id")

def get_current_session(
    request: Request,
    db: Session = Depends(get_db)
) -> OAuthSession:
    session_id = get_session_id_from_request(request)
    if not session_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in."
        )

    session = db.query(OAuthSession).filter(
        OAuthSession.id == session_id,
        OAuthSession.is_active == True
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session invalid or expired. Please log in again."
        )

    if is_expired(session.expires_at):
        session.is_active = False
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again."
        )

    return session

def get_current_session_optional(
    request: Request,
    db: Session = Depends(get_db)
) -> Optional[OAuthSession]:
    try:
        return get_current_session(request, db)
    except HTTPException:
        return None

def get_active_access_token(session: OAuthSession) -> str:
    return session.encrypted_access_token or ""

class LoginRequest(BaseModel):
    username: str
    password: str

@router.post("/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    """
    Single username & password login for the terminal:
    Username: suriyaprakash
    Password: master730
    """
    clean_user = payload.username.strip().lower()
    raw_pass = payload.password.strip()

    expected_user = settings.ADMIN_USERNAME.strip().lower()
    expected_pass = settings.ADMIN_PASSWORD.strip()

    if clean_user != expected_user or raw_pass != expected_pass:
        logger.warning(f"Failed login attempt for user: '{clean_user}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password. Please verify your credentials."
        )

    # Invalidate old sessions for this user
    db.query(OAuthSession).filter(
        OAuthSession.user_id == settings.ADMIN_USERNAME,
        OAuthSession.is_active == True
    ).update({"is_active": False})

    # Create new session valid for 30 days
    session_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(days=30)

    new_session = OAuthSession(
        id=session_id,
        user_id=settings.ADMIN_USERNAME,
        user_name=settings.ADMIN_USERNAME,
        email="suriyaprakash@terminal.local",
        encrypted_access_token="session_token_" + session_id,
        is_active=True,
        expires_at=expires_at
    )
    db.add(new_session)
    db.commit()
    db.refresh(new_session)

    # Set secure cookie
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        max_age=30 * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.DATABASE_URL.startswith("postgresql")
    )

    logger.info(f"User {settings.ADMIN_USERNAME} logged in successfully. Session created.")

    return {
        "authenticated": True,
        "token": session_id,
        "session_id": session_id,
        "user_id": settings.ADMIN_USERNAME,
        "user_name": settings.ADMIN_USERNAME,
        "expires_at": expires_at.isoformat(),
        "message": f"Welcome back, {settings.ADMIN_USERNAME}!"
    }

@router.get("/status")
@router.get("/me")
def auth_status(request: Request, db: Session = Depends(get_db)):
    """
    Returns current login status and user identity.
    """
    session = get_current_session_optional(request, db)
    if session:
        return {
            "authenticated": True,
            "configured": True,
            "session_id": session.id,
            "user_id": session.user_id,
            "user_name": session.user_name,
            "email": session.email,
            "expires_at": session.expires_at.isoformat() if session.expires_at else None
        }

    return {
        "authenticated": False,
        "configured": True,
        "message": "Not authenticated. Please sign in with username and password."
    }

@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    """
    Logs out the current session and clears the session cookie.
    """
    try:
        session = get_current_session(request, db)
        session.is_active = False
        db.commit()
    except HTTPException:
        pass

    response.delete_cookie(key=SESSION_COOKIE_NAME)
    return {"status": "success", "message": "Logged out successfully."}
