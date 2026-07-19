# VigilVid Expo App

Expo React Native app for VigilVid. The backend lives in `../backend`.

## Current Runtime

Use a custom development build:

```bash
npx expo start --dev-client
```

Expo Go is no longer enough because the app uses native modules for Android
Share-to-Detect, local video handling, and Lottie-backed signal animations.

## Local Setup

```bash
npm install
npx expo start --dev-client
```

If `app.json`, native plugins, or native dependencies change, rebuild and
reinstall the development build before testing again. This includes changes to
packages such as `expo-share-intent`, `expo-video`, and `lottie-react-native`.

## Backend URL

For physical Android testing, set the app API base URL to your computer's LAN
IP and run the backend with `--host 0.0.0.0`.

For an APK that will be installed on a phone, set `EXPO_PUBLIC_API_BASE_URL` to
a backend URL the phone can reach. Do not build an APK with `127.0.0.1` unless
the backend also runs on that Android device.

Current hosted demo backend:

```env
EXPO_PUBLIC_API_BASE_URL=https://vigilvid-api.onrender.com
```

Client env vars may contain public URLs only. Do not put Hugging Face tokens,
Supabase service-role keys, or dataset credentials in the Expo app.

Optional Supabase Auth uses only public client values:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_public_anon_key
```

Restart Metro after changing Expo env values. Detection still works when the
Supabase values are blank; the Account screen will show a configuration
message.

## Checks

```bash
npm run typecheck
npx expo lint --no-cache
```

## APK Build

The `preview` EAS profile builds an installable Android APK:

```bash
eas build --profile preview --platform android
```

Before building, confirm `EXPO_PUBLIC_API_BASE_URL` points to the running
backend you want this APK to use.

Current public APK release:

```text
https://github.com/FaroukOUA/VigilVid-FYP/releases/download/v1.0.0/VigilVid-v1.0.0.apk
```

SHA-256:

```text
c64d9635fc8c1a884d3c15055547333cc9b9fd75f9949bcd35bc122aafac57ce
```

## Current Verified Flow

- URL detection reaches the result screen through the FastAPI backend.
- Local video upload reaches the result screen.
- Android Share-to-Detect opens the app and routes supported shared URLs/video
  files into the preview flow.
- Result screen shows probability, verdict, suspicious windows, share result,
  and report issue actions.
- Account screen can initialize a Supabase Auth session when public Supabase
  client values are configured.
- Preview APK installs and runs on a physical Android phone when built with the
  hosted backend URL.
- Public website download links point to the GitHub Release APK.

UI is intended to stay light, readable, and smooth. Keep future animation work
small and focused on clear feedback.
