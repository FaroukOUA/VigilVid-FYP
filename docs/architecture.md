# VigilVid Architecture

## Current Stack

VigilVid currently runs as a mobile app plus a backend proxy.

```text
Static web interface
-> public project, APK download, privacy, research, and aggregate Insights pages

Expo / React Native app
-> FastAPI backend
-> Backend FFmpeg video tools
-> Hugging Face Space detector
-> local MintVid seed-42 export or Hugging Face Dataset game/evaluation files
-> Supabase Auth and database
```

## Web Interface

The public website is in `web/`.

It uses plain HTML, CSS, and JavaScript for the first version so it can be
opened directly or hosted as static files without adding another app framework.

The web interface is responsible for:

- introducing VigilVid to people who do not have the app installed
- providing the Android APK download link
- summarizing privacy behavior
- linking to the public Hugging Face research dataset
- showing aggregate, privacy-safe Insights on a separate dashboard page

The website must not contain Supabase service-role keys, Hugging Face tokens,
SaverAPI keys, or dataset write credentials. Live Insights data comes from
FastAPI `GET /api/insights`, not direct privileged browser access to Supabase.
The backend serves `web/` at `/` for local/demo use, so the website and API can
run from one FastAPI process.
The homepage should avoid public-facing database and backend jargon; technical
aggregate details belong on the separate stats page or in documentation.

## Mobile App

The mobile app is in `VigilVid/`.

It uses:

- Expo and React Native for the Android app runtime and UI.
- TypeScript for app code.
- Expo Router for screen navigation.
- `expo-video` for video preview and game playback.
- `expo-image-picker` for local video upload.
- `expo-share-intent` for Android Share-to-Detect.
- AsyncStorage for local preferences and local game progress.
- Supabase client for sign-in/session handling.

Expo is responsible for the user-facing app experience:

- Home, Preview, Analysis, Result, Game, History, Privacy, and Account screens.
- Selecting videos from the phone.
- Receiving shared links or shared video files from Android.
- Sending API requests to the backend.
- Polling detection job status.
- Displaying normalized results from the backend.
- Requesting game rounds from the backend.

The Expo app does not run the AI model and does not store server secrets.

## Backend

The backend is in `backend/`.

It uses:

- FastAPI for the API server.
- Uvicorn to run FastAPI locally or on a server.
- Python Gradio client to call the Hugging Face Space.
- Backend FFmpeg support for video metadata, trimming, and thumbnail strips.
- Supabase service-role access for backend-only persistence.

The backend is responsible for:

- Receiving detection requests from the mobile app.
- Downloading or accepting uploaded videos.
- Preparing preview metadata and thumbnail strips.
- Enforcing the selected analysis segment.
- Calling the Hugging Face detector.
- Parsing and normalizing model output.
- Returning structured result JSON to the app.
- Reading the public Hugging Face Dataset game manifest.
- Reading the local unzipped game/evaluation export when available.
- Returning sanitized game clip metadata and proxying game clip playback.
- Transcoding proxied game clips for Android-safe playback.
- Saving history, feedback, and game scores when configured.

Backend secrets stay server-side only.

## Hugging Face Space

The Hugging Face Space runs the deepfake detector model.

It receives a video from the backend and returns:

- prediction text
- confidence text
- per-window fake probability breakdown
- processing and duration information

The FastAPI backend is the source of truth for the app result. It parses the
Space output, computes the final probability from window scores, assigns the
four-level label, and returns clean JSON to Expo.

## Game And Evaluation Dataset

The public `farouk04/vigilvid-research` dataset stores evaluation artifacts and
game sample videos. FastAPI reads `app/game_samples.json`, randomizes a game
round, and serves backend clip URLs to Expo.

For local development, FastAPI prefers the unzipped export folder:

```text
vigilvid_jepa21_test_export/
```

This avoids repeated remote downloads while testing the Game tab. If that folder
is missing, the backend falls back to the public Hugging Face Dataset.

Game clip playback is proxied by FastAPI. The backend uses
`GAME_CLIP_TRANSCODE_MODE=always` by default so clips are converted to
phone-safe H.264/yuv420p/AAC MP4 before Android playback. To reduce first-round
waiting, the backend prepares the first selected clip before returning the game
round and warms the remaining selected clips in the background.

The Expo app does not call Hugging Face Dataset URLs directly. If the dataset is
made private later, only the backend should receive the required server-side
token.

## Supabase

Supabase is used for app metadata, not model inference.

Current Supabase responsibilities:

- user accounts and sessions
- signed-in detection history
- feedback reports
- game score persistence
- future aggregate insight views

Supabase public anon keys can be used in the Expo app. Supabase service-role
keys must stay in the backend only.

Current verification:

```sql
select *
from public.game_sessions
order by created_at desc
limit 20;
```

This query runs successfully in the live Supabase project, confirming that the
game score persistence table exists.

## Detection Flow

```text
User chooses URL, Upload, or Android Share-to-Detect
-> Expo opens Preview video
-> FastAPI downloads/uploads/previews video
-> User confirms trim and privacy options
-> Expo creates detection job
-> FastAPI sends selected video segment to Hugging Face
-> Hugging Face returns window scores
-> FastAPI normalizes result
-> Expo shows Result screen
```

## Local Development

Local testing usually needs two processes:

```text
npx expo start --dev-client
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Run Expo from:

```text
VigilVid/
```

Run FastAPI from:

```text
backend/
```

Expo runs the phone app. Uvicorn runs the backend that the phone app calls.

Because `expo-share-intent` and other native modules are used, Expo Go is not
enough for full testing. Use an installed custom development build with
`npx expo start --dev-client`.

For fast local game playback, keep the unzipped export folder at:

```text
C:\Dev\VigilVid-FYP\vigilvid_jepa21_test_export
```

The backend default `GAME_CLIP_LOCAL_EXPORT_ROOT` points there from
`backend/.env.example`. If Windows PATH cannot find FFmpeg, set
`GAME_CLIP_FFMPEG_PATH` and `GAME_CLIP_FFPROBE_PATH` to the full `.exe` paths.

## Secret Rules

- The Expo app never calls Hugging Face directly.
- The Expo app never contains Hugging Face tokens.
- The Expo app never calls Hugging Face Dataset files directly for game clips.
- The Expo app never contains Supabase service-role keys.
- The Expo app never contains SaverAPI/downloader keys.
- Client environment variables may only contain public URLs and public anon keys.
- All model calls and secret-backed operations go through FastAPI.

## Deployment Shape

Current no-local-runtime demo shape:

```text
public website
-> GitHub Release APK link

Android app build
-> hosted FastAPI backend at https://vigilvid-api.onrender.com
-> hosted Hugging Face Space
-> hosted Supabase project
```

The released APK points `EXPO_PUBLIC_API_BASE_URL` to the hosted backend instead
of a local LAN address. Local development can still point the app to a LAN
backend for testing.
