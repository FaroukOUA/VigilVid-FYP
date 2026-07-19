# VigilVid Roadmap

## Current Implementation Status

As of July 19, 2026:

- Phase 2 is functionally working: URL detection and local video upload both reach the result screen through the FastAPI proxy and Hugging Face runtime.
- Phase 3A is working on physical Android with a custom development build: Android Share-to-Detect can open VigilVid and route shared URLs or video files into the preview flow.
- Phase 4 foundation is working: result screen shows four-level verdicts, probability, duration, processing time, suspicious windows, share result, and report issue.
- Phase 5 account/history foundation is working: signed-in users can save and view detection history through optional Supabase persistence.
- Phase 7 Solo Mode foundation is working with backend-randomized public Hugging Face Dataset clips, bundled fallback clips, local progress tracking, and signed-in score persistence.
- Phase 7 Man vs Machine local flow is working with model predictions from the MintVid evaluation export.
- The Game tab calls FastAPI for randomized game clips; Expo does not fetch Hugging Face Dataset files directly.
- The backend prefers the local unzipped seed-42 export at `vigilvid_jepa21_test_export` when present, then falls back to the public Hugging Face Dataset `farouk04/vigilvid-research`.
- Game clip playback uses backend proxy URLs and `GAME_CLIP_TRANSCODE_MODE=auto` so phone-safe clips stream directly and risky encodings are transcoded to Android-playable MP4.
- The Game UI hides source folders/labels, uses Real/Fake answer buttons,
  temporary feedback popups, and compact duel progress for Man vs Machine.
- Supabase `game_sessions` exists in the live project. The verification query `select * from public.game_sessions order by created_at desc limit 20;` runs successfully.
- Current UI has received the final pre-APK polish pass for clearer copy,
  smoother layout, simplified Account/Home/Preview screens, the result gauge,
  History breakdown, and cleaner game feedback.
- Research dataset/evaluation planning has started in `docs/dataset-evaluation.md`; local manifest and metric scripts live under `research/`.
- The seed-42 MintVid export completed with 999 test clips. The local playback audit passed decode for all 999 clips and identified 199 clips that need phone-safe transcoding.
- The FastAPI backend is hosted at `https://vigilvid-api.onrender.com` and has
  been verified for health checks, detection, preview, game clips, and
  aggregate Insights.
- The Android preview APK is built, installable on a physical phone, and
  published through GitHub Releases as `VigilVid-v1.0.0.apk`.
- The static web interface exists in `web/` for consumer-facing project
  introduction, live Android APK download, privacy summary, Real or Fake demo,
  and a separate aggregate `Insights` page using `GET /api/insights` with a
  verified fallback snapshot.
- Expo Go is no longer sufficient because native modules are in use. Use `npx expo start --dev-client` with an installed development build.
- Current FYP demo scope prioritizes final testing evidence, screenshots, and
  report documentation. Ranked/ELO leaderboard and the mobile Insights tab are
  deferred unless explicitly brought back into scope.
- Next target is collecting screenshots, APK/website verification evidence,
  Supabase evidence, model metrics, and UAT/report material.

## Practical Vibe-Coding Workflow

Follow this loop for every feature:

1. Read `AGENTS.md` and the relevant doc.
2. Implement one feature or one integration only.
3. Read the diff.
4. Run the app/checks.
5. Verify the new feature.
6. Verify previous critical flows still work.
7. Commit the working feature.
8. If something breaks, make one targeted fix.

Do not ask for "the whole app" in one prompt. Do not mix unrelated features in one change.

## Phase 0: Source Of Truth

Goal: make future sessions consistent.

Deliverables:

- `AGENTS.md`
- `docs/requirements.md`
- `docs/user-flows.md`
- `docs/api-contract.md`
- `docs/design-system.md`
- `docs/roadmap.md`
- `docs/skills.md`

Done when:

- Future agents can understand scope, stack, API shape, design direction, and build order without re-reading the IR.

## Phase 1: Skills And Project Setup

Goal: prepare the implementation environment.

Tasks:

- Install approved core skills listed in `docs/skills.md`.
- Scaffold Expo app.
- Configure Expo Router.
- Configure TypeScript strict mode.
- Defer NativeWind and use plain React Native `StyleSheet` with shared theme tokens for initial UI.
- Add basic lint/typecheck scripts.
- Scaffold FastAPI backend proxy.
- Add `.env.example` for app and backend.

Done when:

- Expo app launches.
- FastAPI health check works.
- Lint/typecheck run.
- No secrets are committed.
- NativeWind deferral is documented so Phase 2 can focus on the detection loop.

## Phase 2: Minimal Detection Interface

Goal: prove the core FYP detection loop.

Tasks:

- Build Home with compact URL input and upload picker.
- Build FastAPI `POST /api/detections`.
- Call Hugging Face Gradio `/predict` through backend.
- Normalize output into structured JSON.
- Build simple polling using `GET /api/detections/{id}`.
- Show raw structured result in a basic test UI.

Done when:

- A valid URL can produce a structured result.
- A valid uploaded video can produce a structured result.
- Errors are controlled and readable.

## Phase 3: Android Share-to-Detect Spike

Goal: validate the highest-risk mobile feature early.

Tasks:

- Add `expo-share-intent` and a custom development build.
- Configure Android share intent for text/URL payloads first.
- Create Expo Router native intent handler.
- Create share handler screen.
- Test Android share sheet from real apps.
- Add shared video-file payload support after the upload preparation and trim step exists.

Done when:

- VigilVid appears in Android share sheet for at least one supported payload.
- Shared payload routes directly into the Preview video flow.
- Unsupported payloads show a useful message.

## Phase 4: Result Experience

Goal: make the detection output understandable.

Tasks:

- Build Result screen.
- Show probability, verdict, duration, processing time, and suspicious windows.
- Add shareable result card.
- Add feedback/report action.
- Add honest model-limit explanation.

Done when:

- User can understand the result without technical background.
- Result card can be shared.
- False positive/false negative report can be submitted.

## Phase 5: Account, History, Privacy

Goal: add persistence without blocking core detection.

Tasks:

- Phase 5A: add Supabase schema and backend persistence for signed-in detection history.
- Add Supabase Auth.
- Add automatic signed-in history.
- Add privacy copy.
- Ensure raw user-submitted videos are not retained.

Done when:

- Anonymous detection still works.
- Signed-in user can view automatically saved history.
- Privacy copy clearly explains that videos are not stored.

## Phase 6: Education Hub

Goal: deliver static literacy content.

Tasks:

- Add Education tab.
- Add short cards for deepfake spotting, synthetic media basics, Malaysian law, social risk, and how VigilVid works.
- Keep content concise.

Done when:

- Education Hub is usable without account.
- No page reads like a long article.

## Phase 7: Game

Goal: build gamified literacy and data collection.

Tasks:

- Build Solo Mode first.
- Track score, streak, accuracy, and high score.
- Add signed-in score persistence.
- Add Man vs Machine.
- Add asynchronous ELO-style ranked leaderboard if it returns to scope.

Done when:

- Solo Mode works locally.
- Signed-in user scores persist.
- Man vs Machine can compare the user answer against the model prediction.
- Ranked leaderboard updates for authenticated ranked games only if ranked mode
  returns to scope.

## Phase 8: Insights

Goal: show aggregate Insights when enough real data exists.

Status: public website Insights are implemented as an aggregate dashboard.
The mobile app Insights tab remains deferred.

Tasks:

- Use aggregate Supabase metadata from signed-in saved checks, feedback, and game data.
- Add mobile Insights tab if it returns to scope.
- Add aggregate stats endpoint.
- Show saved-check volume, human accuracy, model-vs-user trends, and common missed patterns.
- Ensure no personal identifiers are exposed.

Done when:

- Public Insights are visible to website visitors.
- Mobile Insights are visible to users only if the mobile tab returns to scope.
- Stats are aggregate and privacy-safe.

## Phase 9: Public Web Interface

Goal: provide a public access point for the project and Android APK download.

Tasks:

- Build a website matching the mobile trust/safety design system.
- Explain what VigilVid does for normal short-video users without requiring app
  installation.
- Add Android download area linked to the GitHub Release APK.
- Add privacy policy summary.
- Move aggregate, privacy-safe stats to a separate `Insights` page.
- Load live stats data through FastAPI `GET /api/insights`, with a local
  verified snapshot fallback for plain static preview.
- Keep secrets and privileged database credentials out of browser code.
- Keep public copy visitor-facing and avoid developer deployment checklist text,
  database brand names, and time-window jargon on the homepage.

Done when:

- `web/index.html` can be opened locally.
- `web/stats.html` can be opened locally or served at `/stats`.
- The website contains no backend secrets.
- The download section links to the published APK release.
- Public Insights are clearly labeled as an aggregate snapshot or live aggregate
  data.

## Research Dataset And Evaluation

Goal: make the FYP detector measurable and reproducible.

Tasks:

- Build a local dataset manifest from MintVid or approved real/fake clips.
- Keep raw video files outside the app repo.
- Use Hugging Face Dataset as the canonical research dataset when videos can be
  stored under license/consent.
- Use Supabase only for app metadata and optional indexed research summaries.
- Export model predictions as JSONL.
- Generate evaluation metrics for accuracy, precision, recall, F1, balanced
  accuracy, and confusion matrix.

Done when:

- `research/output/*manifest.jsonl` exists locally.
- Prediction JSONL exists for at least one model version.
- Evaluation metrics can be reproduced from the manifest and prediction files.
- The FYP report can cite dataset size, split, label distribution, and model
  performance.

## Prompt Template

Use this for future implementation prompts:

```text
Read AGENTS.md first and follow it strictly.

Task:
[one feature or one integration]

Constraints:
- Do not change unrelated screens or behavior.
- Do not expose secrets in client code.
- Preserve existing UI unless this task changes it.
- Follow docs/[relevant-doc].md.

Verification:
- Run [lint/typecheck/test/manual flow].
- Report what changed and how it was verified.
```
