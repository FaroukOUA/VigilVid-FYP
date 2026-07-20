# Game Dataset On Hugging Face

## Decision

Use Hugging Face Dataset as the canonical store for game video samples and
model-prediction artifacts. Keep Supabase for user-owned game sessions,
scores, leaderboard rows, and future aggregate insights.

The current dataset is public, but the Expo app still calls FastAPI instead of
Hugging Face directly. The backend reads the public game manifest, selects a
randomized round, returns sanitized metadata, and proxies game video playback.
Bundled clips stay in the app as an offline/failure fallback.

If the dataset later becomes private, keep the same backend path and add a
server-only Hugging Face token. Do not expose dataset tokens in Expo.

## Current Status

As of July 16, 2026:

- `farouk04/vigilvid-research` is public.
- The local seed-42 export is unzipped at
  `C:\Dev\VigilVid-FYP\vigilvid_jepa21_test_export`.
- The export contains 999 MintVid test videos, app game sample JSON, prediction
  JSONL, evaluation metrics, and copied test videos.
- The local audit passed decode for all 999 videos.
- 199 videos need phone-safe transcoding for reliable Android playback.
- Backend game clip serving uses `GAME_CLIP_TRANSCODE_MODE=always` by default
  and prepares the first selected round clip before returning game metadata.
- Supabase `public.game_sessions` exists and can be queried successfully for
  signed-in Solo score persistence.

## Recommended Repos

### Public Research Dataset

Current dataset:

```text
farouk04/vigilvid-research
```

Purpose:

- full seed-42 MintVid test export
- manifest rows
- prediction JSONL
- evaluation metrics
- copied test videos
- dataset card

Public access lets the backend load game samples without a server token. Keep
user-uploaded or opt-in research videos out of this public dataset unless
consent allows it.

### Public Game Dataset

Create this only after you are confident the selected clips can be public:

```text
farouk04/vigilvid-game-samples
```

Purpose:

- small curated game clips only
- app-friendly `app/game_samples.json`
- model predictions used by Man vs Machine
- no private user-uploaded videos

## Dataset Layout

Use this structure for the private research dataset:

```text
README.md
data/
  manifest.jsonl
  test_split.json
  predictions/
    vjepa2.1-attentive-probe-mintvid-seed42.jsonl
  evaluations/
    vjepa2.1-attentive-probe-mintvid-seed42-metrics.json
app/
  game_samples.json
videos/
  test/
    real/
    fake/
```

For a public game-only dataset, use:

```text
README.md
app/
  game_samples.json
videos/
  game/
    vv_sample_id.mp4
```

Each game sample should include:

```json
{
  "id": "vv_f5f74888b04c5e06",
  "title": "Real test sample 01",
  "sourceLabel": "MintVid general",
  "correctAnswer": "real",
  "groundTruthLabel": "real",
  "difficulty": "Warmup",
  "videoPath": "videos/game/vv_f5f74888b04c5e06.mp4",
  "model": {
    "version": "vjepa2.1-attentive-probe-mintvid-seed42",
    "predictionLabel": "real",
    "aiProbability": 0.0,
    "confidencePercent": 0.0,
    "isCorrect": true,
    "clipCount": 2
  }
}
```

Because the dataset is public, the backend can construct:

```text
https://huggingface.co/datasets/farouk04/vigilvid-research/resolve/main/videos/test/real/vv_sample.mp4
```

If the dataset is private, the backend must fetch/proxy the file using a
server-only token. The Expo app should continue using only `/api/game/clips`.

## Upload Steps

1. Create a Hugging Face account.
2. Go to your profile, choose **New Dataset**, name it
   `vigilvid-research`, and set it to **Public** for the MintVid export.
3. Add the dataset card from
   `research/templates/hf-dataset-card-template.md` as `README.md`.
4. Unzip `vigilvid_jepa21_test_export.zip` outside the app folder.
5. Upload the unzipped folder, not the zip, so the dataset files are browsable.

Python upload example:

```python
from huggingface_hub import HfApi

repo_id = "farouk04/vigilvid-research"
folder_path = r"C:\Dev\VigilVid-FYP\vigilvid_jepa21_test_export"

api = HfApi()
api.create_repo(repo_id, repo_type="dataset", private=False, exist_ok=True)
api.upload_folder(
    folder_path=folder_path,
    repo_id=repo_id,
    repo_type="dataset",
)
```

The Hugging Face token used for upload belongs in your local terminal or backend
environment only. Never add it to `VigilVid/.env` as an `EXPO_PUBLIC_*` value.

## How This Links To The Game

Current implementation:

- `VigilVid/data/game.ts` contains the curated local sample list.
- `VigilVid/assets/game/mintvid_test/` contains the bundled game videos.
- FastAPI first tries `GAME_CLIP_LOCAL_EXPORT_ROOT` so local development can
  serve videos from the unzipped seed-42 export without downloading from
  Hugging Face.
- `backend/app/game_samples.py` reads
  `app/game_samples.json` from `farouk04/vigilvid-research`, chooses a randomized
  12-clip round, and returns generic clip metadata through `GET /api/game/clips`.
- Game video playback uses `GET /api/game/clips/{clipId}/video.mp4`, so Expo
  receives backend URLs only.
- In local development, those backend URLs can resolve to local export files.
  In hosted/demo deployment, they resolve through the Hugging Face Dataset.
- The UI hides source labels, folder names, and dataset file paths.
- Man vs Machine reads model predictions from the same game sample metadata.
- If backend loading fails, the app falls back to bundled clips in
  `VigilVid/assets/game/mintvid_test/`.
- Keep score submission in Supabase. Do not store score/user data in the
  Hugging Face Dataset.

Score persistence table:

```sql
select *
from public.game_sessions
order by created_at desc
limit 20;
```

## Local Playback Audit

Before relying on a new exported game dataset, audit the local videos with
FFmpeg:

```powershell
python research/scripts/audit_game_videos.py `
  --export-root vigilvid_jepa21_test_export `
  --output research/output/game-video-audit.json `
  --clean-manifest-output research/output/game_samples.playable.json
```

If Codex or a terminal session cannot find FFmpeg even though it is installed,
pass explicit paths:

```powershell
python research/scripts/audit_game_videos.py `
  --export-root vigilvid_jepa21_test_export `
  --output research/output/game-video-audit.json `
  --clean-manifest-output research/output/game_samples.playable.json `
  --ffmpeg "C:\Users\hp\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe" `
  --ffprobe "C:\Users\hp\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffprobe.exe"
```

The audit checks that each manifest video exists, can be probed, and can decode
sample frames. It also flags videos that are not phone-safe H.264/yuv420p and
therefore need backend transcoding.

Current local audit result on the seed-42 export:

```text
Audited: 999
Passed decode: 999
Failed decode: 0
Needs phone-safe transcode: 199
```

Because many clips require phone-safe transcoding, the backend game clip proxy
uses `GAME_CLIP_TRANSCODE_MODE=always` by default: it prepares phone-safe
H.264/yuv420p/AAC MP4 clips before streaming. The backend prepares the first
selected round clip before returning game metadata, then warms the remaining
selected clips in the background. During local development, set
`GAME_CLIP_LOCAL_EXPORT_ROOT` to the unzipped export folder so the backend does
not have to download each game clip from Hugging Face.

## Why Not Supabase For The Videos

Supabase is better for querying app data: users, scores, sessions, leaderboard,
history, and aggregate insights. Hugging Face Dataset is better for machine
learning artifacts: videos, labels, prediction files, evaluation metrics, and
dataset cards.
