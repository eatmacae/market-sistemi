"""
Market Yönetim Sistemi — Müşteri Display Route'ları
WebSocket üzerinden kasadaki sepet durumu müşteri ekranına iletilir.
Aynı şubedeki tüm display ekranları güncellenir (1 kasa → N display).
"""

import json
import logging
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Product

logger = logging.getLogger("market_sistemi.display")

router = APIRouter(prefix="/api/display", tags=["Müşteri Display"])


# ============================================================
# BAĞLANTI YÖNETİCİSİ
# ============================================================

class DisplayManager:
    """
    Aktif WebSocket bağlantılarını branch_id bazında yönetir.
    Bir kasadan gelen güncelleme tüm display ekranlarına iletilir.
    """

    def __init__(self):
        # { branch_id: Set[WebSocket] }
        self.active: Dict[int, Set[WebSocket]] = {}

    async def connect(self, ws: WebSocket, branch_id: int):
        """Yeni display bağlantısı ekle."""
        await ws.accept()
        if branch_id not in self.active:
            self.active[branch_id] = set()
        self.active[branch_id].add(ws)
        logger.info(f"Display bağlandı — Şube {branch_id} | toplam: {len(self.active[branch_id])}")

    def disconnect(self, ws: WebSocket, branch_id: int):
        """Display bağlantısını kaldır."""
        if branch_id in self.active:
            self.active[branch_id].discard(ws)
            if not self.active[branch_id]:
                del self.active[branch_id]
        logger.info(f"Display ayrıldı — Şube {branch_id}")

    async def broadcast(self, branch_id: int, payload: dict):
        """
        Şubedeki tüm display ekranlarına mesaj gönder.
        Bağlantısı kopanları temizle.
        """
        if branch_id not in self.active:
            return

        kopanlar = set()
        mesaj = json.dumps(payload, ensure_ascii=False)

        for ws in self.active[branch_id]:
            try:
                await ws.send_text(mesaj)
            except Exception:
                kopanlar.add(ws)

        # Kopan bağlantıları temizle
        for ws in kopanlar:
            self.active[branch_id].discard(ws)

    def active_count(self, branch_id: int) -> int:
        """Şubedeki aktif display sayısı."""
        return len(self.active.get(branch_id, set()))


# Global singleton — uygulama genelinde tek instance
display_manager = DisplayManager()


# ============================================================
# WEBSOCKET ENDPOINT (Display ekranı)
# ============================================================

@router.websocket("/ws/{branch_id}")
async def display_websocket(
    ws        : WebSocket,
    branch_id : int,
):
    """
    Müşteri display ekranı WebSocket bağlantısı.

    Bağlantı URL'i: ws://192.168.1.100:8000/api/display/ws/1

    Alınan mesaj formatı (kasadan):
    {
        "type"    : "cart_update",
        "items"   : [...],
        "subtotal": 85.50,
        "total"   : 91.22
    }

    Gönderilen mesaj formatı (display'e):
    {
        "type"    : "cart_update",
        "items"   : [...],
        "subtotal": 85.50,
        "total"   : 91.22,
        "branch_id": 1
    }
    """
    await display_manager.connect(ws, branch_id)

    # Bağlantı kurulunca karşılama mesajı gönder
    await ws.send_text(json.dumps({
        "type"     : "connected",
        "message"  : "Müşteri ekranı bağlandı.",
        "branch_id": branch_id,
    }))

    try:
        while True:
            # Display ekranı genellikle sadece dinler ama ping/pong da gönderebilir
            data = await ws.receive_text()

            try:
                msg = json.loads(data)

                if msg.get("type") == "ping":
                    # Bağlantı canlı tut
                    await ws.send_text(json.dumps({"type": "pong"}))

                elif msg.get("type") == "cart_update":
                    # Kasadan gelen sepet güncellemesini diğer display'lere ilet
                    msg["branch_id"] = branch_id
                    await display_manager.broadcast(branch_id, msg)

            except json.JSONDecodeError:
                logger.warning(f"Geçersiz JSON: {data[:100]}")

    except WebSocketDisconnect:
        display_manager.disconnect(ws, branch_id)


# ============================================================
# REST API: Kasadan display'e mesaj gönder
# ============================================================

@router.post("/broadcast/{branch_id}")
async def broadcast_to_display(
    branch_id: int,
    payload  : dict,
    db       : Session = Depends(get_db),
):
    """
    Kasa uygulaması WebSocket yerine REST ile de display'e mesaj gönderebilir.
    Sepet güncellemesi, ödeme tamamlandı, sıfırlama mesajları için kullanılır.

    Payload örnekleri:

    Sepet güncelle:
    { "type": "cart_update", "items": [...], "subtotal": 50.0, "total": 55.0 }

    Ödeme tamamlandı:
    { "type": "payment_complete", "total": 55.0, "payment_type": "cash", "change": 5.0 }

    Ekranı sıfırla:
    { "type": "clear" }
    """
    payload["branch_id"] = branch_id
    await display_manager.broadcast(branch_id, payload)

    return {
        "success"      : True,
        "message"      : f"Şube {branch_id} display ekranlarına iletildi.",
        "active_screens": display_manager.active_count(branch_id),
    }


# ============================================================
# DURUM ENDPOINT
# ============================================================

@router.get("/status/{branch_id}")
async def display_status(branch_id: int):
    """Şubedeki aktif display ekranı sayısını döner."""
    return {
        "branch_id"    : branch_id,
        "active_screens": display_manager.active_count(branch_id),
        "connected"    : display_manager.active_count(branch_id) > 0,
    }
