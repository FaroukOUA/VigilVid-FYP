import math
import os
import time

import numpy as np
import torch
import torch.nn as nn
from decord import VideoReader, cpu


class CrossAttentionBlock(nn.Module):
    def __init__(self, dim, num_heads, mlp_ratio=4.0):
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

    def forward(self, q, x):
        kv = self.norm_kv(x)
        attn_out, _ = self.attn(self.norm_q(q), kv, kv, need_weights=False)
        return q + self.mlp(self.norm2(q + attn_out))


class AttentiveClassifier(nn.Module):
    def __init__(self, embed_dim=1408, num_heads=16, mlp_ratio=4.0):
        super().__init__()
        self.query_tokens = nn.Parameter(torch.zeros(1, 1, embed_dim))
        self.cross_attention_block = CrossAttentionBlock(embed_dim, num_heads, mlp_ratio)
        self.norm = nn.LayerNorm(embed_dim)
        self.linear = nn.Linear(embed_dim, 1)

        self._init_std = 0.02
        nn.init.trunc_normal_(self.query_tokens, std=self._init_std)
        self.apply(self._init_weights)

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            nn.init.trunc_normal_(module.weight, std=self._init_std)
            if module.bias is not None:
                nn.init.constant_(module.bias, 0)
        elif isinstance(module, nn.LayerNorm):
            nn.init.constant_(module.bias, 0)
            nn.init.constant_(module.weight, 1.0)

    def forward(self, x):
        q = self.query_tokens.expand(x.size(0), -1, -1)
        q = self.cross_attention_block(q, x)
        return self.linear(self.norm(q.squeeze(1))), q.squeeze(1)


def clamp_probability(value: float) -> float:
    return min(max(float(value), 0.0), 1.0)


def aggregate_window_vote_probability(scores: list[dict]) -> dict[str, float | int]:
    """Blend average score with majority voting to avoid max-window bias."""
    probabilities = [
        clamp_probability(score["prob"])
        for score in scores
        if isinstance(score, dict) and "prob" in score
    ]

    if not probabilities:
        return {
            "final_probability": 0.0,
            "mean_probability": 0.0,
            "fake_vote_ratio": 0.0,
            "fake_vote_count": 0,
            "peak_probability": 0.0,
        }

    mean_probability = sum(probabilities) / len(probabilities)
    fake_vote_count = sum(1 for probability in probabilities if probability >= 0.5)
    fake_vote_ratio = fake_vote_count / len(probabilities)
    final_probability = (mean_probability + fake_vote_ratio) / 2

    return {
        "final_probability": clamp_probability(final_probability),
        "mean_probability": mean_probability,
        "fake_vote_ratio": fake_vote_ratio,
        "fake_vote_count": fake_vote_count,
        "peak_probability": max(probabilities),
    }


def load_models(
    device,
    probe_weights_path="mintvid_output2/attentive_probe_optimized.pt",
    encoder_ckpt_path="vjepa2_1_vitg_384.pt",
):
    """Loads the V-JEPA 2.1 encoder and trained probe."""
    print("Loading V-JEPA 2.1 architecture...")

    if encoder_ckpt_path and os.path.exists(encoder_ckpt_path):
        print(f"Loading encoder from local checkpoint: {encoder_ckpt_path}")
        encoder, _ = torch.hub.load(
            "facebookresearch/vjepa2",
            "vjepa2_1_vit_giant_384",
            pretrained=False,
        )

        ckpt_weights = torch.load(encoder_ckpt_path, map_location="cpu", weights_only=True)
        ckpt_weights = ckpt_weights.get(
            "ema_encoder",
            ckpt_weights.get("encoder", ckpt_weights),
        )
        ckpt_weights = {
            key.replace("module.", "").replace("backbone.", ""): value
            for key, value in ckpt_weights.items()
        }
        encoder.load_state_dict(ckpt_weights, strict=False)
        del ckpt_weights
    else:
        print("Loading encoder from PyTorch Hub (pretrained=True)...")
        encoder, _ = torch.hub.load(
            "facebookresearch/vjepa2",
            "vjepa2_1_vit_giant_384",
            pretrained=True,
        )

    encoder = encoder.to(device).to(torch.bfloat16)
    encoder.eval()

    print(f"Loading probe weights from {probe_weights_path}...")
    probe = AttentiveClassifier(embed_dim=1408).to(device)
    probe_state = torch.load(probe_weights_path, map_location=device)
    if "probe_state_dict" in probe_state:
        probe_state = probe_state["probe_state_dict"]
    probe.load_state_dict(probe_state)
    probe.eval()

    return encoder, probe


def get_video_windows(path, resolution=384, frames_per_clip=64, clips_per_window=3):
    """Extract sliding windows from the video."""
    mean = torch.tensor([0.485, 0.456, 0.406]).view(3, 1, 1, 1)
    std = torch.tensor([0.229, 0.224, 0.225]).view(3, 1, 1, 1)

    vr = VideoReader(path, ctx=cpu(0), width=resolution, height=resolution, num_threads=1)
    total_frames = len(vr)
    fps = vr.get_avg_fps()
    duration_sec = total_frames / fps if fps > 0 else 0

    window_frames = frames_per_clip * clips_per_window
    num_windows = math.ceil(total_frames / window_frames)

    windows = []

    for window_index in range(num_windows):
        window_start_frame = window_index * window_frames
        frames_in_this_window = min(window_frames, total_frames - window_start_frame)
        num_clips_this_window = max(
            1,
            math.ceil(frames_in_this_window / frames_per_clip),
        )

        clips = []
        for clip_index in range(num_clips_this_window):
            start = window_start_frame + int(
                frames_in_this_window * clip_index / num_clips_this_window
            )
            end = window_start_frame + int(
                frames_in_this_window * (clip_index + 1) / num_clips_this_window
            )

            indices = np.linspace(start, end - 1, frames_per_clip, dtype=int)
            indices = np.clip(indices, 0, total_frames - 1)

            frames = vr.get_batch(indices).asnumpy()
            tensor = torch.from_numpy(frames).permute(3, 0, 1, 2).float() / 255.0
            clip_tensor = ((tensor - mean) / std).to(torch.bfloat16)
            clips.append(clip_tensor)

        windows.append(
            {
                "clips": clips,
                "start_sec": window_start_frame / fps,
                "end_sec": (window_start_frame + frames_in_this_window) / fps,
            }
        )

    return windows, total_frames, fps, duration_sec


def predict_video(video_path, encoder, probe, device, batch_size=1):
    """Runs sliding-window inference on the full video."""
    t0 = time.perf_counter()

    try:
        windows, total_frames, fps, duration_sec = get_video_windows(video_path)
    except Exception as exc:
        return {"error": f"Failed to load/decode video: {exc}"}

    t_decode = time.perf_counter() - t0

    window_scores = []
    t_encoder_total = 0
    t_probe_total = 0

    for window in windows:
        clips = window["clips"]
        batch = torch.stack(clips).to(device)

        t_enc_start = time.perf_counter()
        with torch.no_grad():
            with torch.amp.autocast("cuda", dtype=torch.bfloat16):
                feat_chunks = []
                for index in range(0, batch.shape[0], batch_size):
                    chunk = batch[index : index + batch_size]
                    feat_chunks.append(encoder(chunk))
                all_feats = torch.cat(feat_chunks, dim=0)
                video_feats = all_feats.view(1, -1, 1408)
        t_encoder_total += time.perf_counter() - t_enc_start

        t_probe_start = time.perf_counter()
        with torch.no_grad():
            with torch.amp.autocast("cuda", dtype=torch.bfloat16):
                logit, _ = probe(video_feats)
                prob = torch.sigmoid(logit).item()
        t_probe_total += time.perf_counter() - t_probe_start

        window_scores.append(
            {
                "prob": prob,
                "start_sec": window["start_sec"],
                "end_sec": window["end_sec"],
            }
        )

    t_total = time.perf_counter() - t0

    aggregation = aggregate_window_vote_probability(window_scores)
    final_prob = float(aggregation["final_probability"])
    prediction = "AI-GENERATED (FAKE)" if final_prob > 0.5 else "REAL"

    return {
        "prediction": prediction,
        "confidence": final_prob,
        "aggregation": aggregation,
        "window_scores": window_scores,
        "windows_analyzed": len(windows),
        "total_frames": total_frames,
        "video_fps": fps,
        "video_duration_sec": duration_sec,
        "profiling": {
            "decode_sec": t_decode,
            "encoder_sec": t_encoder_total,
            "probe_sec": t_probe_total,
            "total_sec": t_total,
            "batch_size_used": batch_size,
        },
    }


def print_report(video_name, result):
    if "error" in result:
        print(f"\nError processing {video_name}: {result['error']}")
        return

    prof = result["profiling"]
    aggregation = result["aggregation"]
    peak_probability = float(aggregation["peak_probability"])

    print(f"\n{'=' * 40}")
    print(" DEEPFAKE DETECTION RESULT")
    print(f"{'=' * 40}")
    print(f" Video       : {os.path.basename(video_name)}")
    print(
        f" Duration    : {result['video_duration_sec']:.1f}s "
        f"({result['video_fps']:.1f}fps, {result['total_frames']} frames)"
    )
    print(f" Windows     : {result['windows_analyzed']} (analyzing full video)")
    print(f"{'-' * 40}")
    print(f" Prediction  : {result['prediction']}")
    print(f" Final score : {result['confidence'] * 100:.1f}%")
    print(f" Mean score  : {float(aggregation['mean_probability']) * 100:.1f}%")
    print(
        f" Fake votes  : {int(aggregation['fake_vote_count'])}/"
        f"{result['windows_analyzed']}"
    )
    print(f" Peak window : {peak_probability * 100:.1f}%")
    print(f"{'-' * 40}")
    print(" Window Breakdown:")
    for window in result["window_scores"]:
        marker = " <- strongest window" if window["prob"] == peak_probability else ""
        print(
            f"   [{window['start_sec']:.1f}s - {window['end_sec']:.1f}s] -> "
            f"{window['prob'] * 100:.1f}% fake{marker}"
        )
    print(f"{'-' * 40}")
    print(f" Profiling (Batch Size: {prof['batch_size_used']}):")
    print(f"   Video Decode : {prof['decode_sec']:.2f}s")
    print(f"   Encoder Pass : {prof['encoder_sec']:.2f}s")
    print(f"   Probe Pass   : {prof['probe_sec']:.2f}s")
    print(f"   Total Time   : {prof['total_sec']:.2f}s")
    print(f"{'=' * 40}\n")
