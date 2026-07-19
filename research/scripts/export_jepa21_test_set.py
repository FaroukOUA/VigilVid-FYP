from __future__ import annotations

import argparse
import contextlib
import hashlib
import json
import math
import mimetypes
import os
import random
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import Any, Iterator


DEFAULT_LIGHTNING_ROOT = Path("/teamspace/studios/this_studio")
DEFAULT_RAM_CACHE_DIR = Path("/tmp/mintvid")
DEFAULT_ORIGINAL_OUTPUT_DIR = DEFAULT_LIGHTNING_ROOT / "mintvid_output2"
DEFAULT_ENCODER_CHECKPOINT = DEFAULT_LIGHTNING_ROOT / "vjepa2_1_vitg_384.pt"
DEFAULT_EXPORT_DIR = DEFAULT_LIGHTNING_ROOT / "vigilvid_jepa21_test_export"
KAGGLE_SLUGS = (
    "faroukelouazzani/general-minvid",
    "faroukelouazzani/face-minvid",
    "faroukelouazzani/fact-mintvid",
)


@dataclass(frozen=True)
class VideoEntry:
    category: str
    label: str
    path: Path
    source_path: str


@dataclass(frozen=True)
class Prediction:
    ai_probability: float
    clip_count: int
    logit: float
    processing_time_sec: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Re-run the VJEPA 2.1 MintVid seed-42 test split, copy the test "
            "videos, and export research/app JSON files."
        ),
    )
    parser.add_argument(
        "--mintvid-root",
        default=str(DEFAULT_RAM_CACHE_DIR),
        help=(
            "Root containing the three Kaggle MintVid folders. Used to derive "
            "category roots when --general-root/--face-root/--fact-root are not set."
        ),
    )
    parser.add_argument("--general-root", default=None)
    parser.add_argument("--face-root", default=None)
    parser.add_argument("--fact-root", default=None)
    parser.add_argument(
        "--kaggle-download",
        action="store_true",
        help=(
            "Download the three MintVid Kaggle datasets into --mintvid-root "
            "before building the seed-42 split."
        ),
    )
    parser.add_argument(
        "--encoder-checkpoint",
        default=str(DEFAULT_ENCODER_CHECKPOINT),
        help="Path to vjepa2_1_vitg_384.pt.",
    )
    parser.add_argument(
        "--probe-checkpoint",
        default=str(DEFAULT_ORIGINAL_OUTPUT_DIR / "checkpoints" / "best_epoch.pt"),
        help=(
            "Path to the trained attentive probe. Supports either best_epoch.pt "
            "with probe_state_dict or attentive_probe_optimized.pt state dict."
        ),
    )
    parser.add_argument(
        "--output-dir",
        default=str(DEFAULT_EXPORT_DIR),
        help="Export folder. Put this outside Git, or under research/output/.",
    )
    parser.add_argument("--seed", default=42, type=int)
    parser.add_argument("--test-size", default=0.2, type=float)
    parser.add_argument("--resolution", default=384, type=int)
    parser.add_argument("--num-frames", default=64, type=int)
    parser.add_argument("--feature-dim", default=1408, type=int)
    parser.add_argument("--encoder-chunk-size", default=12, type=int)
    parser.add_argument(
        "--model-version",
        default="vjepa2.1-attentive-probe-mintvid-seed42",
    )
    parser.add_argument(
        "--limit",
        default=None,
        type=int,
        help="Optional smoke-test limit for the number of test videos to export.",
    )
    parser.add_argument(
        "--hash-by-path",
        action="store_true",
        help="Use path hashes instead of full file hashes for faster dry runs.",
    )
    parser.add_argument(
        "--skip-probe-metadata",
        action="store_true",
        help="Skip ffprobe duration/resolution metadata.",
    )
    parser.add_argument(
        "--skip-video-copy",
        action="store_true",
        help="Write JSON files without copying test videos.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite copied videos if they already exist.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    seed_everything(args.seed)

    output_dir = Path(args.output_dir).expanduser().resolve()
    data_dir = output_dir / "data"
    predictions_dir = data_dir / "predictions"
    evaluations_dir = data_dir / "evaluations"
    app_dir = output_dir / "app"
    for directory in [data_dir, predictions_dir, evaluations_dir, app_dir]:
        directory.mkdir(parents=True, exist_ok=True)

    mintvid_root = Path(args.mintvid_root).expanduser()
    if args.kaggle_download:
        download_kaggle_datasets(mintvid_root)

    category_roots = resolve_category_roots(args)
    all_entries = collect_all_entries(category_roots)
    if not all_entries:
        raise SystemExit("No MintVid mp4 files found. Check the category roots.")

    train_entries, test_entries = split_entries(
        all_entries,
        seed=args.seed,
        test_size=args.test_size,
    )
    if args.limit is not None:
        test_entries = test_entries[: args.limit]

    print(f"Dataset split: {len(train_entries)} train / {len(test_entries)} test")
    print(f"Export directory: {output_dir}")

    import cv2
    import numpy as np
    import torch
    import torch.nn as nn
    from decord import VideoReader, cpu
    from sklearn.metrics import (
        accuracy_score,
        classification_report,
        f1_score,
        precision_score,
        recall_score,
        roc_auc_score,
    )
    from tqdm import tqdm

    cv2.setNumThreads(1)
    try:
        torch.multiprocessing.set_sharing_strategy("file_system")
    except RuntimeError:
        pass

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"PyTorch: {torch.__version__} | CUDA: {torch.cuda.is_available()}")
    if hasattr(torch, "set_float32_matmul_precision"):
        torch.set_float32_matmul_precision("high")

    print("\n===== LOADING VJEPA 2.1 =====")
    encoder, _ = torch.hub.load(
        "facebookresearch/vjepa2",
        "vjepa2_1_vit_giant_384",
        pretrained=False,
    )
    load_encoder_weights(encoder, Path(args.encoder_checkpoint), torch)
    encoder = encoder.to(device)
    if device.type == "cuda":
        encoder = encoder.to(torch.bfloat16)
    encoder.eval()

    probe = build_attentive_classifier(nn, torch, args.feature_dim).to(device)
    load_probe_weights(probe, Path(args.probe_checkpoint), torch, device)
    probe.eval()

    normalizer = VideoNormalizer(torch, args.resolution)
    rows: list[dict[str, Any]] = []
    predictions: list[dict[str, Any]] = []
    app_items: list[dict[str, Any]] = []
    y_true: list[float] = []
    y_pred: list[float] = []
    y_prob: list[float] = []
    failures: list[dict[str, str]] = []

    print("\n===== EVALUATING TEST SET =====")
    with torch.no_grad():
        for entry in tqdm(test_entries, desc="Testing"):
            try:
                digest = (
                    hash_path(entry.source_path)
                    if args.hash_by_path
                    else hash_file(entry.path)
                )
                sample_id = f"vv_{digest[:16]}"
                label_id = 1 if entry.label == "fake" else 0
                exported_video_relpath = None
                if not args.skip_video_copy:
                    exported_video_relpath = copy_test_video(
                        entry,
                        sample_id,
                        output_dir,
                        overwrite=args.overwrite,
                    )

                metadata = (
                    {"duration_sec": None, "height": None, "width": None}
                    if args.skip_probe_metadata
                    else probe_video(entry.path)
                )
                prediction = predict_video(
                    entry.path,
                    encoder,
                    probe,
                    normalizer,
                    torch=torch,
                    np=np,
                    VideoReader=VideoReader,
                    cpu=cpu,
                    device=device,
                    num_frames=args.num_frames,
                    feature_dim=args.feature_dim,
                    encoder_chunk_size=args.encoder_chunk_size,
                )
                prediction_label = "fake" if prediction.ai_probability >= 0.5 else "real"
                confidence_percent = round(prediction.ai_probability * 100, 2)

                row = build_manifest_row(
                    entry,
                    sample_id=sample_id,
                    digest=digest,
                    model_version=args.model_version,
                    prediction_label=prediction_label,
                    ai_probability=prediction.ai_probability,
                    confidence_percent=confidence_percent,
                    processing_time_sec=prediction.processing_time_sec,
                    metadata=metadata,
                    hf_video_path=exported_video_relpath,
                )
                rows.append(row)

                prediction_row = {
                    "sample_id": sample_id,
                    "model_version": args.model_version,
                    "ai_probability": round(prediction.ai_probability, 6),
                    "confidence_percent": confidence_percent,
                    "prediction_label": prediction_label,
                    "processing_time_sec": round(prediction.processing_time_sec, 3),
                    "detection_id": f"jepa21_{sample_id}",
                    "windows": [],
                    "category": entry.category,
                    "clip_count": prediction.clip_count,
                    "logit": round(prediction.logit, 6),
                }
                predictions.append(prediction_row)

                app_items.append(
                    build_game_item(
                        row,
                        prediction_row,
                        label_id=label_id,
                        exported_video_relpath=exported_video_relpath,
                    ),
                )

                y_true.append(float(label_id))
                y_prob.append(prediction.ai_probability)
                y_pred.append(1.0 if prediction.ai_probability >= 0.5 else 0.0)
            except Exception as exc:  # noqa: BLE001 - keep batch export moving.
                failures.append(
                    {
                        "source_path": entry.source_path,
                        "error": str(exc),
                    },
                )
                print(f"\nError [{entry.source_path}]: {exc}")

    metrics = build_metrics(
        y_true=y_true,
        y_pred=y_pred,
        y_prob=y_prob,
        failed=failures,
        total_requested=len(test_entries),
        model_version=args.model_version,
        threshold=0.5,
        accuracy_score=accuracy_score,
        precision_score=precision_score,
        recall_score=recall_score,
        f1_score=f1_score,
        roc_auc_score=roc_auc_score,
        classification_report=classification_report,
    )

    write_jsonl(data_dir / "manifest.jsonl", rows)
    write_jsonl(predictions_dir / f"{safe_slug(args.model_version)}.jsonl", predictions)
    write_json(evaluations_dir / f"{safe_slug(args.model_version)}-metrics.json", metrics)
    write_json(
        data_dir / "test_split.json",
        {
            "schema_version": "vigilvid-test-split-v1",
            "seed": args.seed,
            "test_size": args.test_size,
            "train_count": len(train_entries),
            "test_count": len(test_entries),
            "source_categories": {
                category: str(path) for category, path in category_roots.items()
            },
            "samples": [
                {
                    "sample_id": row["sample_id"],
                    "label": row["label"],
                    "category": str(row["source_path"]).split("/", 1)[0],
                    "source_path": row["source_path"],
                    "hf_video_path": row["hf_video_path"],
                }
                for row in rows
            ],
            "failed_samples": failures,
        },
    )
    write_json(
        app_dir / "game_samples.json",
        {
            "schema_version": "vigilvid-game-samples-v1",
            "generated_at": datetime.now(UTC).isoformat(),
            "model_version": args.model_version,
            "threshold": 0.5,
            "items": app_items,
            "metrics": metrics,
        },
    )

    print("\n===== EXPORT COMPLETE =====")
    print(f"Manifest: {data_dir / 'manifest.jsonl'}")
    print(f"Predictions: {predictions_dir / (safe_slug(args.model_version) + '.jsonl')}")
    print(f"Metrics: {evaluations_dir / (safe_slug(args.model_version) + '-metrics.json')}")
    print(f"App game JSON: {app_dir / 'game_samples.json'}")
    print(f"Copied videos: {output_dir / 'videos' / 'test'}")
    print(f"Processed: {metrics['evaluated_count']} | Failed: {metrics['failed_count']}")


def seed_everything(seed: int) -> None:
    random.seed(seed)
    try:
        import numpy as np

        np.random.seed(seed)
    except ImportError:
        pass
    try:
        import torch

        torch.manual_seed(seed)
    except ImportError:
        pass


def resolve_category_roots(args: argparse.Namespace) -> dict[str, Path]:
    mintvid_root = Path(args.mintvid_root).expanduser()
    defaults = {
        "general": mintvid_root / "faroukelouazzani_general-minvid" / "general",
        "face": mintvid_root / "faroukelouazzani_face-minvid" / "face",
        "fact": mintvid_root / "faroukelouazzani_fact-mintvid" / "fact",
    }
    overrides = {
        "general": args.general_root,
        "face": args.face_root,
        "fact": args.fact_root,
    }
    roots = {
        category: Path(value).expanduser()
        if value is not None
        else defaults[category]
        for category, value in overrides.items()
    }
    missing = [f"{category}: {path}" for category, path in roots.items() if not path.exists()]
    if missing:
        raise SystemExit(
            "Missing MintVid category folders:\n"
            + "\n".join(missing)
            + "\nPass --general-root, --face-root, and --fact-root if your folders differ.",
        )
    return roots


def download_kaggle_datasets(mintvid_root: Path) -> None:
    kaggle_executable = shutil.which("kaggle")
    if kaggle_executable is None:
        raise SystemExit(
            "Kaggle CLI was not found on PATH. Install/configure Kaggle first, "
            "or pass --general-root, --face-root, and --fact-root manually.",
        )

    mintvid_root.mkdir(parents=True, exist_ok=True)
    print(f"\n===== DOWNLOADING MINTVID DATASETS TO {mintvid_root} =====")

    for slug in KAGGLE_SLUGS:
        destination = mintvid_root / slug.replace("/", "_")
        if destination.exists() and any(destination.iterdir()):
            print(f"  {slug} already cached at {destination}")
            continue

        destination.mkdir(parents=True, exist_ok=True)
        print(f"  Downloading {slug}...")
        command = [
            kaggle_executable,
            "datasets",
            "download",
            "-d",
            slug,
            "-p",
            str(destination),
            "--unzip",
            "-q",
        ]
        try:
            subprocess.run(command, check=True)
        except subprocess.CalledProcessError as exc:
            raise SystemExit(
                f"Kaggle download failed for {slug}. Check Kaggle credentials and access.",
            ) from exc


def collect_all_entries(category_roots: dict[str, Path]) -> list[VideoEntry]:
    entries: list[VideoEntry] = []
    for category in ["general", "face", "fact"]:
        base = category_roots[category]
        for label in ["real", "fake"]:
            label_dir = base / label
            for path in collect_videos(label_dir):
                relative = path.relative_to(label_dir).as_posix()
                entries.append(
                    VideoEntry(
                        category=category,
                        label=label,
                        path=path,
                        source_path=f"{category}/{label}/{relative}",
                    ),
                )
    return entries


def collect_videos(path: Path) -> list[Path]:
    # Keep os.walk order to match the original training script's seed-42 split.
    videos: list[Path] = []
    for root, _, files in os.walk(path):
        for filename in files:
            if filename.lower().endswith(".mp4"):
                videos.append(Path(root) / filename)
    return videos


def split_entries(
    entries: list[VideoEntry],
    *,
    seed: int,
    test_size: float,
) -> tuple[list[VideoEntry], list[VideoEntry]]:
    from sklearn.model_selection import train_test_split

    labels_for_split = [0 if entry.label == "real" else 1 for entry in entries]
    train_entries, test_entries = train_test_split(
        entries,
        test_size=test_size,
        stratify=labels_for_split,
        random_state=seed,
    )
    return list(train_entries), list(test_entries)


def load_encoder_weights(encoder: Any, checkpoint_path: Path, torch: Any) -> None:
    checkpoint_path = checkpoint_path.expanduser()
    if not checkpoint_path.exists():
        raise SystemExit(f"Encoder checkpoint not found: {checkpoint_path}")

    load_path = checkpoint_path
    if Path("/tmp").exists():
        local_copy = Path("/tmp") / checkpoint_path.name
        if not local_copy.exists():
            print(f"Copying encoder checkpoint to {local_copy} for faster loading...")
            shutil.copy2(checkpoint_path, local_copy)
        load_path = local_copy

    weights = torch.load(load_path, map_location="cpu", weights_only=True)
    weights = weights.get("ema_encoder", weights.get("encoder", weights))
    weights = {
        key.replace("module.", "").replace("backbone.", ""): value
        for key, value in weights.items()
    }
    encoder.load_state_dict(weights, strict=False)
    print("Encoder ready.")


def build_attentive_classifier(nn: Any, torch: Any, feature_dim: int) -> Any:
    class CrossAttentionBlock(nn.Module):
        def __init__(self, dim: int, num_heads: int, mlp_ratio: float = 4.0):
            super().__init__()
            self.norm_q = nn.LayerNorm(dim)
            self.norm_kv = nn.LayerNorm(dim)
            self.attn = nn.MultiheadAttention(dim, num_heads, batch_first=True)
            self.norm2 = nn.LayerNorm(dim)
            self.mlp = nn.Sequential(
                nn.Linear(dim, int(dim * mlp_ratio)),
                nn.GELU(),
                nn.Linear(int(dim * mlp_ratio), dim),
            )

        def forward(self, q: Any, x: Any) -> Any:
            kv = self.norm_kv(x)
            attn_out, _ = self.attn(self.norm_q(q), kv, kv, need_weights=False)
            return q + self.mlp(self.norm2(q + attn_out))

    class AttentiveClassifier(nn.Module):
        def __init__(self, embed_dim: int = 1408, num_heads: int = 16):
            super().__init__()
            self.query_tokens = nn.Parameter(torch.zeros(1, 1, embed_dim))
            self.cross_attention_block = CrossAttentionBlock(embed_dim, num_heads)
            self.norm = nn.LayerNorm(embed_dim)
            self.linear = nn.Linear(embed_dim, 1)
            self._init_std = 0.02
            nn.init.trunc_normal_(self.query_tokens, std=self._init_std)
            self.apply(self._init_weights)

        def _init_weights(self, module: Any) -> None:
            if isinstance(module, nn.Linear):
                nn.init.trunc_normal_(module.weight, std=self._init_std)
                if module.bias is not None:
                    nn.init.constant_(module.bias, 0)
            elif isinstance(module, nn.LayerNorm):
                nn.init.constant_(module.bias, 0)
                nn.init.constant_(module.weight, 1.0)

        def forward(self, x: Any) -> tuple[Any, Any]:
            q = self.query_tokens.expand(x.size(0), -1, -1)
            q = self.cross_attention_block(q, x)
            pooled = self.norm(q.squeeze(1))
            return self.linear(pooled), q.squeeze(1)

    return AttentiveClassifier(embed_dim=feature_dim)


def load_probe_weights(probe: Any, checkpoint_path: Path, torch: Any, device: Any) -> None:
    checkpoint_path = checkpoint_path.expanduser()
    if not checkpoint_path.exists():
        raise SystemExit(f"Probe checkpoint not found: {checkpoint_path}")
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    state_dict = checkpoint.get("probe_state_dict", checkpoint)
    probe.load_state_dict(state_dict)
    print(f"Probe ready: {checkpoint_path}")


class VideoNormalizer:
    def __init__(self, torch: Any, resolution: int):
        self.torch = torch
        self.resolution = resolution
        self.mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1, 1)
        self.std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1, 1)

    def normalize(self, frames: Any) -> Any:
        tensor = self.torch.from_numpy(frames).permute(3, 0, 1, 2).float() / 255.0
        return (tensor - self.mean) / self.std


def predict_video(
    path: Path,
    encoder: Any,
    probe: Any,
    normalizer: VideoNormalizer,
    *,
    torch: Any,
    np: Any,
    VideoReader: Any,
    cpu: Any,
    device: Any,
    num_frames: int,
    feature_dim: int,
    encoder_chunk_size: int,
) -> Prediction:
    started_at = time.perf_counter()
    clips = get_video_clips(
        path,
        normalizer,
        np=np,
        VideoReader=VideoReader,
        cpu=cpu,
        num_frames=num_frames,
    )
    batch = torch.stack(clips).to(device)
    if device.type == "cuda":
        batch = batch.to(torch.bfloat16)

    with autocast_for_device(torch, device):
        feat_chunks = []
        for index in range(0, batch.shape[0], encoder_chunk_size):
            feat_chunks.append(encoder(batch[index : index + encoder_chunk_size]))
        all_feats = torch.cat(feat_chunks, dim=0)
        video_feats = all_feats.view(1, -1, feature_dim)
        logit, _ = probe(video_feats)

    probability = float(torch.sigmoid(logit).item())
    return Prediction(
        ai_probability=probability,
        clip_count=len(clips),
        logit=float(logit.item()),
        processing_time_sec=time.perf_counter() - started_at,
    )


def get_video_clips(
    path: Path,
    normalizer: VideoNormalizer,
    *,
    np: Any,
    VideoReader: Any,
    cpu: Any,
    num_frames: int,
) -> list[Any]:
    vr = VideoReader(
        str(path),
        ctx=cpu(0),
        width=normalizer.resolution,
        height=normalizer.resolution,
        num_threads=1,
    )
    total = len(vr)
    num_clips = min(3, max(1, math.ceil(total / num_frames)))
    clips = []
    for clip_index in range(num_clips):
        start = int(total * clip_index / num_clips)
        end = int(total * (clip_index + 1) / num_clips)
        indices = np.linspace(start, end - 1, num_frames, dtype=int)
        frames = vr.get_batch(indices).asnumpy()
        clips.append(normalizer.normalize(frames))
    return clips


@contextlib.contextmanager
def autocast_for_device(torch: Any, device: Any) -> Iterator[None]:
    if device.type == "cuda":
        with torch.amp.autocast("cuda", dtype=torch.bfloat16):
            yield
    else:
        yield


def copy_test_video(
    entry: VideoEntry,
    sample_id: str,
    output_dir: Path,
    *,
    overwrite: bool,
) -> str:
    target_dir = output_dir / "videos" / "test" / entry.label
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / f"{sample_id}_{safe_filename(entry.path.name)}"
    if overwrite or not target_path.exists():
        shutil.copy2(entry.path, target_path)
    return target_path.relative_to(output_dir).as_posix()


def build_manifest_row(
    entry: VideoEntry,
    *,
    sample_id: str,
    digest: str,
    model_version: str,
    prediction_label: str,
    ai_probability: float,
    confidence_percent: float,
    processing_time_sec: float,
    metadata: dict[str, Any],
    hf_video_path: str | None,
) -> dict[str, Any]:
    return {
        "schema_version": "vigilvid-research-v1",
        "sample_id": sample_id,
        "split": "test",
        "label": entry.label,
        "label_id": 1 if entry.label == "fake" else 0,
        "local_video_path": str(entry.path),
        "hf_video_path": hf_video_path,
        "video_sha256": digest,
        "file_size_bytes": entry.path.stat().st_size,
        "duration_sec": metadata.get("duration_sec"),
        "width": metadata.get("width"),
        "height": metadata.get("height"),
        "source_dataset": "MintVid",
        "source_path": entry.source_path,
        "license": "research-only",
        "consent_scope": "owned_dataset",
        "mime_type": mimetypes.guess_type(entry.path.name)[0],
        "created_at": datetime.now(UTC).isoformat(),
        "model_version": model_version,
        "prediction_label": prediction_label,
        "ai_probability": round(ai_probability, 6),
        "confidence_percent": confidence_percent,
        "processing_time_sec": round(processing_time_sec, 3),
        "detection_id": f"jepa21_{sample_id}",
        "windows": [],
    }


def build_game_item(
    row: dict[str, Any],
    prediction: dict[str, Any],
    *,
    label_id: int,
    exported_video_relpath: str | None,
) -> dict[str, Any]:
    probability = float(prediction["ai_probability"])
    label = row["label"]
    model_is_correct = prediction["prediction_label"] == label
    correct_confidence = probability if label == "fake" else 1.0 - probability
    difficulty = infer_difficulty(correct_confidence, model_is_correct)
    answer = "ai" if label_id == 1 else "real"
    category = str(prediction["category"])

    return {
        "id": row["sample_id"],
        "sampleId": row["sample_id"],
        "title": title_for_item(category, label, row["sample_id"]),
        "sourceLabel": f"MintVid {category}",
        "correctAnswer": answer,
        "groundTruthLabel": label,
        "difficulty": difficulty,
        "durationSec": row["duration_sec"],
        "videoPath": exported_video_relpath,
        "sourcePath": row["source_path"],
        "model": {
            "version": prediction["model_version"],
            "predictionLabel": prediction["prediction_label"],
            "aiProbability": probability,
            "confidencePercent": prediction["confidence_percent"],
            "isCorrect": model_is_correct,
            "clipCount": prediction["clip_count"],
        },
        "reveal": build_reveal(label, prediction["prediction_label"], probability),
        "signalNotes": build_signal_notes(label, probability, model_is_correct),
    }


def infer_difficulty(correct_confidence: float, model_is_correct: bool) -> str:
    if not model_is_correct or correct_confidence < 0.65:
        return "Hard"
    if correct_confidence < 0.85:
        return "Medium"
    return "Warmup"


def title_for_item(category: str, label: str, sample_id: str) -> str:
    label_text = "real" if label == "real" else "AI-generated"
    return f"{category.title()} {label_text} sample {sample_id[-4:]}"


def build_reveal(label: str, prediction_label: str, probability: float) -> str:
    truth = "real" if label == "real" else "AI-generated"
    model_text = "fake" if prediction_label == "fake" else "real"
    return (
        f"This MintVid test item is marked {truth}. The VJEPA 2.1 probe "
        f"predicted {model_text} with {probability * 100:.1f}% AI probability."
    )


def build_signal_notes(label: str, probability: float, model_is_correct: bool) -> list[str]:
    notes = [
        "Use the ground-truth label for scoring, not the model prediction.",
        f"Model AI probability for this clip: {probability * 100:.1f}%.",
    ]
    if not model_is_correct:
        notes.append("This is a useful hard sample because the model got it wrong.")
    elif label == "fake":
        notes.append("Look for inconsistent motion, lighting, edges, or texture stability.")
    else:
        notes.append("Compression or low quality can look suspicious even when the clip is real.")
    return notes


def build_metrics(
    *,
    y_true: list[float],
    y_pred: list[float],
    y_prob: list[float],
    failed: list[dict[str, str]],
    total_requested: int,
    model_version: str,
    threshold: float,
    accuracy_score: Any,
    precision_score: Any,
    recall_score: Any,
    f1_score: Any,
    roc_auc_score: Any,
    classification_report: Any,
) -> dict[str, Any]:
    if not y_true:
        return {
            "schema_version": "vigilvid-evaluation-v1",
            "model_version": model_version,
            "threshold": threshold,
            "requested_count": total_requested,
            "evaluated_count": 0,
            "failed_count": len(failed),
            "failed_samples": failed,
        }

    tp = sum(1 for truth, pred in zip(y_true, y_pred) if truth == 1 and pred == 1)
    tn = sum(1 for truth, pred in zip(y_true, y_pred) if truth == 0 and pred == 0)
    fp = sum(1 for truth, pred in zip(y_true, y_pred) if truth == 0 and pred == 1)
    fn = sum(1 for truth, pred in zip(y_true, y_pred) if truth == 1 and pred == 0)
    real_count = sum(1 for value in y_true if value == 0)
    fake_count = sum(1 for value in y_true if value == 1)

    try:
        auc_roc = round(float(roc_auc_score(y_true, y_prob)), 5)
    except ValueError:
        auc_roc = None

    fake_recall = safe_div(tp, tp + fn)
    real_recall = safe_div(tn, tn + fp)

    return {
        "schema_version": "vigilvid-evaluation-v1",
        "model_version": model_version,
        "threshold": threshold,
        "requested_count": total_requested,
        "evaluated_count": len(y_true),
        "failed_count": len(failed),
        "label_counts": {
            "real": real_count,
            "fake": fake_count,
        },
        "confusion_matrix": {
            "true_fake_pred_fake": tp,
            "true_fake_pred_real": fn,
            "true_real_pred_fake": fp,
            "true_real_pred_real": tn,
        },
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 5),
        "balanced_accuracy": round(mean([fake_recall, real_recall]), 5),
        "fake_precision": round(float(precision_score(y_true, y_pred, zero_division=0)), 5),
        "fake_recall": round(float(recall_score(y_true, y_pred, zero_division=0)), 5),
        "fake_f1": round(float(f1_score(y_true, y_pred, zero_division=0)), 5),
        "auc_roc": auc_roc,
        "average_ai_probability": round(mean(y_prob), 6),
        "classification_report": classification_report(
            y_true,
            y_pred,
            labels=[0.0, 1.0],
            target_names=["Real", "AI-Generated"],
            zero_division=0,
            output_dict=True,
        ),
        "failed_samples": failed,
    }


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
        payload = json.loads(completed.stdout)
    except (OSError, subprocess.SubprocessError, TimeoutError, json.JSONDecodeError):
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


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as input_file:
        for chunk in iter(lambda: input_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hash_path(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as output_file:
        for row in rows:
            output_file.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def safe_filename(filename: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", filename)


def safe_slug(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("._") or "model"


def safe_div(numerator: int | float, denominator: int | float) -> float:
    if denominator == 0:
        return 0.0
    return round(float(numerator) / float(denominator), 5)


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


if __name__ == "__main__":
    main()
