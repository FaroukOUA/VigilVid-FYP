# VigilVid Skills Plan

## Policy

Install core skills during the future setup session before scaffolding major code. Do not install new skills casually during feature work unless they directly support the current task.

## Core Skills To Install

### React Native / Expo Best Practices

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-native-skills
```

Use for:

- React Native performance
- Expo app structure
- animations
- navigation
- native modules

### Expo Native UI

```bash
npx skills add https://github.com/expo/skills --skill building-native-ui
```

Use for:

- Expo Router conventions
- native navigation patterns
- safe areas
- platform UI behavior
- mobile-first component decisions

### Expo NativeWind / Tailwind Setup

```bash
npx skills add https://github.com/expo/skills --skill expo-tailwind-setup
```

Status: installed for future reference, but NativeWind app setup is deferred for now. The current implementation should use plain React Native `StyleSheet` and shared theme tokens until the UI scale justifies adding NativeWind.

Use later for:

- NativeWind setup
- Tailwind/React Native styling rules
- CSS/native styling compatibility

### Expo Networking

```bash
npx skills add https://github.com/expo/skills --skill native-data-fetching
```

Use for:

- API calls
- network error handling
- upload/polling behavior
- auth headers
- offline/slow-network patterns

### Supabase

```bash
npx skills add https://github.com/supabase/agent-skills --skill supabase
```

Use for:

- Supabase Auth
- Postgres schema
- Row Level Security
- Storage decisions
- migrations
- security checks

### Frontend Design

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

Status: installed and used as the main UI direction skill.

Use for:

- distinctive visual direction
- polished UI composition
- motion and interaction choices
- avoiding generic AI-looking UI

### Impeccable / Delight

```bash
npx skills add https://github.com/pbakaus/impeccable --skill impeccable
```

Status: installed. This package contains the Delight guidance used for
micro-interactions, friendly loading states, and joyful polish.

Use for:

- small moments of delight that support usability
- mascot and loading-state polish
- success, empty, and feedback states
- keeping playful UI appropriate for the trust/safety domain

### Copywriting

```bash
npx skills add https://github.com/coreyhaines31/marketingskills --skill copywriting
```

Status: installed.

Use for:

- public website copy
- visitor-facing CTA wording
- rewriting technical language into normal user language
- keeping claims honest and probability-based

### Web Design Guidelines

```bash
npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
```

Status: installed.

Use for:

- web UI/accessibility review
- spacing, typography, and interaction checks
- final website polish before deployment

## Optional Later Skills

### Test-Driven Development

```bash
npx skills add https://github.com/obra/superpowers --skill test-driven-development
```

Use when:

- adding core business logic
- changing API parsing
- implementing game scoring/ELO
- adding privacy-sensitive behavior

## Usage Rules

- Read the installed skill instructions before applying a skill.
- Prefer official or high-install skills.
- Use skills to guide implementation, not to override `AGENTS.md` or project docs.
- If skill guidance conflicts with VigilVid docs, update the docs intentionally before changing code patterns.
