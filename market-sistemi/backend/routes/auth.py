"""
Market Yönetim Sistemi — Kimlik Doğrulama Route'ları
JWT tabanlı oturum yönetimi + PIN ile kasiyer girişi
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional
from dotenv import load_dotenv
import os

from database import get_db
from models import Personnel
from schemas import TokenResponse, LoginRequest, PINLoginRequest
from services import audit_log

load_dotenv()

# ============================================================
# AYARLAR
# ============================================================

SECRET_KEY                  = os.getenv("SECRET_KEY", "degistir-beni-production-da")
ALGORITHM                   = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

# Şifre hash'leme — bcrypt
pwd_context    = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme  = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

router = APIRouter(prefix="/api/auth", tags=["Kimlik Doğrulama"])


# ============================================================
# YARDIMCI FONKSİYONLAR
# ============================================================

def verify_password(plain: str, hashed: str) -> bool:
    """Düz şifreyi hash ile karşılaştırır"""
    return pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    """Şifreyi bcrypt ile hash'ler"""
    return pwd_context.hash(plain)


def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    """PIN'i hash ile karşılaştırır"""
    return pwd_context.verify(plain_pin, hashed_pin)


def hash_pin(plain_pin: str) -> str:
    """6 haneli PIN'i hash'ler"""
    return pwd_context.hash(plain_pin)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """JWT access token oluşturur"""
    payload = data.copy()
    expire  = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ============================================================
# DEPENDENCY: get_current_user
# ============================================================

def get_current_user(
    token: str       = Depends(oauth2_scheme),
    db:    Session   = Depends(get_db),
) -> Personnel:
    """
    Her korumalı endpoint'te kullanılır.
    Token'ı doğrular ve kullanıcıyı döner.
    Kullanım: user: Personnel = Depends(get_current_user)
    """
    credentials_exception = HTTPException(
        status_code = status.HTTP_401_UNAUTHORIZED,
        detail      = "Geçersiz veya süresi dolmuş oturum. Lütfen tekrar giriş yapın.",
        headers     = {"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(Personnel).filter(
        Personnel.id     == int(user_id),
        Personnel.active == True,
    ).first()

    if user is None:
        raise credentials_exception

    return user


def require_role(*roles: str):
    """
    Rol bazlı yetkilendirme decorator'ı.
    Kullanım: user = Depends(require_role("admin", "warehouse"))
    """
    def role_checker(current_user: Personnel = Depends(get_current_user)) -> Personnel:
        if current_user.role not in roles:
            raise HTTPException(
                status_code = status.HTTP_403_FORBIDDEN,
                detail      = f"Bu işlem için yetkiniz yok. Gerekli rol: {', '.join(roles)}",
            )
        return current_user
    return role_checker


# ============================================================
# ENDPOINT'LER
# ============================================================

@router.post("/login", response_model=TokenResponse)
async def login(
    request:     Request,
    login_data:  LoginRequest,
    db:          Session = Depends(get_db),
):
    """
    E-posta + şifre ile yönetici/personel girişi.
    Başarılı giriş ve başarısız denemeler audit log'a kaydedilir.
    """
    # Kullanıcıyı e-posta ile bul
    user = db.query(Personnel).filter(
        Personnel.email  == login_data.email,
        Personnel.active == True,
    ).first()

    # Kullanıcı yok veya şifre yanlış
    if not user or not user.password or not verify_password(login_data.password, user.password):
        # Başarısız girişi logla
        audit_log.log_action(
            db          = db,
            action_type = "LOGIN_FAILED",
            ip_address  = request.client.host if request.client else None,
            note        = f"Başarısız giriş denemesi: {login_data.email}",
        )
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "E-posta veya şifre hatalı.",
        )

    # JWT token oluştur
    token = create_access_token(data={
        "sub":       str(user.id),
        "role":      user.role,
        "branch_id": user.branch_id,
    })

    # Başarılı girişi logla
    audit_log.log_action(
        db          = db,
        action_type = "LOGIN",
        user_id     = user.id,
        table_name  = "personnel",
        record_id   = user.id,
        ip_address  = request.client.host if request.client else None,
        branch_id   = user.branch_id,
        note        = f"{user.role} girişi: {user.name}",
    )

    return TokenResponse(
        access_token = token,
        token_type   = "bearer",
        user_id      = user.id,
        user_name    = user.name,
        role         = user.role,
        branch_id    = user.branch_id,
    )


@router.post("/login/pin", response_model=TokenResponse)
async def login_with_pin(
    request:    Request,
    pin_data:   PINLoginRequest,
    db:         Session = Depends(get_db),
):
    """
    6 haneli PIN ile kasiyer kasa girişi.
    Şubedeki tüm aktif kasiyer ve depo personeli PIN kullanabilir.
    """
    # Şubedeki aktif kasiyerleri bul (admin hariç)
    users = db.query(Personnel).filter(
        Personnel.branch_id == pin_data.branch_id,
        Personnel.active    == True,
        Personnel.pin       != None,
        Personnel.role      != "admin",
    ).all()

    # PIN'i tüm personelde dene
    matched_user = None
    for user in users:
        if user.pin and verify_pin(pin_data.pin, user.pin):
            matched_user = user
            break

    if not matched_user:
        audit_log.log_action(
            db          = db,
            action_type = "PIN_LOGIN_FAILED",
            ip_address  = request.client.host if request.client else None,
            note        = f"Başarısız PIN denemesi — Şube: {pin_data.branch_id}",
            branch_id   = pin_data.branch_id,
        )
        raise HTTPException(
            status_code = status.HTTP_401_UNAUTHORIZED,
            detail      = "PIN hatalı veya kullanıcı bulunamadı.",
        )

    # Kısa süreli kasiyer tokeni oluştur (8 saat)
    token = create_access_token(data={
        "sub":       str(matched_user.id),
        "role":      matched_user.role,
        "branch_id": matched_user.branch_id,
    })

    audit_log.log_action(
        db          = db,
        action_type = "PIN_LOGIN",
        user_id     = matched_user.id,
        table_name  = "personnel",
        record_id   = matched_user.id,
        ip_address  = request.client.host if request.client else None,
        branch_id   = matched_user.branch_id,
        note        = f"PIN girişi: {matched_user.name}",
    )

    return TokenResponse(
        access_token = token,
        token_type   = "bearer",
        user_id      = matched_user.id,
        user_name    = matched_user.name,
        role         = matched_user.role,
        branch_id    = matched_user.branch_id,
    )


@router.get("/me")
async def get_me(current_user: Personnel = Depends(get_current_user)):
    """Geçerli oturumdaki kullanıcı bilgilerini döner"""
    return {
        "id":        current_user.id,
        "name":      current_user.name,
        "role":      current_user.role,
        "email":     current_user.email,
        "branch_id": current_user.branch_id,
        "active":    current_user.active,
    }


@router.post("/logout")
async def logout(
    request:      Request,
    current_user: Personnel = Depends(get_current_user),
    db:           Session   = Depends(get_db),
):
    """
    Çıkış işlemi — audit log'a kaydedilir.
    JWT stateless olduğu için token istemci tarafında silinmelidir.
    """
    audit_log.log_action(
        db          = db,
        action_type = "LOGOUT",
        user_id     = current_user.id,
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
        note        = f"Çıkış: {current_user.name}",
    )
    return {"success": True, "message": "Çıkış yapıldı."}
