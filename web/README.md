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
- Android APK download link
- feature overview
- privacy policy summary
- separate project stats page with aggregate metrics and charts

The homepage is written for normal short-video users and avoids database or
backend jargon. The separate `stats.html` page tries to read live aggregate JSON
from the FastAPI backend at `GET /api/insights`. If the page is opened directly
from `index.html` or the backend is not reachable, it falls back to a small verified local
`game_sessions` snapshot. Database secrets stay on the backend only.

When the backend is running locally, open `http://127.0.0.1:8000/` to view the
homepage from FastAPI, or `http://127.0.0.1:8000/stats` to view aggregate
project stats on the same origin.

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
