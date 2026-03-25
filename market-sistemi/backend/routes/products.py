"""
Market Yönetim Sistemi — Ürün Route'ları
Ürün CRUD, barkod arama, barkod üretme, Excel import/export
"""

from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime, date, timedelta
import random
import string
import io

from database import get_db
from models import Product, Category, StockMovement, Personnel
from schemas import ProductCreate, ProductUpdate, ProductResponse, PaginatedResponse
from routes.auth import get_current_user, require_role
from services import audit_log

router = APIRouter(prefix="/api/products", tags=["Ürünler"])


# ============================================================
# YARDIMCI: Dahili barkod üretici
# ============================================================

def _uret_barkod(db: Session) -> str:
    """
    Sistemde barkodu olmayan ürünler için dahili barkod üretir.
    Format: MYS + 10 rakam (örn: MYS0123456789)
    Çakışma olmadığından emin olur.
    """
    while True:
        barkod = "MYS" + "".join(random.choices(string.digits, k=10))
        mevcut = db.query(Product).filter(Product.barcode == barkod).first()
        if not mevcut:
            return barkod


# ============================================================
# ÜRÜN LİSTESİ (sayfalandırılmış + filtreli)
# ============================================================

@router.get("", response_model=PaginatedResponse)
async def list_products(
    branch_id    : int            = Query(1),
    page         : int            = Query(1, ge=1),
    per_page     : int            = Query(50, ge=1, le=200),
    search       : Optional[str]  = Query(None),        # İsim veya barkod arama
    category_id  : Optional[int]  = Query(None),
    dusuk_stok   : bool           = Query(False),       # Sadece kritik stok
    skt_yaklasan : bool           = Query(False),       # SKT yaklaşan ürünler
    db           : Session        = Depends(get_db),
    current_user : Personnel      = Depends(get_current_user),
):
    """
    Ürün listesi — arama, kategori filtresi, stok filtresi destekler.
    Soft delete'li ürünler gösterilmez.
    """
    query = db.query(Product).filter(
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    )

    # Metin araması: isim veya barkod
    if search:
        query = query.filter(
            or_(
                Product.name.ilike(f"%{search}%"),
                Product.barcode.ilike(f"%{search}%"),
            )
        )

    # Kategori filtresi
    if category_id:
        query = query.filter(Product.category_id == category_id)

    # Düşük stok filtresi (stok_qty <= min_stock)
    if dusuk_stok:
        query = query.filter(Product.stock_qty <= Product.min_stock)

    # SKT yaklaşan filtresi (30 gün içinde dolacak)
    if skt_yaklasan:
        otuz_gun = date.today() + timedelta(days=30)
        query = query.filter(
            Product.expiry_date != None,
            Product.expiry_date <= otuz_gun,
        )

    # Toplam kayıt sayısı (sayfalama için)
    total = query.count()

    # Sayfalama uygula
    items = (
        query
        .order_by(Product.name)
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return PaginatedResponse(
        total    = total,
        page     = page,
        per_page = per_page,
        items    = [ProductResponse.model_validate(p) for p in items],
    )


# ============================================================
# BARKOD İLE ÜRÜN BUL (Kasa için hızlı endpoint)
# ============================================================

@router.get("/barcode/{barcode}", response_model=ProductResponse)
async def get_by_barcode(
    barcode      : str,
    branch_id    : int = Query(1),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """
    Barkod okuyucudan gelen değerle ürün bulur.
    Kasa ekranında anlık çağrılır.
    """
    product = db.query(Product).filter(
        Product.barcode    == barcode,
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    ).first()

    if not product:
        raise HTTPException(
            status_code = status.HTTP_404_NOT_FOUND,
            detail      = f"'{barcode}' barkoduna sahip ürün bulunamadı.",
        )
    return product


# ============================================================
# ÜRÜN DETAY
# ============================================================

@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id   : int,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    product = db.query(Product).filter(
        Product.id         == product_id,
        Product.branch_id  == current_user.branch_id,
        Product.is_deleted == False,
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")
    return product


# ============================================================
# ÜRÜN OLUŞTUR
# ============================================================

@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    request      : Request,
    data         : ProductCreate,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "warehouse")),
):
    """
    Yeni ürün ekler.
    Barkod verilmezse otomatik MYS barkod üretilir.
    Admin ve depo personeli yapabilir.
    """
    # Barkod kontrolü
    if data.barcode:
        mevcut = db.query(Product).filter(
            Product.barcode    == data.barcode,
            Product.is_deleted == False,
        ).first()
        if mevcut:
            raise HTTPException(
                status_code = 400,
                detail      = f"'{data.barcode}' barkodu zaten kullanımda.",
            )
    else:
        # Otomatik barkod üret
        data = data.model_copy(update={"barcode": _uret_barkod(db)})

    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)

    audit_log.log_action(
        db          = db,
        action_type = "PRODUCT_CREATE",
        user_id     = current_user.id,
        table_name  = "products",
        record_id   = product.id,
        new_value   = {"name": product.name, "barcode": product.barcode, "price": float(product.price)},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return product


# ============================================================
# ÜRÜN GÜNCELLE
# ============================================================

@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id   : int,
    request      : Request,
    data         : ProductUpdate,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "warehouse")),
):
    """
    Kısmi güncelleme — sadece gönderilen alanlar değişir.
    Fiyat değişimi ayrıca audit log'a kaydedilir.
    """
    product = db.query(Product).filter(
        Product.id         == product_id,
        Product.branch_id  == current_user.branch_id,
        Product.is_deleted == False,
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    # Eski değerleri kaydet (audit için)
    eski = {
        "name" : product.name,
        "price": float(product.price) if product.price else None,
        "cost" : float(product.cost)  if product.cost  else None,
    }

    # Sadece None olmayan alanları güncelle
    guncelleme = data.model_dump(exclude_none=True)
    for alan, deger in guncelleme.items():
        setattr(product, alan, deger)

    db.commit()
    db.refresh(product)

    # Fiyat değişmişse ayrı log
    if data.price is not None and eski["price"] != float(data.price):
        audit_log.log_action(
            db          = db,
            action_type = "PRICE_CHANGE",
            user_id     = current_user.id,
            table_name  = "products",
            record_id   = product.id,
            old_value   = {"price": eski["price"]},
            new_value   = {"price": float(data.price)},
            ip_address  = request.client.host if request.client else None,
            branch_id   = current_user.branch_id,
            note        = f"Fiyat değişimi: {product.name}",
        )
    else:
        audit_log.log_action(
            db          = db,
            action_type = "PRODUCT_UPDATE",
            user_id     = current_user.id,
            table_name  = "products",
            record_id   = product.id,
            old_value   = eski,
            new_value   = guncelleme,
            ip_address  = request.client.host if request.client else None,
            branch_id   = current_user.branch_id,
        )

    return product


# ============================================================
# ÜRÜN SİL (Soft Delete)
# ============================================================

@router.delete("/{product_id}")
async def delete_product(
    product_id   : int,
    request      : Request,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin")),
):
    """
    Soft delete — ürün silinmez, is_deleted=True yapılır.
    Sadece admin yapabilir.
    """
    product = db.query(Product).filter(
        Product.id         == product_id,
        Product.branch_id  == current_user.branch_id,
        Product.is_deleted == False,
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    product.is_deleted = True
    product.deleted_at = datetime.utcnow()
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "PRODUCT_DELETE",
        user_id     = current_user.id,
        table_name  = "products",
        record_id   = product.id,
        old_value   = {"name": product.name, "barcode": product.barcode},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
        note        = f"Soft delete: {product.name}",
    )

    return {"success": True, "message": f"'{product.name}' ürünü silindi."}


# ============================================================
# EXCEL TOPLU İMPORT
# ============================================================

@router.post("/import/excel")
async def import_excel(
    request      : Request,
    branch_id    : int = Query(1),
    file         : UploadFile = File(...),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "warehouse")),
):
    """
    Excel dosyasından toplu ürün yükler.
    Sütun başlıkları: name, barcode, category, unit, price, cost, min_stock, vat_rate
    Var olan barkodlar güncellenir, yeni barkodlar eklenir.
    """
    import pandas as pd

    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Sadece .xlsx veya .xls dosyası kabul edilir.")

    icerik = await file.read()
    df     = pd.read_excel(io.BytesIO(icerik))

    # Zorunlu sütun kontrolü
    zorunlu = {"name", "price"}
    eksik   = zorunlu - set(df.columns.str.lower())
    if eksik:
        raise HTTPException(
            status_code = 400,
            detail      = f"Eksik sütunlar: {', '.join(eksik)}. Zorunlu: name, price",
        )

    df.columns = df.columns.str.lower().str.strip()

    eklenen    = 0
    guncellenen = 0
    hatalar    = []

    for idx, row in df.iterrows():
        try:
            barkod = str(row.get("barcode", "")).strip() or None

            if barkod:
                # Mevcut ürünü güncelle
                product = db.query(Product).filter(
                    Product.barcode   == barkod,
                    Product.branch_id == branch_id,
                ).first()
            else:
                product = None

            if product:
                # Güncelle
                eski_fiyat = float(product.price)
                product.name  = str(row["name"]).strip()
                product.price = float(row["price"])
                if "cost"      in df.columns and not pd.isna(row.get("cost")):
                    product.cost = float(row["cost"])
                if "min_stock" in df.columns and not pd.isna(row.get("min_stock")):
                    product.min_stock = int(row["min_stock"])
                db.add(product)
                guncellenen += 1
            else:
                # Yeni ürün ekle
                product = Product(
                    branch_id   = branch_id,
                    name        = str(row["name"]).strip(),
                    barcode     = barkod or _uret_barkod(db),
                    price       = float(row["price"]),
                    cost        = float(row["cost"]) if "cost" in df.columns and not pd.isna(row.get("cost")) else None,
                    unit        = str(row.get("unit", "adet")).strip(),
                    min_stock   = int(row["min_stock"]) if "min_stock" in df.columns and not pd.isna(row.get("min_stock")) else 5,
                    vat_rate    = int(row["vat_rate"])  if "vat_rate" in df.columns and not pd.isna(row.get("vat_rate")) else 1,
                )
                db.add(product)
                eklenen += 1

        except Exception as e:
            hatalar.append(f"Satır {idx + 2}: {str(e)}")

    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "PRODUCT_EXCEL_IMPORT",
        user_id     = current_user.id,
        new_value   = {"eklenen": eklenen, "guncellenen": guncellenen, "dosya": file.filename},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return {
        "success"    : True,
        "eklenen"    : eklenen,
        "guncellenen": guncellenen,
        "hatalar"    : hatalar,
        "message"    : f"{eklenen} ürün eklendi, {guncellenen} ürün güncellendi.",
    }


# ============================================================
# EXCEL EXPORT
# ============================================================

@router.get("/export/excel")
async def export_excel(
    branch_id    : int = Query(1),
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(get_current_user),
):
    """Tüm ürünleri Excel dosyası olarak indirir."""
    import pandas as pd

    products = db.query(Product).filter(
        Product.branch_id  == branch_id,
        Product.is_deleted == False,
    ).order_by(Product.name).all()

    data = [{
        "Barkod"     : p.barcode,
        "Ürün Adı"   : p.name,
        "Birim"      : p.unit,
        "Satış Fiyatı": float(p.price),
        "Alış Fiyatı": float(p.cost) if p.cost else "",
        "Stok"       : p.stock_qty,
        "Min Stok"   : p.min_stock,
        "KDV %"      : p.vat_rate,
        "Raf Yeri"   : p.shelf_location or "",
        "SKT"        : str(p.expiry_date) if p.expiry_date else "",
    } for p in products]

    df     = pd.DataFrame(data)
    output = io.BytesIO()
    df.to_excel(output, index=False, engine="openpyxl")
    output.seek(0)

    return StreamingResponse(
        output,
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers    = {"Content-Disposition": f"attachment; filename=urunler_{branch_id}.xlsx"},
    )


# ============================================================
# DAHİLİ BARKOD ÜRET (tek ürün için)
# ============================================================

@router.post("/{product_id}/generate-barcode")
async def generate_barcode(
    product_id   : int,
    request      : Request,
    db           : Session = Depends(get_db),
    current_user : Personnel = Depends(require_role("admin", "warehouse")),
):
    """Barkodu olmayan ürüne dahili barkod atar."""
    product = db.query(Product).filter(
        Product.id         == product_id,
        Product.is_deleted == False,
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")

    if product.barcode:
        raise HTTPException(
            status_code = 400,
            detail      = f"Ürünün zaten barkodu var: {product.barcode}",
        )

    product.barcode = _uret_barkod(db)
    db.commit()

    audit_log.log_action(
        db          = db,
        action_type = "BARCODE_GENERATE",
        user_id     = current_user.id,
        table_name  = "products",
        record_id   = product.id,
        new_value   = {"barcode": product.barcode},
        ip_address  = request.client.host if request.client else None,
        branch_id   = current_user.branch_id,
    )

    return {"success": True, "barcode": product.barcode}
