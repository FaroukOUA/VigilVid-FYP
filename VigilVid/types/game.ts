export type GameMode = "solo";

export type GameAnswer = "real" | "ai";

export type GameDifficulty = "Warmup" | "Medium" | "Hard";

export type GameScoreSyncRequest = {
  mode: GameMode;
  score: number;
  correctCount: number;
  totalRounds: number;
  bestStreak: number;
  roundIds: string[];
};

export type GameScoreSyncResponse = {
  ok: true;
};

export type GameClipResponseItem = {
  correctAnswer: GameAnswer;
  difficulty: GameDifficulty;
  durationSec: number;
  id: string;
  modelAiProbability: number;
  modelAnswer: GameAnswer;
  reveal: string;
  signalNotes: string[];
  title: string;
  videoUrl: string;
};

export type GameClipsResponse = {
  items: GameClipResponseItem[];
};
