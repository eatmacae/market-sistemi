"""
Market Yönetim Sistemi — Seed Script
İlk kurulumda çalıştırılır: python seed.py

Yapar:
  1. Merkez şubesi (id=1) — zaten migration'da var, kontrol eder
  2. Admin kullanıcısı — şifre ve PIN'i burada hash'ler (güvenli)
  3. Örnek kategoriler
  4. Örnek ürünler (5 adet)

Kullanım:
  cd backend
  python seed.py
"""

import os
import sys
from dotenv import load_dotenv

load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models   import Branch, Personnel, Category, Product
from passlib.context import CryptContext

# Bcrypt context
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

db = SessionLocal()


def seed():
    print("🌱 Seed başlıyor...\n")

    # ──────────────────────────────────────────────────────
    # 1. Merkez Şubesi
    # ──────────────────────────────────────────────────────
    sube = db.query(Branch).filter_by(id=1).first()
    if not sube:
        sube = Branch(id=1, name="Merkez", active=True)
        db.add(sube)
        db.flush()
        print("  ✅ Merkez şubesi oluşturuldu.")
    else:
        print("  ℹ️  Merkez şubesi zaten mevcut.")

    # ──────────────────────────────────────────────────────
    # 2. Admin Kullanıcısı
    # ──────────────────────────────────────────────────────
    admin = db.query(Personnel).filter_by(email="admin@market.local").first()
    if not admin:
        admin = Personnel(
            branch_id = 1,
            name      = "Sistem Yöneticisi",
            role      = "admin",
            email     = "admin@market.local",
            password  = pwd_ctx.hash("admin123"),   # ← DEĞİŞTİR!
            pin       = pwd_ctx.hash("123456"),      # ← DEĞİŞTİR!
            active    = True,
        )
        db.add(admin)
        print("  ✅ Admin kullanıcısı oluşturuldu.")
        print("     E-posta : admin@market.local")
        print("     Şifre   : admin123  ← MUTLAKA DEĞİŞTİR!")
        print("     PIN     : 123456    ← MUTLAKA DEĞİŞTİR!")
    else:
        print("  ℹ️  Admin kullanıcısı zaten mevcut.")

    # ──────────────────────────────────────────────────────
    # 3. Temel Kategoriler
    # ──────────────────────────────────────────────────────
    kategoriler = [
        "Gıda",
        "İçecek",
        "Temizlik",
        "Kişisel Bakım",
        "Elektronik",
        "Diğer",
    ]
    eklenen = 0
    for kat_adi in kategoriler:
        mevcut = db.query(Category).filter_by(branch_id=1, name=kat_adi).first()
        if not mevcut:
            db.add(Category(branch_id=1, name=kat_adi))
            eklenen += 1

    if eklenen:
        print(f"  ✅ {eklenen} kategori eklendi.")
    else:
        print("  ℹ️  Kategoriler zaten mevcut.")

    db.flush()

    # Gıda kategorisini bul
    gida_kat = db.query(Category).filter_by(branch_id=1, name="Gıda").first()

    # ──────────────────────────────────────────────────────
    # 4. Örnek Ürünler
    # ──────────────────────────────────────────────────────
    ornek_urunler = [
        {
            "name"       : "Ekmek 350g",
            "barcode"    : "8690000000001",
            "price"      : 7.50,
            "cost"       : 5.00,
            "stock_qty"  : 50,
            "min_stock"  : 10,
            "vat_rate"   : 1,
            "unit"       : "adet",
        },
        {
            "name"       : "Su 1.5L",
            "barcode"    : "8690000000002",
            "price"      : 12.00,
            "cost"       : 8.00,
            "stock_qty"  : 100,
            "min_stock"  : 20,
            "vat_rate"   : 1,
            "unit"       : "adet",
        },
        {
            "name"       : "Süt 1L",
            "barcode"    : "8690000000003",
            "price"      : 28.00,
            "cost"       : 22.00,
            "stock_qty"  : 30,
            "min_stock"  : 10,
            "vat_rate"   : 1,
            "unit"       : "adet",
        },
        {
            "name"       : "Yumurta (10'lu)",
            "barcode"    : "8690000000004",
            "price"      : 45.00,
            "cost"       : 35.00,
            "stock_qty"  : 20,
            "min_stock"  : 5,
            "vat_rate"   : 1,
            "unit"       : "kutu",
        },
        {
            "name"       : "Zeytinyağı 1L",
            "barcode"    : "8690000000005",
            "price"      : 250.00,
            "cost"       : 200.00,
            "stock_qty"  : 15,
            "min_stock"  : 3,
            "vat_rate"   : 10,
            "unit"       : "şişe",
        },
    ]

    eklenen = 0
    for u in ornek_urunler:
        mevcut = db.query(Product).filter_by(barcode=u["barcode"]).first()
        if not mevcut:
            db.add(Product(
                branch_id   = 1,
                category_id = gida_kat.id if gida_kat else None,
                **u,
            ))
            eklenen += 1

    if eklenen:
        print(f"  ✅ {eklenen} örnek ürün eklendi.")
    else:
        print("  ℹ️  Örnek ürünler zaten mevcut.")

    # ──────────────────────────────────────────────────────
    # Kaydet
    # ──────────────────────────────────────────────────────
    db.commit()
    print("\n✅ Seed tamamlandı!")
    print("\n📋 Giriş bilgileri:")
    print("   URL    : http://sunucu-ip:8000")
    print("   E-posta: admin@market.local")
    print("   Şifre  : admin123")
    print("   PIN    : 123456")
    print("\n⚠️  Üretim ortamında şifreleri mutlaka değiştirin!")


if __name__ == "__main__":
    try:
        seed()
    except Exception as e:
        db.rollback()
        print(f"\n❌ Seed hatası: {e}")
        raise
    finally:
        db.close()
