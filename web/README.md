# VigilVid Web Interface

This is the public project website for VigilVid.

It remains safe to open as a plain static site:

- no Supabase keys in browser code
- no Hugging Face tokens in browser code
- no package install required
- can be opened directly from `index.html`

Current pages/sections:

- project introduction
- framed homepage screenshot (`assets/screen-home.jpeg`)
- foreground homepage demo video (`assets/vigilvid-promo.mp4`)
- framed feature screenshots (`assets/screen-*.jpeg` and
  `assets/screen-share-detect.jpg`)
- Android APK download link (`VigilVid-v1.0.0.apk`)
- feature overview
- privacy policy summary
- separate Insights page with aggregate metrics and charts

The homepage is written for normal short-video users and avoids database or
backend jargon. The separate `stats.html` page is labeled as `Insights` and
tries to read live aggregate JSON from the FastAPI backend at
`GET /api/insights`. If the page is opened directly from `index.html` or the
backend is not reachable, it falls back to a small verified local
`game_sessions` snapshot. Database secrets stay on the backend only.

Current public Android APK:

```text
https://github.com/FaroukOUA/VigilVid-FYP/releases/download/v1.0.0/VigilVid-v1.0.0.apk
```

APK SHA-256:

```text
c64d9635fc8c1a884d3c15055547333cc9b9fd75f9949bcd35bc122aafac57ce
```

When the backend is running locally, open `http://127.0.0.1:8000/` to view the
homepage from FastAPI, or `http://127.0.0.1:8000/stats` to view aggregate
Insights on the same origin.

Website navigation uses the hosted routes `/`, `/#features`, `/#practice`,
`/#privacy`, and `/stats`. When the HTML files are opened directly from disk,
`app.js` rewrites those internal links to `index.html` and `stats.html` so local
preview still works without a server.

The hosted backend currently used by the APK and public demo is:

```text
https://vigilvid-api.onrender.com
```

For a separate hosted API, define `window.VIGILVID_API_BASE_URL` before
`app.js` loads. Do not put Supabase service-role keys in this file or any public
browser code.

Hosting options:

- GitHub Pages for static public hosting
- Vercel or Netlify for static hosting with simple redirects
- OpenAI Sites or another hosted site platform after adding the appropriate
  project configuration

Before replacing the APK link with a future build, make sure the Android app
can reach the public VigilVid server used for detection and game clips.
