"""units_per_case + idempotency_keys tablosu

Revision ID: 002_units_idempotency
Revises    : 001_init
Create Date: 2026-03-26 00:00:00

Değişiklikler:
    - products.units_per_case (INTEGER DEFAULT 1) eklendi
    - idempotency_keys tablosu eklendi (offline sync güvenliği)
"""

from alembic import op
import sqlalchemy as sa

revision = '002_units_idempotency'
down_revision = '001_init'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── products tablosuna units_per_case sütunu ekle ──
    op.add_column(
        'products',
        sa.Column('units_per_case', sa.Integer(), nullable=False, server_default='1')
    )

    # ── İdempotency tablosu ──
    op.create_table(
        'idempotency_keys',
        sa.Column('id',           sa.Integer(),     primary_key=True),
        sa.Column('operation_id', sa.String(36),    nullable=False, unique=True, index=True),
        sa.Column('endpoint',     sa.String(200),   nullable=False),
        sa.Column('created_at',   sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('idempotency_keys')
    op.drop_column('products', 'units_per_case')
