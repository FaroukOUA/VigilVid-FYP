# VigilVid FYP Report Guide

This guide maps the APU FYP report structure to the current VigilVid project
docs and implementation evidence. Use it as the starting point for writing the
final documentation.

Source guideline reviewed:

```text
C:\Users\hp\OneDrive - Asia Pacific University of Technology And Innovation (APU)\YEAR #3\FYP\FYP Semester 2\2.0 FYP Guideline and Samples\New FYP Structure Guidelines.pdf
```

## Start Here

Use these files first:

- `docs/requirements.md`: project scope, objectives, functional requirements,
  non-functional requirements, constraints, and success criteria.
- `docs/architecture.md`: current app/backend/model/database architecture and
  local/deployment runtime explanation.
- `docs/user-flows.md`: user journeys, detection flow, result flow, game flow,
  history, privacy, and deferred Insights behavior.
- `docs/api-contract.md`: backend API, Hugging Face integration, Supabase
  persistence, security rules, and current endpoints.
- `docs/dataset-evaluation.md`: dataset structure, seed-42 test export,
  prediction files, metrics, and FYP evaluation evidence.
- `docs/game-dataset-huggingface.md`: Hugging Face game dataset setup, local
  export behavior, video audit, and Supabase game score persistence.
- `docs/design-system.md`: UI design decisions, colors, components, loading
  states, result cards, game card behavior, motion, and accessibility.
- `docs/roadmap.md`: current progress, deferred scope, and future work.
- `web/README.md`: public website purpose, hosting notes, and separate project
  stats integration.

Use supporting implementation files as appendices or evidence:

- `supabase/migrations/202606290001_detection_persistence.sql`
- `supabase/migrations/202607060001_game_score_persistence.sql`
- `research/output/game-video-audit.json`
- `research/output/game_samples.playable.json`
- `research/scripts/export_jepa21_test_set.py`
- `research/scripts/audit_game_videos.py`
- `research/templates/hf-dataset-card-template.md`
- `web/index.html`
- `web/stats.html`
- `web/styles.css`
- `web/app.js`

## Report Structure Mapping

### Front Matter

The guideline includes cover page, declaration/confidentiality, library form,
acknowledgement, abstract, table of contents, list of figures, list of tables,
and abbreviations.

For VigilVid, define abbreviations such as:

- AI: Artificial Intelligence
- API: Application Programming Interface
- EAS: Expo Application Services
- FFmpeg: Fast Forward MPEG media processing tool
- HF: Hugging Face
- RLS: Row Level Security
- UAT: User Acceptance Testing

### Chapter 1: Introduction

Use:

- `docs/requirements.md`
- `docs/roadmap.md`

Suggested content:

- Problem background: short-form AI-generated/deepfake video content is hard
  for users to verify quickly.
- Project aim: build a mobile-first video detection and literacy app.
- Objectives:
  - detect video from URL, upload, and Android share intent
  - show probability-based result with time-window breakdown
  - provide optional account history and game score persistence
  - support learning through education and Real or Fake gameplay
  - keep model/API secrets server-side
- Scope:
  - v1 is video-only
  - maximum analyzed segment is 2 minutes and 100 MB
  - Android is the main real-device target
  - ranked leaderboard and Insights are deferred for the current demo scope
- Contribution:
  - usable Expo app
  - FastAPI proxy around a Hugging Face model
  - Supabase-backed history and game score persistence
  - public Hugging Face evaluation/game dataset workflow

### Chapter 2: Literature Review

Use external academic sources plus:

- `docs/requirements.md` for project framing
- `docs/dataset-evaluation.md` for evaluation terminology

Suggested literature areas:

- deepfake and AI-generated video detection
- video-window or temporal-segment based classification
- mobile misinformation and media literacy tools
- user trust in probability-based AI systems
- gamified learning or crowdsourced labeling
- privacy and consent for user-contributed media datasets

Keep website references limited. The guideline prefers journals, articles, and
books, and asks for APA style references.

### Chapter 3: Methodology

Use:

- `docs/requirements.md`
- `docs/user-flows.md`
- `docs/dataset-evaluation.md`
- `research/README.md`

Suggested content:

- Development method: iterative prototyping with working increments.
- Requirements gathering: user needs from problem analysis and FYP scope.
- System method:
  - Expo client for mobile UI
  - FastAPI backend for secret-backed processing
  - Hugging Face Space for model inference
  - Supabase for authenticated metadata
  - Hugging Face Dataset for game/evaluation artifacts
- Dataset method:
  - MintVid seed-42 split
  - 3993 train clips and 999 test clips
  - exported prediction JSONL and metrics JSON
  - local playback audit for game video reliability
- Evaluation method:
  - accuracy, precision, recall, F1, balanced accuracy, confusion matrix
  - app functional testing
  - user acceptance testing with at least 3 testers if following the guideline

### Chapter 4: Design And Implementation

The guideline expects system architecture, diagrams, interface design, database
design, screenshots, and implementation discussion. For CSDA-style projects, it
also expects data collection, preprocessing, data understanding, and model
building/evaluation discussion.

Use:

- `docs/architecture.md`
- `docs/api-contract.md`
- `docs/user-flows.md`
- `docs/design-system.md`
- `docs/game-dataset-huggingface.md`
- `docs/dataset-evaluation.md`
- `supabase/migrations/`

Suggested sections:

- 4.1 Introduction
- 4.2 System Architecture
  - Expo app
  - FastAPI backend
  - Hugging Face Space
  - Hugging Face Dataset
  - Supabase Auth/Postgres
  - FFmpeg/ffprobe video processing
- 4.3 Data Flow And Use Cases
  - URL detection
  - upload detection
  - Android Share-to-Detect
  - result window preview
  - game round loading
  - signed-in history and score persistence
- 4.4 Database Design
  - detection history tables
  - detection windows
  - detection feedback
  - game sessions
  - insights summary views
- 4.5 Dataset Design
  - Hugging Face Dataset layout
  - game sample manifest
  - prediction JSONL
  - metrics JSON
- 4.6 Interface Design
  - detection home
  - preview/trim screen
  - analyzing screen
  - result screen
  - history
  - game modes
  - account/privacy
  - public website homepage and separate Insights page
- 4.7 Implementation
  - backend URL preview and upload preview
  - backend trim/window clip generation
  - result aggregation from per-window probabilities
  - Supabase optional persistence
  - game clips through backend proxy
  - auto transcoding for Android playback
  - static web interface for project access, download information, privacy
    summary, and separate aggregate Insights charts
- 4.8 Sample Code
  - include short, focused snippets only
  - good examples: FastAPI detection endpoint, Supabase persistence method,
    Expo API client call, game clip proxy, result window popup
- 4.9 Summary

Diagrams to create:

- overall architecture diagram
- detection sequence diagram
- game clip loading sequence diagram
- Supabase ERD
- dataset flow diagram from MintVid to HF Dataset to app game

### Chapter 5: Results And Discussion

The guideline expects proof of correctness, testing plan, testing results, UAT,
model evaluation, and model deployment discussion.

Use:

- `docs/dataset-evaluation.md`
- `docs/game-dataset-huggingface.md`
- `docs/api-contract.md`
- `docs/architecture.md`
- `research/output/game-video-audit.json`
- backend and Expo test command outputs

Suggested sections:

- 5.1 Introduction
- 5.2 Model Evaluation And Discussion
  - dataset split and label distribution
  - metrics from the seed-42 export
  - confusion matrix
  - examples of correct predictions, false positives, and false negatives
  - discussion of window aggregation and limitations
- 5.3 System Testing
  - URL detection
  - upload detection
  - Android Share-to-Detect
  - result window popup playback
  - report issue link
  - sign-in/history
  - Solo score persistence
  - game clip playback and transcoding
  - public website navigation, APK download link, privacy summary, homepage
    messaging, and separate aggregate Insights dashboard
- 5.4 User Acceptance Testing
  - minimum 3 testers if following the guideline note
  - include tester demographic profile in appendix
  - include UI, navigation, performance, clarity, and trust questions
- 5.5 Deployment Discussion
  - local dev requires Expo dev client and Uvicorn backend
  - no-local demo uses the Android APK, hosted FastAPI backend, hosted HF Space,
    and hosted Supabase
  - do not expose service-role, HF, SaverAPI, or dataset write tokens in Expo
- 5.6 Summary

Useful verification evidence:

- backend compile/check output
- Expo typecheck/lint output
- Supabase query output for `public.game_sessions`
- screenshots of detection, preview, result, history, game, and account screens
- Hugging Face Dataset page screenshot
- Supabase table screenshot

### Chapter 6: Conclusion

The guideline expects critical evaluation, limitations, and recommendations.

Use:

- `docs/roadmap.md`
- `docs/requirements.md`
- `docs/dataset-evaluation.md`

Suggested content:

- Critical evaluation:
  - achieved a working mobile video-detection flow
  - backend protects model/downloader/database secrets
  - result page explains probability and per-window signals
  - game improves user literacy using evaluated MintVid samples
  - Supabase stores account metadata and game scores
- Limitations:
  - model output is probabilistic, not proof
  - current classifier is binary and cannot explain artifact categories
  - analysis is limited to selected 2-minute segments
  - ranked leaderboard and the mobile Insights tab are deferred in the current
    scope
- Recommendations:
  - prepare store distribution or a stronger release channel after the APK demo
  - add stronger model evaluation and model comparison
  - add artifact-category classifier
  - add richer loading/game animations
  - build privacy-safe aggregate Insights only after enough real data exists

### References

Use APA style. Prioritize journals, conference papers, books, and official
technical documentation. Cite any dataset, model, framework, or law source used
in the report.

Likely sources to cite:

- MintVid dataset source
- V-JEPA/VJEPA 2.1 or the model architecture source
- deepfake detection papers
- Hugging Face documentation
- Supabase documentation
- Expo/React Native documentation
- Malaysian legal sources if discussed in Education content

### Appendices

The guideline lists these appendices:

- Appendix A: PPF title registration proposal
- Appendix B: ethics form
- Appendix C: 6 log sheets
- Appendix D: poster
- Appendix E: Gantt chart
- Appendix F: sample code implementation
- Appendix G: respondent demographic profile and system testers
- Appendix H: first two pages of Turnitin similarity report

For VigilVid, Appendix F can include:

- selected Expo screen/component snippets
- FastAPI endpoint snippets
- Supabase migration snippets
- research export script snippets

Do not paste huge files into the appendix. Include short snippets that prove key
implementation decisions.

## Current Progress To Report

Implemented:

- Expo Android app with custom dev-client flow.
- Detection from URL, upload, and Android Share-to-Detect.
- Backend video preview, metadata, thumbnail strips, trimming, and exact window
  clip playback.
- FastAPI proxy to Hugging Face Space.
- Per-window aggregation for final probability.
- Result screen with tappable analysis windows and fake-content report link.
- Supabase Auth and signed-in detection history.
- Education tab.
- Solo Mode and Man vs Machine game flow.
- Backend-randomized game clips from local export or public Hugging Face Dataset.
- Backend auto transcoding for risky game video encodings.
- Supabase `game_sessions` table exists and is queryable.
- Seed-42 MintVid test export with 999 test clips and prediction/evaluation
  artifacts.
- Hosted FastAPI backend at `https://vigilvid-api.onrender.com`.
- Published Android APK through GitHub Releases with a SHA-256 checksum.
- Static public web interface with a consumer-facing homepage, Android APK
  download link, privacy summary, Real or Fake demo, and separate aggregate
  Insights page using live `/api/insights` data with a verified fallback
  snapshot.

Deferred:

- Play Store release
- ranked/ELO leaderboard
- mobile user-facing Insights tab
- artifact-category explanation classifier

## Immediate Documentation Tasks

1. Capture screenshots for Chapter 4 and Chapter 5.
2. Export or screenshot model metrics for Chapter 5.
3. Create architecture, ERD, and sequence diagrams.
4. Prepare a UAT form with at least 3 testers if following the guideline.
5. Collect backend/Expo/Supabase verification evidence.
6. Write limitations honestly around probability, dataset bias, Play Store
   release status, and deferred features.
