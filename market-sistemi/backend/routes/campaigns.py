"""
Market Yönetim Sistemi — Kampanya Route'ları
Kampanya CRUD, aktif/pasif yönetimi, performans özeti
"""

from fastapi  import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm  import Session
from sqlalchemy      import func, and_
from typing          import Optional
from datetime        import date
from pydantic        import BaseModel
from decimal         import Decimal

from database  import get_db
from models    import Campaign, Sale, SaleItem
from routes.auth import get_current_user, require_role
from services  import audit_log
from models    import Personnel

router = APIRouter(prefix="/api/campaigns", tags=["Kampanyalar"])


# ============================================================
# ŞEMALAR (bu dosyaya özel)
# ============================================================

class CampaignCreate(BaseModel):
    name      : str
    type      : str      # percent | fixed | buy_x_get_y
    value     : Decimal  # İndirim yüzdesi, tutarı veya bedava adet için baz
    min_qty   : int = 1  # Kampanyanın uygulanacağı minimum miktar
    free_qty  : int = 0  # X al Y öde için bedava adet sayısı
    start_date: date
    end_date  : date
    active    : bool = True
    branch_id : int  = 1


class CampaignUpdate(BaseModel):
    name      : Optional[str]     = None
    value     : Optional[Decimal] = None
    min_qty   : Optional[int]     = None
    free_qty  : Optional[int]     = None
    start_date: Optional[date]    = None
    end_date  : Optional[date]    = None
    active    : Optional[bool]    = None


class CampaignResponse(BaseModel):
    id        : int
    branch_id : int
    name      : str
    type      : str
    value     : Decimal
    min_qty   : int
    free_qty  : int
    start_date: date
    end_date  : date
    active    : bool
    is_deleted: bool

    class Config:
        from_attributes = True


# ============================================================
# KAMPANYA LİSTESİ
# ============================================================

@router.get("")
async def list_campaigns(
    branch_id   : int            = Query(1),
    active      : Optional[bool] = Query(None),
    gecerli     : bool           = Query(False),   # sadece bugün geçerli olanlar
    page        : int            = Query(1, ge=1),
    per_page    : int            = Query(50, ge=1, le=100),
    db          : Session        = Depends(get_db),
    current_user: Personnel      = Depends(get_current_user),
):
    """Kampanya listesi. gecerli=True ile sadece aktif tarih aralığındakileri getirir."""
    sorgu = db.query(Campaign).filter(
        Campaign.branch_id  == branch_id,
        Campaign.is_deleted == False,
    )

    if active is not None:
        sorgu = sorgu.filter(Campaign.active == active)

    if gecerli:
        bugun = date.today()
        sorgu = sorgu.filter(
            Campaign.active     == True,
            Campaign.start_date <= bugun,
            Campaign.end_date   >= bugun,
        )

    toplam = sorgu.count()
    items  = (
        sorgu
        .order_by(Campaign.end_date.asc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "total"   : toplam,
        "page"    : page,
        "per_page": per_page,
        "items"   : [CampaignResponse.model_validate(c) for c in items],
    }


# ============================================================
# KAMPANYA DETAY
# ============================================================

@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id : int,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(get_current_user),
):
    kampanya = db.query(Campaign).filter(
        Campaign.id         == campaign_id,
        Campaign.is_deleted == False,
    ).first()
    if not kampanya:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı.")
    return kampanya


# ============================================================
# KAMPANYA OLUŞTUR
# ============================================================

@router.post("", response_model=CampaignResponse, status_code=201)
async def create_campaign(
    request     : Request,
    data        : CampaignCreate,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Yeni kampanya oluşturur."""
    # Tarih doğrulama
    if data.end_date < data.start_date:
        raise HTTPException(
            status_code=400,
            detail="Bitiş tarihi başlangıç tarihinden önce olamaz.",
        )

    # Tür doğrulama
    if data.type not in ("percent", "fixed", "buy_x_get_y"):
        raise HTTPException(
            status_code=400,
            detail="Kampanya tipi 'percent', 'fixed' veya 'buy_x_get_y' olmalıdır.",
        )

    if data.type == "percent" and (float(data.value) <= 0 or float(data.value) > 100):
        raise HTTPException(
            status_code=400,
            detail="Yüzde indirim 0-100 arasında olmalıdır.",
        )

    if data.type == "buy_x_get_y" and data.free_qty <= 0:
        raise HTTPException(
            status_code=400,
            detail="X al Y öde kampanyasında bedava adet 0'dan büyük olmalıdır.",
        )

    kampanya = Campaign(
        branch_id  = data.branch_id,
        name       = data.name,
        type       = data.type,
        value      = data.value,
        min_qty    = data.min_qty,
        free_qty   = data.free_qty,
        start_date = data.start_date,
        end_date   = data.end_date,
        active     = data.active,
        is_deleted = False,
    )
    db.add(kampanya)
    db.commit()
    db.refresh(kampanya)

    audit_log.log_action(
        db          = db,
        action_type = "CAMPAIGN_CREATE",
        user_id     = current_user.id,
        table_name  = "campaigns",
        record_id   = kampanya.id,
        new_value   = {
            "name"  : kampanya.name,
            "type"  : kampanya.type,
            "value" : float(kampanya.value),
        },
        ip_address  = request.client.host if request.client else None,
        branch_id   = data.branch_id,
    )

    return kampanya


# ============================================================
# KAMPANYA GÜNCELLE
# ============================================================

@router.patch("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id : int,
    request     : Request,
    data        : CampaignUpdate,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Kampanya günceller. Sadece gönderilen alanlar değişir."""
    kampanya = db.query(Campaign).filter(
        Campaign.id         == campaign_id,
        Campaign.is_deleted == False,
    ).first()
    if not kampanya:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı.")

    eski_deger = {
        "name"      : kampanya.name,
        "value"     : float(kampanya.value),
        "active"    : kampanya.active,
        "end_date"  : str(kampanya.end_date),
    }

    if data.name       is not None: kampanya.name       = data.name
    if data.value      is not None: kampanya.value      = data.value
    if data.min_qty    is not None: kampanya.min_qty    = data.min_qty
    if data.free_qty   is not None: kampanya.free_qty   = data.free_qty
    if data.start_date is not None: kampanya.start_date = data.start_date
    if data.end_date   is not None: kampanya.end_date   = data.end_date
    if data.active     is not None: kampanya.active     = data.active

    # Tarih tutarlılığı kontrolü
    if kampanya.end_date < kampanya.start_date:
        raise HTTPException(
            status_code=400,
            detail="Bitiş tarihi başlangıç tarihinden önce olamaz.",
        )

    db.commit()
    db.refresh(kampanya)

    audit_log.log_action(
        db          = db,
        action_type = "CAMPAIGN_UPDATE",
        user_id     = current_user.id,
        table_name  = "campaigns",
        record_id   = campaign_id,
        old_value   = eski_deger,
        new_value   = {"name": kampanya.name, "active": kampanya.active},
        ip_address  = request.client.host if request.client else None,
        branch_id   = kampanya.branch_id,
    )

    return kampanya


# ============================================================
# KAMPANYA AKTİF/PASİF
# ============================================================

@router.patch("/{campaign_id}/toggle-active")
async def toggle_campaign(
    campaign_id : int,
    request     : Request,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Kampanyayı aktif/pasif yapar."""
    kampanya = db.query(Campaign).filter(
        Campaign.id         == campaign_id,
        Campaign.is_deleted == False,
    ).first()
    if not kampanya:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı.")

    eski = kampanya.active
    kampanya.active = not kampanya.active
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "CAMPAIGN_TOGGLE",
        user_id     = current_user.id,
        table_name  = "campaigns",
        record_id   = campaign_id,
        old_value   = {"active": eski},
        new_value   = {"active": kampanya.active},
        ip_address  = request.client.host if request.client else None,
        branch_id   = kampanya.branch_id,
    )

    durum = "aktif" if kampanya.active else "pasif"
    return {
        "success": True,
        "message": f"'{kampanya.name}' kampanyası {durum} yapıldı.",
        "active" : kampanya.active,
    }


# ============================================================
# KAMPANYA SİL (Soft delete)
# ============================================================

@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id : int,
    request     : Request,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """Kampanyayı soft delete ile siler."""
    kampanya = db.query(Campaign).filter(
        Campaign.id         == campaign_id,
        Campaign.is_deleted == False,
    ).first()
    if not kampanya:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı.")

    from datetime import datetime, timezone
    kampanya.is_deleted = True
    kampanya.deleted_at = datetime.now(timezone.utc)
    kampanya.active     = False
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "CAMPAIGN_DELETE",
        user_id     = current_user.id,
        table_name  = "campaigns",
        record_id   = campaign_id,
        old_value   = {"name": kampanya.name},
        ip_address  = request.client.host if request.client else None,
        branch_id   = kampanya.branch_id,
    )

    return {"success": True, "message": f"'{kampanya.name}' kampanyası silindi."}


# ============================================================
# KAMPANYA PERFORMANS ÖZETİ
# ============================================================

@router.get("/{campaign_id}/performance")
async def campaign_performance(
    campaign_id : int,
    db          : Session   = Depends(get_db),
    current_user: Personnel = Depends(require_role("admin")),
):
    """
    Kampanyanın kullanıldığı satış sayısı, uygulanan indirim ve etkilenen ürünler.
    """
    kampanya = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not kampanya:
        raise HTTPException(status_code=404, detail="Kampanya bulunamadı.")

    sonuc = db.query(
        func.count(func.distinct(SaleItem.sale_id)) .label("satis_sayisi"),
        func.coalesce(func.sum(SaleItem.discount), 0).label("toplam_indirim"),
        func.coalesce(func.sum(SaleItem.total),    0).label("toplam_ciro"),
        func.coalesce(func.sum(SaleItem.qty),      0).label("toplam_adet"),
    ).join(
        Sale, Sale.id == SaleItem.sale_id
    ).filter(
        SaleItem.campaign_id == campaign_id,
        Sale.status          == "completed",
    ).first()

    return {
        "campaign_id"    : campaign_id,
        "name"           : kampanya.name,
        "type"           : kampanya.type,
        "satis_sayisi"   : int(sonuc.satis_sayisi   or 0),
        "toplam_indirim" : round(float(sonuc.toplam_indirim or 0), 2),
        "toplam_ciro"    : round(float(sonuc.toplam_ciro    or 0), 2),
        "toplam_adet"    : round(float(sonuc.toplam_adet    or 0), 2),
    }
