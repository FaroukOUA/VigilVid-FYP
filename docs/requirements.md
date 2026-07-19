# VigilVid Requirements

## Summary

VigilVid is a mobile app that helps users check whether short-form videos,
especially videos encountered on social media, are likely AI-generated or
deepfake content. v1 focuses on video detection only, using a hosted Hugging
Face model through a FastAPI backend proxy.

The app must feel credible and low-friction: users can detect without an
account, see probability-based results, learn about AI-video detection in the
Education Hub, and sharpen their judgment through Solo and Man vs Machine game
modes.

## Locked Decisions

- App name: VigilVid.
- v1 scope: video-only AI-generated/deepfake detection.
- Future work: image detection and artifact-category classifier.
- Analysis limit: max 2 minutes and 100 MB. URL sources and local/shared video files may be longer during preview/review, but the selected analyzed segment must stay within this limit.
- Primary platform for Share-to-Detect: Android.
- Result output: probability, four-level verdict, processing time, duration, and suspicious time-window breakdown.
- No v1 artifact-category claims until a second classifier exists.
- Core detection works without account.
- User-submitted videos are not retained after checking.
- Signed-in checks save result summaries to History automatically.
- Supabase stores app metadata: users, history, scores, feedback, and future
  aggregate insights.
- Public web interface covers project introduction, app download, privacy, and a
  separate aggregate Insights page.
- Current FYP demo scope defers ranked/ELO leaderboard and the user-facing
  Insights dashboard unless they are explicitly brought back into scope.

## V1 Functional Requirements

### Detection

- Accept video input through URL paste.
- Accept direct file upload from device.
- Accept Android Share-to-Detect payloads from other apps where supported.
- Validate file type, duration, and size before analysis when possible.
- For URL/share links, download/resolve the video on the backend for preview metadata and require a selected segment if the source is longer than 2 minutes.
- For upload/share file payloads, include a preparation step where users can review metadata and trim/crop video before analysis when needed.
- Send detection requests through the FastAPI proxy, not directly to Hugging Face.
- Show analysis progress immediately.
- Return and display AI-generated probability as a percentage.
- Show a four-level verdict derived from AI-generated probability: real, partially real, partially fake, or fake.
- Show suspicious time windows using the model's per-window probabilities.
- Support false positive and false negative reporting.

### Result Screen

- Show the submitted media source type: URL, upload, or shared payload.
- Show confidence percentage prominently.
- Show processing time and video duration.
- Show suspicious window breakdown.
- Include a plain-language explanation that is honest about model limits.
- Include shareable result card behavior.
- Include feedback/report button.

### Privacy

- Detection must work without account.
- User-submitted videos must not be stored after checking.
- Signed-in checks save result summaries to History automatically.
- Anonymous checks do not save account history.
- Explain that History saves results only, not videos.

### Account System

- Account is optional.
- Account unlocks detection history, game score persistence, and profile/settings.
- Ranked leaderboard identity is future scope.
- Anonymous users can still use detection, education, and local game practice.

### Detection History

- Save history automatically when the user is signed in.
- Store metadata and result summaries in Supabase.
- Do not store raw video in history.
- Do not store user-submitted videos in Supabase Storage for v1. If media
  retention returns later, it must be a separate explicit feature with consent,
  deletion, retention, and storage-cost rules.

### Real Or Fake Game

- Solo Mode first: beat personal high score.
- Track score, accuracy, streak, high score, and improvement over time.
- Man vs Machine later: compare user answers against model predictions.
- Ranked PvP means asynchronous ELO-style ranking, not live matchmaking, but it
  is deferred for the current FYP demo scope.
- Ranked scores require account when ranked mode is implemented.
- Gameplay data may contribute to aggregate stats only in privacy-safe form.

### Education Hub

- Short-form, scannable content only.
- Topics:
  - how to spot deepfakes
  - AI and synthetic media basics
  - Malaysian legal context including Communications and Multimedia Act 1998 and Penal Code
  - social risks of fake content
  - how VigilVid works in non-technical language
- No long article-style pages in v1.

### Public Web Interface

- Provide a public website for people who do not yet have the mobile app.
- The homepage should speak to normal short-video users, not developers or
  database users.
- Include project introduction, main features, Android download area, and
  privacy policy summary on the homepage.
- Keep aggregate metrics on a separate public Insights page.
- Present stats content as aggregate app metrics and charts, not as raw database
  rows.
- Avoid public-facing terms that normal users may not know, such as Supabase or
  backend implementation details.
- Do not expose Supabase service-role keys, Hugging Face tokens, SaverAPI keys,
  or dataset write credentials in browser code.
- The Android APK link is published only when the app points to a hosted
  backend rather than a local LAN or `127.0.0.1` URL.
- Insights on the web must be aggregate and privacy-safe. Live data should come
  from FastAPI `GET /api/insights` instead of querying Supabase directly from
  public browser code.

### Insights

- Public website Insights are implemented as an aggregate dashboard.
- The mobile app Insights tab is deferred for the current FYP demo scope.
- When the mobile tab is implemented, provide a user-facing Insights tab.
- Show aggregate anonymous research stats:
  - human accuracy trends from game data
  - AI-vs-user comparison trends
  - saved-check volume
  - commonly missed or convincing synthetic media patterns
- Do not expose personal identifiers in insights.

## Non-Functional Requirements

- Low-friction detection flow.
- Clear error handling for invalid links, unsupported files, oversized videos, too-long videos, failed model calls, and network issues.
- Immediate loading/progress feedback.
- Aim for under 10 seconds on short standard clips; longer videos up to 2 minutes may take longer.
- Clean light trust/safety visual design.
- Strong privacy language without hiding tradeoffs.
- Hugging Face tokens, ZeroGPU access, and Hugging Face Pro credentials must stay in backend environment variables only.
- App must be testable on Android first.

## V2 / Future Work

- Image detection.
- Second classifier for artifact categories:
  - Human Fidelity
  - Physics
  - Controllability
  - Creativity
  - Commonsense
- iOS Share-to-Detect support after Android proof.
- Admin/research dashboard.
- More advanced model monitoring.
- More advanced gamified crowdsourcing modes.

## Success Criteria

- User can submit a valid video by URL and receive a structured result.
- User can upload a valid video and receive a structured result.
- Android Share-to-Detect proof shows VigilVid in the share sheet and routes payload to detection.
- User can understand probability result without technical background.
- Signed-in user can view automatically saved detection history.
- Solo game works locally, then persists authenticated scores.
- Public web interface explains the app, privacy policy, and download path in
  normal user-facing language.
- Separate public Insights page shows aggregate metrics without exposing
  user identifiers.
- Public website Insights display aggregate anonymous data only.
