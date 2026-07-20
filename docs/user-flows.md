# VigilVid User Flows

## Home Dashboard

1. User opens Home from the first bottom tab.
2. Home shows a compact dashboard with saved checks, game accuracy, high score,
   and a video check entry point.
   Scrolling remains enabled for smaller phones and keyboard states.
3. Home keeps the video check entry simple: paste a video link or choose a video
   from the phone.
4. Shared videos do not stop on Home. Share-to-Detect still routes directly to
   the Preview video screen through the dedicated share handler.

## Detection From URL

1. User opens Home.
2. User pastes video URL.
3. App validates that the URL uses `http` or `https`.
4. User taps Preview video.
5. App opens a Preview video screen.
6. Preview screen asks the backend to download/resolve the URL and return video metadata.
7. User sees duration, size, frame dimensions, and a thumbnail strip when available.
8. If the source is longer than 2 minutes, user chooses a maximum 2-minute segment with a draggable thumbnail trim selector before analysis.
9. User confirms analysis.
10. App routes to a dedicated Analysis screen.
11. Analysis screen creates the detection request through FastAPI using the preview id and selected segment.
12. Analysis screen shows progress state immediately.
13. App polls detection status until completed or failed.
14. Analysis screen reveals the Result state.

Current implementation note:

- URL preview/download is backend-first. The app does not expose the downloader API key.
- Direct video URLs are attempted first; social media URLs use the backend `SAVER_API_KEY` downloader path when configured.
- Backend `ffmpeg`/`ffprobe` is required for URL metadata, thumbnail strips, and selected segment trimming.

Failure states:

- Empty URL.
- Unsupported URL.
- Downloader/model failure.
- Missing backend media tools.
- Timeout or network failure.

## Detection From Upload

1. User opens Home.
2. User chooses video from device.
3. App validates format, size, and duration when metadata is available.
4. Max analyzed segment is 2 minutes and 100 MB.
5. App opens a preparation screen with selected video preview and metadata.
6. App uploads the file to the backend preview cache to read reliable metadata and generate a thumbnail strip when available.
7. If duration metadata is available, the user can choose a maximum 2-minute segment with the draggable trim selector before analysis.
8. User taps Analyze.
9. If upload preview succeeded, Analysis uses the preview id and selected trim start/end values instead of uploading the same file again.
10. If upload preview failed, App falls back to multipart upload from the dedicated Analysis screen with selected trim start/end values when needed.
11. App shows upload/progress state immediately.
12. Analysis screen reveals the Result state on completion.

Current implementation note:

- Local video selection, preview, metadata, and limit checks are implemented.
- Backend multipart upload is implemented.
- URL-backed segment selection is implemented after backend preview.
- Local upload segment selection uses backend preview metadata and thumbnail strips when preview succeeds. The backend trims uploaded files before model analysis when trim values are provided.

Failure states:

- Unsupported format.
- File larger than 100 MB.
- Missing duration metadata for a clip that needs trimming.
- Upload failure.
- Backend/model failure.

## Android Share-to-Detect

1. User is in Instagram, TikTok, YouTube Shorts, gallery, browser, or another app.
2. User taps Share.
3. Android share sheet lists VigilVid when payload type is supported.
4. User selects VigilVid.
5. VigilVid opens through the share intent.
6. Expo Router native intent handler routes to a dedicated share handler screen.
7. Share handler resolves payload:
   - video file/content URI
   - URL/text
   - unsupported content
8. Shared URL/text payloads open the Preview video screen automatically and can proceed to analysis.
9. Shared video files open the Preview video screen with cached file metadata and can proceed to upload analysis.
10. User confirms video details and chooses a segment when duration details are available.
11. Detection proceeds through the dedicated Analysis screen.

Technical note:

- Android is first target.
- Incoming share behavior uses `expo-share-intent` and requires a custom dev build/EAS build.
- Instagram/TikTok/YouTube may share different payload types depending on app version and content.
- Current verified behavior on physical Android: shared URLs and supported shared video files open VigilVid and route into the Preview video screen.
- Future improvement: reduce manual steps from share intent while keeping video preview and trimming before analysis.

## Result Flow

1. Result screen receives completed detection payload.
2. Screen shows:
   - verdict
   - AI probability percentage
   - processing time
   - video duration
   - analysis time-window breakdown
   - plain-language explanation
3. User can:
   - share result card
   - tap any analysis window to preview that part of the video
   - report suspected fake content through `https://sebenarnya.my/salur/`
   - view saved history if signed in
   - start another scan

Explanation rule:

- v1 explanation must not claim artifact categories. It should say the model found stronger synthetic-media signals in specific windows and provide probability-based wording.

Current implementation note:

- The analysis-window timeline can render a placeholder strip when no video thumbnails are available.
- URL preview detections can return a real backend-generated thumbnail strip with a continuous probability overlay from green through amber to red.
- Local upload detections can return a backend-generated thumbnail strip when the upload is trimmed before analysis. Otherwise the result timeline may use the placeholder strip.
- Result windows are tappable. The popup uses the already prepared preview video
  or selected local video, seeks to the selected model window, and stops at the
  window end. This keeps Android playback immediate and avoids waiting for a
  separate backend mini-clip.

## Account Flow

1. User can use detection without account.
2. Account screen focuses on account status, sign-in, sign-out, privacy, and
   the signed-in email.
3. User is prompted to sign in only when using:
   - cloud history
   - future ranked leaderboard
   - persistent profile
4. Supabase Auth manages account/session.
5. Anonymous/local state remains usable without sign-in.

## History Flow

1. Signed-in user opens History.
2. App fetches detection history metadata from Supabase.
3. User sees previous analyses by date, source type, verdict, and probability.
4. User can open a past result summary.
5. Raw videos are not stored or shown in History.

## Game Flow: Solo Mode

1. User opens Game.
2. User chooses Solo Mode.
3. App presents a backend-randomized sequence of real/fake video examples.
4. User answers real or fake.
5. App gives immediate haptic feedback and colors the selected answer by whether it was correct.
6. A temporary encouraging popup appears for about 1.5 seconds, then fades out.
7. App tracks score, accuracy, streak, and high score.
8. If signed in, score can sync to Supabase.
9. Round-complete screen shows the current round summary and account save state
   without a separate local-progress section.

## Game Flow: Man Vs Machine

1. User starts Man vs Machine.
2. For each item, user answers real/fake.
3. App gives immediate haptic feedback and colors the selected answer by whether it was correct.
4. A temporary encouraging popup appears for about 1.5 seconds.
5. VigilVid reveals its pick in the top duel progress card with a short checking animation.
6. The duel progress track updates for both the user and VigilVid.
7. The screen keeps the area between the Real/Fake buttons and the next action clear.
8. Final screen shows user score, VigilVid score, and accuracy gap.

Current implementation note:

- Game modes call FastAPI for randomized public Hugging Face Dataset clips.
- The backend prepares the first selected game clip before returning the round
  and warms the remaining selected clips in the background. The app can fall
  back to bundled local clips only if remote game loading fails.
- Active mode screens use the app bar title only; they do not repeat the mode
  name inside the page.
- The game UI shows generic clip names only; it does not show source folders or whether a clip came from a real/fake dataset folder.
- Difficulty labels from the export are internal balancing metadata and should not be shown as primary user-facing UI.
- Model predictions come from the same evaluation export metadata.
- Solo scores are local and can sync for signed-in users when Supabase persistence is configured. Ranked/ELO persistence is a separate follow-up.

## Game Flow: Ranked ELO

Status: deferred for the current FYP demo scope.

1. Signed-in user starts ranked mode.
2. User plays an asynchronous challenge round.
3. App calculates result from accuracy and difficulty.
4. Backend updates ELO-style rating in Supabase.
5. Leaderboard shows global ranking.

No live matchmaking is required for v1.

## Education Hub Flow

1. User opens Education.
2. User sees short cards grouped by topic.
3. User opens a card for a concise explanation.
4. Cards may link to detection or game actions.

Content must stay short and scannable.

## Insights Flow

Status: mobile app Insights are deferred for the current FYP demo scope. The
public website has a separate aggregate Insights dashboard.

1. User opens Insights.
2. App loads aggregate anonymous stats.
3. User sees:
   - human accuracy trends
   - AI-vs-user game trends
   - common missed patterns

Insights must not expose personally identifiable information.

Current implementation note:

- Mobile Insights are intentionally deferred until enough aggregate rows exist
  from saved detection summaries, feedback, and game data.
- The public website `stats.html` page is labeled as Insights and shows only
  aggregate values or an honest empty/sample state.

## Public Website Flow

1. Visitor opens the VigilVid website.
2. Visitor reads a consumer-facing explanation of checking AI-generated
   social media videos, learning detection clues, and using the Real or Fake
   game.
3. Visitor can download the Android APK from the website header, hero, or
   download section.
4. Visitor can read the privacy summary.
5. Visitor can open the `Insights` page from the header or footer to see
   aggregate metrics and charts that do not expose user identifiers.

Current implementation note:

- The first web version is a static site in `web/`.
- The homepage is `web/index.html`.
- Aggregate Insights are separate in `web/stats.html`.
- In hosted use, public navigation should use `/` for the homepage and `/stats`
  for aggregate Insights instead of linking visitors to `index.html`.
- The stats page tries to load live aggregate JSON from FastAPI
  `GET /api/insights`.
- If the backend is unreachable, it falls back to an aggregate game-session
  snapshot from verified Supabase rows.
- The website download links point to the GitHub Release asset
  `VigilVid-v1.0.0.apk`.
- Public website copy should be written for visitors and evaluators, not as a
  deployment checklist for the developer.
- Public homepage copy should avoid technical terms such as Supabase, database
  rows, backend setup, and time-window jargon.

## Privacy Flow

1. User opens Privacy from Account or Education.
2. User can read what VigilVid keeps.
3. User sees that signed-in checks save result summaries automatically.
4. User sees that videos are not kept after checking.
5. User can request deletion/export behavior in future versions if required by policy.
