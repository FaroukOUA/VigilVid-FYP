You are an expert Expo, React Native, TypeScript, FastAPI, and Supabase engineer helping build VigilVid.

Write clean, simple, maintainable code. Prefer clarity over abstraction. Before every feature, read this file and the relevant files in `docs/`.

## Project Overview

VigilVid is a video-only AI-generated/deepfake detection mobile app. It helps users analyze short-form videos, understand probability-based results, learn about synthetic media, and practice spotting synthetic media through a game.

Core v1 goals:

- Detect AI-generated/deepfake videos from URL, upload, and Android Share-to-Detect.
- Show probability, verdict, processing time, and suspicious time-window breakdown.
- Provide optional accounts for history and game scores.
- Include a Real or Fake game, Education Hub, and Privacy policy.
- Include a public web interface for project introduction, app download,
  privacy, and a separate aggregate Insights page.
- Defer ranked leaderboard and user-facing Insights unless explicitly brought
  back into scope.
- Keep detection usable without an account.

## Source Of Truth

Use these docs for detailed requirements:

- `docs/requirements.md`: scope, product rules, privacy, success criteria.
- `docs/user-flows.md`: screen and user journey behavior.
- `docs/api-contract.md`: backend proxy APIs and Hugging Face integration.
- `docs/design-system.md`: UI style, motion, status colors, component rules.
- `docs/roadmap.md`: build order, prompt discipline, verification loop.
- `docs/skills.md`: recommended skills to install/use in future sessions.

If this file conflicts with a doc, pause and update the docs first instead of inventing a new rule.

## Tech Stack

Mobile:

- Expo. If working inside `VigilVid/`, use the installed Expo SDK version from `package.json` and consult matching versioned Expo docs.
- React Native
- TypeScript
- Expo Router
- Plain React Native `StyleSheet` for initial screens; NativeWind is deferred until the UI scale justifies the extra build dependency.
- Zustand
- AsyncStorage
- Supabase Auth/Postgres
- Reanimated and Expo Haptics for polished interactions

Backend:

- FastAPI proxy
- Python Gradio client or direct Gradio HTTP calls
- Hugging Face Space as experimental model runtime
- Hugging Face Dataset for curated game/evaluation assets, not user-submitted video storage

Do not introduce new major libraries without a clear reason and user approval.

## Architecture Rules

Target structure after app scaffolding:

```text
app/                  Expo Router screens and route groups
components/           Reusable UI components
constants/            Theme, images, copy constants
data/                 Static education/game seed content
hooks/                Reusable app hooks
lib/                  API clients, Supabase client, helpers
store/                Zustand stores
types/                Shared TypeScript types
backend/              FastAPI proxy
web/                  Public static website
docs/                 Project planning and implementation docs
assets/               Images, icons, animations
```

Screens should compose components and call hooks/stores. Keep business logic in `lib/`, `store/`, or backend modules.

## Product Constraints

- v1 is video-only. Do not implement image detection unless the scope is explicitly changed.
- Max v1 analyzed segment limit is 2 minutes and 100 MB. URL sources and local/shared video files may be longer during preview/review, but the selected segment sent to the model must stay within this limit.
- Show progress immediately. Aim for under 10 seconds on short standard clips; longer videos can take longer.
- Current model returns binary fake probability and per-window scores only.
- Do not claim Human Fidelity, Physics, Controllability, Creativity, or Commonsense artifact categories until a second classifier exists.
- Core detection must work without an account.
- User-submitted videos must not be stored after checking.
- Signed-in checks save result summaries to History automatically; anonymous checks do not save account history.
- Android is the first real-device target for Share-to-Detect.

## API And Secrets Rules

- The mobile app must never call Hugging Face directly.
- The mobile app calls the FastAPI proxy.
- Do not expose Hugging Face tokens, Supabase service-role keys, SaverAPI keys, or dataset write credentials in client code.
- Client-side environment variables may only contain public URLs and public anon keys.
- All external AI/model calls go through server-side code.

## UI Rules

- Default style is light trust/safety UI.
- Prioritize credible, readable, fast-feeling screens.
- Use strong status colors: green for real, yellow-green for partially real, orange for partially fake, red for fake, blue/teal for analysis and neutral progress.
- The game can be more energetic, but it must still feel like VigilVid.
- Use animation deliberately: progress, result reveal, game feedback, and light haptics.
- Do not add decorative clutter or generic AI-looking gradients.

## State And Data Rules

- Use local state for temporary UI state.
- Use Zustand for cross-screen client state.
- Use AsyncStorage for lightweight local persistence.
- Use Supabase for authenticated history, game scores, and future
  aggregate insights metadata.
- Do not store raw user-submitted videos. History stores result summaries only.

## TypeScript Rules

- Use strict TypeScript.
- Avoid `any`.
- Prefer simple typed objects over clever generic abstractions.
- Define shared API types in `types/` once the app is scaffolded.

## Development Workflow

Follow the practical vibe-coding loop:

1. Read `AGENTS.md` and relevant docs.
2. Work on one feature or one integration at a time.
3. Keep diffs small.
4. Preserve existing UI and behavior unless the task asks to change it.
5. Run lint/typecheck/tests relevant to the changed area.
6. Verify the main user flow manually when UI is affected.
7. Commit only working, verified increments.

Feature priority:

1. Documentation and project source of truth.
2. Skills setup.
3. Expo app and FastAPI proxy scaffold.
4. Minimal detection interface.
5. Android Share-to-Detect proof.
6. Result screen.
7. Auth, automatic signed-in history, and privacy.
8. Education Hub.
9. Real or Fake Solo Mode.
10. Man vs Machine.
11. Public web interface.
12. ELO leaderboard and Insights tab only if they return to scope.

## Final Reminder

Before every implementation task, read this file and the relevant `docs/` file. Do not repeat project context in prompts when it belongs here.
