import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export type SoloGameProgress = {
  bestStreak: number;
  correctAnswers: number;
  highScore: number;
  lastPlayedAt: string | null;
  roundsPlayed: number;
};

export type SoloGameResult = {
  correctCount: number;
  score: number;
  streak: number;
  totalRounds: number;
};

const STORAGE_KEY = "vigilvid.solo-game-progress.v1";

const defaultProgress: SoloGameProgress = {
  bestStreak: 0,
  correctAnswers: 0,
  highScore: 0,
  lastPlayedAt: null,
  roundsPlayed: 0,
};

export function useSoloGameProgress() {
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [progress, setProgress] =
    useState<SoloGameProgress>(defaultProgress);

  useEffect(() => {
    let isActive = true;

    async function loadProgress() {
      try {
        const storedValue = await AsyncStorage.getItem(STORAGE_KEY);
        const parsedProgress = parseSoloGameProgress(storedValue);
        if (isActive) {
          setProgress(parsedProgress);
          setErrorMessage("");
        }
      } catch {
        if (isActive) {
          setErrorMessage("Solo game progress could not be loaded.");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProgress();

    return () => {
      isActive = false;
    };
  }, []);

  const recordGameResult = useCallback(
    async ({ correctCount, score, streak, totalRounds }: SoloGameResult) => {
      const nextProgress: SoloGameProgress = {
        bestStreak: Math.max(progress.bestStreak, streak),
        correctAnswers: progress.correctAnswers + correctCount,
        highScore: Math.max(progress.highScore, score),
        lastPlayedAt: new Date().toISOString(),
        roundsPlayed: progress.roundsPlayed + totalRounds,
      };

      setProgress(nextProgress);

      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextProgress));
        setErrorMessage("");
      } catch {
        setErrorMessage("Solo game progress could not be saved.");
      }
    },
    [progress],
  );

  return {
    errorMessage,
    isLoading,
    progress,
    recordGameResult,
  };
}

function parseSoloGameProgress(value: string | null): SoloGameProgress {
  if (!value) {
    return defaultProgress;
  }

  try {
    const parsed = JSON.parse(value) as Partial<SoloGameProgress>;
    return {
      bestStreak:
        typeof parsed.bestStreak === "number"
          ? parsed.bestStreak
          : defaultProgress.bestStreak,
      correctAnswers:
        typeof parsed.correctAnswers === "number"
          ? parsed.correctAnswers
          : defaultProgress.correctAnswers,
      highScore:
        typeof parsed.highScore === "number"
          ? parsed.highScore
          : defaultProgress.highScore,
      lastPlayedAt:
        typeof parsed.lastPlayedAt === "string"
          ? parsed.lastPlayedAt
          : defaultProgress.lastPlayedAt,
      roundsPlayed:
        typeof parsed.roundsPlayed === "number"
          ? parsed.roundsPlayed
          : defaultProgress.roundsPlayed,
    };
  } catch {
    return defaultProgress;
  }
}
