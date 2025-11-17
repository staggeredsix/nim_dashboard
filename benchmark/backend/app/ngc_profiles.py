"""Persistence helpers for managing reusable NGC API keys."""
from __future__ import annotations

from datetime import datetime
from typing import List

from fastapi import HTTPException
from sqlalchemy import delete, select

from .database import get_session
from .models import NgcApiKeyProfile, NgcModelDownload
from .schemas import (
    ModelActionResponse,
    NgcDownloadHistoryItem,
    NgcProfileCreateRequest,
    NgcProfileResponse,
)


class NgcProfileService:
    """CRUD helpers around :class:`NgcApiKeyProfile`."""

    RECENT_DOWNLOAD_LIMIT = 10

    def list_profiles(self) -> List[NgcProfileResponse]:
        with get_session() as session:
            statement = select(NgcApiKeyProfile).order_by(NgcApiKeyProfile.created_at.desc())
            profiles = session.execute(statement).scalars().all()
            return [self._serialize_profile(profile, session) for profile in profiles]

    def create_profile(self, request: NgcProfileCreateRequest) -> NgcProfileResponse:
        if not request.api_key.strip():
            raise HTTPException(status_code=400, detail="API key cannot be empty")
        with get_session() as session:
            profile = NgcApiKeyProfile(
                name=request.name.strip(),
                usage=request.usage.strip() if request.usage else None,
                api_key=request.api_key.strip(),
            )
            session.add(profile)
            session.flush()
            session.refresh(profile)
            return self._serialize_profile(profile, session)

    def delete_profile(self, profile_id: int) -> ModelActionResponse:
        with get_session() as session:
            statement = delete(NgcApiKeyProfile).where(NgcApiKeyProfile.id == profile_id)
            result = session.execute(statement)
            if result.rowcount == 0:
                raise HTTPException(status_code=404, detail="Profile not found")
        return ModelActionResponse(status="deleted", detail="NGC profile removed", metadata={"id": profile_id})

    def resolve_api_key(self, profile_id: int) -> str:
        with get_session() as session:
            profile = session.get(NgcApiKeyProfile, profile_id)
            if not profile:
                raise HTTPException(status_code=404, detail="Profile not found")
            profile.last_used_at = datetime.utcnow()
            session.add(profile)
            return profile.api_key

    def list_downloads(self, profile_id: int) -> List[NgcDownloadHistoryItem]:
        with get_session() as session:
            profile = session.get(NgcApiKeyProfile, profile_id)
            if not profile:
                raise HTTPException(status_code=404, detail="Profile not found")
            return self._serialize_downloads(profile_id, session)

    def record_download(self, profile_id: int, model_name: str, tag: str | None = None) -> None:
        timestamp = datetime.utcnow()
        with get_session() as session:
            profile = session.get(NgcApiKeyProfile, profile_id)
            if not profile:
                raise HTTPException(status_code=404, detail="Profile not found")
            download = NgcModelDownload(
                profile_id=profile_id,
                model_name=model_name,
                tag=tag,
                created_at=timestamp,
            )
            session.add(download)
            profile.last_used_at = timestamp
            session.add(profile)

    def mark_profile_used(self, profile_id: int) -> None:
        with get_session() as session:
            profile = session.get(NgcApiKeyProfile, profile_id)
            if profile:
                profile.last_used_at = datetime.utcnow()
                session.add(profile)

    def _serialize_profile(self, profile: NgcApiKeyProfile, session) -> NgcProfileResponse:
        downloads = self._serialize_downloads(profile.id, session)
        return NgcProfileResponse(
            id=profile.id,
            name=profile.name,
            usage=profile.usage,
            masked_key=profile.masked_key,
            created_at=profile.created_at.isoformat(),
            last_used_at=profile.last_used_at.isoformat() if profile.last_used_at else None,
            recent_downloads=downloads,
        )

    def _serialize_downloads(self, profile_id: int, session) -> List[NgcDownloadHistoryItem]:
        statement = (
            select(NgcModelDownload)
            .where(NgcModelDownload.profile_id == profile_id)
            .order_by(NgcModelDownload.created_at.desc())
            .limit(self.RECENT_DOWNLOAD_LIMIT)
        )
        downloads = session.execute(statement).scalars().all()
        return [
            NgcDownloadHistoryItem(
                id=download.id,
                model_name=download.model_name,
                tag=download.tag,
                downloaded_at=download.created_at.isoformat(),
            )
            for download in downloads
        ]
