# VigilVid API Contract

## Architecture

The mobile app calls the FastAPI proxy. The mobile app must not call Hugging Face directly.

```text
Expo app
-> FastAPI proxy
-> Hugging Face Gradio Space
-> FastAPI normalized JSON
-> Expo app
```

The current experimental Hugging Face Space is:

- Space: `farouk04/test_scanly`
- Space ID: `farouk04/test_scanly`
- Gradio API name: `/predict`
- Current inputs: URL, uploaded video, state
- Current outputs: prediction string, confidence string, window breakdown string
- The Hugging Face Space can handle extracting video from submitted links for
  legacy URL-backed detections.
- The preferred app flow is backend URL preview: FastAPI downloads/resolves the
  video, prepares metadata and thumbnail strips, then sends a local video
  segment to Hugging Face as an uploaded file.
- If the Space requires ZeroGPU or Hugging Face Pro access, configure that token only in the FastAPI backend environment.

The proxy is responsible for normalizing this into structured JSON.

Runtime mode:

- `DETECTION_BACKEND_MODE=auto` uses Hugging Face when `HUGGING_FACE_TOKEN` is set, otherwise mock mode.
- `DETECTION_BACKEND_MODE=hf` forces Hugging Face and fails if server-side token/config is missing.
- `DETECTION_BACKEND_MODE=mock` avoids Hugging Face calls for UI testing.

Token rules:

- The current detection flow needs only the server-side Hugging Face access required to call the configured Space.
- Hugging Face Dataset write credentials are not used for user-submitted detection videos.
- No Hugging Face token belongs in Expo client code.

## Core Types

```ts
type DetectionStatus = "queued" | "processing" | "completed" | "failed";

type DetectionLabel = "real" | "partially_real" | "partially_fake" | "fake";

type DetectionWindow = {
  startSec: number;
  endSec: number;
  fakeProbability: number;
};

type DetectionResult = {
  detectionId: string;
  status: "completed";
  label: DetectionLabel;
  aiProbability: number;
  confidencePercent: number;
  processingTimeSec: number;
  videoDurationSec: number;
  thumbnailStripUrl?: string | null;
  windows: DetectionWindow[];
  explanation: string;
  sourceType: "url" | "upload" | "share";
};

type VideoPreview = {
  previewId: string;
  sourceType: "url" | "upload" | "share";
  originalUrl: string;
  durationMs: number;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  contentType: string;
  thumbnailStripUrl: string | null;
  requiresTrim: boolean;
  maxSegmentDurationMs: number;
  canAnalyze: boolean;
  issues: string[];
};
```

## POST `/api/video-previews`

Downloads/resolves a URL-backed video on the backend and returns preview
metadata. This endpoint keeps downloader API keys server-side only.

Request:

```json
{
  "url": "https://example.com/video.mp4",
  "sourceType": "url"
}
```

Response:

```json
{
  "previewId": "src_abc123",
  "sourceType": "url",
  "originalUrl": "https://example.com/video.mp4",
  "durationMs": 185000,
  "fileSizeBytes": 42000000,
  "width": 1080,
  "height": 1920,
  "contentType": "video/mp4",
  "thumbnailStripUrl": "https://api.example.com/api/video-previews/src_abc123/thumbnail-strip.jpg",
  "requiresTrim": true,
  "maxSegmentDurationMs": 120000,
  "canAnalyze": true,
  "issues": [
    "Choose a segment that is 2 minutes or shorter before analysis."
  ]
}
```

Rules:

- Supports direct video URLs first, then the configured server-side downloader API.
- Uses `SAVER_API_KEY` on the backend only. The Expo app must never receive this key.
- Normalizes submitted social/share URLs before downloader use. For example,
  Instagram `igsh`, common `utm_*`, and similar tracking query parameters are
  removed while signed direct-video parameters are preserved.
- Requires backend FFmpeg support for metadata, thumbnails, and trimming. The
  backend can use packaged FFmpeg when system tools are unavailable.
- URL source videos may be longer than 2 minutes for preview, but analysis must use a selected segment of 2 minutes or less.
- The selected segment must also stay within the 100 MB analysis limit.
- Hosted previews default to a 150 MB source download limit
  (`VIDEO_PREVIEW_MAX_DOWNLOAD_MB`) to keep 512 MB Render instances stable.
- Raw downloaded URL videos are temporary backend files and must not be stored unless separate research retention is enabled later.

## GET `/api/video-previews/{previewId}/video.mp4`

Returns the temporary backend preview video file for preview and result-window
playback while the preview cache is still alive.

Rules:

- Requires a valid unexpired `previewId`.
- Exposes only the temporary downloaded/uploaded preview file, not downloader
  credentials or Hugging Face credentials.
- Intended for in-app preview playback, including tapping result windows for
  URL-backed detections.
- May return `404` after the preview cache expires. The user must create a new
  preview in that case.

## GET `/api/video-previews/{previewId}/window-clip.mp4`

Returns an exact temporary MP4 clip for one analyzed model window.

Query:

```text
startSec=32.0
endSec=38.4
```

Rules:

- Requires a valid unexpired `previewId`.
- `startSec` and `endSec` are source-video seconds, so the app adds the selected
  trim start before requesting a clip for a result window.
- The backend generates the clip on demand and caches it until the preview
  expires.
- The returned MP4 contains only the requested window, so native video controls
  cannot scrub outside that window.
- Requires `ffmpeg`.

## GET `/api/detections/{detectionId}/window-clip`

Returns readiness for one result-window MP4 and starts background preparation if
the clip is not ready yet. The mobile result popup calls this endpoint before
loading a window clip so the video player does not block on FFmpeg work.

Query:

```text
startSec=0.0
endSec=6.0
```

Response:

```json
{
  "status": "preparing",
  "videoUrl": null,
  "retryAfterMs": 1000
}
```

or:

```json
{
  "status": "ready",
  "videoUrl": "https://.../api/detections/det_abc/window-clip.mp4?startSec=0.000&endSec=6.000",
  "retryAfterMs": 1000
}
```

Rules:

- Requires a completed detection whose temporary playback segment has not
  expired.
- This endpoint returns quickly. It must not block while a video player waits
  for ffmpeg.
- The backend also prewarms a small number of high-signal result-window clips
  after detection completion. It must not queue every window and block user
  requested clips behind unnecessary work.
- Hosted deployments should use conservative worker counts:
  `DETECTION_WORKERS=1`, `PLAYBACK_WORKERS=1`, and
  `MAX_PREWARM_WINDOW_CLIPS=1` for 512 MB Render instances.

## GET `/api/detections/{detectionId}/window-clip.mp4`

Returns an exact temporary MP4 clip for one result window from the analyzed
segment used by the completed detection job. This is the preferred result-screen
preview endpoint because it does not rely only on the original URL/upload
preview cache.

Query:

```text
startSec=0.0
endSec=6.0
```

Rules:

- Requires a completed detection whose temporary playback segment has not
  expired.
- `startSec` and `endSec` are seconds within the analyzed segment returned in
  the detection result `windows` array.
- The backend serves an Android-safe H.264/yuv420p MP4 clip once it has been
  prepared. If the clip is still preparing, this endpoint returns HTTP 425.
- This is temporary processing data only. It must not be persisted to Supabase
  or Hugging Face.

## POST `/api/video-previews/upload`

Uploads a local/shared video file to the backend preview cache and returns
metadata plus a thumbnail strip before final analysis. This endpoint is used so
the upload trim selector can show real frames without exposing ffmpeg or
downloader credentials in the mobile app.

Multipart fields:

```text
file: video file
sourceType: upload | share
```

Response: same `VideoPreview` shape as `POST /api/video-previews`, with
`sourceType: "upload"` or `"share"` and an empty `originalUrl`.

Rules:

- The uploaded preview file is temporary backend processing data.
- Requires backend FFmpeg support for metadata and thumbnails. The backend can
  use packaged FFmpeg when system tools are unavailable.
- Final analysis should prefer `previewId` plus trim values so the app does not upload the file again when preview succeeds.
- If preview creation fails, the app may fall back to multipart detection without preview thumbnails.

## POST `/api/detections`

Creates a detection job.

Optional header:

```text
Idempotency-Key: stable-client-request-key
```

If the same key is submitted again while the backend still has the job in
memory, the API returns the original `detectionId` instead of starting another
model run.

Accepted input modes:

- JSON URL request.
- JSON shared URL/text request after Android share payload resolution.
- JSON preview request after `POST /api/video-previews` or `POST /api/video-previews/upload`.
- Multipart upload request.

JSON URL request:

```json
{
  "url": "https://example.com/video.mp4",
  "sourceType": "url"
}
```

JSON shared URL/text request:

```json
{
  "url": "https://example.com/video.mp4",
  "sourceType": "share"
}
```

JSON preview request:

```json
{
  "previewId": "src_abc123",
  "sourceType": "url",
  "trimStartSec": 30,
  "trimEndSec": 150
}
```

Multipart upload fields:

```text
file: video file
sourceType: upload | share
trimStartSec: optional number
trimEndSec: optional number
```

Response:

```json
{
  "detectionId": "det_123",
  "status": "queued"
}
```

Rules:

- Accept exactly one source: URL, `previewId`, or file.
- Prefer `previewId` for URL-backed and upload-preview app submissions so FastAPI can send the downloaded/trimmed video file to Hugging Face without resolving or uploading the source again.
- Treat shared URLs as URL-backed detection jobs while preserving `sourceType: "share"` in the result.
- Treat uploaded/shared video-file `trimStartSec` and `trimEndSec` as an optional backend trim request before calling Hugging Face.
- Enforce max 2 minutes and 100 MB on the actual analyzed video or selected segment.
- If authenticated, associate request with the user id and save a result summary to History.
- If unauthenticated, allow request but do not save account history.
- Raw user-submitted video must not be retained after processing.

## GET `/api/detections/{detectionId}`

Returns current detection state.

Queued/processing response:

```json
{
  "detectionId": "det_123",
  "status": "processing",
  "progressMessage": "Analyzing video windows"
}
```

Completed response:

```json
{
  "detectionId": "det_123",
  "status": "completed",
  "label": "fake",
  "aiProbability": 0.873,
  "confidencePercent": 87.3,
  "processingTimeSec": 18.4,
  "videoDurationSec": 42.1,
  "thumbnailStripUrl": "https://api.example.com/detections/det_123/thumbnail-strip.jpg",
  "windows": [
    { "startSec": 0, "endSec": 6.4, "fakeProbability": 0.61 },
    { "startSec": 6.4, "endSec": 12.8, "fakeProbability": 0.87 }
  ],
  "explanation": "The model found the strongest synthetic-media signal around 6.4s to 12.8s. This is a probability estimate, not proof.",
  "sourceType": "url"
}
```

Failed response:

```json
{
  "detectionId": "det_123",
  "status": "failed",
  "errorCode": "model_unavailable",
  "message": "The detector is temporarily unavailable. Try again later."
}
```

## POST `/api/detections/{detectionId}/feedback`

Records disputed result feedback.

Request:

```json
{
  "feedbackType": "false_positive",
  "comment": "This is my original video.",
  "allowResearchUse": true
}
```

Allowed `feedbackType` values:

- `false_positive`
- `false_negative`
- `unclear_result`
- `other`

Response:

```json
{
  "ok": true
}
```

Persistence:

- Feedback is kept in memory for local development.
- When backend Supabase persistence is enabled, feedback is also written through the server-side service role key.
- The Expo app must never write directly to the feedback table.

## GET `/api/history`

Returns saved detection summaries for the signed-in user.

Required header:

```text
Authorization: Bearer <supabase_user_access_token>
```

Response:

```json
{
  "items": [
    {
      "detectionId": "det_123",
      "sourceType": "upload",
      "label": "partially_fake",
      "aiProbability": 0.62,
      "confidencePercent": 62,
      "processingTimeSec": 11.4,
      "videoDurationSec": 38.2,
      "createdAt": "2026-07-06T12:00:00Z"
    }
  ]
}
```

Rules:

- Requires Supabase persistence to be enabled on the backend.
- Requires a valid Supabase Auth user token.
- Returns only rows owned by the authenticated user.
- Returns result metadata only. Raw video is not returned or stored in history.

## GET `/api/game/clips`

Returns a randomized, sanitized round of playable game clips.

Query:

```text
limit=12
```

Response:

```json
{
  "items": [
    {
      "id": "vv_f5f74888b04c5e06",
      "title": "Clip 1",
      "correctAnswer": "real",
      "difficulty": "Warmup",
      "durationSec": 12,
      "modelAnswer": "real",
      "modelAiProbability": 0.02,
      "reveal": "Ground truth: real. The model predicted real with 2% AI probability.",
      "signalNotes": [
        "Score is based on the dataset ground-truth label.",
        "The model prediction is shown only for comparison.",
        "Treat model output as a probability estimate, not proof."
      ],
      "videoUrl": "http://localhost:8000/api/game/clips/vv_f5f74888b04c5e06/video.mp4"
    }
  ]
}
```

Rules:

- The Expo app calls this backend endpoint, not Hugging Face directly.
- The backend first reads `app/game_samples.json` from the local unzipped export
  folder when `GAME_CLIP_LOCAL_EXPORT_ROOT` exists. This keeps local testing fast
  and avoids unnecessary Hugging Face downloads.
- If no local export is available, the backend reads the public game manifest
  from the configured Hugging Face Dataset.
- The backend hides source folders, dataset labels, and raw file paths from the
  app UI.
- The backend should return generic clip titles only.
- `difficulty` is internal round-balancing metadata from the export script. It
  is currently `Hard` when the model was wrong or correct-label confidence is
  below `0.65`, `Medium` when confidence is below `0.85`, otherwise `Warmup`.
  The app should not make this a primary user-facing label.
- If the backend cannot load remote game clips, the app may fall back to bundled clips.
- Optional setting: `HUGGING_FACE_GAME_DATASET_ID`, defaulting to `farouk04/vigilvid-research`.

## GET `/api/game/clips/{clipId}/video.mp4`

Streams a temporary cached MP4 for one game clip.

Rules:

- The backend serves the matching local export video when available. Otherwise,
  it downloads the public Hugging Face Dataset video on demand and caches it
  locally.
- Public game rounds default to `GAME_CLIP_VERIFIED_ONLY=true`, which filters
  to audited phone-safe clips listed in the backend.
- `GAME_CLIP_TRANSCODE_MODE=never` is the hosted default for game clips to avoid
  slow on-demand FFmpeg jobs. `always` and `auto` remain available for local
  experiments.
- Supported transcode modes: `always`/`true`, `auto`, and `never`/`false`.
- Optional settings:
  - `GAME_CLIP_LOCAL_EXPORT_ROOT`, defaulting to `../vigilvid_jepa21_test_export`
    from the backend folder.
  - `GAME_CLIP_FFMPEG_PATH` and `GAME_CLIP_FFPROBE_PATH` for explicit Windows
    executable paths when PATH resolution fails.
  - `GAME_CLIP_MAX_BYTES`, defaulting to `209715200`.
  - `GAME_CLIP_VERIFIED_ONLY`, defaulting to `true`.
  - `GAME_CLIP_FORCE_TRANSCODE`, defaulting to `false`. When false, verified
    clips bypass game transcoding even if an old transcode mode env var remains
    set.
  - `GAME_CLIP_BLOCKED_IDS`, comma-separated IDs excluded from game rounds.
  - `GAME_CLIP_ALLOWED_IDS`, comma-separated verified IDs. When set, only these
    IDs can appear in game rounds.
- Requires backend FFmpeg support when transcoding is needed. `ffprobe` is used
  for auto codec checks when available.
- The Expo app receives only the backend URL.
- Hugging Face tokens or dataset write credentials must never be exposed in Expo client code.
- The endpoint is for game playback only, not user detection history.

## GET `/api/game/clips/{clipId}/ready`

Returns readiness for one game clip and starts background preparation if the
clip is not ready yet. This endpoint is a backend helper. The current Expo app
plays the `videoUrl` returned by `GET /api/game/clips`; the backend prepares the
selected clips in the background when prewarming is enabled.

Response:

```json
{
  "status": "ready",
  "videoUrl": "https://.../api/game/clips/vv_x/video.mp4",
  "retryAfterMs": 1000
}
```

Rules:

- Returns quickly and does not stream the MP4 itself.
- Uses the same backend-only transcoding/cache rules as the game video endpoint.
- The current mobile app does not need to call this endpoint during normal game
  playback.
- `GAME_CLIP_PLAYBACK_VERSION` can be bumped when the Android-safe ffmpeg output
  recipe changes, forcing cached playable MP4 files to be regenerated.
- Keep `GAME_CLIP_READY_BEFORE_RESPONSE=0` on hosted demos so round metadata
  returns immediately instead of waiting on remote downloads or FFmpeg. Verified
  mode enforces this behavior for public game rounds.

## POST `/api/game/scores`

Persists a completed Solo Mode game score for the signed-in user.

Required header:

```text
Authorization: Bearer <supabase_user_access_token>
```

Request:

```json
{
  "mode": "solo",
  "score": 520,
  "correctCount": 5,
  "totalRounds": 6,
  "bestStreak": 3,
  "roundIds": [
    "market-interview-real",
    "podcast-host-ai"
  ]
}
```

Response:

```json
{
  "ok": true
}
```

Rules:

- Anonymous users can play Solo Mode and save local progress without calling this endpoint.
- Requires Supabase persistence to be enabled on the backend.
- Requires a valid Supabase Auth user token.
- The Expo app must never write directly to the game score table.
- The backend writes score rows through the server-side service role key only.
- The backend validates `correctCount <= totalRounds` and `bestStreak <= totalRounds`.
- Rows are stored in `public.game_sessions`.
- Live Supabase verification query:

```sql
select *
from public.game_sessions
order by created_at desc
limit 20;
```

## Supabase Persistence

Supabase is the metadata store for account history, feedback, game scores,
leaderboards, and aggregate insights. Core detection remains usable when
Supabase is not configured.

Initial persistence rules:

- Completed detection metadata is written automatically for signed-in users.
- Anonymous detection requests do not save account history.
- Raw video is not stored in Supabase.
- Feedback/report submissions are persisted as user-initiated reports when Supabase persistence is enabled.
- Solo game score rows are persisted in `public.game_sessions` when a signed-in
  user completes a Solo game and the backend has Supabase persistence enabled.
- `public.insights_game_summary` is a service-role-readable aggregate view over
  game sessions for future Insights work.
- Service-role credentials are backend-only.

## GET `/api/insights`

Returns aggregate anonymous stats for the public website Insights page.

Status: implemented for public website Insights use. The mobile Insights tab is
still deferred unless it explicitly returns to scope.

Response:

```json
{
  "source": "supabase",
  "updatedAt": "2026-07-16T00:00:00Z",
  "game": {
    "sessionCount": 2,
    "averageAccuracy": 0.625,
    "totalCorrect": 15,
    "totalRounds": 24,
    "bestScore": 1160,
    "bestStreak": 5,
    "recentSessions": [
      {
        "mode": "solo",
        "score": 1160,
        "correctCount": 9,
        "totalRounds": 12,
        "accuracy": 0.75,
        "bestStreak": 5,
        "createdAt": "2026-07-14T15:13:37.28035+00:00"
      }
    ],
    "daily": []
  },
  "detection": {
    "detectionCount": 0,
    "researchContributionCount": 0,
    "averageAiProbability": 0,
    "byLabel": {},
    "bySourceType": {},
    "daily": []
  },
  "privacy": {
    "aggregateOnly": true,
    "userIdentifiersReturned": false,
    "rawRoundMetadataReturned": false
  }
}
```

Rules:

- Does not require a user token.
- Reads Supabase only from the backend with server-side credentials.
- Returns aggregate and sanitized chart data only.
- Does not return `user_id`, row `id`, raw game metadata, round IDs, comments,
  or raw video references.
- If Supabase persistence is not configured, returns `source: "not_configured"`
  with empty aggregate values so detection and the public site can still run.

## Hugging Face Normalization

Current Gradio output must be parsed into structured fields:

- Window breakdown text -> `windows`, `processingTimeSec`, `videoDurationSec`.
- Window breakdown scores -> final `aiProbability`, `confidencePercent`, and
  `label`.
- Thumbnail strip generation -> `thumbnailStripUrl` when the backend has extracted frames. If unavailable, return `null` and let the client show a placeholder track.

If parsing fails, the proxy should return a controlled `failed` state rather than passing raw Gradio text to the app.

The FastAPI proxy must not use the Hugging Face Space's top-level confidence as
the final score when per-window scores are available. That value can behave like
a max-window score, which overstates short spikes. Instead, the proxy uses
window-vote aggregation:

```text
mean_window_probability = average(fakeProbability for all windows)
fake_vote_ratio = count(windows where fakeProbability >= 0.5) / window_count
final_ai_probability = (mean_window_probability + fake_vote_ratio) / 2
```

Example:

```text
windows = 20%, 30%, 30%
mean_window_probability = 26.7%
fake_vote_ratio = 0 / 3 = 0%
final_ai_probability = 13.3%
label = real
```

## Research Dataset And Evaluation

Status: planned backend integration. The current repo includes local planning
and scripts in `docs/dataset-evaluation.md` and `research/`.

Recommended storage split:

- Hugging Face Dataset stores approved research videos, manifests,
  predictions, evaluation metrics, and the dataset card.
- Supabase stores app metadata, user-owned history, feedback, game scores,
  aggregate insights, and optional research indexes.

Future backend-only settings:

```text
HUGGING_FACE_RESEARCH_DATASET_ID=farouk04/vigilvid-research
HUGGING_FACE_DATASET_TOKEN=server_only_dataset_write_token
RESEARCH_DATASET_ENABLED=false
```

The Expo app must never receive Hugging Face Dataset write credentials.

## Label Thresholds

Default v1 thresholds:

- `0 <= aiProbability <= 0.25`: `real`
- `0.25 < aiProbability <= 0.50`: `partially_real`
- `0.50 < aiProbability <= 0.75`: `partially_fake`
- `0.75 < aiProbability <= 1`: `fake`

These thresholds can be tuned after evaluation.

## Security Rules

- Keep Hugging Face token and dataset write credentials server-side only.
- Never put Hugging Face tokens, ZeroGPU credentials, or Hugging Face Pro account credentials in Expo client environment variables.
- Keep Supabase service-role key server-side only.
- Use Supabase anon key only in the client.
- Add basic rate limiting before public release.
- Log errors without storing raw user content.
