"""
Market Yönetim Sistemi — Denetim İzi Servisi
Her kritik işlemde bu modül çağrılır.
Audit log kayıtları SİLİNEMEZ ve DEĞİŞTİRİLEMEZ.
"""

from sqlalchemy.orm import Session
from typing import Optional, Any


def log_action(
    db:          Session,
    action_type: str,
    user_id:     Optional[int] = None,
    table_name:  Optional[str] = None,
    record_id:   Optional[int] = None,
    old_value:   Optional[Any] = None,
    new_value:   Optional[Any] = None,
    ip_address:  Optional[str] = None,
    note:        Optional[str] = None,
    branch_id:   int = 1,
) -> None:
    """
    Kritik işlem kaydı oluşturur.

    Kullanım örnekleri:
        audit_log.log_action(db, "SALE_CREATE", user_id=1, table_name="sales", record_id=42)
        audit_log.log_action(db, "PRODUCT_UPDATE", user_id=1, table_name="products",
                             record_id=5, old_value={"price": 10.0}, new_value={"price": 12.5})
        audit_log.log_action(db, "LOGIN", user_id=1, ip_address="192.168.1.5")

    Parametreler:
        db          : Veritabanı oturumu
        action_type : İşlem türü — büyük harf konvansiyonu (LOGIN, SALE_CREATE vb.)
        user_id     : İşlemi yapan personelin ID'si
        table_name  : Etkilenen tablo adı
        record_id   : Etkilenen kaydın ID'si
        old_value   : Değişmeden önceki değer (dict)
        new_value   : Değişmeden sonraki değer (dict)
        ip_address  : İstemci IP adresi
        note        : Ek not (örn. fatura rollback için "invoice_42")
        branch_id   : Şube ID'si
    """
    # Model'i burada import ediyoruz — döngüsel import'u önlemek için
    from models import AuditLog

    # JSON serileştirme — datetime gibi özel tipler için
    def _serialize(value: Any) -> Optional[dict]:
        if value is None:
            return None
        if isinstance(value, dict):
            return value
        # SQLAlchemy model nesnelerini dict'e çevir
        if hasattr(value, "__dict__"):
            return {k: str(v) for k, v in value.__dict__.items()
                    if not k.startswith("_")}
        return {"value": str(value)}

    log_entry = AuditLog(
        branch_id   = branch_id,
        user_id     = user_id,
        action_type = action_type.upper(),
        table_name  = table_name,
        record_id   = record_id,
        old_value   = _serialize(old_value),
        new_value   = _serialize(new_value),
        ip_address  = ip_address,
        note        = note,
    )

    db.add(log_entry)
    db.commit()


def get_record_history(
    db:         Session,
    table_name: str,
    record_id:  int,
) -> list:
    """
    Belirli bir kaydın tüm değişiklik tarihçesini döner.
    Örnek: ürün fiyatı ne zaman kim tarafından değiştirildi?
    """
    from models import AuditLog

    logs = (
        db.query(AuditLog)
        .filter(
            AuditLog.table_name == table_name,
            AuditLog.record_id  == record_id,
        )
        .order_by(AuditLog.created_at.desc())
        .all()
    )
    return logs
