"""
Market Yönetim Sistemi — Şubeler Arası Transfer Route'ları
Transfer talebi oluşturma, onaylama, tamamlama, listeleme
"""

from fastapi        import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy.orm import Session
from typing         import Optional

from database   import get_db
from models     import Transfer, Product, Branch, Personnel
from routes.auth import get_current_user, require_role
from services   import audit_log
from services.stock_service import stok_guncelle

router = APIRouter(prefix="/api/transfers", tags=["Transfer"])


# ============================================================
# TRANSFER LİSTESİ
# ============================================================

@router.get("")
async def transfer_listesi(
    branch_id : int            = Query(1),    # from veya to şubesi
    status    : Optional[str]  = Query(None), # pending | approved | done
    page      : int            = Query(1, ge=1),
    per_page  : int            = Query(50),
    db        : Session        = Depends(get_db),
    current_user: Personnel    = Depends(get_current_user),
):
    """Şubeye ait transfer listesi (gönderen veya alıcı)."""
    sorgu = db.query(Transfer).filter(
        (Transfer.from_branch_id == branch_id) |
        (Transfer.to_branch_id   == branch_id)
    )

    if status:
        sorgu = sorgu.filter(Transfer.status == status)

    toplam = sorgu.count()
    items  = (
        sorgu
        .order_by(Transfer.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    # Şube ve ürün adlarını çek
    sube_cache: dict = {}
    urun_cache: dict = {}

    def sube_adi(sid: int) -> str:
        if sid not in sube_cache:
            s = db.query(Branch).filter(Branch.id == sid).first()
            sube_cache[sid] = s.name if s else f"Şube#{sid}"
        return sube_cache[sid]

    def urun_adi(pid: int) -> str:
        if pid not in urun_cache:
            u = db.query(Product).filter(Product.id == pid).first()
            urun_cache[pid] = f"{u.name} ({u.barcode})" if u else f"Ürün#{pid}"
        return urun_cache[pid]

    return {
        "total"   : toplam,
        "page"    : page,
        "per_page": per_page,
        "items"   : [
            {
                "id"              : t.id,
                "from_branch_id"  : t.from_branch_id,
                "from_branch_name": sube_adi(t.from_branch_id),
                "to_branch_id"    : t.to_branch_id,
                "to_branch_name"  : sube_adi(t.to_branch_id),
                "product_id"      : t.product_id,
                "product_name"    : urun_adi(t.product_id),
                "qty"             : t.qty,
                "status"          : t.status,
                "note"            : t.note,
                "created_at"      : str(t.created_at),
            }
            for t in items
        ],
    }


# ============================================================
# TRANSFER TALEBİ OLUŞTUR
# ============================================================

@router.post("", status_code=201)
async def transfer_olustur(
    request       : Request,
    from_branch_id: int,
    to_branch_id  : int,
    product_id    : int,
    qty           : int,
    note          : Optional[str] = None,
    db            : Session       = Depends(get_db),
    current_user  : Personnel     = Depends(get_current_user),
):
    """
    Şubeler arası stok transfer talebi oluşturur.
    Stok henüz düşülmez — onaylama aşamasında düşülür.
    """
    if from_branch_id == to_branch_id:
        raise HTTPException(status_code=400, detail="Kaynak ve hedef şube aynı olamaz.")
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Miktar pozitif olmalıdır.")

    # Şubeler var mı?
    kaynak = db.query(Branch).filter(Branch.id == from_branch_id, Branch.active == True).first()
    if not kaynak:
        raise HTTPException(status_code=404, detail="Kaynak şube bulunamadı.")

    hedef = db.query(Branch).filter(Branch.id == to_branch_id, Branch.active == True).first()
    if not hedef:
        raise HTTPException(status_code=404, detail="Hedef şube bulunamadı.")

    # Ürün kaynak şubede var mı? Yeterli stok var mı?
    urun = db.query(Product).filter(
        Product.id        == product_id,
        Product.branch_id == from_branch_id,
        Product.is_deleted == False,
    ).first()
    if not urun:
        raise HTTPException(status_code=404, detail="Ürün kaynak şubede bulunamadı.")
    if urun.stock_qty < qty:
        raise HTTPException(
            status_code=400,
            detail=f"Yetersiz stok. Mevcut: {urun.stock_qty} {urun.unit}, İstenen: {qty} {urun.unit}",
        )

    transfer = Transfer(
        from_branch_id = from_branch_id,
        to_branch_id   = to_branch_id,
        product_id     = product_id,
        qty            = qty,
        status         = "pending",
        note           = note,
        created_by     = current_user.id,
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)

    audit_log.log_action(
        db          = db,
        action_type = "TRANSFER_CREATE",
        user_id     = current_user.id,
        table_name  = "transfers",
        record_id   = transfer.id,
        new_value   = {
            "from": kaynak.name,
            "to"  : hedef.name,
            "qty" : qty,
            "urun": urun.name,
        },
        ip_address  = request.client.host if request.client else None,
        branch_id   = from_branch_id,
    )

    return {
        "success"   : True,
        "transfer_id": transfer.id,
        "message"   : f"{urun.name} — {qty} {urun.unit} transfer talebi oluşturuldu.",
    }


# ============================================================
# TRANSFER ONAYLA (stok düşümü gerçekleşir)
# ============================================================

@router.patch("/{transfer_id}/approve")
async def transfer_onayla(
    transfer_id : int,
    request     : Request,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """
    Transfer talebini onaylar.
    Kaynak şubeden stok düşer, hedef şubede stok artar.
    Hedef şubede ürün yoksa otomatik oluşturulur.
    """
    transfer = db.query(Transfer).filter(Transfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer bulunamadı.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail=f"Transfer zaten '{transfer.status}' durumunda.")

    # Kaynak ürün stok kontrolü (tekrar)
    kaynak_urun = db.query(Product).filter(
        Product.id        == transfer.product_id,
        Product.branch_id == transfer.from_branch_id,
        Product.is_deleted == False,
    ).first()
    if not kaynak_urun:
        raise HTTPException(status_code=404, detail="Kaynak ürün artık mevcut değil.")
    if kaynak_urun.stock_qty < transfer.qty:
        raise HTTPException(
            status_code=400,
            detail=f"Yetersiz stok. Mevcut: {kaynak_urun.stock_qty}, Transfer: {transfer.qty}",
        )

    # Kaynak şubeden düş
    stok_guncelle(
        db         = db,
        product_id = transfer.product_id,
        qty_delta  = -transfer.qty,
        hareket_tipi = "transfer_out",
        aciklama   = f"Transfer #{transfer.id} — çıkış",
        personel_id  = current_user.id,
        branch_id  = transfer.from_branch_id,
    )

    # Hedef şubede ürün var mı?
    hedef_urun = db.query(Product).filter(
        Product.branch_id == transfer.to_branch_id,
        Product.barcode   == kaynak_urun.barcode,
        Product.is_deleted == False,
    ).first()

    if hedef_urun:
        # Var — stok ekle
        stok_guncelle(
            db           = db,
            product_id   = hedef_urun.id,
            qty_delta    = transfer.qty,
            hareket_tipi = "transfer_in",
            aciklama     = f"Transfer #{transfer.id} — giriş",
            personel_id  = current_user.id,
            branch_id    = transfer.to_branch_id,
        )
    else:
        # Yok — kopyala ve oluştur
        yeni = Product(
            branch_id     = transfer.to_branch_id,
            barcode       = kaynak_urun.barcode,
            name          = kaynak_urun.name,
            category_id   = kaynak_urun.category_id,
            unit          = kaynak_urun.unit,
            sale_price    = kaynak_urun.sale_price,
            cost_price    = kaynak_urun.cost_price,
            kdv_rate      = kaynak_urun.kdv_rate,
            stock_qty     = transfer.qty,
            min_stock     = kaynak_urun.min_stock,
            shelf_location= kaynak_urun.shelf_location,
        )
        db.add(yeni)
        db.flush()

    # Transfer durumunu güncelle
    transfer.status = "done"
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "TRANSFER_APPROVE",
        user_id     = current_user.id,
        table_name  = "transfers",
        record_id   = transfer_id,
        new_value   = {"status": "done", "qty": transfer.qty},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return {
        "success": True,
        "message": f"Transfer onaylandı. {transfer.qty} {kaynak_urun.unit} aktarıldı.",
    }


# ============================================================
# TRANSFER İPTAL
# ============================================================

@router.patch("/{transfer_id}/cancel")
async def transfer_iptal(
    transfer_id : int,
    request     : Request,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Bekleyen transfer talebini iptal eder."""
    transfer = db.query(Transfer).filter(Transfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer bulunamadı.")
    if transfer.status != "pending":
        raise HTTPException(status_code=400, detail=f"Sadece 'pending' durumdaki transferler iptal edilebilir.")

    transfer.status = "cancelled"
    db.commit()

    return {"success": True, "message": "Transfer iptal edildi."}
