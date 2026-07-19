"""Deepfake Detector - Hugging Face ZeroGPU Space.

V-JEPA 2.1 ViT-Giant + AttentiveClassifier probe.

Reference version for VigilVid:
- Uses window-vote aggregation instead of max-window final scoring.
- Does not store submitted user videos after processing.
"""

import glob
import os
import shutil
import tempfile
import threading
import time
import warnings

import requests

warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=UserWarning)

import gradio as gr
import spaces
import torch
from huggingface_hub import hf_hub_download
from inference_core import AttentiveClassifier, get_video_windows
from saverapi_client import saverapi_fetch

# ---------------------------------------------------------------------------
# Config and secrets
# ---------------------------------------------------------------------------
DEVICE = "cuda"
FEATURE_DIM = 1408

HF_TOKEN = os.environ.get("HF_TOKEN")
ENCODER_REPO = os.environ.get("ENCODER_REPO", "")
PROBE_REPO = os.environ.get("PROBE_REPO", ENCODER_REPO)

# SaverAPI rotator config. The client itself lives in saverapi_client.py.
SAVER_API_KEY_COOLDOWN_SEC = int(os.environ.get("SAVER_API_KEY_COOLDOWN_SEC", "3600"))
SAVER_API_MAX_RETRIES_PER_REQUEST = int(
    os.environ.get("SAVER_API_MAX_RETRIES_PER_REQUEST", "5")
)
SAVER_API_MAX_FILESIZE_MB = int(os.environ.get("SAVER_API_MAX_FILESIZE_MB", "100"))
SAVER_API_STARTUP_PROBE_URL = os.environ.get("SAVER_API_STARTUP_PROBE_URL", "").strip()

# ---------------------------------------------------------------------------
# Model loading
# ---------------------------------------------------------------------------
print("=" * 50)
print("Loading V-JEPA 2.1 encoder architecture via torch.hub...")
encoder, _ = torch.hub.load(
    "facebookresearch/vjepa2",
    "vjepa2_1_vit_giant_384",
    pretrained=False,
    trust_repo=True,
    verbose=False,
)

print(f"Downloading V-JEPA 2.1 weights from {ENCODER_REPO} ...")
encoder_weights_path = hf_hub_download(
    repo_id=ENCODER_REPO,
    filename="vjepa2_1_vitg_384.pt",
    token=HF_TOKEN,
)
ckpt = torch.load(encoder_weights_path, map_location="cpu", weights_only=True)
ckpt = ckpt.get("ema_encoder", ckpt.get("encoder", ckpt))
ckpt = {k.replace("module.", "").replace("backbone.", ""): v for k, v in ckpt.items()}
encoder.load_state_dict(ckpt, strict=False)
del ckpt
encoder = encoder.to(DEVICE).to(torch.bfloat16)
encoder.eval()
print("Encoder ready.")

print("Loading AttentiveClassifier probe...")
probe_path = hf_hub_download(
    repo_id=PROBE_REPO,
    filename="attentive_probe_optimized.pt",
    token=HF_TOKEN,
)
probe_state = torch.load(probe_path, map_location="cpu")
if "probe_state_dict" in probe_state:
    probe_state = probe_state["probe_state_dict"]
probe = AttentiveClassifier(embed_dim=FEATURE_DIM)
probe.load_state_dict(probe_state)
probe = probe.to(DEVICE)
probe.eval()
print("Probe ready.")
print("=" * 50)


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------
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


def remove_video_files(video_path: str) -> None:
    for file_path in glob.glob(video_path + "*") + [video_path]:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass


# ---------------------------------------------------------------------------
# SaverAPI key rotator
# ---------------------------------------------------------------------------
class KeyRotator:
    """Sticky-failover pool of SaverAPI keys.

    Reads keys from SAVER_API_KEY_1..SAVER_API_KEY_10. On any error, the
    failing key is marked dead for `cooldown_sec` seconds. State is in-memory
    only and resets on Space restart.
    """

    KEY_ENV_NAMES = [f"SAVER_API_KEY_{index}" for index in range(1, 11)]

    def __init__(self, cooldown_sec: int):
        self.keys = [os.environ.get(name, "").strip() for name in self.KEY_ENV_NAMES]
        self.keys = [key for key in self.keys if key]
        self.cooldown_sec = cooldown_sec
        self._dead_until: dict = {}
        self._lock = threading.Lock()
        self._cursor = 0

    def get_key(self) -> str | None:
        with self._lock:
            if not self.keys:
                return None

            key_count = len(self.keys)
            for offset in range(key_count):
                index = (self._cursor + offset) % key_count
                key = self.keys[index]
                if self._dead_until.get(key, 0) <= time.time():
                    return key

            return None

    def mark_dead(self, key: str) -> None:
        with self._lock:
            self._dead_until[key] = time.time() + self.cooldown_sec
            try:
                self._cursor = (self.keys.index(key) + 1) % len(self.keys)
            except (ValueError, ZeroDivisionError):
                pass

    def status(self) -> dict:
        with self._lock:
            now = time.time()
            return {
                "configured": len(self.keys),
                "live": sum(
                    1 for key in self.keys if self._dead_until.get(key, 0) <= now
                ),
                "dead": [
                    self.mask(key)
                    for key, timestamp in self._dead_until.items()
                    if timestamp > now
                ],
                "cursor_index": self._cursor,
            }

    @staticmethod
    def mask(key: str) -> str:
        if len(key) <= 10:
            return "***"
        return f"{key[:6]}***{key[-4:]}"


key_rotator = KeyRotator(cooldown_sec=SAVER_API_KEY_COOLDOWN_SEC)
print(f"[SaverAPI] Rotator initialised with {len(key_rotator.keys)} key(s).")


def _saverapi_fetch_one(url: str, key: str) -> tuple[bool, str]:
    """Normalise saverapi_fetch return to (ok, file_or_error)."""
    try:
        return saverapi_fetch(url, key, max_filesize_mb=SAVER_API_MAX_FILESIZE_MB)
    except Exception as exc:
        return False, f"key-level:exception: {type(exc).__name__}: {exc}"


def download_video(url: str) -> tuple[bool, str]:
    """Tries configured SaverAPI keys in sequence."""
    if not url.lower().startswith(("http://", "https://")):
        return False, "Unsupported URL scheme. Use http:// or https://"

    last_err = ""
    for attempt in range(SAVER_API_MAX_RETRIES_PER_REQUEST):
        key = key_rotator.get_key()
        if key is None:
            return False, "SaverAPI key pool exhausted; try again later."

        ok, payload = _saverapi_fetch_one(url, key)
        if ok:
            return True, payload

        last_err = payload
        if last_err.startswith("key-level:"):
            key_rotator.mark_dead(key)
            print(
                f"[SaverAPI] key {KeyRotator.mask(key)} failed "
                f"(attempt {attempt + 1}/{SAVER_API_MAX_RETRIES_PER_REQUEST}): "
                f"{last_err[:200]}"
            )
            continue

        return False, last_err

    return (
        False,
        f"SaverAPI: all {SAVER_API_MAX_RETRIES_PER_REQUEST} retries failed. "
        f"Last: {last_err[:200]}",
    )


def _startup_probe():
    """Best-effort probe of each configured key at Space boot."""
    if os.environ.get("SKIP_STARTUP_PROBE", "").lower() in ("1", "true", "yes"):
        print("[SaverAPI] Startup probe skipped (SKIP_STARTUP_PROBE=1).")
        return
    if not SAVER_API_STARTUP_PROBE_URL:
        print("[SaverAPI] No SAVER_API_STARTUP_PROBE_URL set; skipping startup probe.")
        return
    if not key_rotator.keys:
        print("[SaverAPI] No keys configured; skipping startup probe.")
        return

    print(
        f"[SaverAPI] Probing {len(key_rotator.keys)} key(s) "
        f"with {SAVER_API_STARTUP_PROBE_URL} ..."
    )
    for key in key_rotator.keys:
        ok, payload = _saverapi_fetch_one(SAVER_API_STARTUP_PROBE_URL, key)
        if ok:
            remove_video_files(payload)
            print(f"[SaverAPI]   key {KeyRotator.mask(key)}: OK")
            continue

        if payload.startswith("key-level:"):
            key_rotator.mark_dead(key)
            print(f"[SaverAPI]   key {KeyRotator.mask(key)}: DEAD ({payload[:100]})")
        else:
            print(
                f"[SaverAPI]   key {KeyRotator.mask(key)}: "
                f"probe-URL error ({payload[:100]})"
            )


# ---------------------------------------------------------------------------
# GPU inference
# ---------------------------------------------------------------------------
@spaces.GPU(duration=120)
def encode_and_classify(windows: list) -> list:
    gpu_start_time = time.time()
    print("\n[TIMING] --- GPU Allocated & Inference Started ---")

    if not windows:
        return []

    vram_bytes = torch.cuda.get_device_properties(DEVICE).total_memory
    vram_gb = vram_bytes / (1024**3)
    dynamic_batch_size = max(3, int(vram_gb / 3))

    all_clips = []
    window_clip_counts = []

    for window in windows:
        all_clips.extend(window["clips"])
        window_clip_counts.append(len(window["clips"]))

    global_batch = torch.stack(all_clips).to(DEVICE)
    all_feats = []

    with torch.no_grad():
        with torch.amp.autocast("cuda", dtype=torch.bfloat16):
            for index in range(0, global_batch.shape[0], dynamic_batch_size):
                chunk = global_batch[index : index + dynamic_batch_size]
                feats = encoder(chunk)
                all_feats.append(feats)

    all_feats = torch.cat(all_feats, dim=0)

    scores = []
    current_idx = 0

    for index, window in enumerate(windows):
        count = window_clip_counts[index]
        window_feats = all_feats[current_idx : current_idx + count]
        current_idx += count

        video_feats = window_feats.view(1, -1, FEATURE_DIM)

        with torch.no_grad():
            with torch.amp.autocast("cuda", dtype=torch.bfloat16):
                logit, _ = probe(video_feats)
                prob = torch.sigmoid(logit).item()

        scores.append(
            {
                "prob": prob,
                "start_sec": window["start_sec"],
                "end_sec": window["end_sec"],
            }
        )

    gpu_end_time = time.time()
    print(f"[TIMING] GPU execution completed in {gpu_end_time - gpu_start_time:.2f}s")
    return scores


# ---------------------------------------------------------------------------
# Gradio predict
# ---------------------------------------------------------------------------
def predict(
    url: str,
    uploaded_video: str,
    current_state: dict,
) -> tuple[str, str, str, dict]:
    global_start_time = time.time()
    print(f"\n{'=' * 30}\n[TIMING] Request Received.")

    url = (url or "").strip()

    if current_state and "video_path" in current_state:
        remove_video_files(current_state["video_path"])

    file_start_time = time.time()
    if uploaded_video:
        tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
        shutil.copy(uploaded_video, tmp.name)
        video_path = tmp.name
    elif url:
        ok, path_or_err = download_video(url)
        if not ok:
            return f"Download failed: {path_or_err}", "", "", {}
        video_path = path_or_err
    else:
        return "Please enter a URL or upload a video.", "", "", {}

    file_ready_time = time.time()
    print(
        "[TIMING] File Acquisition (Download/Copy) took: "
        f"{file_ready_time - file_start_time:.2f}s"
    )

    try:
        windows, total_frames, fps, duration_sec = get_video_windows(video_path)
    except Exception as exc:
        remove_video_files(video_path)
        return f"Video decode failed: {exc}", "", "", {}

    cpu_decode_time = time.time()
    print(f"[TIMING] CPU Video Decoding took: {cpu_decode_time - file_ready_time:.2f}s")

    print("[TIMING] Requesting GPU Hardware from ZeroGPU Queue...")
    queue_start_time = time.time()
    scores = encode_and_classify(windows)
    queue_and_gpu_time = time.time()

    print(
        "[TIMING] Total time spent requesting queue + GPU execution: "
        f"{queue_and_gpu_time - queue_start_time:.2f}s"
    )

    if not scores:
        remove_video_files(video_path)
        return "No windows processed.", "", "", {}

    aggregation = aggregate_window_vote_probability(scores)
    final_prob = float(aggregation["final_probability"])
    peak_prob = float(aggregation["peak_probability"])
    label = "AI-GENERATED (FAKE)" if final_prob > 0.5 else "REAL"
    elapsed_time = time.time() - global_start_time
    confidence = f"{final_prob * 100:.1f}%"

    lines = [
        f"Processing Time: {elapsed_time:.1f}s",
        f"Duration: {duration_sec:.1f}s  |  Frames: {total_frames}  |  Windows: {len(scores)}",
        (
            f"Aggregation: mean={float(aggregation['mean_probability']) * 100:.1f}%  |  "
            f"fake votes={int(aggregation['fake_vote_count'])}/{len(scores)}  |  "
            f"peak={peak_prob * 100:.1f}%\n"
        ),
    ]

    for score in scores:
        flag = "  <- strongest window" if score["prob"] == peak_prob else ""
        lines.append(
            f"  [{score['start_sec']:.1f}s - {score['end_sec']:.1f}s]  ->  "
            f"{score['prob'] * 100:.1f}% fake{flag}"
        )

    remove_video_files(video_path)

    print(f"[TIMING] Total Blocking Time Before UI Return: {elapsed_time:.2f}s")
    return label, confidence, "\n".join(lines), {}


# ---------------------------------------------------------------------------
# Gradio UI
# ---------------------------------------------------------------------------
with gr.Blocks(title="Deepfake Detector") as demo:
    session_state = gr.State(value={})

    gr.Markdown(
        """
        ## Deepfake Video Detector
        Paste a public Instagram, TikTok, or direct `.mp4` URL, **OR** upload a video directly.
        Uses **V-JEPA 2.1 ViT-Giant** + **AttentiveClassifier** probe.
        """
    )

    with gr.Row():
        url_box = gr.Textbox(
            label="Video URL",
            placeholder="https://www.instagram.com/reels/...",
            autofocus=True,
            scale=1,
        )
        upload_box = gr.Video(
            label="Or Upload Video directly",
            sources=["upload"],
            scale=1,
        )

    run_btn = gr.Button("Analyze", variant="primary")

    with gr.Row():
        label_out = gr.Textbox(label="Prediction", scale=2)
        conf_out = gr.Textbox(label="AI-generated probability", scale=1)

    breakdown_out = gr.Textbox(
        label="Window Breakdown & Processing Time",
        lines=7,
        interactive=False,
    )

    run_btn.click(
        fn=predict,
        inputs=[url_box, upload_box, session_state],
        outputs=[label_out, conf_out, breakdown_out, session_state],
    )

    url_box.submit(
        fn=predict,
        inputs=[url_box, upload_box, session_state],
        outputs=[label_out, conf_out, breakdown_out, session_state],
    )


_startup_probe()

demo.launch()
