from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate VigilVid predictions against a research manifest.",
    )
    parser.add_argument("--manifest", required=True, help="Manifest JSONL path.")
    parser.add_argument("--predictions", required=True, help="Predictions JSONL path.")
    parser.add_argument("--output", required=True, help="Metrics JSON output path.")
    parser.add_argument(
        "--threshold",
        default=0.5,
        type=float,
        help="AI probability threshold for binary fake prediction.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest_rows = read_jsonl(Path(args.manifest))
    prediction_rows = read_jsonl(Path(args.predictions))
    predictions_by_id = {row["sample_id"]: row for row in prediction_rows}

    evaluated = []
    missing_predictions = []
    for sample in manifest_rows:
        sample_id = sample.get("sample_id")
        prediction = predictions_by_id.get(sample_id)
        if prediction is None:
            missing_predictions.append(sample_id)
            continue

        truth = label_to_binary(sample.get("label"))
        predicted = prediction_to_binary(prediction, threshold=args.threshold)
        probability = to_float(prediction.get("ai_probability"))
        evaluated.append(
            {
                "ai_probability": probability,
                "prediction": predicted,
                "processing_time_sec": to_float(
                    prediction.get("processing_time_sec"),
                ),
                "sample_id": sample_id,
                "truth": truth,
            }
        )

    metrics = build_metrics(evaluated, missing_predictions, args.threshold)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(metrics, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(f"Evaluated {metrics['evaluated_count']} samples")
    print(f"Wrote metrics to {output_path}")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows = []
    with path.open("r", encoding="utf-8") as input_file:
        for line_number, line in enumerate(input_file, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                row = json.loads(stripped)
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{path}:{line_number}: invalid JSON: {exc}") from exc
            if not isinstance(row, dict):
                raise SystemExit(f"{path}:{line_number}: row must be an object")
            rows.append(row)
    return rows


def label_to_binary(label: Any) -> int:
    if label == "fake":
        return 1
    if label == "real":
        return 0
    raise SystemExit(f"Unsupported ground-truth label: {label}")


def prediction_to_binary(prediction: dict[str, Any], *, threshold: float) -> int:
    probability = to_float(prediction.get("ai_probability"))
    if probability is not None:
        return 1 if probability >= threshold else 0

    label = prediction.get("prediction_label")
    if label in {"fake", "partially_fake"}:
        return 1
    if label in {"real", "partially_real"}:
        return 0

    raise SystemExit(
        f"Prediction for {prediction.get('sample_id')} has no usable label/probability",
    )


def build_metrics(
    rows: list[dict[str, Any]],
    missing_predictions: list[Any],
    threshold: float,
) -> dict[str, Any]:
    tp = sum(1 for row in rows if row["truth"] == 1 and row["prediction"] == 1)
    tn = sum(1 for row in rows if row["truth"] == 0 and row["prediction"] == 0)
    fp = sum(1 for row in rows if row["truth"] == 0 and row["prediction"] == 1)
    fn = sum(1 for row in rows if row["truth"] == 1 and row["prediction"] == 0)
    total = len(rows)

    fake_precision = safe_div(tp, tp + fp)
    fake_recall = safe_div(tp, tp + fn)
    real_precision = safe_div(tn, tn + fn)
    real_recall = safe_div(tn, tn + fp)

    probabilities = [
        row["ai_probability"]
        for row in rows
        if isinstance(row.get("ai_probability"), int | float)
    ]
    processing_times = [
        row["processing_time_sec"]
        for row in rows
        if isinstance(row.get("processing_time_sec"), int | float)
    ]
    false_positive_ids = [
        row["sample_id"]
        for row in rows
        if row["truth"] == 0 and row["prediction"] == 1
    ]
    false_negative_ids = [
        row["sample_id"]
        for row in rows
        if row["truth"] == 1 and row["prediction"] == 0
    ]

    return {
        "threshold": threshold,
        "evaluated_count": total,
        "missing_prediction_count": len(missing_predictions),
        "missing_prediction_sample_ids": missing_predictions[:100],
        "confusion_matrix": {
            "true_fake_pred_fake": tp,
            "true_fake_pred_real": fn,
            "true_real_pred_fake": fp,
            "true_real_pred_real": tn,
        },
        "accuracy": safe_div(tp + tn, total),
        "balanced_accuracy": mean(
            [
                fake_recall,
                real_recall,
            ],
        ),
        "fake_precision": fake_precision,
        "fake_recall": fake_recall,
        "fake_f1": f1(fake_precision, fake_recall),
        "real_precision": real_precision,
        "real_recall": real_recall,
        "real_f1": f1(real_precision, real_recall),
        "average_ai_probability": mean(probabilities) if probabilities else None,
        "average_processing_time_sec": (
            mean(processing_times) if processing_times else None
        ),
        "false_positive_sample_ids": false_positive_ids[:100],
        "false_negative_sample_ids": false_negative_ids[:100],
    }


def safe_div(numerator: int | float, denominator: int | float) -> float:
    if denominator == 0:
        return 0.0
    return round(float(numerator) / float(denominator), 5)


def f1(precision: float, recall: float) -> float:
    return safe_div(2 * precision * recall, precision + recall)


def to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    main()
