from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any


PHONE_SAFE_CODECS = {"h264"}
PHONE_SAFE_PIXEL_FORMATS = {"yuv420p", "yuvj420p"}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Audit exported game videos for local decode and phone-safe playback.",
    )
    parser.add_argument(
        "--export-root",
        default="vigilvid_jepa21_test_export",
        help="Path to the unzipped vigilvid_jepa21_test_export folder.",
    )
    parser.add_argument(
        "--manifest",
        default="app/game_samples.json",
        help="Manifest path relative to export root.",
    )
    parser.add_argument(
        "--output",
        default="research/output/game-video-audit.json",
        help="JSON report path.",
    )
    parser.add_argument(
        "--clean-manifest-output",
        default="research/output/game_samples.playable.json",
        help="Manifest copy containing only videos that passed local decode.",
    )
    parser.add_argument(
        "--decode-frames",
        type=int,
        default=12,
        help="Number of frames to decode per video for the smoke check.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Limit the number of manifest items for a quick smoke test.",
    )
    parser.add_argument(
        "--ffmpeg",
        default="ffmpeg",
        help="ffmpeg executable path.",
    )
    parser.add_argument(
        "--ffprobe",
        default="ffprobe",
        help="ffprobe executable path.",
    )
    args = parser.parse_args()

    export_root = Path(args.export_root).resolve()
    manifest_path = export_root / args.manifest
    output_path = Path(args.output).resolve()
    clean_manifest_path = Path(args.clean_manifest_output).resolve()

    ffmpeg_path = resolve_tool(args.ffmpeg, "ffmpeg")
    ffprobe_path = resolve_tool(args.ffprobe, "ffprobe")

    manifest = read_json(manifest_path)
    items = manifest.get("items")
    if not isinstance(items, list):
        raise SystemExit(f"Manifest does not contain an items array: {manifest_path}")

    selected_items = items[: args.limit] if args.limit > 0 else items
    rows: list[dict[str, Any]] = []
    started_at = time.time()

    for index, item in enumerate(selected_items, start=1):
        if not isinstance(item, dict):
            rows.append(
                {
                    "index": index,
                    "id": None,
                    "status": "failed",
                    "issues": ["manifest_item_not_object"],
                },
            )
            continue

        rows.append(
            audit_item(
                export_root=export_root,
                item=item,
                index=index,
                decode_frames=args.decode_frames,
                ffmpeg_path=ffmpeg_path,
                ffprobe_path=ffprobe_path,
            ),
        )

    passed_ids = {
        row["id"]
        for row in rows
        if row.get("status") == "ok" and isinstance(row.get("id"), str)
    }
    clean_items = [
        item
        for item in items
        if isinstance(item, dict) and item.get("id") in passed_ids
    ]
    clean_manifest = {
        **manifest,
        "items": clean_items,
        "audit_note": "Contains only items that passed local ffprobe and ffmpeg frame decode.",
    }

    summary = build_summary(rows, elapsed_sec=time.time() - started_at)
    write_json(
        output_path,
        {
            "schema_version": "vigilvid-game-video-audit-v1",
            "export_root": str(export_root),
            "manifest": str(manifest_path),
            "decode_frames": args.decode_frames,
            "summary": summary,
            "items": rows,
        },
    )
    write_json(clean_manifest_path, clean_manifest)

    print(f"Audited: {summary['checked_count']}")
    print(f"Passed decode: {summary['ok_count']}")
    print(f"Failed decode: {summary['failed_count']}")
    print(f"Needs phone-safe transcode: {summary['needs_transcode_count']}")
    print(f"Report: {output_path}")
    print(f"Playable manifest: {clean_manifest_path}")


def audit_item(
    *,
    ffmpeg_path: str,
    ffprobe_path: str,
    export_root: Path,
    item: dict[str, Any],
    index: int,
    decode_frames: int,
) -> dict[str, Any]:
    sample_id = item.get("id")
    video_path_value = item.get("videoPath")
    issues: list[str] = []

    row: dict[str, Any] = {
        "index": index,
        "id": sample_id if isinstance(sample_id, str) else None,
        "videoPath": video_path_value if isinstance(video_path_value, str) else None,
        "status": "failed",
        "issues": issues,
    }

    if not isinstance(video_path_value, str) or not video_path_value:
        issues.append("missing_video_path")
        return row

    video_path = export_root / video_path_value
    row["absolutePath"] = str(video_path)
    if not video_path.exists():
        issues.append("video_file_missing")
        return row

    probe = ffprobe_video(video_path, ffprobe_path)
    row["probe"] = probe
    if probe is None:
        issues.append("ffprobe_failed")
        return row

    codec = probe.get("codec_name")
    pixel_format = probe.get("pix_fmt")
    phone_safe = (
        codec in PHONE_SAFE_CODECS and pixel_format in PHONE_SAFE_PIXEL_FORMATS
    )
    row["phoneSafeWithoutTranscode"] = phone_safe
    if not phone_safe:
        issues.append("needs_phone_safe_transcode")

    decode_error = ffmpeg_decode_frames(video_path, decode_frames, ffmpeg_path)
    if decode_error is not None:
        issues.append("ffmpeg_decode_failed")
        row["decodeError"] = decode_error[-600:]
        return row

    row["status"] = "ok"
    return row


def ffprobe_video(path: Path, ffprobe_path: str) -> dict[str, Any] | None:
    command = [
        ffprobe_path,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name,profile,pix_fmt,width,height,avg_frame_rate:format=duration",
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
        payload = json.loads(completed.stdout)
    except (
        OSError,
        subprocess.SubprocessError,
        TimeoutError,
        json.JSONDecodeError,
    ):
        return None

    streams = payload.get("streams")
    stream = streams[0] if isinstance(streams, list) and streams else {}
    media_format = payload.get("format")
    duration = media_format.get("duration") if isinstance(media_format, dict) else None
    if not isinstance(stream, dict):
        return None

    return {
        "codec_name": stream.get("codec_name"),
        "profile": stream.get("profile"),
        "pix_fmt": stream.get("pix_fmt"),
        "width": stream.get("width"),
        "height": stream.get("height"),
        "avg_frame_rate": stream.get("avg_frame_rate"),
        "duration": duration,
    }


def ffmpeg_decode_frames(
    path: Path,
    frame_count: int,
    ffmpeg_path: str,
) -> str | None:
    command = [
        ffmpeg_path,
        "-v",
        "error",
        "-i",
        str(path),
        "-map",
        "0:v:0",
        "-frames:v",
        str(max(1, frame_count)),
        "-f",
        "null",
        "-",
    ]
    try:
        subprocess.run(
            command,
            capture_output=True,
            check=True,
            text=True,
            timeout=30,
        )
    except (
        OSError,
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
    ) as exc:
        stderr = getattr(exc, "stderr", "") or str(exc)
        return stderr

    return None


def build_summary(rows: list[dict[str, Any]], *, elapsed_sec: float) -> dict[str, Any]:
    ok_count = sum(1 for row in rows if row.get("status") == "ok")
    failed_count = len(rows) - ok_count
    needs_transcode_count = sum(
        1 for row in rows if "needs_phone_safe_transcode" in row.get("issues", [])
    )
    issue_counts: dict[str, int] = {}
    for row in rows:
        issues = row.get("issues")
        if not isinstance(issues, list):
            continue
        for issue in issues:
            if isinstance(issue, str):
                issue_counts[issue] = issue_counts.get(issue, 0) + 1

    return {
        "checked_count": len(rows),
        "ok_count": ok_count,
        "failed_count": failed_count,
        "needs_transcode_count": needs_transcode_count,
        "issue_counts": issue_counts,
        "elapsed_sec": round(elapsed_sec, 2),
    }


def resolve_tool(value: str, name: str) -> str:
    explicit_path = Path(value)
    if explicit_path.exists():
        return str(explicit_path)

    found_path = shutil.which(value)
    if found_path is not None:
        return found_path

    raise SystemExit(f"{name} is required on PATH or via --{name}.")


def read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SystemExit(f"File not found: {path}") from exc

    if not isinstance(payload, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return payload


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
