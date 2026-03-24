"""İlk migration — tüm tabloları oluşturur

Revision ID: 001_init
Revises    : (ilk migration)
Create Date: 2026-03-24 00:00:00

Tablolar (FK bağımlılık sırasıyla):
    branches → personnel, categories, customers, suppliers
    sessions → sales → sale_items
    products → stock_movements, sale_items, invoices, transfers
    campaigns → sale_items
    audit_logs, licenses, sales_targets, system_settings, supplier_price_logs
"""

from alembic import op
import sqlalchemy as sa


# ============================================================
# MİGRASYON KİMLİKLERİ
# ============================================================

revision = "001_init"
down_revision = None          # İlk migration — öncesi yok
branch_labels = None
depends_on = None


# ============================================================
# UPGRADE — Tüm tabloları oluştur
# ============================================================

def upgrade() -> None:

    # ----------------------------------------------------------
    # 1. ŞUBELER
    # ----------------------------------------------------------
    op.create_table(
        "branches",
        sa.Column("id",         sa.Integer(),                    nullable=False),
        sa.Column("name",       sa.String(100),                  nullable=False),
        sa.Column("address",    sa.Text(),                       nullable=True),
        sa.Column("phone",      sa.String(20),                   nullable=True),
        sa.Column("active",     sa.Boolean(),                    nullable=True,  server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True),      nullable=True,  server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_branches_id", "branches", ["id"])

    # ----------------------------------------------------------
    # 2. KATEGORİLER
    # ----------------------------------------------------------
    op.create_table(
        "categories",
        sa.Column("id",         sa.Integer(),               nullable=False),
        sa.Column("branch_id",  sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("name",       sa.String(100),             nullable=False),
        sa.Column("parent_id",  sa.Integer(),               nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"],  ["branches.id"]),
        sa.ForeignKeyConstraint(["parent_id"],  ["categories.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_categories_id", "categories", ["id"])

    # ----------------------------------------------------------
    # 3. PERSONEL
    # ----------------------------------------------------------
    op.create_table(
        "personnel",
        sa.Column("id",         sa.Integer(),               nullable=False),
        sa.Column("branch_id",  sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("name",       sa.String(100),             nullable=False),
        sa.Column("role",       sa.String(20),              nullable=False),
        sa.Column("pin",        sa.String(200),             nullable=True),
        sa.Column("email",      sa.String(100),             nullable=True),
        sa.Column("password",   sa.String(200),             nullable=True),
        sa.Column("active",     sa.Boolean(),               nullable=True,  server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_personnel_id", "personnel", ["id"])

    # ----------------------------------------------------------
    # 4. MÜŞTERİLER
    # ----------------------------------------------------------
    op.create_table(
        "customers",
        sa.Column("id",             sa.Integer(),               nullable=False),
        sa.Column("branch_id",      sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("name",           sa.String(100),             nullable=False),
        sa.Column("phone",          sa.String(20),              nullable=True),
        sa.Column("address",        sa.Text(),                  nullable=True),
        sa.Column("credit_limit",   sa.Numeric(10, 2),          nullable=True,  server_default="0"),
        sa.Column("credit_balance", sa.Numeric(10, 2),          nullable=True,  server_default="0"),
        sa.Column("loyalty_points", sa.Integer(),               nullable=True,  server_default="0"),
        sa.Column("birth_date",     sa.Date(),                  nullable=True),
        sa.Column("price_type",     sa.String(20),              nullable=True,  server_default="retail"),
        sa.Column("is_deleted",     sa.Boolean(),               nullable=True,  server_default="false"),
        sa.Column("deleted_at",     sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",     sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("phone"),
    )
    op.create_index("ix_customers_id",    "customers", ["id"])
    op.create_index("ix_customers_phone", "customers", ["phone"])

    # ----------------------------------------------------------
    # 5. TEDARİKÇİLER
    # ----------------------------------------------------------
    op.create_table(
        "suppliers",
        sa.Column("id",              sa.Integer(),               nullable=False),
        sa.Column("branch_id",       sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("name",            sa.String(100),             nullable=False),
        sa.Column("address",         sa.Text(),                  nullable=True),
        sa.Column("phone",           sa.String(20),              nullable=True),
        sa.Column("email",           sa.String(100),             nullable=True),
        sa.Column("tax_no",          sa.String(20),              nullable=True),
        sa.Column("scraper_url",     sa.String(500),             nullable=True),
        sa.Column("scraper_user",    sa.String(100),             nullable=True),
        sa.Column("scraper_pass_enc",sa.Text(),                  nullable=True),
        sa.Column("scraping_active", sa.Boolean(),               nullable=True,  server_default="false"),
        sa.Column("is_deleted",      sa.Boolean(),               nullable=True,  server_default="false"),
        sa.Column("deleted_at",      sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_suppliers_id", "suppliers", ["id"])

    # ----------------------------------------------------------
    # 6. ÜRÜNLER
    # ----------------------------------------------------------
    op.create_table(
        "products",
        sa.Column("id",              sa.Integer(),               nullable=False),
        sa.Column("branch_id",       sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("name",            sa.String(200),             nullable=False),
        sa.Column("barcode",         sa.String(50),              nullable=True),
        sa.Column("category_id",     sa.Integer(),               nullable=True),
        sa.Column("unit",            sa.String(20),              nullable=True,  server_default="adet"),
        sa.Column("price",           sa.Numeric(10, 2),          nullable=False),
        sa.Column("price_wholesale", sa.Numeric(10, 2),          nullable=True),
        sa.Column("price_credit",    sa.Numeric(10, 2),          nullable=True),
        sa.Column("price_staff",     sa.Numeric(10, 2),          nullable=True),
        sa.Column("cost",            sa.Numeric(10, 2),          nullable=True),
        sa.Column("margin_percent",  sa.Numeric(5, 2),           nullable=True,  server_default="20"),
        sa.Column("stock_qty",       sa.Integer(),               nullable=True,  server_default="0"),
        sa.Column("min_stock",       sa.Integer(),               nullable=True,  server_default="5"),
        sa.Column("max_stock",       sa.Integer(),               nullable=True),
        sa.Column("vat_rate",        sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("shelf_location",  sa.String(50),              nullable=True),
        sa.Column("supplier_code",   sa.String(100),             nullable=True),
        sa.Column("expiry_date",     sa.Date(),                  nullable=True),
        sa.Column("image_url",       sa.Text(),                  nullable=True),
        sa.Column("is_deleted",      sa.Boolean(),               nullable=True,  server_default="false"),
        sa.Column("deleted_at",      sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.Column("updated_at",      sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"],   ["branches.id"]),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("barcode"),
    )
    op.create_index("ix_products_id",      "products", ["id"])
    op.create_index("ix_products_name",    "products", ["name"])
    op.create_index("ix_products_barcode", "products", ["barcode"])

    # ----------------------------------------------------------
    # 7. STOK HAREKETLERİ
    # ----------------------------------------------------------
    op.create_table(
        "stock_movements",
        sa.Column("id",         sa.Integer(),               nullable=False),
        sa.Column("branch_id",  sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("product_id", sa.Integer(),               nullable=True),
        sa.Column("type",       sa.String(20),              nullable=True),
        sa.Column("qty_before", sa.Integer(),               nullable=True),
        sa.Column("qty_change", sa.Integer(),               nullable=True),
        sa.Column("qty_after",  sa.Integer(),               nullable=True),
        sa.Column("note",       sa.Text(),                  nullable=True),
        sa.Column("user_id",    sa.Integer(),               nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"],  ["branches.id"]),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"]),
        sa.ForeignKeyConstraint(["user_id"],    ["personnel.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_movements_id", "stock_movements", ["id"])

    # ----------------------------------------------------------
    # 8. KAMPANYALAR
    # ----------------------------------------------------------
    op.create_table(
        "campaigns",
        sa.Column("id",         sa.Integer(),               nullable=False),
        sa.Column("branch_id",  sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("name",       sa.String(100),             nullable=True),
        sa.Column("type",       sa.String(30),              nullable=True),
        sa.Column("value",      sa.Numeric(10, 2),          nullable=True),
        sa.Column("min_qty",    sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("free_qty",   sa.Integer(),               nullable=True,  server_default="0"),
        sa.Column("start_date", sa.Date(),                  nullable=True),
        sa.Column("end_date",   sa.Date(),                  nullable=True),
        sa.Column("active",     sa.Boolean(),               nullable=True,  server_default="true"),
        sa.Column("is_deleted", sa.Boolean(),               nullable=True,  server_default="false"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_campaigns_id", "campaigns", ["id"])

    # ----------------------------------------------------------
    # 9. VARDİYALAR (KASA OTURUMLARI)
    # ----------------------------------------------------------
    op.create_table(
        "sessions",
        sa.Column("id",             sa.Integer(),               nullable=False),
        sa.Column("branch_id",      sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("cashier_id",     sa.Integer(),               nullable=True),
        sa.Column("opening_amount", sa.Numeric(10, 2),          nullable=True),
        sa.Column("closing_amount", sa.Numeric(10, 2),          nullable=True),
        sa.Column("opened_at",      sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.Column("closed_at",      sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"],  ["branches.id"]),
        sa.ForeignKeyConstraint(["cashier_id"], ["personnel.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sessions_id", "sessions", ["id"])

    # ----------------------------------------------------------
    # 10. SATIŞLAR
    # ----------------------------------------------------------
    op.create_table(
        "sales",
        sa.Column("id",           sa.Integer(),               nullable=False),
        sa.Column("branch_id",    sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("customer_id",  sa.Integer(),               nullable=True),
        sa.Column("cashier_id",   sa.Integer(),               nullable=True),
        sa.Column("session_id",   sa.Integer(),               nullable=True),
        sa.Column("total",        sa.Numeric(10, 2),          nullable=True),
        sa.Column("discount",     sa.Numeric(10, 2),          nullable=True,  server_default="0"),
        sa.Column("vat_amount",   sa.Numeric(10, 2),          nullable=True),
        sa.Column("payment_type", sa.String(20),              nullable=True),
        sa.Column("cash_given",   sa.Numeric(10, 2),          nullable=True),
        sa.Column("change_given", sa.Numeric(10, 2),          nullable=True),
        sa.Column("status",       sa.String(20),              nullable=True,  server_default="completed"),
        sa.Column("created_at",   sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"],   ["branches.id"]),
        sa.ForeignKeyConstraint(["cashier_id"],  ["personnel.id"]),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"]),
        sa.ForeignKeyConstraint(["session_id"],  ["sessions.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sales_id", "sales", ["id"])

    # ----------------------------------------------------------
    # 11. SATIŞ KALEMLERİ
    # ----------------------------------------------------------
    op.create_table(
        "sale_items",
        sa.Column("id",          sa.Integer(),      nullable=False),
        sa.Column("branch_id",   sa.Integer(),      nullable=True,  server_default="1"),
        sa.Column("sale_id",     sa.Integer(),      nullable=True),
        sa.Column("product_id",  sa.Integer(),      nullable=True),
        sa.Column("qty",         sa.Numeric(10, 3), nullable=True),
        sa.Column("unit_price",  sa.Numeric(10, 2), nullable=True),
        sa.Column("discount",    sa.Numeric(10, 2), nullable=True,  server_default="0"),
        sa.Column("total",       sa.Numeric(10, 2), nullable=True),
        sa.Column("campaign_id", sa.Integer(),      nullable=True),
        sa.ForeignKeyConstraint(["branch_id"],   ["branches.id"]),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"]),
        sa.ForeignKeyConstraint(["product_id"],  ["products.id"]),
        sa.ForeignKeyConstraint(["sale_id"],     ["sales.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sale_items_id", "sale_items", ["id"])

    # ----------------------------------------------------------
    # 12. FATURALAR
    # ----------------------------------------------------------
    op.create_table(
        "invoices",
        sa.Column("id",          sa.Integer(),               nullable=False),
        sa.Column("branch_id",   sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("supplier_id", sa.Integer(),               nullable=True),
        sa.Column("file_name",   sa.String(200),             nullable=True),
        sa.Column("file_type",   sa.String(10),              nullable=True),
        sa.Column("total",       sa.Numeric(10, 2),          nullable=True),
        sa.Column("status",      sa.String(20),              nullable=True,  server_default="pending"),
        sa.Column("uploaded_by", sa.Integer(),               nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["branch_id"],   ["branches.id"]),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"]),
        sa.ForeignKeyConstraint(["uploaded_by"], ["personnel.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_invoices_id", "invoices", ["id"])

    # ----------------------------------------------------------
    # 13. ŞUBELER ARASI TRANSFER
    # ----------------------------------------------------------
    op.create_table(
        "transfers",
        sa.Column("id",             sa.Integer(),               nullable=False),
        sa.Column("from_branch_id", sa.Integer(),               nullable=True),
        sa.Column("to_branch_id",   sa.Integer(),               nullable=True),
        sa.Column("product_id",     sa.Integer(),               nullable=True),
        sa.Column("qty",            sa.Integer(),               nullable=True),
        sa.Column("status",         sa.String(20),              nullable=True,  server_default="pending"),
        sa.Column("note",           sa.Text(),                  nullable=True),
        sa.Column("created_by",     sa.Integer(),               nullable=True),
        sa.Column("created_at",     sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["from_branch_id"], ["branches.id"]),
        sa.ForeignKeyConstraint(["to_branch_id"],   ["branches.id"]),
        sa.ForeignKeyConstraint(["product_id"],     ["products.id"]),
        sa.ForeignKeyConstraint(["created_by"],     ["personnel.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_transfers_id", "transfers", ["id"])

    # ----------------------------------------------------------
    # 14. DENETİM İZİ (AUDIT LOG)
    # ----------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id",          sa.BigInteger(),            nullable=False),
        sa.Column("branch_id",   sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("user_id",     sa.Integer(),               nullable=True),
        sa.Column("action_type", sa.String(50),              nullable=False),
        sa.Column("table_name",  sa.String(50),              nullable=True),
        sa.Column("record_id",   sa.Integer(),               nullable=True),
        sa.Column("old_value",   sa.JSON(),                  nullable=True),
        sa.Column("new_value",   sa.JSON(),                  nullable=True),
        sa.Column("ip_address",  sa.String(45),              nullable=True),
        sa.Column("note",        sa.Text(),                  nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.ForeignKeyConstraint(["user_id"],   ["personnel.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_id", "audit_logs", ["id"])

    # ----------------------------------------------------------
    # 15. LİSANSLAR
    # ----------------------------------------------------------
    op.create_table(
        "licenses",
        sa.Column("id",            sa.Integer(),               nullable=False),
        sa.Column("branch_id",     sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("customer_name", sa.String(100),             nullable=True),
        sa.Column("email",         sa.String(100),             nullable=True),
        sa.Column("phone",         sa.String(20),              nullable=True),
        sa.Column("license_key",   sa.String(50),              nullable=True),
        sa.Column("package",       sa.String(20),              nullable=True),
        sa.Column("branch_limit",  sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("device_limit",  sa.Integer(),               nullable=True,  server_default="2"),
        sa.Column("start_date",    sa.Date(),                  nullable=True),
        sa.Column("end_date",      sa.Date(),                  nullable=True),
        sa.Column("status",        sa.String(20),              nullable=True,  server_default="active"),
        sa.Column("created_at",    sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("license_key"),
    )
    op.create_index("ix_licenses_id",          "licenses", ["id"])
    op.create_index("ix_licenses_license_key", "licenses", ["license_key"])

    # ----------------------------------------------------------
    # 16. SATIŞ HEDEFLERİ
    # ----------------------------------------------------------
    op.create_table(
        "sales_targets",
        sa.Column("id",            sa.Integer(),               nullable=False),
        sa.Column("branch_id",     sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("type",          sa.String(10),              nullable=False),
        sa.Column("target_amount", sa.Numeric(12, 2),          nullable=False),
        sa.Column("period_start",  sa.Date(),                  nullable=False),
        sa.Column("note",          sa.String(200),             nullable=True),
        sa.Column("created_by",    sa.Integer(),               nullable=True),
        sa.Column("created_at",    sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.Column("updated_at",    sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"],  ["branches.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["personnel.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_sales_targets_id", "sales_targets", ["id"])

    # ----------------------------------------------------------
    # 17. SİSTEM AYARLARI
    # ----------------------------------------------------------
    op.create_table(
        "system_settings",
        sa.Column("id",         sa.Integer(),               nullable=False),
        sa.Column("branch_id",  sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("key",        sa.String(100),             nullable=False),
        sa.Column("value",      sa.Text(),                  nullable=True),
        sa.Column("value_enc",  sa.Text(),                  nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["branch_id"], ["branches.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_system_settings_id", "system_settings", ["id"])

    # ----------------------------------------------------------
    # 18. TEDARİKÇİ FİYAT TAKİP KAYITLARI
    # ----------------------------------------------------------
    op.create_table(
        "supplier_price_logs",
        sa.Column("id",             sa.Integer(),               nullable=False),
        sa.Column("branch_id",      sa.Integer(),               nullable=True,  server_default="1"),
        sa.Column("supplier_id",    sa.Integer(),               nullable=True),
        sa.Column("product_code",   sa.String(100),             nullable=True),
        sa.Column("product_name",   sa.String(200),             nullable=True),
        sa.Column("old_price",      sa.Numeric(10, 2),          nullable=True),
        sa.Column("new_price",      sa.Numeric(10, 2),          nullable=True),
        sa.Column("change_percent", sa.Numeric(6, 2),           nullable=True),
        sa.Column("detected_at",    sa.DateTime(timezone=True), nullable=True,  server_default=sa.text("now()")),
        sa.Column("notified",       sa.Boolean(),               nullable=True,  server_default="false"),
        sa.ForeignKeyConstraint(["branch_id"],   ["branches.id"]),
        sa.ForeignKeyConstraint(["supplier_id"], ["suppliers.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_supplier_price_logs_id", "supplier_price_logs", ["id"])

    # ----------------------------------------------------------
    # VARSAYILAN VERİ — Merkez şubesi (id=1 zorunlu, FK referansı)
    # ----------------------------------------------------------
    # Kullanıcılar seed.py ile eklenir (şifre hash için bcrypt gerekir)
    op.execute(
        "INSERT INTO branches (id, name, active) VALUES (1, 'Merkez', true)"
    )


# ============================================================
# DOWNGRADE — Tüm tabloları sil (FK sırasının tersi)
# ============================================================

def downgrade() -> None:
    # Ters sırada sil — FK kısıtlamaları ihlal edilmesin
    op.drop_table("supplier_price_logs")
    op.drop_table("system_settings")
    op.drop_table("sales_targets")
    op.drop_table("licenses")
    op.drop_table("audit_logs")
    op.drop_table("transfers")
    op.drop_table("invoices")
    op.drop_table("sale_items")
    op.drop_table("sales")
    op.drop_table("sessions")
    op.drop_table("campaigns")
    op.drop_table("stock_movements")
    op.drop_table("products")
    op.drop_table("suppliers")
    op.drop_table("customers")
    op.drop_table("personnel")
    op.drop_table("categories")
    op.drop_table("branches")
