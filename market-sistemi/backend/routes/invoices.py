"""
Market Yönetim Sistemi — Fatura Route'ları
PDF/Excel/Word fatura yükleme, önizleme, onay ve rollback
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import os

from database import get_db
from models import Invoice, Personnel, Supplier
from routes.auth import get_current_user, require_role
from services import audit_log, invoice_parser

router = APIRouter(prefix="/api/invoices", tags=["Faturalar"])

# Desteklenen dosya uzantıları
DESTEKLENEN_UZANTILAR = {"pdf", "xlsx", "xls", "docx"}


# ============================================================
# FATURA YÜKLEYİP ÖNİZLE (Onay öncesi)
# ============================================================

@router.post("/preview")
async def preview_invoice(
    request      : Request,
    branch_id    : int = Query(1),
    supplier_id  : Optional[int] = Query(None),
    multipliers  : Optional[str] = Query(None),  # JSON string: {"koli":"24","paket":"6"}
    file         : UploadFile = File(...),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "warehouse")),
):
    """
    Fatura dosyasını yükler ve ürünleri eşleştirerek önizleme döner.
    Onaylanmadan stok değişmez.

    Her satır için döner:
    - invoice_item: faturadaki ürün bilgisi
    - product: eşleşen ürün (varsa)
    - match_type: "barcode" | "fuzzy" | "unmatched"
    - confidence: eşleşme güveni (0-100)
    - yeni_maliyet: hesaplanan birim maliyet
    - oneri_fiyat: önerilen satış fiyatı
    """
    # Dosya uzantısı kontrolü
    uzanti = file.filename.rsplit(".", 1)[-1].lower()
    if uzanti not in DESTEKLENEN_UZANTILAR:
        raise HTTPException(
            status_code = 400,
            detail      = f"Desteklenmeyen dosya türü: .{uzanti}. Desteklenenler: {', '.join(DESTEKLENEN_UZANTILAR)}",
        )

    # Birim çarpanlarını parse et
    import json
    carpanlar = {}
    if multipliers:
        try:
            carpanlar = {k: int(v) for k, v in json.loads(multipliers).items()}
        except Exception:
            pass

    file_bytes = await file.read()

    # Faturayı parse et
    try:
        satirlar = await invoice_parser.parse_invoice(
            db        = db,
            file_bytes= file_bytes,
            file_type = "pdf" if uzanti == "pdf" else ("xlsx" if uzanti in ("xlsx", "xls") else "docx"),
            branch_id = branch_id,
        )
    except Exception as e:
        raise HTTPException(
            status_code = 422,
            detail      = f"Fatura okunamadı: {str(e)}",
        )

    # Her satırı ürünle eşleştir
    onizleme = []
    for satir in satirlar:
        urun, esleme_tipi, guven = invoice_parser.match_product(db, satir, branch_id)

        # Birim maliyeti hesapla
        yeni_maliyet = invoice_parser.calculate_unit_cost(
            line_total  = satir.get("line_total", 0) or 0,
            qty         = satir.get("qty", 1) or 1,
            unit        = satir.get("unit", "adet"),
            multipliers = carpanlar,
        )

        # Satış fiyatı öner
        marj = float(urun.margin_percent) if urun and urun.margin_percent else 20.0
        oneri_fiyat = invoice_parser.suggest_sale_price(yeni_maliyet, marj) if yeni_maliyet > 0 else None

        onizleme.append({
            "invoice_item" : satir,
            "product_id"   : urun.id   if urun else None,
            "product_name" : urun.name if urun else None,
            "match_type"   : esleme_tipi,
            "confidence"   : guven,
            "yeni_maliyet" : round(yeni_maliyet, 4),
            "mevcut_maliyet": float(urun.cost) if urun and urun.cost else None,
            "mevcut_fiyat" : float(urun.price) if urun else None,
            "oneri_fiyat"  : oneri_fiyat,
            "onaylandi"    : esleme_tipi != "unmatched",  # Eşleşenler varsayılan onaylı
        })

    # Geçici fatura kaydı oluştur (onay bekliyor)
    fatura = Invoice(
        branch_id   = branch_id,
        supplier_id = supplier_id,
        file_name   = file.filename,
        file_type   = uzanti,
        status      = "pending",
        uploaded_by = current_user.id,
    )
    db.add(fatura)
    db.commit()
    db.refresh(fatura)

    audit_log.log_action(
        db          = db,
        action_type = "INVOICE_UPLOAD",
        user_id     = current_user.id,
        table_name  = "invoices",
        record_id   = fatura.id,
        new_value   = {"dosya": file.filename, "satir_sayisi": len(satirlar)},
        ip_address  = request.client.host if request.client else None,
        branch_id   = branch_id,
    )

    return {
        "invoice_id"     : fatura.id,
        "dosya"          : file.filename,
        "satir_sayisi"   : len(satirlar),
        "eslesen"        : sum(1 for s in onizleme if s["match_type"] != "unmatched"),
        "eslesmeyen"     : sum(1 for s in onizleme if s["match_type"] == "unmatched"),
        "onizleme"       : onizleme,
    }


# ============================================================
# FATURA ONAYLA (Stok + fiyat güncelleme)
# ============================================================

@router.post("/{invoice_id}/approve")
async def approve_invoice(
    invoice_id   : int,
    request      : Request,
    eslestirmeler: list,   # Önizlemeden dönen + kullanıcının düzelttiği liste
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "warehouse")),
):
    """
    Faturayı onaylar ve stok/fiyat güncellemelerini uygular.
    Hatalı yükleme durumunda /rollback ile geri alınabilir.
    """
    fatura = db.query(Invoice).filter(
        Invoice.id     == invoice_id,
        Invoice.status == "pending",
    ).first()

    if not fatura:
        raise HTTPException(
            status_code = 404,
            detail      = "Fatura bulunamadı veya zaten onaylandı.",
        )

    sonuc = await invoice_parser.apply_invoice(
        db             = db,
        invoice_id     = invoice_id,
        eslestirmeler  = eslestirmeler,
        user_id        = current_user.id,
        branch_id      = fatura.branch_id,
    )

    # Fatura durumunu güncelle
    from datetime import datetime, timezone
    fatura.status      = "approved"
    fatura.approved_at = datetime.now(timezone.utc)
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "INVOICE_APPROVE",
        user_id     = current_user.id,
        table_name  = "invoices",
        record_id   = invoice_id,
        new_value   = sonuc,
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return {
        "success"    : True,
        "invoice_id" : invoice_id,
        "guncellenen": sonuc["guncellenen"],
        "atlanmis"   : sonuc["atlanmis"],
        "message"    : f"Fatura onaylandı. {sonuc['guncellenen']} ürün güncellendi.",
    }


# ============================================================
# FATURA GERİ AL (Rollback)
# ============================================================

@router.post("/{invoice_id}/rollback")
async def rollback_invoice(
    invoice_id   : int,
    request      : Request,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """
    Onaylanmış faturanın etkilerini geri alır.
    Sadece admin yapabilir.
    Audit log'daki eski değerler kullanılır.
    """
    fatura = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not fatura:
        raise HTTPException(status_code=404, detail="Fatura bulunamadı.")

    if fatura.status == "rolled_back":
        raise HTTPException(status_code=400, detail="Bu fatura zaten geri alınmış.")

    try:
        sonuc = await invoice_parser.rollback_invoice(
            db         = db,
            invoice_id = invoice_id,
            user_id    = current_user.id,
            branch_id  = fatura.branch_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    fatura.status = "rolled_back"
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "INVOICE_ROLLBACK_CONFIRM",
        user_id     = current_user.id,
        table_name  = "invoices",
        record_id   = invoice_id,
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return sonuc


# ============================================================
# FATURA LİSTESİ
# ============================================================

@router.get("")
async def list_invoices(
    branch_id    : int = Query(1),
    status_filter: Optional[str] = Query(None),   # pending | approved | rolled_back
    page         : int = Query(1, ge=1),
    per_page     : int = Query(20, ge=1, le=100),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Fatura listesi — durum filtresi destekler."""
    query = db.query(Invoice).filter(Invoice.branch_id == branch_id)

    if status_filter:
        query = query.filter(Invoice.status == status_filter)

    total  = query.count()
    items  = query.order_by(Invoice.created_at.desc()).offset((page - 1) * per_page).limit(per_page).all()

    return {
        "total"   : total,
        "page"    : page,
        "per_page": per_page,
        "items"   : [
            {
                "id"         : f.id,
                "file_name"  : f.file_name,
                "file_type"  : f.file_type,
                "status"     : f.status,
                "created_at" : str(f.created_at),
                "approved_at": str(f.approved_at) if f.approved_at else None,
            }
            for f in items
        ],
    }
