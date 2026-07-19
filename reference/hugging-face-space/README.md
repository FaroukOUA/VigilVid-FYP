# Hugging Face Space Reference Files

These files are complete replacement copies for the current
`farouk04/test_scanly` Hugging Face Space source.

Copy these files into the Space:

- `detector.py` -> replace the Space `detector.py`
- `inference_core.py` -> replace the Space `inference_core.py`

You do not need to copy `saverapi_client.py` for this scoring change.

## What Changed

1. Final prediction no longer uses only the maximum window score.
2. Final prediction now uses the same window-vote aggregation documented in
   `docs/api-contract.md`:

```text
mean_window_probability = average(window fake probabilities)
fake_vote_ratio = count(windows where probability >= 0.5) / window_count
final_probability = (mean_window_probability + fake_vote_ratio) / 2
```

3. The strongest window is still shown in the breakdown, but it is not the
   final score by itself.
4. The consent checkbox and research upload path were removed. The temporary
   video is deleted after processing.

## Quick Examples

```text
windows: 20%, 30%, 30%
mean: 26.7%
fake votes: 0/3
final: 13.3%

windows: 6%, 20%, 60%
mean: 28.7%
fake votes: 1/3
final: 31.0%
```

After copying the files, restart the Hugging Face Space. Then restart the local
FastAPI backend so the Expo app talks to the updated runtime.
