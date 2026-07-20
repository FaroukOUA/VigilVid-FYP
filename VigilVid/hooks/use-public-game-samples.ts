import { useCallback, useEffect, useState } from "react";

import {
  soloGameItems,
  type SoloGameItem,
} from "../data/game";
import { getGameClips } from "../lib/api";
import type { GameClipResponseItem } from "../types/game";

const GAME_ROUND_LIMIT = 12;
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
  const [errorMessage, setErrorMessage] = useState("");
  const [items, setItems] = useState<SoloGameItem[]>(fallbackGameItems);
  const [refreshKey, setRefreshKey] = useState(0);
  const [status, setStatus] = useState<GameSampleStatus>("loading");

  useEffect(() => {
    if (refreshKey === 0) {
      return undefined;
    }

    const controller = new AbortController();

    async function loadSamples() {
      setStatus("loading");
      setErrorMessage("");

      try {
        const response = await getGameClips(GAME_ROUND_LIMIT, controller.signal);
        const nextItems = response.items.map(toSoloGameItem);

        if (nextItems.length === 0) {
          throw new Error("No playable game clips are available right now.");
        }

        setItems(nextItems);
        setStatus("remote");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Could not load game clips.";

        setItems(fallbackGameItems);
        setErrorMessage(message);
        setStatus("fallback");
      }
    }

    void loadSamples();

    return () => controller.abort();
  }, [refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((currentKey) => currentKey + 1);
  }, []);

  return {
    errorMessage,
    items,
    refresh,
    status,
  };
}

function toSoloGameItem(item: GameClipResponseItem): SoloGameItem {
  return {
    correctAnswer: item.correctAnswer,
    difficulty: item.difficulty,
    durationSec: item.durationSec,
    id: item.id,
    modelAiProbability: item.modelAiProbability,
    modelAnswer: item.modelAnswer,
    reveal: item.reveal,
    signalNotes: item.signalNotes,
    sourceLabel: "",
    title: item.title,
    videoSource: {
      contentType: "progressive",
      uri: item.videoUrl,
      useCaching: true,
    },
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
