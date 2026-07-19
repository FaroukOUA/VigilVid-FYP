from __future__ import annotations

import json
import math
import os
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlencode, urlparse

import httpx

ANALYSIS_MAX_DURATION_SEC = 120.0
ANALYSIS_MAX_BYTES = 100 * 1024 * 1024
DEFAULT_SOURCE_DOWNLOAD_LIMIT_MB = 250
DIRECT_DOWNLOAD_TIMEOUT_SEC = 75.0
LOOKUP_TIMEOUT_SEC = 20.0
PREVIEW_TTL_SEC = 30 * 60
THUMBNAIL_FRAME_COUNT = 8

ALL_IN_ONE_URL = "https://saverapi.net/api/all-in-one-downloader-api"
YOUTUBE_URL = "https://saverapi.net/api/youtube-api"

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://saverapi.net",
    "Referer": "https://saverapi.net/",
}


class VideoPreviewError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        error_code: str = "video_preview_failed",
        status_code: int = 400,
    ) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.status_code = status_code


@dataclass
class VideoMetadata:
    duration_sec: float
    height: int | None
    width: int | None


@dataclass
class VideoPreview:
    preview_id: str
    source_type: str
    original_url: str
    file_path: Path
    file_size_bytes: int
    content_type: str
    duration_sec: float
    width: int | None
    height: int | None
    thumbnail_strip_path: Path | None
    created_at: float


video_previews: dict[str, VideoPreview] = {}
video_preview_clips: dict[tuple[str, int, int], Path] = {}


def create_url_video_preview(*, url: str, source_type: str) -> VideoPreview:
    cleanup_expired_video_previews()
    validate_http_url(url)

    preview_id = f"src_{uuid.uuid4().hex[:12]}"
    file_path: Path | None = None
    thumbnail_strip_path: Path | None = None

    try:
        file_path, content_type = download_url_to_temp_file(url, preview_id)
        metadata = probe_video_metadata(file_path)
        file_size_bytes = file_path.stat().st_size
        thumbnail_strip_path = generate_thumbnail_strip(
            file_path,
            file_id=preview_id,
            duration_sec=metadata.duration_sec,
            start_sec=0.0,
            end_sec=metadata.duration_sec,
            variant="preview",
        )

        preview = VideoPreview(
            preview_id=preview_id,
            source_type=source_type,
            original_url=url,
            file_path=file_path,
            file_size_bytes=file_size_bytes,
            content_type=content_type,
            duration_sec=metadata.duration_sec,
            width=metadata.width,
            height=metadata.height,
            thumbnail_strip_path=thumbnail_strip_path,
            created_at=time.monotonic(),
        )
        video_previews[preview_id] = preview
        return preview
    except Exception:
        if file_path is not None:
            cleanup_file(file_path)
        if thumbnail_strip_path is not None:
            cleanup_file(thumbnail_strip_path)
        raise


def create_uploaded_video_preview(
    *,
    file_path: Path,
    source_type: str,
    content_type: str,
) -> VideoPreview:
    cleanup_expired_video_previews()

    preview_id = f"src_{uuid.uuid4().hex[:12]}"
    thumbnail_strip_path: Path | None = None

    try:
        metadata = probe_video_metadata(file_path)
        file_size_bytes = file_path.stat().st_size
        thumbnail_strip_path = generate_thumbnail_strip(
            file_path,
            file_id=preview_id,
            duration_sec=metadata.duration_sec,
            start_sec=0.0,
            end_sec=metadata.duration_sec,
            variant="preview",
        )

        preview = VideoPreview(
            preview_id=preview_id,
            source_type=source_type,
            original_url="",
            file_path=file_path,
            file_size_bytes=file_size_bytes,
            content_type=content_type or "video/mp4",
            duration_sec=metadata.duration_sec,
            width=metadata.width,
            height=metadata.height,
            thumbnail_strip_path=thumbnail_strip_path,
            created_at=time.monotonic(),
        )
        video_previews[preview_id] = preview
        return preview
    except Exception:
        cleanup_file(file_path)
        cleanup_file(thumbnail_strip_path)
        raise


def get_video_preview(preview_id: str) -> VideoPreview | None:
    cleanup_expired_video_previews()
    return video_previews.get(preview_id)


def get_video_preview_thumbnail_path(preview_id: str) -> Path | None:
    preview = get_video_preview(preview_id)
    if preview is None:
        return None

    return preview.thumbnail_strip_path


def get_video_preview_media(preview_id: str) -> tuple[Path, str] | None:
    preview = get_video_preview(preview_id)
    if preview is None:
        return None

    return preview.file_path, preview.content_type


def get_video_preview_window_clip(
    *,
    preview_id: str,
    start_sec: float,
    end_sec: float,
) -> Path:
    preview = get_video_preview(preview_id)
    if preview is None:
        raise VideoPreviewError(
            "The video preview expired. Go back and check the video again.",
            error_code="preview_expired",
            status_code=404,
        )

    clip_start_sec, clip_end_sec = normalize_clip_range(
        start_sec,
        end_sec,
        preview.duration_sec,
    )
    cache_key = (
        preview_id,
        round(clip_start_sec * 1000),
        round(clip_end_sec * 1000),
    )
    cached_clip_path = video_preview_clips.get(cache_key)
    if cached_clip_path is not None and cached_clip_path.exists():
        return cached_clip_path

    clip_path = build_temp_path(
        f"{preview_id}_window_{cache_key[1]}_{cache_key[2]}",
        ".mp4",
    )
    try:
        trim_video_window_clip(
            source_path=preview.file_path,
            target_path=clip_path,
            start_sec=clip_start_sec,
            duration_sec=clip_end_sec - clip_start_sec,
        )
    except Exception:
        cleanup_file(clip_path)
        raise

    video_preview_clips[cache_key] = clip_path
    return clip_path


def create_analysis_segment(
    *,
    preview_id: str,
    trim_start_sec: float | None,
    trim_end_sec: float | None,
    detection_id: str,
) -> tuple[VideoPreview, Path, int, Path | None]:
    preview = get_video_preview(preview_id)
    if preview is None:
        raise VideoPreviewError(
            "The video preview expired. Paste the link again and create a new preview.",
            error_code="preview_expired",
            status_code=404,
        )

    start_sec, end_sec = normalize_trim_range(
        trim_start_sec,
        trim_end_sec,
        preview.duration_sec,
    )
    duration_sec = end_sec - start_sec
    if duration_sec > ANALYSIS_MAX_DURATION_SEC:
        raise VideoPreviewError(
            "Choose a video part that is 2 minutes or shorter.",
            error_code="segment_too_long",
        )

    segment_path = build_temp_path(f"{detection_id}_segment", ".mp4")
    trim_video_segment(
        source_path=preview.file_path,
        target_path=segment_path,
        start_sec=start_sec,
        duration_sec=duration_sec,
    )

    file_size_bytes = segment_path.stat().st_size
    if file_size_bytes > ANALYSIS_MAX_BYTES:
        cleanup_file(segment_path)
        raise VideoPreviewError(
            "The selected video part is larger than 100 MB. Choose a shorter part.",
            error_code="segment_too_large",
            status_code=413,
        )

    thumbnail_path = generate_thumbnail_strip(
        preview.file_path,
        file_id=detection_id,
        duration_sec=preview.duration_sec,
        start_sec=start_sec,
        end_sec=end_sec,
        variant="result",
    )
    return preview, segment_path, file_size_bytes, thumbnail_path


def normalize_trim_range(
    trim_start_sec: float | None,
    trim_end_sec: float | None,
    duration_sec: float,
) -> tuple[float, float]:
    if duration_sec <= 0:
        raise VideoPreviewError(
            "This video has no readable duration.",
            error_code="invalid_duration",
        )

    start_sec = clamp_float(trim_start_sec or 0.0, 0.0, duration_sec)
    fallback_end = min(start_sec + ANALYSIS_MAX_DURATION_SEC, duration_sec)
    end_sec = clamp_float(trim_end_sec or fallback_end, start_sec, duration_sec)

    if end_sec <= start_sec:
        raise VideoPreviewError(
            "Choose a valid video part before checking.",
            error_code="invalid_segment",
        )

    if end_sec - start_sec > ANALYSIS_MAX_DURATION_SEC:
        end_sec = start_sec + ANALYSIS_MAX_DURATION_SEC

    return start_sec, min(end_sec, duration_sec)


def normalize_clip_range(
    start_sec: float,
    end_sec: float,
    duration_sec: float,
) -> tuple[float, float]:
    if duration_sec <= 0:
        raise VideoPreviewError(
            "This video has no readable duration.",
            error_code="invalid_duration",
        )

    if not math.isfinite(start_sec) or not math.isfinite(end_sec):
        raise VideoPreviewError(
            "Choose a valid video part.",
            error_code="invalid_window",
        )

    clip_start_sec = clamp_float(start_sec, 0.0, duration_sec)
    clip_end_sec = clamp_float(end_sec, clip_start_sec, duration_sec)
    if clip_end_sec <= clip_start_sec:
        raise VideoPreviewError(
            "Choose a valid video part.",
            error_code="invalid_window",
        )

    if clip_end_sec - clip_start_sec > ANALYSIS_MAX_DURATION_SEC:
        raise VideoPreviewError(
            "Preview clips must be 2 minutes or shorter.",
            error_code="window_too_long",
        )

    return clip_start_sec, clip_end_sec


def download_url_to_temp_file(url: str, preview_id: str) -> tuple[Path, str]:
    direct_error: VideoPreviewError | None = None

    try:
        return stream_download_to_file(url, preview_id, content_type_hint="")
    except VideoPreviewError as exc:
        direct_error = exc

    saver_api_key = os.getenv("SAVER_API_KEY", "").strip()
    if not saver_api_key:
        raise VideoPreviewError(
            "This video link could not be opened right now.",
            error_code="downloader_not_configured",
            status_code=503,
        ) from direct_error

    direct_video_url = lookup_saverapi_direct_url(url, saver_api_key)
    return stream_download_to_file(direct_video_url, preview_id, content_type_hint="")


def stream_download_to_file(
    url: str,
    preview_id: str,
    *,
    content_type_hint: str,
) -> tuple[Path, str]:
    max_bytes = get_source_download_limit_bytes()
    target_path = build_temp_path(preview_id, get_url_suffix(url))
    content_type = content_type_hint or "video/mp4"
    bytes_written = 0

    try:
        with httpx.stream(
            "GET",
            url,
            follow_redirects=True,
            headers={
                "User-Agent": BROWSER_HEADERS["User-Agent"],
                "Accept": "*/*",
            },
            timeout=DIRECT_DOWNLOAD_TIMEOUT_SEC,
        ) as response:
            if response.status_code >= 400:
                raise VideoPreviewError(
                    "This video link could not be opened.",
                    error_code="download_http_error",
                    status_code=400,
                )

            response_content_type = response.headers.get("content-type", "")
            if response_content_type:
                content_type = response_content_type.split(";", 1)[0].strip().lower()

            content_length = parse_positive_int(response.headers.get("content-length"))
            if content_length is not None and content_length > max_bytes:
                raise VideoPreviewError(
                    f"The linked video is larger than {get_source_download_limit_mb()} MB.",
                    error_code="source_too_large",
                    status_code=413,
                )

            byte_iterator = response.iter_bytes(chunk_size=64 * 1024)
            first_chunk = next(byte_iterator, b"")
            if looks_like_html(first_chunk):
                raise VideoPreviewError(
                    "This link opens a web page instead of a video file.",
                    error_code="not_direct_video",
                )

            with target_path.open("wb") as file:
                if first_chunk:
                    file.write(first_chunk)
                    bytes_written += len(first_chunk)

                for chunk in byte_iterator:
                    if not chunk:
                        continue
                    bytes_written += len(chunk)
                    if bytes_written > max_bytes:
                        raise VideoPreviewError(
                            f"The linked video is larger than {get_source_download_limit_mb()} MB.",
                            error_code="source_too_large",
                            status_code=413,
                        )
                    file.write(chunk)
    except VideoPreviewError:
        cleanup_file(target_path)
        raise
    except httpx.HTTPError as exc:
        cleanup_file(target_path)
        raise VideoPreviewError(
            "The video could not be downloaded from this link.",
            error_code="download_failed",
        ) from exc

    if bytes_written == 0:
        cleanup_file(target_path)
        raise VideoPreviewError(
            "The video from this link was empty.",
            error_code="empty_download",
        )

    return target_path, content_type


def lookup_saverapi_direct_url(url: str, api_key: str) -> str:
    endpoint = YOUTUBE_URL if is_youtube_url(url) else ALL_IN_ONE_URL
    params = {"url": url}
    if endpoint == YOUTUBE_URL:
        params["farmat"] = os.getenv("SAVER_API_YOUTUBE_QUALITY", "720")

    headers = {
        **BROWSER_HEADERS,
        "Content-Type": "application/json",
        "x-api-key": api_key,
    }

    try:
        with httpx.Client(timeout=LOOKUP_TIMEOUT_SEC) as client:
            response = client.get(f"{endpoint}?{urlencode(params)}", headers=headers)
    except httpx.HTTPError as exc:
        raise VideoPreviewError(
            "This video link could not be prepared right now.",
            error_code="downloader_unavailable",
            status_code=503,
        ) from exc

    if response.status_code == 402:
        raise VideoPreviewError(
            "This video link could not be prepared right now.",
            error_code="downloader_insufficient_credits",
            status_code=503,
        )

    if response.status_code == 403 and "error code" in response.text.lower():
        raise VideoPreviewError(
            "This video link could not be prepared right now.",
            error_code="downloader_blocked",
            status_code=503,
        )

    if response.status_code >= 400:
        raise VideoPreviewError(
            "This video link could not be prepared.",
            error_code="downloader_rejected",
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise VideoPreviewError(
            "This video link could not be prepared right now.",
            error_code="downloader_invalid_response",
            status_code=503,
        ) from exc

    direct_url = extract_direct_video_url(payload)
    if not direct_url:
        raise VideoPreviewError(
            "VigilVid could not find a playable video at this link.",
            error_code="downloader_no_video",
        )

    return direct_url


def extract_direct_video_url(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None

    status = payload.get("status")
    url = payload.get("url")
    if status == "tunnel" and isinstance(url, str) and url:
        return url

    medias = payload.get("medias")
    if isinstance(medias, list):
        for media in medias:
            if isinstance(media, dict) and isinstance(media.get("url"), str):
                return media["url"]

    if payload.get("error") is False and isinstance(payload.get("download_url"), str):
        return payload["download_url"]

    if isinstance(url, str) and url and isinstance(payload.get("source"), str):
        return url

    return None


def probe_video_metadata(video_path: Path) -> VideoMetadata:
    result = run_media_command(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(video_path),
        ],
        timeout_sec=30,
    )

    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise VideoPreviewError(
            "Video details could not be read.",
            error_code="metadata_parse_failed",
            status_code=500,
        ) from exc

    streams = payload.get("streams")
    video_stream = next(
        (
            stream
            for stream in streams
            if isinstance(stream, dict) and stream.get("codec_type") == "video"
        ),
        None,
    ) if isinstance(streams, list) else None
    if not isinstance(video_stream, dict):
        raise VideoPreviewError(
            "This file does not look like a playable video.",
            error_code="no_video_stream",
        )

    duration = parse_positive_float(video_stream.get("duration"))
    if duration is None and isinstance(payload.get("format"), dict):
        duration = parse_positive_float(payload["format"].get("duration"))

    if duration is None:
        raise VideoPreviewError(
            "The video length could not be read.",
            error_code="duration_unknown",
        )

    width = parse_positive_int(video_stream.get("width"))
    height = parse_positive_int(video_stream.get("height"))
    return VideoMetadata(duration_sec=duration, width=width, height=height)


def trim_video_segment(
    *,
    source_path: Path,
    target_path: Path,
    start_sec: float,
    duration_sec: float,
) -> None:
    run_media_command(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{start_sec:.3f}",
            "-i",
            str(source_path),
            "-t",
            f"{duration_sec:.3f}",
            "-c",
            "copy",
            "-avoid_negative_ts",
            "make_zero",
            str(target_path),
        ],
        timeout_sec=90,
    )

    if not target_path.exists() or target_path.stat().st_size == 0:
        raise VideoPreviewError(
            "The selected video part could not be prepared.",
            error_code="trim_failed",
            status_code=500,
        )


def trim_video_window_clip(
    *,
    source_path: Path,
    target_path: Path,
    start_sec: float,
    duration_sec: float,
) -> None:
    run_media_command(
        [
            "ffmpeg",
            "-y",
            "-ss",
            f"{start_sec:.3f}",
            "-i",
            str(source_path),
            "-t",
            f"{duration_sec:.3f}",
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(target_path),
        ],
        timeout_sec=90,
    )

    if not target_path.exists() or target_path.stat().st_size == 0:
        raise VideoPreviewError(
            "The preview clip could not be prepared.",
            error_code="window_clip_failed",
            status_code=500,
        )


def generate_thumbnail_strip(
    video_path: Path,
    *,
    file_id: str,
    duration_sec: float,
    start_sec: float,
    end_sec: float,
    variant: str,
) -> Path | None:
    segment_duration = max(0.25, min(duration_sec, end_sec) - start_sec)
    frames_per_second = max(0.05, min(2.0, THUMBNAIL_FRAME_COUNT / segment_duration))
    output_path = build_temp_path(f"{file_id}_{variant}_strip", ".jpg")

    try:
        run_media_command(
            [
                "ffmpeg",
                "-y",
                "-ss",
                f"{start_sec:.3f}",
                "-t",
                f"{segment_duration:.3f}",
                "-i",
                str(video_path),
                "-vf",
                f"fps={frames_per_second:.5f},scale=160:-2,tile={THUMBNAIL_FRAME_COUNT}x1",
                "-frames:v",
                "1",
                str(output_path),
            ],
            timeout_sec=60,
        )
    except VideoPreviewError:
        cleanup_file(output_path)
        return None

    if not output_path.exists() or output_path.stat().st_size == 0:
        cleanup_file(output_path)
        return None

    return output_path


def run_media_command(command: list[str], *, timeout_sec: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            capture_output=True,
            check=True,
            text=True,
            timeout=timeout_sec,
        )
    except FileNotFoundError as exc:
        raise VideoPreviewError(
            "Video tools are unavailable right now.",
            error_code="media_tools_missing",
            status_code=503,
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise VideoPreviewError(
            "VigilVid could not process this video file.",
            error_code="media_processing_failed",
            status_code=400,
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise VideoPreviewError(
            "Video processing took too long. Try a shorter video.",
            error_code="media_processing_timeout",
            status_code=504,
        ) from exc


def cleanup_expired_video_previews() -> None:
    now = time.monotonic()
    expired_ids = [
        preview_id
        for preview_id, preview in video_previews.items()
        if now - preview.created_at > PREVIEW_TTL_SEC
    ]
    for preview_id in expired_ids:
        preview = video_previews.pop(preview_id, None)
        if preview is not None:
            cleanup_file(preview.file_path)
            cleanup_file(preview.thumbnail_strip_path)
            cleanup_video_preview_clips(preview_id)


def cleanup_video_preview_clips(preview_id: str) -> None:
    clip_keys = [
        cache_key
        for cache_key in video_preview_clips
        if cache_key[0] == preview_id
    ]
    for cache_key in clip_keys:
        cleanup_file(video_preview_clips.pop(cache_key, None))


def cleanup_file(path: Path | None) -> None:
    if path is None:
        return
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def build_temp_path(name: str, suffix: str) -> Path:
    normalized_name = "".join(
        character if character.isalnum() or character in {"_", "-"} else "_"
        for character in name
    )
    return Path(tempfile.gettempdir()) / f"vigilvid_{normalized_name}_{uuid.uuid4().hex[:8]}{suffix}"


def validate_http_url(url: str) -> None:
    parsed_url = urlparse(url)
    if parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
        raise VideoPreviewError("Paste a valid video link.")


def is_youtube_url(url: str) -> bool:
    parsed_url = urlparse(url.lower())
    return any(
        host in parsed_url.netloc
        for host in {"youtube.com", "www.youtube.com", "youtu.be", "youtube-nocookie.com"}
    )


def looks_like_html(chunk: bytes) -> bool:
    normalized = chunk.lstrip().lower()
    return normalized.startswith((b"<!doctype", b"<html"))


def get_url_suffix(url: str) -> str:
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix and 1 < len(suffix) <= 8:
        return suffix
    return ".mp4"


def get_source_download_limit_mb() -> int:
    value = os.getenv(
        "VIDEO_PREVIEW_MAX_DOWNLOAD_MB",
        str(DEFAULT_SOURCE_DOWNLOAD_LIMIT_MB),
    )
    try:
        return max(1, int(value))
    except ValueError:
        return DEFAULT_SOURCE_DOWNLOAD_LIMIT_MB


def get_source_download_limit_bytes() -> int:
    return get_source_download_limit_mb() * 1024 * 1024


def parse_positive_float(value: object) -> float | None:
    if isinstance(value, int | float):
        parsed = float(value)
    elif isinstance(value, str):
        try:
            parsed = float(value)
        except ValueError:
            return None
    else:
        return None

    return parsed if math.isfinite(parsed) and parsed > 0 else None


def parse_positive_int(value: object) -> int | None:
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str):
        try:
            parsed = int(value)
        except ValueError:
            return None
        return parsed if parsed > 0 else None
    return None


def clamp_float(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)
