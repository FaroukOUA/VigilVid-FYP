from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

VIDEO_EXTENSIONS = {
    ".avi",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".webm",
}

LABEL_ALIASES = {
    "authentic": "real",
    "deepfake": "fake",
    "fake": "fake",
    "generated": "fake",
    "real": "real",
    "synthetic": "fake",
}

SPLIT_NAMES = {"train", "validation", "test", "demo"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a VigilVid research manifest from local video folders.",
    )
    parser.add_argument("--input-root", required=True, help="Dataset root folder.")
    parser.add_argument("--output", required=True, help="Output JSONL path.")
    parser.add_argument("--source-dataset", default="MintVid")
    parser.add_argument("--license", default="research-only")
    parser.add_argument(
        "--consent-scope",
        choices=["owned_dataset", "opt_in_user", "public_benchmark", "unknown"],
        default="owned_dataset",
    )
    parser.add_argument(
        "--default-split",
        choices=["train", "validation", "test", "demo"],
        default=None,
        help="Use this split when no split folder is present.",
    )
    parser.add_argument(
        "--hash-by-path",
        action="store_true",
        help="Faster dry-run mode: derive sample ids from paths instead of file bytes.",
    )
    parser.add_argument(
        "--skip-probe",
        action="store_true",
        help="Skip ffprobe duration/dimension metadata for faster manifest drafts.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_root = Path(args.input_root).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()

    if not input_root.exists():
        raise SystemExit(f"Input root does not exist: {input_root}")

    rows = []
    video_files = sorted(iter_video_files(input_root))
    for index, video_path in enumerate(video_files, start=1):
        relative_path = video_path.relative_to(input_root).as_posix()
        label = infer_label(video_path.relative_to(input_root))
        if label is None:
            print(f"Skipping unlabeled video: {relative_path}")
            continue

        if index == 1 or index % 100 == 0 or index == len(video_files):
            print(f"Scanning {index}/{len(video_files)}: {relative_path}")

        split = infer_split(video_path.relative_to(input_root), args.default_split)
        digest = (
            hash_path(relative_path)
            if args.hash_by_path
            else hash_file(video_path)
        )
        metadata = (
            {"duration_sec": None, "height": None, "width": None}
            if args.skip_probe
            else probe_video(video_path)
        )
        row = {
            "schema_version": "vigilvid-research-v1",
            "sample_id": f"vv_{digest[:16]}",
            "split": split,
            "label": label,
            "label_id": 1 if label == "fake" else 0,
            "local_video_path": str(video_path),
            "hf_video_path": None,
            "video_sha256": digest,
            "file_size_bytes": video_path.stat().st_size,
            "duration_sec": metadata.get("duration_sec"),
            "width": metadata.get("width"),
            "height": metadata.get("height"),
            "source_dataset": args.source_dataset,
            "source_path": relative_path,
            "license": args.license,
            "consent_scope": args.consent_scope,
            "model_version": None,
            "prediction_label": None,
            "ai_probability": None,
            "confidence_percent": None,
            "processing_time_sec": None,
            "detection_id": None,
            "windows": [],
            "mime_type": mimetypes.guess_type(video_path.name)[0],
            "created_at": datetime.now(UTC).isoformat(),
        }
        rows.append(row)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as output_file:
        for row in rows:
            output_file.write(json.dumps(row, ensure_ascii=False) + "\n")

    label_counts = count_by(rows, "label")
    split_counts = count_by(rows, "split")
    print(f"Wrote {len(rows)} rows to {output_path}")
    print(f"Labels: {label_counts}")
    print(f"Splits: {split_counts}")


def iter_video_files(root: Path) -> list[Path]:
    return [
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS
    ]


def infer_label(relative_path: Path) -> str | None:
    for part in relative_path.parts:
        normalized = part.strip().lower().replace("-", "_").replace(" ", "_")
        if normalized == "ai":
            return "fake"
        for alias, label in LABEL_ALIASES.items():
            if alias in normalized:
                return label
    return None


def infer_split(relative_path: Path, default_split: str | None) -> str:
    for part in relative_path.parts:
        normalized = part.strip().lower().replace("-", "_").replace(" ", "_")
        if normalized == "val":
            return "validation"
        if normalized in SPLIT_NAMES:
            return normalized

    if default_split:
        return default_split

    digest = hash_path(relative_path.as_posix())
    bucket = int(digest[:8], 16) % 100
    if bucket < 70:
        return "train"
    if bucket < 85:
        return "validation"
    return "test"


def hash_path(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as video_file:
        for chunk in iter(lambda: video_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe_video(path: Path) -> dict[str, float | int | None]:
    if shutil.which("ffprobe") is None:
        return {"duration_sec": None, "height": None, "width": None}

    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height:format=duration",
        "-of",
        "json",
        str(path),
    ]
    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            check=True,
            text=True,
            timeout=20,
        )
    except (subprocess.SubprocessError, OSError, TimeoutError):
        return {"duration_sec": None, "height": None, "width": None}

    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {"duration_sec": None, "height": None, "width": None}

    streams = payload.get("streams")
    stream = streams[0] if isinstance(streams, list) and streams else {}
    video_format = payload.get("format")
    duration_raw = (
        video_format.get("duration")
        if isinstance(video_format, dict)
        else None
    )

    return {
        "duration_sec": to_float(duration_raw),
        "height": to_int(stream.get("height")) if isinstance(stream, dict) else None,
        "width": to_int(stream.get("width")) if isinstance(stream, dict) else None,
    }


def to_float(value: Any) -> float | None:
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return None


def to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def count_by(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        value = str(row.get(key))
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


if __name__ == "__main__":
    main()
