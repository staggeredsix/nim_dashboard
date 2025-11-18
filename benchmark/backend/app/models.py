"""Database models."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.sqlite import JSON as SQLITE_JSON
from sqlalchemy.orm import relationship

from .database import Base
from .schemas import BenchmarkProvider


class BenchmarkRun(Base):
    __tablename__ = "benchmark_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(Enum(BenchmarkProvider), nullable=False)
    model_name = Column(String(128), nullable=False)
    status = Column(String(32), default="queued", nullable=False)
    prompt = Column(Text, nullable=False)
    parameters = Column(JSON().with_variant(SQLITE_JSON, "sqlite"), nullable=False)
    metrics = Column(JSON().with_variant(SQLITE_JSON, "sqlite"), nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "provider": self.provider.value,
            "model_name": self.model_name,
            "status": self.status,
            "prompt": self.prompt,
            "parameters": self.parameters,
            "metrics": self.metrics,
            "error": self.error,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

    @classmethod
    def from_request(
        cls,
        provider: BenchmarkProvider,
        model_name: str,
        prompt: str,
        parameters: Dict[str, Any],
        status: str = "queued",
    ) -> "BenchmarkRun":
        return cls(
            provider=provider,
            model_name=model_name,
            prompt=prompt,
            parameters=parameters,
            status=status,
        )

    def mark_started(self) -> None:
        self.status = "running"
        self.started_at = datetime.utcnow()

    def mark_completed(self, metrics: Dict[str, Any]) -> None:
        self.status = "completed"
        self.metrics = metrics
        self.completed_at = datetime.utcnow()

    def mark_failed(self, error: str, metrics: Optional[Dict[str, Any]] = None) -> None:
        self.status = "failed"
        self.error = error
        if metrics:
            self.metrics = metrics
        self.completed_at = datetime.utcnow()


class NgcApiKeyProfile(Base):
    """Stores reusable NGC API keys with friendly labels."""

    __tablename__ = "ngc_api_key_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    usage = Column(String(128), nullable=True)
    api_key = Column(String(512), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)

    downloads = relationship(
        "NgcModelDownload",
        back_populates="profile",
        cascade="all, delete-orphan",
    )

    @property
    def masked_key(self) -> str:
        suffix = self.api_key[-4:] if len(self.api_key) >= 4 else self.api_key
        return f"***{suffix}"


class NgcModelDownload(Base):
    """Audit log linking profiles to the models they pulled."""

    __tablename__ = "ngc_model_downloads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("ngc_api_key_profiles.id"), nullable=False)
    model_name = Column(String(256), nullable=False)
    tag = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    profile = relationship("NgcApiKeyProfile", back_populates="downloads")
