"""${message}

Revizyon ID    : ${up_revision}
Önceki Revizyon: ${down_revision | comma,n}
Oluşturulma    : ${create_date}

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# Revizyon kimlikleri
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    """Migration'ı uygula"""
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    """Migration'ı geri al"""
    ${downgrades if downgrades else "pass"}
