from __future__ import annotations

import hashlib
import json
import os
import random
import shutil
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Literal
from urllib.parse import quote

import httpx

GameAnswer = Literal["real", "ai"]
GameDifficulty = Literal["Warmup", "Medium", "Hard"]
PHONE_SAFE_CODECS = {"h264"}
PHONE_SAFE_PIXEL_FORMATS = {"yuv420p", "yuvj420p"}
PHONE_SAFE_VIDEO_FILTER = (
    "scale=w='min(1280,iw)':h='min(1280,ih)':"
    "force_original_aspect_ratio=decrease:force_divisible_by=2,"
    "setsar=1,fps=30,format=yuv420p"
)


def normalize_clip_id(value: str) -> str:
    return value.strip().lower().replace("-", "_")


def parse_env_id_set(value: str) -> set[str]:
    return {
        normalize_clip_id(item)
        for item in value.replace("\n", ",").split(",")
        if item.strip()
    }


def parse_env_bool(value: str, *, default: bool) -> bool:
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False

    return default


def load_verified_clip_ids() -> set[str]:
    file_path = Path(__file__).with_name("game_verified_clip_ids.json")
    try:
        payload = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()

    ids = payload.get("ids") if isinstance(payload, dict) else None
    if not isinstance(ids, list):
        return set()

    return {
        normalize_clip_id(item)
        for item in ids
        if isinstance(item, str) and item.strip()
    }


HF_GAME_DATASET_ID = os.getenv(
    "HUGGING_FACE_GAME_DATASET_ID",
    "farouk04/vigilvid-research",
).strip()
HF_GAME_DATASET_BASE_URL = (
    f"https://huggingface.co/datasets/{HF_GAME_DATASET_ID}/resolve/main"
)
HF_GAME_SAMPLES_URL = f"{HF_GAME_DATASET_BASE_URL}/app/game_samples.json"
GAME_ROUND_LIMIT = 12
GAME_MANIFEST_CACHE_SEC = int(os.getenv("GAME_MANIFEST_CACHE_SEC", "300"))
GAME_CLIP_MAX_BYTES = int(os.getenv("GAME_CLIP_MAX_BYTES", str(200 * 1024 * 1024)))
GAME_CLIP_TRANSCODE_MODE = os.getenv(
    "GAME_CLIP_TRANSCODE_MODE",
    os.getenv("GAME_CLIP_TRANSCODE_ENABLED", "never"),
).strip().lower()
GAME_CLIP_FFMPEG_PATH = os.getenv("GAME_CLIP_FFMPEG_PATH", "").strip()
GAME_CLIP_FFPROBE_PATH = os.getenv("GAME_CLIP_FFPROBE_PATH", "").strip()
GAME_CLIP_PLAYBACK_VERSION = os.getenv(
    "GAME_CLIP_PLAYBACK_VERSION",
    "android-safe-v4",
).strip()
GAME_CLIP_READY_BEFORE_RESPONSE = int(
    os.getenv("GAME_CLIP_READY_BEFORE_RESPONSE", "0"),
)
GAME_CLIP_ALLOWED_IDS = parse_env_id_set(os.getenv("GAME_CLIP_ALLOWED_IDS", ""))
GAME_CLIP_BLOCKED_IDS = parse_env_id_set(os.getenv("GAME_CLIP_BLOCKED_IDS", ""))
GAME_CLIP_VERIFIED_ONLY = parse_env_bool(
    os.getenv("GAME_CLIP_VERIFIED_ONLY", "true"),
    default=True,
)
GAME_CLIP_FORCE_TRANSCODE = parse_env_bool(
    os.getenv("GAME_CLIP_FORCE_TRANSCODE", "false"),
    default=False,
)
GAME_CLIP_VERIFIED_IDS = load_verified_clip_ids()
GAME_CLIP_CACHE_DIR = Path(tempfile.gettempdir()) / "vigilvid_game_clips"
DEFAULT_LOCAL_EXPORT_ROOT = Path(__file__).resolve().parents[2] / "vigilvid_jepa21_test_export"
GAME_CLIP_LOCAL_EXPORT_ROOT = os.getenv(
    "GAME_CLIP_LOCAL_EXPORT_ROOT",
    str(DEFAULT_LOCAL_EXPORT_ROOT),
).strip()


class GameSampleError(Exception):
    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class GameSample:
    correct_answer: GameAnswer
    difficulty: GameDifficulty
    duration_sec: int
    id: str
    model_ai_probability: float
    model_answer: GameAnswer
    signal_notes: list[str]
    video_path: str


_manifest_cache: list[GameSample] | None = None
_manifest_cached_at = 0.0
_clip_paths_by_id: dict[str, str] = {}
_manifest_lock = Lock()
_download_lock = Lock()
_prepare_lock = Lock()
_preparing_clip_ids: set[str] = set()
_preparing_lock = Lock()
_prewarm_executor = ThreadPoolExecutor(
    max_workers=int(os.getenv("GAME_CLIP_PREWARM_WORKERS", "1")),
    thread_name_prefix="game-clip",
)


def get_game_round(limit: int, public_base_url: str) -> list[dict[str, object]]:
    samples = get_manifest_samples()
    if not samples:
        raise GameSampleError("No playable game clips were found.", status_code=502)

    round_limit = max(1, min(limit, 24))
    selected_samples = select_random_round(samples, round_limit)
    prepared_count = 0 if GAME_CLIP_VERIFIED_ONLY else max(
        0,
        min(GAME_CLIP_READY_BEFORE_RESPONSE, len(selected_samples)),
    )
    prepare_game_clips_before_response(selected_samples[:prepared_count])
    prewarm_game_clips(selected_samples[prepared_count:])

    return [
        build_game_sample_response(
            sample=sample,
            index=index,
            public_base_url=public_base_url,
        )
        for index, sample in enumerate(selected_samples)
    ]


def get_game_clip_file(clip_id: str) -> Path:
    video_path = resolve_game_clip_path(clip_id)
    playable_path = get_cached_clip_path(clip_id, video_path, "playable")
    local_source_path = get_local_game_clip_path(video_path)

    if local_source_path is not None:
        if should_serve_verified_clip_directly(clip_id):
            return local_source_path

        return prepare_game_clip_for_playback(
            playable_path=playable_path,
            source_path=local_source_path,
        )

    remote_url = build_hf_file_url(video_path)
    source_path = get_cached_clip_path(clip_id, video_path, "source")
    source_path = download_game_clip(
        cache_path=source_path,
        remote_url=remote_url,
    )

    if should_serve_verified_clip_directly(clip_id):
        return source_path

    return prepare_game_clip_for_playback(
        playable_path=playable_path,
        source_path=source_path,
    )


def get_game_clip_playback_status(
    clip_id: str,
) -> tuple[Literal["preparing", "ready"], Path | None]:
    video_path = resolve_game_clip_path(clip_id)
    playable_path = get_cached_clip_path(clip_id, video_path, "playable")

    if playable_path.exists() and playable_path.stat().st_size > 0:
        return "ready", playable_path

    local_source_path = get_local_game_clip_path(video_path)
    if local_source_path is not None and should_serve_verified_clip_directly(clip_id):
        return "ready", local_source_path

    if local_source_path is not None and not should_transcode_game_clip(local_source_path):
        return "ready", local_source_path

    schedule_game_clip_preparation(clip_id)
    return "preparing", None


def schedule_game_clip_preparation(clip_id: str) -> None:
    with _preparing_lock:
        if clip_id in _preparing_clip_ids:
            return
        _preparing_clip_ids.add(clip_id)

    def prepare_clip() -> None:
        try:
            get_game_clip_file(clip_id)
        except GameSampleError:
            pass
        finally:
            with _preparing_lock:
                _preparing_clip_ids.discard(clip_id)

    _prewarm_executor.submit(prepare_clip)


def prepare_game_clip_for_playback(*, source_path: Path, playable_path: Path) -> Path:
    if not should_transcode_game_clip(source_path):
        return source_path

    stale_part_path = playable_path.with_suffix(f"{playable_path.suffix}.part")
    stale_part_path.unlink(missing_ok=True)
    if playable_path.exists() and playable_path.stat().st_size > 0:
        return playable_path

    with _prepare_lock:
        stale_part_path.unlink(missing_ok=True)
        if playable_path.exists() and playable_path.stat().st_size > 0:
            return playable_path
        return transcode_game_clip(source_path, playable_path)


def prewarm_game_clips(samples: list[GameSample]) -> None:
    if not samples:
        return

    for sample in samples:
        schedule_game_clip_preparation(sample.id)


def prepare_game_clips_before_response(samples: list[GameSample]) -> None:
    for sample in samples:
        try:
            get_game_clip_file(sample.id)
        except GameSampleError:
            continue


def download_game_clip(*, cache_path: Path, remote_url: str) -> Path:
    if cache_path.exists() and cache_path.stat().st_size > 0:
        return cache_path

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    part_path = cache_path.with_suffix(f"{cache_path.suffix}.part")

    with _download_lock:
        if cache_path.exists() and cache_path.stat().st_size > 0:
            return cache_path

        total_bytes = 0
        try:
            with httpx.stream(
                "GET",
                remote_url,
                follow_redirects=True,
                timeout=60,
            ) as response:
                if response.status_code >= 400:
                    raise GameSampleError(
                        "The selected game clip could not be loaded.",
                        status_code=502,
                    )

                with part_path.open("wb") as output_file:
                    for chunk in response.iter_bytes():
                        total_bytes += len(chunk)
                        if total_bytes > GAME_CLIP_MAX_BYTES:
                            raise GameSampleError(
                                "The selected game clip is too large to proxy.",
                                status_code=413,
                            )
                        output_file.write(chunk)

            part_path.replace(cache_path)
        except GameSampleError:
            part_path.unlink(missing_ok=True)
            raise
        except Exception as exc:
            part_path.unlink(missing_ok=True)
            raise GameSampleError(
                "The selected game clip could not be loaded.",
                status_code=502,
            ) from exc

    return cache_path


def transcode_game_clip(source_path: Path, output_path: Path) -> Path:
    if output_path.exists() and output_path.stat().st_size > 0:
        return output_path

    ffmpeg_path = find_ffmpeg_path()
    if ffmpeg_path is None:
        raise GameSampleError(
            "ffmpeg is required to prepare game clips for phone playback.",
            status_code=503,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    part_path = output_path.with_name(f"{output_path.stem}.part{output_path.suffix}")
    command = [
        ffmpeg_path,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source_path),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-vf",
        PHONE_SAFE_VIDEO_FILTER,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-profile:v",
        "baseline",
        "-pix_fmt",
        "yuv420p",
        "-level",
        "3.1",
        "-bf",
        "0",
        "-g",
        "60",
        "-tag:v",
        "avc1",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        str(part_path),
    ]

    try:
        subprocess.run(
            command,
            capture_output=True,
            check=True,
            text=True,
            timeout=120,
        )
        part_path.replace(output_path)
    except (OSError, subprocess.SubprocessError, TimeoutError) as exc:
        part_path.unlink(missing_ok=True)
        raise GameSampleError(
            "The selected game clip could not be prepared for playback.",
            status_code=502,
        ) from exc

    return output_path


def find_ffmpeg_path() -> str | None:
    if GAME_CLIP_FFMPEG_PATH and Path(GAME_CLIP_FFMPEG_PATH).exists():
        return GAME_CLIP_FFMPEG_PATH

    return shutil.which("ffmpeg") or get_packaged_ffmpeg_path()


def get_packaged_ffmpeg_path() -> str | None:
    try:
        import imageio_ffmpeg
    except Exception:
        return None

    try:
        ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None

    return ffmpeg_path if ffmpeg_path and Path(ffmpeg_path).exists() else None


def find_ffprobe_path() -> str | None:
    if GAME_CLIP_FFPROBE_PATH and Path(GAME_CLIP_FFPROBE_PATH).exists():
        return GAME_CLIP_FFPROBE_PATH

    return shutil.which("ffprobe")


def should_transcode_game_clip(source_path: Path) -> bool:
    if GAME_CLIP_TRANSCODE_MODE in {"0", "false", "no", "off", "never"}:
        return False

    if GAME_CLIP_TRANSCODE_MODE in {"1", "always", "true", "yes", "on", "auto"}:
        return True

    return not is_phone_safe_game_clip(source_path)


def should_serve_verified_clip_directly(clip_id: str) -> bool:
    return (
        GAME_CLIP_VERIFIED_ONLY
        and not GAME_CLIP_FORCE_TRANSCODE
        and normalize_clip_id(clip_id) in GAME_CLIP_VERIFIED_IDS
    )


def is_phone_safe_game_clip(source_path: Path) -> bool:
    ffprobe_path = find_ffprobe_path()
    if ffprobe_path is None:
        return False

    command = [
        ffprobe_path,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,pix_fmt",
        "-of",
        "json",
        str(source_path),
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=True,
            text=True,
            timeout=20,
        )
        payload = json.loads(completed.stdout)
    except (OSError, subprocess.SubprocessError, TimeoutError, json.JSONDecodeError):
        return False

    streams = payload.get("streams")
    stream = streams[0] if isinstance(streams, list) and streams else {}
    if not isinstance(stream, dict):
        return False

    return (
        stream.get("codec_name") in PHONE_SAFE_CODECS
        and stream.get("pix_fmt") in PHONE_SAFE_PIXEL_FORMATS
    )


def get_local_manifest_payload() -> object | None:
    export_root = get_local_export_root()
    if export_root is None:
        return None

    manifest_path = export_root / "app" / "game_samples.json"
    if not manifest_path.exists():
        return None

    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def get_local_game_clip_path(video_path: str) -> Path | None:
    export_root = get_local_export_root()
    if export_root is None:
        return None

    local_path = export_root / video_path
    if local_path.exists() and local_path.is_file():
        return local_path

    return None


def get_local_export_root() -> Path | None:
    if not GAME_CLIP_LOCAL_EXPORT_ROOT:
        return None

    export_root = Path(GAME_CLIP_LOCAL_EXPORT_ROOT)
    if export_root.exists() and export_root.is_dir():
        return export_root

    return None


def get_manifest_samples() -> list[GameSample]:
    global _manifest_cache, _manifest_cached_at

    now = time.monotonic()
    with _manifest_lock:
        if (
            _manifest_cache is not None
            and now - _manifest_cached_at < GAME_MANIFEST_CACHE_SEC
        ):
            return _manifest_cache

    try:
        local_payload = get_local_manifest_payload()
        if local_payload is not None:
            payload = local_payload
        else:
            response = httpx.get(
                HF_GAME_SAMPLES_URL,
                follow_redirects=True,
                timeout=15,
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as exc:
        raise GameSampleError(
            "Game clips are temporarily unavailable.",
            status_code=502,
        ) from exc

    samples = filter_game_samples(parse_game_manifest(payload))
    with _manifest_lock:
        _manifest_cache = samples
        _manifest_cached_at = now
        _clip_paths_by_id.clear()
        for sample in samples:
            _clip_paths_by_id[sample.id] = sample.video_path

    return samples


def parse_game_manifest(payload: object) -> list[GameSample]:
    if not isinstance(payload, dict):
        return []

    items = payload.get("items")
    if not isinstance(items, list):
        return []

    samples: list[GameSample] = []
    for item in items:
        sample = parse_game_manifest_item(item)
        if sample is not None:
            samples.append(sample)

    return samples


def filter_game_samples(samples: list[GameSample]) -> list[GameSample]:
    return [sample for sample in samples if should_include_game_sample(sample)]


def should_include_game_sample(sample: GameSample) -> bool:
    sample_id = normalize_clip_id(sample.id)
    if sample_id in GAME_CLIP_BLOCKED_IDS:
        return False

    if GAME_CLIP_ALLOWED_IDS:
        return sample_id in GAME_CLIP_ALLOWED_IDS

    if GAME_CLIP_VERIFIED_ONLY and GAME_CLIP_VERIFIED_IDS:
        return sample_id in GAME_CLIP_VERIFIED_IDS

    return True


def parse_game_manifest_item(value: object) -> GameSample | None:
    if not isinstance(value, dict):
        return None

    sample_id = get_string(value.get("id"))
    correct_answer = get_game_answer(value.get("correctAnswer"))
    difficulty = get_difficulty(value.get("difficulty"))
    video_path = get_string(value.get("videoPath"))
    if (
        not sample_id
        or correct_answer is None
        or difficulty is None
        or not is_safe_hf_path(video_path)
    ):
        return None

    model = value.get("model")
    model_record = model if isinstance(model, dict) else {}
    model_ai_probability = get_probability(model_record.get("aiProbability"))
    model_answer = get_model_answer(
        model_record.get("predictionLabel"),
        model_ai_probability,
    )
    clip_count = get_number(model_record.get("clipCount")) or 2
    duration_sec = get_number(value.get("durationSec")) or max(6, clip_count * 6)

    return GameSample(
        correct_answer=correct_answer,
        difficulty=difficulty,
        duration_sec=round(duration_sec),
        id=sample_id,
        model_ai_probability=model_ai_probability,
        model_answer=model_answer,
        signal_notes=get_string_array(value.get("signalNotes")),
        video_path=video_path,
    )


def select_random_round(
    samples: list[GameSample],
    round_limit: int,
) -> list[GameSample]:
    rng = random.SystemRandom()
    selected: list[GameSample] = []
    used_ids: set[str] = set()
    plan: list[tuple[GameAnswer, GameDifficulty, int]] = [
        ("real", "Warmup", 2),
        ("ai", "Warmup", 2),
        ("real", "Medium", 2),
        ("ai", "Medium", 2),
        ("real", "Hard", 2),
        ("ai", "Hard", 2),
    ]

    for answer, difficulty, count in plan:
        matches = [
            sample
            for sample in samples
            if sample.correct_answer == answer
            and sample.difficulty == difficulty
            and sample.id not in used_ids
        ]
        rng.shuffle(matches)
        for sample in matches[:count]:
            if len(selected) >= round_limit:
                break
            selected.append(sample)
            used_ids.add(sample.id)

    if len(selected) < round_limit:
        remaining = [sample for sample in samples if sample.id not in used_ids]
        rng.shuffle(remaining)
        for sample in remaining:
            if len(selected) >= round_limit:
                break
            selected.append(sample)
            used_ids.add(sample.id)

    rng.shuffle(selected)
    return selected[:round_limit]


def build_game_sample_response(
    *,
    sample: GameSample,
    index: int,
    public_base_url: str,
) -> dict[str, object]:
    return {
        "id": sample.id,
        "title": f"Clip {index + 1}",
        "correctAnswer": sample.correct_answer,
        "difficulty": sample.difficulty,
        "durationSec": sample.duration_sec,
        "modelAnswer": sample.model_answer,
        "modelAiProbability": sample.model_ai_probability,
        "reveal": build_reveal_text(sample),
        "signalNotes": build_signal_notes(sample),
        "videoUrl": (
            f"{public_base_url}/api/game/clips/"
            f"{quote(sample.id, safe='')}/video.mp4"
        ),
    }


def build_reveal_text(sample: GameSample) -> str:
    return (
        f"Answer: {get_answer_label(sample.correct_answer)}. "
        f"VigilVid estimated {get_answer_label(sample.model_answer)} with a "
        f"{round(sample.model_ai_probability * 100)}% AI signal."
    )


def build_signal_notes(sample: GameSample) -> list[str]:
    notes = [
        "Your score uses the known answer for this practice clip.",
        "VigilVid's estimate is shown only for comparison.",
        "Treat the estimate as a clue, not proof.",
    ]
    return notes if not sample.signal_notes else notes


def resolve_game_clip_path(clip_id: str) -> str:
    with _manifest_lock:
        video_path = _clip_paths_by_id.get(clip_id)

    if video_path is not None:
        return video_path

    samples = get_manifest_samples()
    for sample in samples:
        if sample.id == clip_id:
            return sample.video_path

    raise GameSampleError("Game clip was not found.", status_code=404)


def get_cached_clip_path(clip_id: str, video_path: str, variant: str) -> Path:
    cache_version = GAME_CLIP_PLAYBACK_VERSION if variant == "playable" else "source"
    digest = hashlib.sha256(
        f"{clip_id}:{video_path}:{variant}:{cache_version}".encode("utf-8"),
    ).hexdigest()
    return GAME_CLIP_CACHE_DIR / variant / f"{digest[:24]}.mp4"


def build_hf_file_url(path_in_repo: str) -> str:
    encoded_path = "/".join(
        quote(segment, safe="")
        for segment in path_in_repo.split("/")
        if segment
    )
    return f"{HF_GAME_DATASET_BASE_URL}/{encoded_path}"


def is_safe_hf_path(path: str) -> bool:
    if not path or path.startswith("/") or "://" in path:
        return False

    return all(segment not in {"", ".", ".."} for segment in path.split("/"))


def get_string(value: object) -> str:
    return value if isinstance(value, str) else ""


def get_number(value: object) -> float | None:
    if isinstance(value, int | float) and not isinstance(value, bool):
        return float(value)

    return None


def get_probability(value: object) -> float:
    number_value = get_number(value)
    if number_value is None:
        return 0.0

    return min(1.0, max(0.0, number_value))


def get_string_array(value: object) -> list[str]:
    if not isinstance(value, list):
        return []

    return [item for item in value if isinstance(item, str)]


def get_game_answer(value: object) -> GameAnswer | None:
    if value in {"real", "ai"}:
        return value  # type: ignore[return-value]

    return None


def get_difficulty(value: object) -> GameDifficulty | None:
    if value in {"Warmup", "Medium", "Hard"}:
        return value  # type: ignore[return-value]

    return None


def get_model_answer(value: object, probability: float) -> GameAnswer:
    if value == "fake":
        return "ai"

    if value == "real":
        return "real"

    return "ai" if probability >= 0.5 else "real"


def get_answer_label(answer: GameAnswer) -> str:
    return "AI-generated" if answer == "ai" else "real"
