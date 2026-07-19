from __future__ import annotations

import hashlib
import logging
import math
import os
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Literal
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from dotenv import load_dotenv
from starlette.datastructures import UploadFile

from app.game_samples import GameSampleError, get_game_clip_file, get_game_round
from app.hugging_face import DetectionRuntimeError, run_hugging_face_detection
from app.persistence import (
    get_authenticated_user_id,
    get_detection_history,
    get_public_insights,
    is_supabase_persistence_enabled,
    persist_detection_feedback,
    persist_detection_result,
    persist_game_score,
)
from app.video_preview import (
    ANALYSIS_MAX_BYTES,
    ANALYSIS_MAX_DURATION_SEC,
    VideoPreview,
    VideoPreviewError,
    create_analysis_segment,
    create_uploaded_video_preview,
    create_url_video_preview,
    get_video_preview_media,
    get_video_preview_window_clip,
    generate_thumbnail_strip,
    get_video_preview_thumbnail_path,
    normalize_trim_range,
    probe_video_metadata,
    trim_video_segment,
)

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

logger = logging.getLogger(__name__)
WEB_DIR = Path(__file__).resolve().parents[2] / "web"
WEB_ASSETS_DIR = WEB_DIR / "assets"

app = FastAPI(
    title="VigilVid API",
    description="Backend proxy for VigilVid video detection workflows.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

if WEB_ASSETS_DIR.exists():
    app.mount(
        "/assets",
        StaticFiles(directory=WEB_ASSETS_DIR),
        name="web-assets",
    )

DetectionSourceType = Literal["url", "upload", "share"]
DetectionLabel = Literal["real", "partially_real", "partially_fake", "fake"]
DetectionFeedbackType = Literal[
    "false_positive",
    "false_negative",
    "unclear_result",
    "other",
]
GameMode = Literal["solo"]
MAX_UPLOAD_BYTES = 100 * 1024 * 1024
UPLOAD_CHUNK_BYTES = 1024 * 1024
IDEMPOTENCY_KEY_HEADER = "Idempotency-Key"


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class DetectionCreateRequest(ApiModel):
    url: str | None = None
    preview_id: str | None = Field(default=None, alias="previewId")
    source_type: DetectionSourceType = Field(alias="sourceType")
    trim_start_sec: float | None = Field(default=None, alias="trimStartSec")
    trim_end_sec: float | None = Field(default=None, alias="trimEndSec")


class DetectionFeedbackRequest(ApiModel):
    feedback_type: DetectionFeedbackType = Field(alias="feedbackType")
    comment: str = ""


class GameScoreRequest(ApiModel):
    mode: GameMode = "solo"
    score: int = Field(ge=0)
    correct_count: int = Field(alias="correctCount", ge=0)
    total_rounds: int = Field(alias="totalRounds", gt=0)
    best_streak: int = Field(alias="bestStreak", ge=0)
    round_ids: list[str] = Field(default_factory=list, alias="roundIds")


class VideoPreviewRequest(ApiModel):
    url: str
    source_type: DetectionSourceType = Field(alias="sourceType")


@dataclass
class DetectionJob:
    detection_id: str
    created_at: float
    source_type: DetectionSourceType
    user_id: str | None = None
    url: str | None = None
    file_path: Path | None = None
    file_name: str | None = None
    content_type: str | None = None
    file_size_bytes: int | None = None
    original_url: str | None = None
    idempotency_key: str | None = None
    thumbnail_strip_url: str | None = None
    status: Literal["queued", "processing", "completed", "failed"] = "queued"
    progress_message: str = "Preparing video"
    result: dict[str, object] | None = None
    error_code: str | None = None
    error_message: str | None = None


@dataclass
class DetectionFeedback:
    detection_id: str
    created_at: float
    feedback_type: DetectionFeedbackType
    comment: str
    user_id: str | None = None


detection_jobs: dict[str, DetectionJob] = {}
detection_jobs_by_idempotency_key: dict[str, str] = {}
detection_thumbnail_strips: dict[str, Path] = {}
detection_feedback: list[DetectionFeedback] = []
detection_jobs_lock = Lock()
detection_executor = ThreadPoolExecutor(
    max_workers=int(os.getenv("DETECTION_WORKERS", "2")),
)


@app.get("/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "vigilvid-api",
    }


@app.get("/", include_in_schema=False)
def get_web_index() -> FileResponse:
    return get_web_file("index.html", "text/html")


@app.get("/index.html", include_in_schema=False)
def get_web_index_file() -> FileResponse:
    return get_web_file("index.html", "text/html")


@app.get("/stats", include_in_schema=False)
def get_web_stats_shortcut() -> FileResponse:
    return get_web_file("stats.html", "text/html")


@app.get("/stats.html", include_in_schema=False)
def get_web_stats() -> FileResponse:
    return get_web_file("stats.html", "text/html")


@app.get("/styles.css", include_in_schema=False)
def get_web_styles() -> FileResponse:
    return get_web_file("styles.css", "text/css")


@app.get("/app.js", include_in_schema=False)
def get_web_script() -> FileResponse:
    return get_web_file("app.js", "application/javascript")


def get_web_file(file_name: str, media_type: str) -> FileResponse:
    file_path = WEB_DIR / file_name
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Public website file was not found.",
        )

    return FileResponse(file_path, media_type=media_type)


@app.post("/api/video-previews")
def create_video_preview(
    request: VideoPreviewRequest,
    http_request: Request,
) -> dict[str, object]:
    if request.source_type not in {"url", "share"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paste a video link.",
        )

    try:
        preview = create_url_video_preview(
            url=request.url.strip(),
            source_type=request.source_type,
        )
    except VideoPreviewError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return build_video_preview_response(preview, get_public_base_url(http_request))


@app.post("/api/video-previews/upload")
async def create_upload_video_preview(http_request: Request) -> dict[str, object]:
    file_path: Path | None = None

    try:
        async with http_request.form(
            max_files=1,
            max_fields=1,
            max_part_size=MAX_UPLOAD_BYTES,
        ) as form:
            source_type = parse_source_type(str(form.get("sourceType", "")))
            file_value = form.get("file")

            if source_type not in {"upload", "share"}:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Choose a video file.",
                )

            if not isinstance(file_value, UploadFile):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A video file is required.",
                )

            content_type = file_value.content_type or ""
            if content_type and not (
                content_type.startswith("video/")
                or content_type == "application/octet-stream"
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Choose a video file.",
                )

            file_path, _ = await save_upload_to_temp_file(
                file_value,
                f"upload_preview_{uuid.uuid4().hex[:12]}",
            )
            preview = create_uploaded_video_preview(
                file_path=file_path,
                source_type=source_type,
                content_type=content_type or "video/mp4",
            )
            file_path = None
    except HTTPException:
        cleanup_uploaded_file(file_path)
        raise
    except VideoPreviewError as exc:
        cleanup_uploaded_file(file_path)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        cleanup_uploaded_file(file_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The upload preview could not be prepared.",
        ) from exc

    return build_video_preview_response(preview, get_public_base_url(http_request))


@app.get("/api/video-previews/{preview_id}/thumbnail-strip.jpg")
def get_video_preview_thumbnail(preview_id: str) -> FileResponse:
    thumbnail_path = get_video_preview_thumbnail_path(preview_id)
    if thumbnail_path is None or not thumbnail_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video preview thumbnail was not found.",
        )

    return FileResponse(thumbnail_path, media_type="image/jpeg")


@app.get("/api/video-previews/{preview_id}/video.mp4")
def get_video_preview_media_file(preview_id: str) -> FileResponse:
    media = get_video_preview_media(preview_id)
    if media is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video preview was not found.",
        )

    media_path, content_type = media
    if not media_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Video preview file was not found.",
        )

    media_type = content_type if content_type.startswith("video/") else "video/mp4"
    return FileResponse(media_path, media_type=media_type)


@app.get("/api/video-previews/{preview_id}/window-clip.mp4")
def get_video_preview_window_clip_file(
    preview_id: str,
    start_sec: float = Query(alias="startSec"),
    end_sec: float = Query(alias="endSec"),
) -> FileResponse:
    try:
        clip_path = get_video_preview_window_clip(
            preview_id=preview_id,
            start_sec=start_sec,
            end_sec=end_sec,
        )
    except VideoPreviewError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    if not clip_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preview clip was not found.",
        )

    return FileResponse(clip_path, media_type="video/mp4")


@app.get("/api/detections/{detection_id}/thumbnail-strip.jpg")
def get_detection_thumbnail(detection_id: str) -> FileResponse:
    thumbnail_path = detection_thumbnail_strips.get(detection_id)
    if thumbnail_path is None or not thumbnail_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Preview image was not found.",
        )

    return FileResponse(thumbnail_path, media_type="image/jpeg")


def build_video_preview_response(
    preview: VideoPreview,
    public_base_url: str,
) -> dict[str, object]:
    duration_ms = round(preview.duration_sec * 1000)
    requires_trim = preview.duration_sec > ANALYSIS_MAX_DURATION_SEC
    issues = (
        ["Choose a video part that is 2 minutes or shorter before checking."]
        if requires_trim
        else []
    )

    thumbnail_strip_url = None
    if preview.thumbnail_strip_path is not None:
        thumbnail_strip_url = (
            f"{public_base_url}/api/video-previews/{preview.preview_id}"
            "/thumbnail-strip.jpg"
        )

    return {
        "previewId": preview.preview_id,
        "sourceType": preview.source_type,
        "originalUrl": preview.original_url,
        "durationMs": duration_ms,
        "fileSizeBytes": preview.file_size_bytes,
        "width": preview.width,
        "height": preview.height,
        "contentType": preview.content_type,
        "thumbnailStripUrl": thumbnail_strip_url,
        "requiresTrim": requires_trim,
        "maxSegmentDurationMs": int(ANALYSIS_MAX_DURATION_SEC * 1000),
        "canAnalyze": True,
        "issues": issues,
    }


def get_public_base_url(http_request: Request) -> str:
    forwarded_proto = http_request.headers.get("x-forwarded-proto")
    forwarded_host = http_request.headers.get("x-forwarded-host")
    if forwarded_proto and forwarded_host:
        return f"{forwarded_proto}://{forwarded_host}".rstrip("/")

    return str(http_request.base_url).rstrip("/")


@app.post("/api/detections", status_code=status.HTTP_202_ACCEPTED)
async def create_detection(http_request: Request) -> dict[str, str]:
    idempotency_key = get_idempotency_key(http_request)
    if idempotency_key:
        existing_response = get_existing_detection_response(idempotency_key)
        if existing_response is not None:
            return existing_response

    detection_id = f"det_{uuid.uuid4().hex[:12]}"
    job = await build_detection_job(http_request, detection_id)
    job.idempotency_key = idempotency_key

    with detection_jobs_lock:
        if idempotency_key:
            existing_detection_id = detection_jobs_by_idempotency_key.get(
                idempotency_key,
            )
            if existing_detection_id in detection_jobs:
                cleanup_uploaded_file(job.file_path)
                return build_detection_queued_response(existing_detection_id)
            detection_jobs_by_idempotency_key[idempotency_key] = detection_id

        detection_jobs[detection_id] = job

    detection_executor.submit(process_detection_job, detection_id)

    return build_detection_queued_response(detection_id)


def get_idempotency_key(http_request: Request) -> str | None:
    value = http_request.headers.get(IDEMPOTENCY_KEY_HEADER, "").strip()
    if not value:
        return None

    return value[:256]


def get_existing_detection_response(idempotency_key: str) -> dict[str, str] | None:
    with detection_jobs_lock:
        detection_id = detection_jobs_by_idempotency_key.get(idempotency_key)
        if detection_id is None or detection_id not in detection_jobs:
            return None

    return build_detection_queued_response(detection_id)


def build_detection_queued_response(detection_id: str) -> dict[str, str]:
    return {
        "detectionId": detection_id,
        "status": "queued",
    }


async def build_detection_job(
    http_request: Request,
    detection_id: str,
) -> DetectionJob:
    content_type = http_request.headers.get("content-type", "").lower()
    user_id = resolve_authenticated_user_id(http_request)

    if content_type.startswith("multipart/form-data"):
        return await build_upload_detection_job(
            http_request,
            detection_id,
            user_id,
            get_public_base_url(http_request),
        )

    request = await parse_json_detection_request(http_request)
    if request.preview_id:
        return build_preview_detection_job(
            request,
            detection_id,
            user_id,
            get_public_base_url(http_request),
        )

    validate_url_detection_request(request)
    return DetectionJob(
        detection_id=detection_id,
        created_at=time.monotonic(),
        source_type=request.source_type,
        user_id=user_id,
        url=request.url,
    )


def build_preview_detection_job(
    request: DetectionCreateRequest,
    detection_id: str,
    user_id: str | None,
    public_base_url: str,
) -> DetectionJob:
    if request.source_type not in {"url", "share", "upload"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a video or paste a video link.",
        )

    try:
        preview, segment_path, file_size_bytes, thumbnail_path = create_analysis_segment(
            preview_id=request.preview_id or "",
            trim_start_sec=request.trim_start_sec,
            trim_end_sec=request.trim_end_sec,
            detection_id=detection_id,
        )
    except VideoPreviewError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    thumbnail_strip_url = None
    if thumbnail_path is not None:
        detection_thumbnail_strips[detection_id] = thumbnail_path
        thumbnail_strip_url = (
            f"{public_base_url}/api/detections/{detection_id}"
            "/thumbnail-strip.jpg"
        )

    return DetectionJob(
        detection_id=detection_id,
        created_at=time.monotonic(),
        source_type=preview.source_type,
        user_id=user_id,
        file_path=segment_path,
        file_name=f"{preview.preview_id}.mp4",
        content_type="video/mp4",
        file_size_bytes=file_size_bytes,
        original_url=preview.original_url,
        thumbnail_strip_url=thumbnail_strip_url,
    )


def resolve_authenticated_user_id(http_request: Request) -> str | None:
    return get_authenticated_user_id(get_bearer_token(http_request))


def get_bearer_token(http_request: Request) -> str | None:
    header = http_request.headers.get("authorization", "").strip()
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None

    return token.strip()


async def parse_json_detection_request(http_request: Request) -> DetectionCreateRequest:
    try:
        payload = await http_request.json()
        request = DetectionCreateRequest.model_validate(payload)
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=exc.errors(),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="VigilVid could not read this request.",
        ) from exc

    if request.source_type == "upload" and not request.preview_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a video file.",
        )

    if request.preview_id and request.url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose one video or paste one video link.",
        )

    if request.preview_id:
        return request

    return request


def validate_url_detection_request(request: DetectionCreateRequest) -> None:
    if not request.url:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paste a video link.",
        )

    parsed_url = urlparse(request.url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paste a valid video link.",
        )


async def build_upload_detection_job(
    http_request: Request,
    detection_id: str,
    user_id: str | None,
    public_base_url: str,
) -> DetectionJob:
    file_path: Path | None = None
    thumbnail_strip_url: str | None = None

    try:
        async with http_request.form(
            max_files=1,
            max_fields=6,
            max_part_size=MAX_UPLOAD_BYTES,
        ) as form:
            source_type = parse_source_type(str(form.get("sourceType", "")))
            trim_start_sec = parse_form_float(form.get("trimStartSec"))
            trim_end_sec = parse_form_float(form.get("trimEndSec"))
            file_value = form.get("file")

            if source_type not in {"upload", "share"}:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Choose a video file.",
                )

            if not isinstance(file_value, UploadFile):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="A video file is required.",
                )

            content_type = file_value.content_type or ""
            if content_type and not (
                content_type.startswith("video/")
                or content_type == "application/octet-stream"
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Choose a video file.",
                )

            file_path, file_size_bytes = await save_upload_to_temp_file(
                file_value,
                detection_id,
            )

            if trim_start_sec is not None or trim_end_sec is not None:
                file_path, file_size_bytes, thumbnail_strip_url = (
                    prepare_uploaded_segment(
                        source_path=file_path,
                        detection_id=detection_id,
                        trim_start_sec=trim_start_sec,
                        trim_end_sec=trim_end_sec,
                        public_base_url=public_base_url,
                    )
                )
    except HTTPException:
        cleanup_uploaded_file(file_path)
        raise
    except VideoPreviewError as exc:
        cleanup_uploaded_file(file_path)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    except Exception as exc:
        cleanup_uploaded_file(file_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The upload could not be parsed.",
        ) from exc

    return DetectionJob(
        detection_id=detection_id,
        created_at=time.monotonic(),
        source_type=source_type,
        user_id=user_id,
        file_path=file_path,
        file_name=file_value.filename,
        content_type=content_type,
        file_size_bytes=file_size_bytes,
        thumbnail_strip_url=thumbnail_strip_url,
    )


def parse_source_type(value: str) -> DetectionSourceType | None:
    normalized = value.strip().lower()
    if normalized in {"url", "upload", "share"}:
        return normalized

    return None


def parse_form_float(value: object) -> float | None:
    text = str(value).strip() if value is not None else ""
    if not text:
        return None

    try:
        parsed = float(text)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trim values must be numbers.",
        ) from exc

    if not math.isfinite(parsed):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Trim values must be finite numbers.",
        )

    return parsed


def prepare_uploaded_segment(
    *,
    source_path: Path,
    detection_id: str,
    trim_start_sec: float | None,
    trim_end_sec: float | None,
    public_base_url: str,
) -> tuple[Path, int, str | None]:
    metadata = probe_video_metadata(source_path)
    start_sec, end_sec = normalize_trim_range(
        trim_start_sec,
        trim_end_sec,
        metadata.duration_sec,
    )
    duration_sec = end_sec - start_sec
    if duration_sec > ANALYSIS_MAX_DURATION_SEC:
        raise VideoPreviewError(
            "Choose a video part that is 2 minutes or shorter.",
            error_code="segment_too_long",
        )

    segment_path = tempfile.NamedTemporaryFile(
        delete=False,
        prefix=f"{detection_id}_segment_",
        suffix=".mp4",
    )
    segment_path.close()
    target_path = Path(segment_path.name)

    try:
        trim_video_segment(
            source_path=source_path,
            target_path=target_path,
            start_sec=start_sec,
            duration_sec=duration_sec,
        )

        file_size_bytes = target_path.stat().st_size
        if file_size_bytes > ANALYSIS_MAX_BYTES:
            raise VideoPreviewError(
                "The selected video part is larger than 100 MB. Choose a shorter part.",
                error_code="segment_too_large",
                status_code=413,
            )

        thumbnail_path = generate_thumbnail_strip(
            source_path,
            file_id=detection_id,
            duration_sec=metadata.duration_sec,
            start_sec=start_sec,
            end_sec=end_sec,
            variant="result",
        )
    except Exception:
        cleanup_uploaded_file(target_path)
        raise
    finally:
        cleanup_uploaded_file(source_path)

    thumbnail_strip_url = None
    if thumbnail_path is not None:
        detection_thumbnail_strips[detection_id] = thumbnail_path
        thumbnail_strip_url = (
            f"{public_base_url}/api/detections/{detection_id}"
            "/thumbnail-strip.jpg"
        )

    return target_path, file_size_bytes, thumbnail_strip_url


async def save_upload_to_temp_file(
    uploaded_file: UploadFile,
    detection_id: str,
) -> tuple[Path, int]:
    suffix = get_upload_suffix(uploaded_file.filename)
    temp_file = tempfile.NamedTemporaryFile(
        delete=False,
        prefix=f"{detection_id}_",
        suffix=suffix,
    )
    temp_path = Path(temp_file.name)
    total_bytes = 0

    try:
        with temp_file:
            while chunk := await uploaded_file.read(UPLOAD_CHUNK_BYTES):
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="This video is larger than 100 MB.",
                    )
                temp_file.write(chunk)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    finally:
        await uploaded_file.close()

    if total_bytes == 0:
        temp_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded video file is empty.",
        )

    return temp_path, total_bytes


def get_upload_suffix(filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix and 1 < len(suffix) <= 12:
        return suffix

    return ".mp4"


@app.get("/api/detections/{detection_id}")
def get_detection(detection_id: str) -> dict[str, object]:
    with detection_jobs_lock:
        job = detection_jobs.get(detection_id)

    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Result was not found.",
        )

    if job.status == "completed" and job.result is not None:
        return job.result

    if job.status == "failed":
        return {
            "detectionId": detection_id,
            "status": "failed",
            "errorCode": job.error_code or "model_unavailable",
            "message": job.error_message
            or "VigilVid could not check this video right now. Try again later.",
        }

    return {
        "detectionId": detection_id,
        "status": job.status,
        "progressMessage": job.progress_message,
    }


@app.post("/api/detections/{detection_id}/feedback")
def submit_detection_feedback(
    detection_id: str,
    request: DetectionFeedbackRequest,
    http_request: Request,
) -> dict[str, bool]:
    feedback = DetectionFeedback(
        detection_id=detection_id,
        created_at=time.monotonic(),
        feedback_type=request.feedback_type,
        comment=request.comment.strip()[:1000],
        user_id=resolve_authenticated_user_id(http_request),
    )

    with detection_jobs_lock:
        if detection_id not in detection_jobs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Result was not found.",
            )

        detection_feedback.append(feedback)

    persist_detection_feedback_safely(feedback)

    return {"ok": True}


@app.get("/api/history")
def get_history(http_request: Request) -> dict[str, object]:
    if not is_supabase_persistence_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Saved history is not available right now.",
        )

    user_id = resolve_authenticated_user_id(http_request)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to view saved results.",
        )

    return {
        "items": [
            build_history_item_response(row)
            for row in get_detection_history(user_id)
        ],
    }


@app.get("/api/insights")
def get_insights() -> dict[str, object]:
    return get_public_insights()


@app.get("/api/game/clips")
def get_game_clips(
    http_request: Request,
    limit: int = Query(default=12, ge=1, le=24),
) -> dict[str, object]:
    try:
        items = get_game_round(
            limit=limit,
            public_base_url=get_public_base_url(http_request),
        )
    except GameSampleError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    return {"items": items}


@app.get("/api/game/clips/{clip_id}/video.mp4")
def get_game_clip_video(clip_id: str) -> FileResponse:
    try:
        clip_path = get_game_clip_file(clip_id)
    except GameSampleError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    if not clip_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Game clip was not found.",
        )

    return FileResponse(clip_path, media_type="video/mp4")


@app.post("/api/game/scores")
def submit_game_score(
    request: GameScoreRequest,
    http_request: Request,
) -> dict[str, bool]:
    if not is_supabase_persistence_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not save score to your account right now.",
        )

    user_id = resolve_authenticated_user_id(http_request)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in to save game scores.",
        )

    validate_game_score_request(request)

    if not persist_game_score(
        user_id=user_id,
        mode=request.mode,
        score=request.score,
        correct_count=request.correct_count,
        total_rounds=request.total_rounds,
        best_streak=request.best_streak,
        round_ids=request.round_ids,
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not save score to your account right now.",
        )

    return {"ok": True}


def validate_game_score_request(request: GameScoreRequest) -> None:
    if request.correct_count > request.total_rounds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="correctCount cannot be greater than totalRounds.",
        )

    if request.best_streak > request.total_rounds:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bestStreak cannot be greater than totalRounds.",
        )


def build_history_item_response(row: dict[str, object]) -> dict[str, object]:
    return {
        "detectionId": to_string(row.get("detection_id")),
        "sourceType": to_string(row.get("source_type")),
        "label": to_string(row.get("label")),
        "aiProbability": to_float_or_default(row.get("ai_probability")),
        "confidencePercent": to_float_or_default(row.get("confidence_percent")),
        "processingTimeSec": to_optional_float(row.get("processing_time_sec")),
        "videoDurationSec": to_optional_float(row.get("video_duration_sec")),
        "createdAt": to_string(row.get("created_at")),
    }


@app.get("/api/hugging-face/view-api")
def view_hugging_face_api() -> dict[str, object]:
    if os.getenv("APP_ENV") == "production":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found.",
        )

    from gradio_client import Client

    token = os.getenv("HUGGING_FACE_TOKEN", "").strip() or None
    space_id = os.getenv("HUGGING_FACE_SPACE_ID", "farouk04/test_scanly")
    client = Client(space_id, token=token, verbose=False, download_files=False)
    return client.view_api(return_format="dict")


def process_detection_job(detection_id: str) -> None:
    with detection_jobs_lock:
        job = detection_jobs.get(detection_id)
        if job is None:
            return
        job.status = "processing"
        job.progress_message = "Checking video"

    try:
        if get_detection_backend_mode() == "mock":
            time.sleep(3.2)
            result = build_mock_detection_result(job)
        else:
            normalized = run_hugging_face_detection(
                url=job.url if job.file_path is None else None,
                uploaded_video_path=job.file_path,
            )
            with detection_jobs_lock:
                current_job = detection_jobs.get(detection_id)
                if current_job is not None:
                    current_job.progress_message = "Preparing result"

            result = {
                "detectionId": job.detection_id,
                "status": "completed",
                "label": normalized.label,
                "aiProbability": normalized.ai_probability,
                "confidencePercent": normalized.confidence_percent,
                "processingTimeSec": normalized.processing_time_sec,
                "videoDurationSec": normalized.video_duration_sec,
                "thumbnailStripUrl": job.thumbnail_strip_url,
                "windows": normalized.windows,
                "explanation": normalized.explanation,
                "sourceType": job.source_type,
            }

        with detection_jobs_lock:
            current_job = detection_jobs.get(detection_id)
            if current_job is not None:
                current_job.status = "completed"
                current_job.progress_message = "Completed"
                current_job.result = result

        persist_detection_result_safely(job, result)
    except DetectionRuntimeError as exc:
        logger.warning("Detection job failed: %s", exc.error_code)
        fail_detection_job(detection_id, exc.error_code, str(exc))
    except Exception:
        logger.exception("Unexpected detection job failure")
        fail_detection_job(
            detection_id,
            "model_unavailable",
            "VigilVid could not check this video right now. Try again later.",
        )
    finally:
        cleanup_job_upload(detection_id)


def persist_detection_result_safely(
    job: DetectionJob,
    result: dict[str, object],
) -> None:
    try:
        persist_detection_result(
            detection_id=job.detection_id,
            user_id=job.user_id,
            source_type=job.source_type,
            result=result,
            file_name=job.file_name,
            content_type=job.content_type,
            file_size_bytes=job.file_size_bytes,
            has_url=job.url is not None or job.original_url is not None,
        )
    except Exception:
        logger.exception(
            "Unexpected optional Supabase persistence failure for detection metadata",
        )


def persist_detection_feedback_safely(feedback: DetectionFeedback) -> None:
    try:
        persist_detection_feedback(
            detection_id=feedback.detection_id,
            user_id=feedback.user_id,
            feedback_type=feedback.feedback_type,
            comment=feedback.comment,
        )
    except Exception:
        logger.exception(
            "Unexpected optional Supabase persistence failure for detection feedback",
        )


def fail_detection_job(detection_id: str, error_code: str, message: str) -> None:
    with detection_jobs_lock:
        job = detection_jobs.get(detection_id)
        if job is None:
            return
        job.status = "failed"
        job.error_code = error_code
        job.error_message = message


def cleanup_job_upload(detection_id: str) -> None:
    with detection_jobs_lock:
        job = detection_jobs.get(detection_id)
        if job is None:
            return
        file_path = job.file_path
        job.file_path = None

    if file_path is None:
        return

    cleanup_uploaded_file(file_path)


def cleanup_uploaded_file(file_path: Path | None) -> None:
    if file_path is None:
        return

    try:
        file_path.unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not delete temporary upload %s", file_path)


def get_detection_backend_mode() -> Literal["hf", "mock"]:
    mode = os.getenv("DETECTION_BACKEND_MODE", "auto").strip().lower()
    if mode == "mock":
        return "mock"

    if mode == "hf":
        return "hf"

    return "hf" if os.getenv("HUGGING_FACE_TOKEN", "").strip() else "mock"


def build_mock_detection_result(job: DetectionJob) -> dict[str, object]:
    seed = job.url or job.original_url or f"{job.file_name or 'upload'}:{job.file_size_bytes or 0}"
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    video_duration_sec = 42.0 + float(digest[0] % 36)
    window_count = 5
    window_length = video_duration_sec / window_count
    windows = []

    for index in range(window_count):
        raw_score = digest[index + 1] / 255
        fake_probability = round(0.18 + raw_score * 0.68, 3)
        windows.append(
            {
                "startSec": round(index * window_length, 1),
                "endSec": round((index + 1) * window_length, 1),
                "fakeProbability": fake_probability,
            }
        )

    ai_probability = round(
        sum(window["fakeProbability"] for window in windows) / len(windows),
        3,
    )
    strongest_window = max(windows, key=lambda window: window["fakeProbability"])

    return {
        "detectionId": job.detection_id,
        "status": "completed",
        "label": get_label(ai_probability),
        "aiProbability": ai_probability,
        "confidencePercent": round(ai_probability * 100, 1),
        "processingTimeSec": 3.2,
        "videoDurationSec": round(video_duration_sec, 1),
        "thumbnailStripUrl": job.thumbnail_strip_url,
        "windows": windows,
        "explanation": (
            "VigilVid found the strongest AI signal around "
            f"{strongest_window['startSec']}s to {strongest_window['endSec']}s. "
            "This result is an estimate, not proof."
        ),
        "sourceType": job.source_type,
    }


def get_label(ai_probability: float) -> DetectionLabel:
    if ai_probability <= 0.25:
        return "real"
    if ai_probability <= 0.5:
        return "partially_real"
    if ai_probability <= 0.75:
        return "partially_fake"
    return "fake"


def to_string(value: object) -> str:
    return value if isinstance(value, str) else ""


def to_optional_float(value: object) -> float | None:
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None

    return None


def to_float_or_default(value: object, default: float = 0.0) -> float:
    return to_optional_float(value) or default
