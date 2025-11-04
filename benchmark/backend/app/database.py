"""Database configuration and utilities."""
from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from pathlib import Path

from .settings import settings


engine = create_engine(settings.database_url, future=True)
SessionLocal = sessionmaker(bind=engine, class_=Session, expire_on_commit=False)
Base = declarative_base()


def create_all() -> None:
    if settings.database_url.startswith("sqlite"):
        db_path = settings.database_url.split("///")[-1]
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    from . import models  # noqa: F401 ensures models are registered

    Base.metadata.create_all(bind=engine)


@contextmanager
def get_session() -> Iterator[Session]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
