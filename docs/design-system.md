# VigilVid Design System

## Direction

VigilVid uses a light trust/safety visual style with joyful signal feedback.
The interface should feel credible, clear, fast, and a little alive. It should
not look like a marketing landing page, a generic AI app, or a cartoon mascot
app.

Design sentence:

> A calm trust-and-safety scanner with playful signal feedback, strong status
> colors, compact result cards, and a more energetic game mode.

## Current UI Status

The current screens are a working foundation, not the final UI polish pass. Keep future changes compatible with the existing flow, but expect to improve:

- screen transitions
- Lottie-backed detection progress animation
- result reveal animation
- share-to-detect handoff polish
- final typography/spacing pass
- clearer video preview and trim/crop controls

## Visual Principles

- Clarity before decoration.
- High readability for academic demo and real users.
- Status should be obvious without becoming alarmist.
- Motion should explain progress, confirm input, or reward interaction.
- Game screens may be more dynamic, but still use the same brand tokens.
- Joy should come from feedback, pacing, and small rewards, not from decorative
  clutter.
- Active game-mode screens should rely on the app bar for the mode title. Do
  not repeat "Solo mode" or "You vs VigilVid" as an in-page heading.

## Color Tokens

Use the Signal Bloom palette:

```text
Background:              #F7FBF8
Surface:                 #FFFFFF
Surface muted:           #EAF7F3
Surface raised:          #FDFEFE
Text primary / ink:      #0B1F24
Text secondary:          #52656B
Border:                  #D7E5E0

Primary teal:            #0E7C73
Primary teal dark:       #075E58
Analysis blue:           #2563EB
Signal aqua:             #22C7A9
Reward mango:            #F6B84B
Game violet:             #7C3AED
Game violet muted:       #EDE9FE

Real:                    #137D43
Real muted:              #DCFCE7
Partially real text:     #365314
Partially real muted:    #ECFCCB
Partially fake text:     #7C2D12
Partially fake muted:    #FFEDD5
Uncertain text:          #B45309
Uncertain muted:         #FEF3C7
Fake:                    #D92D20
Fake muted:              #FEE2E2
```

Color roles:

- Primary teal: main CTAs, active tabs, top app bars, privacy toggles.
- Analysis blue: neutral analysis/progress state, history save state, scanning
  status.
- Signal aqua: animated scan glow, active progress accents, non-critical
  interactive feedback.
- Reward mango: score bumps, completion sparkle, small celebratory feedback.
- Game violet: game mode identity, You vs VigilVid, and machine reveal
  moments.
- Status colors: verdicts and warnings only.

Avoid one-note palettes. Do not make the app entirely teal, blue, purple, or
gray. The primary teal is the anchor; aqua, mango, and violet are controlled
supporting accents.

## Logo System

- Primary mark: a modern minimalist owl guardian on a teal/aqua signal field,
  with a subtle magnifying glass eye cue and small mango beak/accent.
- Use the mark for app icon, splash icon, favicon, compact navigation, and the
  Home hero brand cue.
- Use the app icon with adjacent live text on website headers. Use the wordmark
  SVG only when the app name should appear as a single graphic.
- Keep the owl geometric, friendly, and minimal. Avoid detailed animal
  illustration, scary expressions, cartoon mascot styling, or decorative
  clutter.
- Source/generated assets:
  - `VigilVid/assets/brand/vigilvid-owl-mark-source.png`
  - `VigilVid/assets/brand/vigilvid-owl-mark.png`
  - `VigilVid/assets/brand/vigilvid-mark.svg`
  - `VigilVid/assets/brand/vigilvid-logo.svg`
  - `VigilVid/scripts/generate-logo-assets.py`

Contrast rules:

- Body text must meet at least 4.5:1 contrast against its background.
- Use white text only on sufficiently dark fills such as primary teal, primary
  dark, analysis blue, game violet, real green, and fake red.
- For partially real / partially fake chips, prefer tinted backgrounds with
  dark text instead of white text on mid-tone yellow-green or orange.
- Never rely on color alone for verdicts; include the verdict word and AI
  signal score.

## Typography

- Use the native/system font stack for now. It is the right default for a
  safety tool because readability matters more than brand display personality.
- Do not add a decorative display font to operational screens.
- Use a compact Material-style role scale:
  - Screen title: 28 / 34, weight 700-800
  - Section title: 18 / 24, weight 700
  - Body: 16 / 24, weight 400
  - Help text: 13 / 19, weight 400
  - Label/data caption: 12 / 16, weight 700
- Use tabular numbers for timers, scores, durations, and AI signal values.
- Avoid uppercase eyebrows on every card. Use them only when they clarify
  source, status, or mode.
- In active task screens, skip eyebrows unless they add new information that is
  not already in the app bar, card title, or button label.
- Do not repeat the app-bar title as a large in-page title. The app bar owns
  the screen name; in-page headings should describe content or current state.
- Top-of-page eyebrows are generally avoided in the mobile app. Prefer direct
  section titles and body copy.
- Keep labels short and direct. Prefer "Check video", "Selected part",
  "Saved checks", and "History" over internal terms.

## Layout

- Use safe areas consistently.
- Screens should be scrollable when content may overflow.
- Home should stay compact, but keep scrolling enabled so smaller screens and
  keyboard states do not clip content.
- Use cards for repeated items, result summaries, and game items, but avoid
  nested cards.
- Avoid cards inside cards.
- Keep primary actions fixed or easy to reach on mobile.
- Important detection state should be visible without scrolling.
- Touch targets should be at least 48 dp tall.
- Metadata should use compact grids only when labels remain readable on small
  Android screens; otherwise wrap into two columns or stacked rows.
- Implement initial UI with plain React Native `StyleSheet` and shared theme tokens. NativeWind is deferred until the UI scale justifies the extra build dependency.

## Core Components

### Home Dashboard

- First bottom tab is Home.
- Home should combine a few useful stats, the main "Check video" entry point,
  and no extra shortcut cards.
- Use the bottom navigation for Learn, Game, and History.
- Keep Home short and avoid long explanations. If content grows, move it to the
  destination screen instead of expanding Home.
- Account-only information belongs on Account. Broad progress stats belong on
  Home.
- Account details should stay minimal; when signed in, show the account email
  instead of repeated History or video-storage sections.
- Share-to-Detect must bypass Home and open the Preview video flow directly.

### Detection Input

- Segmented control for Link / Phone / Shared.
- Link input with paste affordance.
- Keep the Home link input compact and visually secondary to the primary
  "Preview video" action.
- Phone video picker with preview and video details.
- Link preview state with video details, thumbnail strip, and a compact
  draggable trim selector when the video is longer than 2 minutes.
- Local upload preview with video details when available,
  thumbnail strip, and the same draggable trim selector when length is
  available.
- On Preview, show the source link/file as a small muted line. It should be
  copyable but not compete with the video preview, metadata, trim controls, or
  check button.
- Do not show a separate "Ready to check" confirmation box on Preview. Keep the
  Preview screen focused on the video, selected part, and primary check action.
- Do not show a separate account-saving card on Preview. History saving is
  automatic for signed-in users and should be explained in Account, History, and
  Privacy instead.
- Do not show a save-history toggle.
- Check button must be disabled until input is valid.

### Loading State

- Show immediate progress after Check.
- Use a Lottie-backed signal loader, animated progress indicator, elapsed time
  where useful, and plain-language status.
- Replace the old PNG mascot-frame loader with abstract scan motion:
  - pulsing rings
  - rotating scan beam
  - small signal dots
  - restrained glow using teal, aqua, blue, and mango
- Keep loader motion purposeful and lightweight. No decorative ambient animation
  outside active loading states.
- Do not promise exact completion time for long videos.
- Copy examples:
  - "Preparing video"
  - "Checking video"
  - "Preparing your result"

### Result Card

- Use a semi-circle AI signal gauge instead of showing only a large
  number. The number still appears inside the gauge for precision.
- The gauge arc should move from green through amber to red as AI signal
  increases.
- Animate the gauge fill on result reveal. Keep the animation under roughly
  800ms. Do not use a needle, pointer, or hand on the gauge.
- Status chip:
  - Real
  - Partially real
  - Partially fake
  - Fake
- Four-level verdict thresholds:
  - `0%` to `25%`: Real
  - `25%` to `50%`: Partially real
  - `50%` to `75%`: Partially fake
  - `75%` to `100%`: Fake
- Short explanation under the score.
- "Moments to review" list or timeline. Prefer an actual video thumbnail
  timeline with a translucent AI signal overlay. Overlay color should be
  continuous by score, moving from green through amber to red rather than using
  only three fixed buckets.
- Until preview frame extraction exists, the result timeline may show a
  placeholder strip with the same continuous overlay logic.
- Actions:
  - Share result
  - Report issue
  - Check another video

### History

- Show saved result summaries, not saved videos.
- Include compact summary content for saved checks, the result breakdown by
  verdict, and the most recent saved result when data exists.
- In the result breakdown, use neutral rows with small semantic color markers
  and aligned tabular counts. Avoid large tinted status blocks.
- Order the result breakdown as Real / Partially real on the first row, then
  Fake / Partially fake on the second row.
- Empty state should direct signed-in users to check a video and explain that
  results save automatically.
- Use light entrance motion for newly rendered history cards and loading
  feedback for refresh. Do not imply the original video is available.

### Game Card

- Bigger media preview.
- Clear binary choices: Real / Fake.
- Use immediate animated feedback after answer.
- Answer buttons should scale subtly on press and show a short animated popup
  after the user answers. Avoid permanent full-width correct/review blocks.
- Use reward mango sparingly for streaks, score jumps, and completion moments.
- Use game violet for mode selection and You vs VigilVid framing.
- Show streak, score, and accuracy without cluttering the media.
- Round-complete screens should show the current round summary and account save
  state only. Do not add a separate "local progress" card.
- Solo Mode should not show an answer-details panel. Use the temporary popup,
  selected-answer styling, score, and streak to keep the round moving.
- You vs VigilVid should reveal VigilVid's pick in the top duel progress card
  after the user answers, then animate a compact duel progress track. Do not
  use an answer-details modal or extra comparison cards between the answer
  buttons and the next action.

### Education Cards

- Short card title.
- One-sentence preview.
- 3-5 bullet max inside detail screen.
- Avoid long article pages.

### Insights Cards

- Aggregate metric cards.
- Use plain labels:
  - "Saved checks"
  - "Average human accuracy"
  - "Model vs user trend"
- "Most missed patterns"
- Avoid exposing individual user data.

### Public Website

- Match the mobile app tokens: light background, white surfaces, dark teal
  header, teal primary actions, and status colors only where they communicate
  meaning.
- The homepage should feel like a public app page for normal short-video users,
  not a developer setup page or database dashboard.
- Lead with the project objective: helping people check for AI-generated video,
  especially in short videos encountered on social media. Treat sharing as one
  use case, not the website's entire message.
- Keep aggregate project stats on a separate stats page, not in the homepage
  flow.
- Use signal animation assets or the app icon as the brand cue. Avoid relying on
  the old owl mascot image-frame loader for loading states.
- The website hero should lead with a real app screenshot inside a phone frame
  when available. Put text-heavy promo videos in a separate foreground demo
  section, not behind page copy.
- Keep the website hero compact enough to fit comfortably at normal browser
  zoom. Avoid oversized phone frames and three-line headlines when a shorter
  line can carry the message.
- Do not use generic hero fact chips such as "No account needed" or "Estimate,
  not proof" in the top hero. If those points are needed, place them in Privacy
  or supporting sections.
- Do not label hero media with website-behavior or implementation copy such as
  "Home preview," "marketing video," or playback instructions. The visual and
  surrounding product copy must provide enough context on their own.
- Blend the website hero into the page background. Do not place the entire
  navigation and hero inside one large white presentation card. Use soft teal,
  aqua, and mint ambient shapes instead of off-brand purple panels.
- Feature sections may use a small set of framed screenshots for the main app
  capabilities: sharing or choosing a video, previewing a clip, checking a
  result, practicing real-or-fake calls, keeping summaries, and learning clues.
- Avoid presenting checking, practice, history, and education as one required
  flow. They are separate features that can be shown in one screenshot slider.
- For website screenshot showcases, prefer a focused phone slider with one
  dominant active screen and smaller side screens over a flat row of equal
  cards. Include arrows, dots, and keyboard support.
- In the website screenshot slider, the phone frame should be the object. Avoid
  putting each phone inside another white card unless that card communicates
  useful structure.
- Keep the hero screenshot clean: phone frame only, no extra outer card around
  the phone and no floating labels unless they communicate critical information.
- Keep website marketing videos centered as foreground media with short text
  above and below. Do not add extra demo-label bars when the video already
  contains its own text.
- Website marketing videos should be passive: muted, looped, non-clickable, and
  paused when scrolled away. Resume from the same point when visible again.
- Keep playback behavior invisible to visitors. Do not explain autoplay,
  looping, muting, pausing, or viewport behavior in public-facing copy.
- A small real-or-fake practice demo may use local curated game clips with
  plain Real / Fake choices and immediate feedback.
- Download and privacy sections should be direct and plain.
- Public copy should avoid technical terms that normal users may not know, such
  as Supabase, backend configuration, database rows, and time-window jargon.
- Name the practice feature as the "Real or Fake game" in public website copy.
  Avoid vague phrases such as "practicing your judgment" when the game can be
  named directly.
- In the main feature overview, name both game modes (Solo and You vs VigilVid)
  and the Education Hub. Explain that the games sharpen recognition skills and
  that the Education Hub teaches AI-video detection more broadly.
- When describing result detail, use plain phrases like "moments to review" or
  "parts of the clip" instead of "time windows."
- Web stats must show aggregate data only and should clearly distinguish a small
  snapshot from final research findings.
- Avoid developer-facing setup language such as build, host, publish, localhost,
  or backend configuration in public-facing website copy.

## Motion And Haptics

UX psychology rules:

- Every motion should be a trigger-feedback pair: user action or system state
  change in, local visible feedback out.
- Put feedback close to the trigger. If the user taps Check, the button,
  progress card, and loader should respond immediately.
- Use animation for system status, recognition, error prevention, and reward.
  Do not use motion only to fill time.
- Keep ordinary transitions around 150-250ms. Larger result reveal or gauge
  motion can be 500-800ms when it communicates completion.
- Respect reduced-motion settings by pausing Lottie loops or using a still
  frame/crossfade.

Use motion for:

- Detection progress.
- Result reveal.
- AI signal gauge reveal.
- Score increments.
- Correct/incorrect game feedback.
- Pull-to-refresh or lightweight transitions.

Use haptics for:

- Game answer selected.
- Result completed.
- Error/invalid submission.

Avoid constant ambient animation. It will make the app feel less serious.

Implementation rules:

- Use `lottie-react-native` for branded loader/completion animations.
- Use Reanimated for interactive UI state: press feedback, result reveal, game
  answer feedback, progress sweeps, and gauge fill movement.
- Animate transform and opacity by default. Avoid animating width, height,
  margins, or layout-heavy properties.
- Keep Lottie JSON assets local. Do not load animation JSON from a remote URL in
  the app.

## Copy Rules

- Use probability language, not proof language.
- Avoid saying "This video is fake" as an absolute claim.
- Public app copy must be usable by non-technical users. Avoid backend,
  API, Supabase, metadata, payload, job, model, detector, source type,
  time-window, ELO, and environment/configuration wording in user-facing
  screens, result text, errors, game copy, and public website copy.
- Prefer plain nouns and verbs:
  - "check" instead of "analyze" when describing the user action
  - "video link" or "link" instead of "URL"
  - "video details" instead of "metadata"
  - "result" or "saved result" instead of "job" or "scan metadata"
  - "VigilVid estimate" instead of "model prediction"
  - "moments to review" or "video part" instead of "time windows" or
    "analysis segment"
  - "saved result" or "History" instead of "stored metadata"
- Technical implementation terms are allowed in developer docs, API contracts,
  internal variable names, and logs, but not in copy a normal app user sees.
- Preferred wording:
  - "Fake"
  - "Partially fake"
  - "Partially real"
  - "Real"
  - "Low AI signal"
  - "VigilVid found stronger signals in these moments"
  - "This result is an estimate, not proof"

## Accessibility

- Do not rely only on color for verdict.
- Buttons must have clear text labels.
- Keep contrast high on status chips.
- Avoid tiny controls in the game.
- Ensure text wraps cleanly on small Android screens.
- Respect font scaling by using React Native text sizing normally, not fixed
  image text.
- Progress, result, and gauge components should expose text alternatives such as
  "AI signal 68 percent".
