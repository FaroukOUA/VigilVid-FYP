export const colors = {
  background: "#F7FBF8",
  surface: "#FFFFFF",
  surfaceMuted: "#EAF7F3",
  surfaceRaised: "#FDFEFE",
  textPrimary: "#0B1F24",
  textSecondary: "#52656B",
  border: "#D7E5E0",
  primaryTeal: "#0E7C73",
  primaryTealDark: "#075E58",
  analysisBlue: "#2563EB",
  signalAqua: "#22C7A9",
  rewardMango: "#F6B84B",
  gameAccent: "#7C3AED",
  gameAccentMuted: "#EDE9FE",
  likelyReal: "#137D43",
  likelyRealMuted: "#DCFCE7",
  partiallyReal: "#365314",
  partiallyRealMuted: "#ECFCCB",
  partiallyFake: "#7C2D12",
  partiallyFakeMuted: "#FFEDD5",
  uncertain: "#B45309",
  uncertainMuted: "#FEF3C7",
  likelyAi: "#D92D20",
  likelyAiMuted: "#FEE2E2",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 12,
  lg: 16,
} as const;

export const typography = {
  screenTitle: {
    fontSize: 28,
    lineHeight: 34,
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  help: {
    fontSize: 13,
    lineHeight: 19,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
} as const;
