# VigilVid Backend

FastAPI proxy for VigilVid. The Expo app must call this backend rather than calling Hugging Face directly.

Hugging Face tokens, ZeroGPU access, and Hugging Face Pro credentials belong only in the backend `.env`. Do not add them to Expo `EXPO_PUBLIC_*` variables.

Current hosted demo backend:

```text
https://vigilvid-api.onrender.com
```

This hosted backend is the API base URL used by the published Android APK.

URL preview, thumbnail strips, and backend segment trimming require `ffmpeg`
and `ffprobe` to be installed on the backend host. The app will show a clear
setup error if those tools are missing.

Game clips are also proxied through the backend. By default the backend
transcodes game clips to phone-safe H.264/AAC MP4 before serving them to Expo,
which avoids odd dataset encodings showing as unsupported or green video on
Android.

When the real Hugging Face call is enabled, put the token here:

```env
HUGGING_FACE_TOKEN=hf_your_token_here
HUGGING_FACE_SPACE_ID=farouk04/test_scanly
HUGGING_FACE_GRADIO_API_NAME=/predict
DETECTION_BACKEND_MODE=auto
```

Then run Uvicorn with the env file loaded:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file .env
```

`DETECTION_BACKEND_MODE=auto` uses Hugging Face when `HUGGING_FACE_TOKEN` is set and falls back to mock mode when it is not set. Use `DETECTION_BACKEND_MODE=mock` when testing UI without spending ZeroGPU quota.

For backend URL preview/downloader support, add one SaverAPI key server-side:

```env
SAVER_API_KEY=your_server_only_saverapi_key
SAVER_API_YOUTUBE_QUALITY=720
VIDEO_PREVIEW_MAX_DOWNLOAD_MB=250
```

`VIDEO_PREVIEW_MAX_DOWNLOAD_MB` controls the temporary source download cap.
The actual analyzed segment remains limited to 2 minutes and 100 MB.

For game clips, keep these backend-only settings:

```env
HUGGING_FACE_GAME_DATASET_ID=farouk04/vigilvid-research
GAME_CLIP_LOCAL_EXPORT_ROOT=../vigilvid_jepa21_test_export
GAME_CLIP_TRANSCODE_MODE=always
GAME_CLIP_FFMPEG_PATH=
GAME_CLIP_FFPROBE_PATH=
GAME_CLIP_MAX_BYTES=209715200
GAME_CLIP_PLAYBACK_VERSION=android-safe-v2
GAME_CLIP_READY_BEFORE_RESPONSE=1
GAME_CLIP_PREWARM_WORKERS=1
PLAYBACK_WORKERS=1
RESULT_PLAYBACK_TTL_SEC=2700
```

`GAME_CLIP_LOCAL_EXPORT_ROOT` lets local development serve clips from the
unzipped export folder instead of downloading every clip from Hugging Face.
`GAME_CLIP_TRANSCODE_MODE=always` is the safest Android setting and prepares
phone-safe H.264/yuv420p/AAC MP4 clips before streaming. If Uvicorn cannot find
FFmpeg on Windows, set `GAME_CLIP_FFMPEG_PATH` and `GAME_CLIP_FFPROBE_PATH` to
the absolute `.exe` paths. `GAME_CLIP_PLAYBACK_VERSION` forces playable game
clip cache regeneration when the ffmpeg output recipe changes.
`GAME_CLIP_READY_BEFORE_RESPONSE` controls how many selected clips are prepared
before the round response is returned.

## Local Setup

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

For physical Android testing, run the backend on all interfaces:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file .env
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok","service":"vigilvid-api"}
```

Current mock detection loop:

```bash
curl -X POST http://127.0.0.1:8000/api/detections ^
  -H "Content-Type: application/json" ^
  -d "{\"url\":\"https://example.com/video.mp4\",\"sourceType\":\"url\",\"researchOptIn\":false,\"saveToHistory\":false}"
```

Then poll:

```bash
curl http://127.0.0.1:8000/api/detections/det_your_id
```

For a physical Android device, run Uvicorn with `--host 0.0.0.0` and set the Expo app's `EXPO_PUBLIC_API_BASE_URL` to your computer's LAN IP.

Debug the live Gradio signature:

```bash
curl http://127.0.0.1:8000/api/hugging-face/view-api
```

## Optional Supabase Persistence

Supabase is optional during local development. Without these values, detection
and feedback still work with in-memory state.

Apply the SQL in `../supabase/migrations/202606290001_detection_persistence.sql`
and `../supabase/migrations/202607060001_game_score_persistence.sql` in the
Supabase SQL editor, then add backend-only values to `backend/.env`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PERSISTENCE_ENABLED=true
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
```

Keep `SUPABASE_SERVICE_ROLE_KEY` out of the Expo app. Only the FastAPI backend
uses it.

Current game-score verification query:

```sql
select *
from public.game_sessions
order by created_at desc
limit 20;
```

If this query runs successfully, the game score table exists. Actual score rows
will appear only after a signed-in user completes Solo Mode while the backend is
running with Supabase persistence enabled.

### Public Insights Endpoint

`GET /api/insights` returns privacy-safe aggregate stats JSON for the public
website. It reads Supabase with the backend service role key only and does not
return `user_id`, row IDs, game round metadata, comments, or raw video
references.

If Supabase persistence is disabled or missing credentials, the endpoint returns
an empty `source: "not_configured"` response so the website can fall back to its
local verified snapshot.

The backend also serves the public website from `../web` at `/`, and the
separate Insights page at `/stats`, so local website testing can use one
server:

```powershell
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Then open `http://127.0.0.1:8000/` for the homepage,
`http://127.0.0.1:8000/stats` for public Insights, or
`http://127.0.0.1:8000/api/insights` for the raw aggregate JSON.

## Research Dataset Planning

The research/evaluation dataset plan lives in
`../docs/dataset-evaluation.md`. The current recommendation is hybrid:

- Hugging Face Dataset for raw/trimmed research videos, manifests,
  predictions, dataset card, and metrics.
- Supabase for app metadata, authenticated history, feedback, game scores,
  aggregate insights, and optional research sample indexes.

Reserved future backend-only env names:

```env
HUGGING_FACE_RESEARCH_DATASET_ID=farouk04/vigilvid-research
HUGGING_FACE_DATASET_TOKEN=hf_server_only_dataset_write_token
RESEARCH_DATASET_ENABLED=false
```

Do not put these in the Expo app.
