---
pretty_name: VigilVid Research Dataset
language:
  - en
license: other
task_categories:
  - video-classification
tags:
  - synthetic-media
  - deepfake-detection
  - vigilvid
  - mintvid
---

# VigilVid Research Dataset

## Dataset Summary

Private research dataset for evaluating VigilVid's video-only AI-generated /
deepfake detection workflow.

This dataset is intended for academic evaluation, model improvement, and FYP
reporting. It should remain private until consent, licensing, and public release
conditions are reviewed.

## Dataset Structure

```text
data/
  manifest.jsonl
  predictions/
  evaluations/
videos/
  train/
  validation/
  test/
  demo/
```

Each `manifest.jsonl` row follows `vigilvid-research-v1`.

Important fields:

- `sample_id`
- `split`
- `label`
- `video_sha256`
- `hf_video_path`
- `source_dataset`
- `license`
- `consent_scope`
- `ai_probability`
- `prediction_label`

## Labels

- `real`: authentic / not AI-generated ground truth
- `fake`: AI-generated / deepfake ground truth

## Evaluation

Report at minimum:

- accuracy
- fake precision
- fake recall
- fake F1
- real precision
- real recall
- balanced accuracy
- confusion matrix

## Privacy And Consent

Videos are included only when the source dataset license or user opt-in permits
research use.

Detection history is metadata only. Raw-video retention is separately controlled
by research consent.

## Known Limitations

- Binary real/fake labels only.
- No artifact-category classifier in v1.
- Model probabilities are estimates, not proof.
- Dataset composition may not represent all social platforms or manipulation
  methods.
