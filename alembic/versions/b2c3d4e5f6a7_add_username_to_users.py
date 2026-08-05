"""add username to users

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-08-05 20:00:00.000000

The login credential moves from the e-mail to a username. Existing rows are backfilled
from the e-mail's local part -- the same derivation the tests use -- so nobody loses
access. PostgreSQL-specific SQL: it is the only database this project runs migrations
against (tests build their schema straight from the models on SQLite).

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('username', sa.String(length=32), nullable=True))

    # Local part of the e-mail, lower-cased, stripped of anything outside the allow-list.
    op.execute(
        """
        UPDATE users
           SET username = regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9._-]', '', 'g')
        """
    )
    # A name has to start alphanumeric and be at least 3 characters long.
    op.execute(
        """
        UPDATE users
           SET username = 'user' || username
         WHERE username !~ '^[a-z0-9]' OR length(username) < 3
        """
    )
    # Two addresses can share a local part on different domains; keep the oldest bare.
    op.execute(
        """
        UPDATE users AS u
           SET username = left(u.username, 30) || d.rn::text
          FROM (
                SELECT id,
                       row_number() OVER (PARTITION BY username ORDER BY created_at, id) AS rn
                  FROM users
               ) AS d
         WHERE u.id = d.id AND d.rn > 1
        """
    )
    op.execute("UPDATE users SET username = left(username, 32)")

    op.alter_column('users', 'username', nullable=False)
    op.create_index('ix_users_username', 'users', ['username'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_users_username', table_name='users')
    op.drop_column('users', 'username')
