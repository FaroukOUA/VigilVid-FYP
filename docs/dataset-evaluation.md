# VigilVid Dataset And Evaluation Plan

## Decision

Use a hybrid research setup:

- Hugging Face Dataset: canonical research dataset, video files, dataset card,
  labels, and versioned evaluation manifests.
- Supabase: app metadata, authenticated history, feedback, game scores,
  aggregate insights, and optional indexed research metadata.

Do not use Supabase as the primary raw-video dataset store. It is useful for
querying metadata and user-owned rows, but Hugging Face is the better fit for
machine-learning dataset artifacts, dataset cards, private/public dataset
visibility, and later reuse in notebooks or model training.

## What Goes Where

### Hugging Face Dataset

Store:

- public MintVid evaluation videos when the source license allows redistribution
- raw or trimmed user-contributed research videos only when consent allows it
- stable dataset manifest rows
- ground-truth labels
- split names: `train`, `validation`, `test`, `demo`
- model prediction exports
- evaluation result JSON files
- dataset card / README

Current public MintVid evaluation dataset repo:

```text
farouk04/vigilvid-research
```

Future opt-in user-contributed videos should go to a separate private dataset
unless consent explicitly allows public release.

Current seed-42 export status:

- Dataset split: 3993 train clips and 999 test clips.
- Test export: `vigilvid_jepa21_test_export`.
- Hugging Face Dataset: `farouk04/vigilvid-research`.
- Model prediction export:
  `data/predictions/vjepa2.1-attentive-probe-mintvid-seed42.jsonl`.
- Metrics export:
  `data/evaluations/vjepa2.1-attentive-probe-mintvid-seed42-metrics.json`.
- App game manifest: `app/game_samples.json`.
- Copied test videos: `videos/test/real/` and `videos/test/fake/`.
- Playback audit: 999 decoded successfully, 0 decode failures, and 199 clips
  require phone-safe transcoding for Android playback.

Suggested layout:

```text
README.md
data/
  manifest.jsonl
  predictions/
    model-v1-test.jsonl
  evaluations/
    model-v1-test-metrics.json
videos/
  train/
    real/
    fake/
  validation/
    real/
    fake/
  test/
    real/
    fake/
  demo/
    real/
    fake/
```

Keep the repo private while labels, licensing, and consent are still being
checked.

### Supabase

Store:

- signed-in detection history metadata
- feedback reports
- game sessions and leaderboard rows
- aggregate insight rows
- optional research sample index pointing to Hugging Face paths

Do not store:

- Hugging Face tokens
- Hugging Face Dataset write tokens
- service-role keys in Expo
- raw video in detection history

## Record Shape

The canonical row shape is JSONL. One video sample equals one JSON object.

Required fields:

```json
{
  "schema_version": "vigilvid-research-v1",
  "sample_id": "vv_abc123",
  "split": "test",
  "label": "fake",
  "label_id": 1,
  "local_video_path": "C:/path/to/video.mp4",
  "hf_video_path": null,
  "video_sha256": "hex...",
  "file_size_bytes": 123456,
  "duration_sec": 12.3,
  "width": 1080,
  "height": 1920,
  "source_dataset": "MintVid",
  "source_path": "fake/example.mp4",
  "license": "research-only",
  "consent_scope": "owned_dataset",
  "mime_type": "video/mp4",
  "created_at": "2026-07-08T00:00:00+00:00",
  "model_version": null,
  "prediction_label": null,
  "ai_probability": null,
  "confidence_percent": null,
  "processing_time_sec": null,
  "detection_id": null,
  "windows": []
}
```

Label rules:

- `real`: authentic / not AI-generated ground truth
- `fake`: AI-generated / deepfake ground truth
- `label_id`: `0` for real, `1` for fake

Prediction rules:

- `ai_probability` is always `0..1`
- `confidence_percent` is always `0..100`
- `prediction_label` uses VigilVid's four result labels:
  - `real`
  - `partially_real`
  - `partially_fake`
  - `fake`

For binary evaluation, treat `partially_fake` and `fake` as fake predictions,
and `real` and `partially_real` as real predictions.

## Local Setup

From the project root:

```powershell
python research/scripts/build_manifest.py `
  --input-root "C:\Users\hp\OneDrive - Asia Pacific University of Technology And Innovation (APU)\YEAR #3\FYP\CODING\MintVid" `
  --output research/output/mintvid-manifest.jsonl `
  --source-dataset MintVid `
  --license "research-only" `
  --consent-scope owned_dataset
```

The script:

- scans video files recursively
- infers labels from folder names containing `real`, `fake`, `authentic`,
  `synthetic`, `deepfake`, or `ai`
- computes SHA-256 hashes for stable sample IDs
- uses `ffprobe` when available for duration and dimensions
- writes metadata only; it does not copy videos

For a faster draft manifest, add `--skip-probe`. This skips duration and
resolution metadata but still builds label/split/file rows.

After you run the model and export predictions:

```powershell
python research/scripts/evaluate_predictions.py `
  --manifest research/output/mintvid-manifest.jsonl `
  --predictions research/output/model-v1-predictions.jsonl `
  --output research/output/model-v1-test-metrics.json
```

## Prediction Export Shape

Predictions should be JSONL:

```json
{"sample_id":"vv_abc123","model_version":"hf-space-farouk04-test_scanly-2026-07","ai_probability":0.87,"confidence_percent":87.0,"prediction_label":"fake","processing_time_sec":8.2,"detection_id":"det_123","windows":[{"startSec":0,"endSec":6,"fakeProbability":0.87}]}
```

## Hugging Face Setup

1. Create a Hugging Face account if needed.
2. Create a public Dataset repo for the approved MintVid export, for example:
   `farouk04/vigilvid-research`.
3. Add `research/templates/hf-dataset-card-template.md` as the dataset
   `README.md`.
4. Upload `data/manifest.jsonl`, prediction JSONL, metrics JSON, and the
   allowed video files.
5. Keep only license-approved/public-source videos in this public dataset.
   Future user-contributed research videos should use a separate private
   dataset unless explicit public-release consent exists.

Recommended backend environment names for future upload integration:

```env
HUGGING_FACE_RESEARCH_DATASET_ID=farouk04/vigilvid-research
HUGGING_FACE_DATASET_TOKEN=hf_server_only_dataset_write_token
RESEARCH_DATASET_ENABLED=false
```

These are server-only values. Do not add them to Expo `EXPO_PUBLIC_*` env vars.

## Supabase Setup

The current app already stores detection history, windows, feedback, and game
scores. For research indexing, use the draft SQL in:

```text
research/sql/research_metadata_tables.sql
```

This SQL is intentionally outside `supabase/migrations` for now because the
Supabase CLI is not installed in the local environment. When ready:

1. Install or open Supabase CLI.
2. Run `supabase migration new research_metadata`.
3. Copy the draft SQL into the generated migration.
4. Apply it in your Supabase project SQL editor or migration workflow.
5. Keep RLS enabled and service-role-only writes unless a user-facing research
   dashboard is intentionally added.

## Evaluation Metrics For FYP

Minimum metrics to report:

- dataset size by label and split
- accuracy
- fake precision
- fake recall
- fake F1
- real precision
- real recall
- balanced accuracy
- confusion matrix

Useful extra metrics:

- average AI probability for real samples
- average AI probability for fake samples
- false positives and false negatives with sample IDs
- processing-time average

## Next Documentation And Evaluation Step

The core seed-42 export exists, so the next work is reporting and validation:

1. Cite dataset size, label distribution, split method, and seed number in the
   FYP report.
2. Cite the exported prediction JSONL and metrics JSON as evidence.
3. Include the confusion matrix and class-level precision/recall/F1 in Chapter 5.
4. Keep `research/output/game-video-audit.json` as evidence that the game videos
   decode locally.
5. Use Supabase only for user/app metadata such as history, feedback, and
   `game_sessions`; do not move the raw video dataset into Supabase.
6. If future users contribute videos, create a separate private Hugging Face
   Dataset unless the consent text explicitly allows public release.
