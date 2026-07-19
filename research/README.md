# VigilVid Research Dataset Tools

This folder contains local tools for building a research/evaluation dataset
without committing raw videos to the app repository.

Recommended flow:

1. Build a manifest from your local dataset folders.
2. Run the model and export predictions.
3. Evaluate predictions against ground truth.
4. Upload approved artifacts to a private Hugging Face Dataset.
5. Keep Supabase for app metadata and optional indexed research summaries.

Core files:

- `schema/vigilvid-research-v1.schema.json`: JSON Schema for manifest rows.
- `scripts/build_manifest.py`: scans local real/fake video folders into JSONL.
- `scripts/evaluate_predictions.py`: computes metrics from manifest and model
  predictions.
- `scripts/export_jepa21_test_set.py`: re-runs the MintVid seed-42 VJEPA 2.1
  test split, records per-video predictions, copies the test videos into an
  export folder, and writes app-friendly game sample JSON.
- `templates/hf-dataset-card-template.md`: starter Hugging Face Dataset card.
- `templates/manifest.example.jsonl`: example manifest row.
- `templates/predictions.example.jsonl`: example prediction row.
- `sql/research_metadata_tables.sql`: optional Supabase metadata index SQL.

Local generated files should go under `research/output/`, which is ignored by
Git.

Lightning export example:

```bash
python research/scripts/export_jepa21_test_set.py \
  --kaggle-download \
  --output-dir /teamspace/studios/this_studio/vigilvid_jepa21_test_export \
  --encoder-checkpoint /teamspace/studios/this_studio/vjepa2_1_vitg_384.pt \
  --probe-checkpoint /teamspace/studios/this_studio/mintvid_output2/checkpoints/best_epoch.pt
```

`--kaggle-download` downloads these datasets to `/tmp/mintvid` when missing:

- `faroukelouazzani/general-minvid`
- `faroukelouazzani/face-minvid`
- `faroukelouazzani/fact-mintvid`

The export folder will contain:

- `data/manifest.jsonl`
- `data/predictions/vjepa2.1-attentive-probe-mintvid-seed42.jsonl`
- `data/evaluations/vjepa2.1-attentive-probe-mintvid-seed42-metrics.json`
- `data/test_split.json`
- `app/game_samples.json`
- `videos/test/real/` and `videos/test/fake/`

## Current Export Status

Current local export:

```text
C:\Dev\VigilVid-FYP\vigilvid_jepa21_test_export
```

Current public Hugging Face Dataset:

```text
farouk04/vigilvid-research
```

The completed seed-42 export produced 999 test clips and 0 failed samples. The
local playback audit output lives in `research/output/game-video-audit.json`;
it confirmed that all 999 clips decode locally and that 199 clips need
phone-safe transcoding for Android playback.

Run the local playback audit again with:

```powershell
python research/scripts/audit_game_videos.py `
  --export-root vigilvid_jepa21_test_export `
  --output research/output/game-video-audit.json `
  --clean-manifest-output research/output/game_samples.playable.json
```

Use these outputs as supporting evidence for the FYP report's dataset,
implementation, and testing chapters.
