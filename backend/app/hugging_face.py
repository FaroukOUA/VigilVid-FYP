from __future__ import annotations

import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from gradio_client import Client, handle_file

DetectionLabel = Literal["real", "partially_real", "partially_fake", "fake"]


class DetectionRuntimeError(RuntimeError):
    def __init__(self, message: str, error_code: str = "model_unavailable") -> None:
        super().__init__(message)
        self.error_code = error_code


@dataclass(frozen=True)
class NormalizedDetectionResult:
    label: DetectionLabel
    ai_probability: float
    confidence_percent: float
    processing_time_sec: float
    video_duration_sec: float
    windows: list[dict[str, float]]
    explanation: str


def run_hugging_face_detection(
    *,
    url: str | None = None,
    uploaded_video_path: str | Path | None = None,
) -> NormalizedDetectionResult:
    if bool(url) == bool(uploaded_video_path):
        raise DetectionRuntimeError(
            "Choose one video or paste one video link.",
            "invalid_request",
        )

    token = get_required_env("HUGGING_FACE_TOKEN")
    space_id = os.getenv("HUGGING_FACE_SPACE_ID", "farouk04/test_scanly")
    api_name = os.getenv("HUGGING_FACE_GRADIO_API_NAME", "/predict")

    try:
        client = Client(space_id, token=token, verbose=False, download_files=False)
        started_at = time.perf_counter()
        raw_output = client.predict(
            url=url or "",
            uploaded_video=handle_file(uploaded_video_path)
            if uploaded_video_path is not None
            else None,
            api_name=api_name,
        )
    except Exception as exc:
        raise DetectionRuntimeError(
            "VigilVid could not check this video right now. Try again later.",
            "model_unavailable",
        ) from exc

    return normalize_gradio_output(raw_output, fallback_processing_time=time.perf_counter() - started_at)


def normalize_gradio_output(
    raw_output: Any,
    *,
    fallback_processing_time: float,
) -> NormalizedDetectionResult:
    _prediction_text, confidence_text, breakdown_text = unpack_gradio_output(raw_output)
    _raw_ai_probability = parse_probability(confidence_text)

    windows = parse_windows(breakdown_text)
    if not windows:
        raise DetectionRuntimeError(
            "VigilVid could not read the result for this video. Try again later.",
            "normalization_failed",
        )

    video_duration_sec = parse_duration_sec(breakdown_text) or windows[-1]["endSec"]
    processing_time_sec = parse_processing_time_sec(breakdown_text) or fallback_processing_time
    ai_probability = aggregate_window_vote_probability(windows)
    label = get_label(ai_probability)
    strongest_window = max(windows, key=lambda window: window["fakeProbability"])
    fake_vote_count = count_fake_window_votes(windows)

    return NormalizedDetectionResult(
        label=label,
        ai_probability=round(ai_probability, 3),
        confidence_percent=round(ai_probability * 100, 1),
        processing_time_sec=round(processing_time_sec, 1),
        video_duration_sec=round(video_duration_sec, 1),
        windows=windows,
        explanation=(
            f"{fake_vote_count} of {len(windows)} moments showed a stronger "
            "AI signal. The strongest signal was around "
            f"{strongest_window['startSec']}s to {strongest_window['endSec']}s. "
            "This result is an estimate, not proof."
        ),
    )


def get_required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise DetectionRuntimeError(
            "VigilVid is not ready to check videos right now.",
            "missing_backend_secret",
        )

    return value


def unpack_gradio_output(raw_output: Any) -> tuple[str, str, str]:
    if isinstance(raw_output, tuple | list) and len(raw_output) >= 3:
        return str(raw_output[0]), str(raw_output[1]), str(raw_output[2])

    raise DetectionRuntimeError(
        "VigilVid could not read the result for this video. Try again later.",
        "normalization_failed",
    )


def parse_probability(text: str) -> float | None:
    match = re.search(r"(\d+(?:\.\d+)?)(?P<percent>\s*%)?", text)
    if not match:
        return None

    return normalize_probability_value(
        float(match.group(1)),
        is_percent=bool(match.group("percent")),
    )


def parse_windows(text: str) -> list[dict[str, float]]:
    windows: list[dict[str, float]] = []
    pattern = re.compile(
        r"(?P<start>\d+(?:\.\d+)?)\s*s?\s*(?:-|to|–|—)\s*"
        r"(?P<end>\d+(?:\.\d+)?)\s*s?.{0,120}?"
        r"(?P<prob>\d+(?:\.\d+)?)(?P<percent>\s*%)?",
        re.IGNORECASE,
    )

    for match in pattern.finditer(text):
        start_sec = float(match.group("start"))
        end_sec = float(match.group("end"))
        fake_probability = normalize_probability_value(
            float(match.group("prob")),
            is_percent=bool(match.group("percent")),
        )

        if end_sec <= start_sec:
            continue

        windows.append(
            {
                "startSec": round(start_sec, 1),
                "endSec": round(end_sec, 1),
                "fakeProbability": round(clamp(fake_probability, 0, 1), 3),
            }
        )

    return windows


def normalize_probability_value(value: float, *, is_percent: bool) -> float:
    if is_percent or value > 1:
        value = value / 100

    return clamp(value, 0, 1)


def parse_duration_sec(text: str) -> float | None:
    patterns = [
        r"(?:video\s*)?duration[^0-9]*(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds|m|min|minutes)?",
        r"total[^0-9]*(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds|m|min|minutes)",
    ]

    return parse_time_value(text, patterns)


def parse_processing_time_sec(text: str) -> float | None:
    patterns = [
        r"processing\s*time[^0-9]*(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds|m|min|minutes)?",
        r"processed\s*in[^0-9]*(\d+(?:\.\d+)?)\s*(ms|s|sec|seconds|m|min|minutes)?",
    ]

    return parse_time_value(text, patterns)


def aggregate_window_vote_probability(windows: list[dict[str, float]]) -> float:
    """Blend average window score with majority voting to avoid max-score bias."""
    if not windows:
        return 0.0

    probabilities = [
        clamp(window["fakeProbability"], 0, 1)
        for window in windows
        if "fakeProbability" in window
    ]
    if not probabilities:
        return 0.0

    mean_probability = sum(probabilities) / len(probabilities)
    fake_vote_ratio = sum(
        1 for probability in probabilities if probability >= 0.5
    ) / len(probabilities)

    return clamp((mean_probability + fake_vote_ratio) / 2, 0, 1)


def count_fake_window_votes(windows: list[dict[str, float]]) -> int:
    return sum(
        1
        for window in windows
        if clamp(window.get("fakeProbability", 0), 0, 1) >= 0.5
    )


def parse_time_value(text: str, patterns: list[str]) -> float | None:
    normalized_text = text.lower()

    for pattern in patterns:
        match = re.search(pattern, normalized_text)
        if not match:
            continue

        value = float(match.group(1))
        unit = match.group(2) or "s"

        if unit == "ms":
            return value / 1000

        if unit in {"m", "min", "minutes"}:
            return value * 60

        return value

    return None


def get_label(ai_probability: float) -> DetectionLabel:
    if ai_probability <= 0.25:
        return "real"
    if ai_probability <= 0.5:
        return "partially_real"
    if ai_probability <= 0.75:
        return "partially_fake"
    return "fake"


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)
