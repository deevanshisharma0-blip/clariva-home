import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from .config import settings

log = logging.getLogger("nexus.db")

# Use DATABASE_URL from env (Supabase Postgres in production, SQLite locally)
_db_url = settings.database_url

engine = create_async_engine(
    _db_url,
    echo=False,
    # Postgres pool settings (ignored for SQLite)
    pool_pre_ping=True,
    pool_recycle=300,
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


_IS_POSTGRES = _db_url.startswith("postgresql")


async def _migrate_schema(conn) -> None:
    """Add new columns to existing tables without dropping data.

    Safe to run on any startup — already-existing columns are silently skipped.
    """
    if _IS_POSTGRES:
        # PostgreSQL: use IF NOT EXISTS syntax to avoid errors
        migrations = [
            "ALTER TABLE approvals ADD COLUMN IF NOT EXISTS execution_status VARCHAR(30)",
            "ALTER TABLE approvals ADD COLUMN IF NOT EXISTS execution_result JSONB",
            "ALTER TABLE approvals ADD COLUMN IF NOT EXISTS executed_at TIMESTAMP",
        ]
        for sql in migrations:
            try:
                await conn.execute(text(sql))
            except Exception as exc:
                log.debug("PG migration skipped: %s", exc)
    else:
        # SQLite: catch-and-ignore on duplicate column
        migrations = [
            "ALTER TABLE approvals ADD COLUMN execution_status VARCHAR(30)",
            "ALTER TABLE approvals ADD COLUMN execution_result TEXT",
            "ALTER TABLE approvals ADD COLUMN executed_at DATETIME",
        ]
        for sql in migrations:
            try:
                await conn.execute(text(sql))
            except Exception:
                pass  # column already exists


async def init_db():
    from . import models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_schema(conn)
    log.info("Database ready (%s)", "PostgreSQL" if _IS_POSTGRES else "SQLite")
