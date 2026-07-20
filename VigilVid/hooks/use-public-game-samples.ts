import { useCallback } from "react";

import {
  soloGameItems,
  type SoloGameItem,
} from "../data/game";

const genericSignalNotes = [
  "Your score uses the known answer for this practice clip.",
  "VigilVid's estimate is shown only for comparison.",
  "Treat the estimate as a clue, not proof.",
];
const fallbackGameItems = soloGameItems.map((item, index) =>
  sanitizeGameItem(item, index),
);

type GameSampleStatus = "fallback" | "loading" | "remote";

export function usePublicGameSamples(): {
  errorMessage: string;
  items: SoloGameItem[];
  refresh: () => void;
  status: GameSampleStatus;
} {
  const refresh = useCallback(() => {}, []);

  return {
    errorMessage: "",
    items: fallbackGameItems,
    refresh,
    status: "fallback",
  };
}

function sanitizeGameItem(item: SoloGameItem, index: number): SoloGameItem {
  return {
    ...item,
    reveal: buildRevealText(item),
    signalNotes: genericSignalNotes,
    sourceLabel: "",
    title: `Clip ${index + 1}`,
  };
}

function buildRevealText(item: SoloGameItem) {
  return (
    `Answer: ${getAnswerLabel(item.correctAnswer)}. ` +
    `VigilVid estimated ${getAnswerLabel(item.modelAnswer)} with a ` +
    `${Math.round(item.modelAiProbability * 100)}% AI signal.`
  );
}

function getAnswerLabel(answer: SoloGameItem["correctAnswer"]) {
  return answer === "ai" ? "fake" : "real";
}
