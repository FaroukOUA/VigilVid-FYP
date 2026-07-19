import type { VideoSource } from "expo-video";

export type GameAnswer = "real" | "ai";

export type SoloGameItem = {
  correctAnswer: GameAnswer;
  difficulty: "Warmup" | "Medium" | "Hard";
  durationSec: number;
  id: string;
  modelAiProbability: number;
  modelAnswer: GameAnswer;
  reveal: string;
  signalNotes: string[];
  sourceLabel: string;
  title: string;
  videoSource: VideoSource;
};

export const soloGameItems: SoloGameItem[] = [
  {
    correctAnswer: "real",
    difficulty: "Warmup",
    durationSec: 12,
    id: "vv-f5f74888b04c5e06",
    modelAiProbability: 0,
    modelAnswer: "real",
    reveal:
      "Answer: real. VigilVid saw almost no AI signal here.",
    signalNotes: [
      "This is a clearer real practice clip.",
      "Poor video quality can still make real clips look noisy.",
      "Your score uses the known answer for this practice clip.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 01",
    videoSource: require("../assets/game/mintvid_test/vv_f5f74888b04c5e06.mp4"),
  },
  {
    correctAnswer: "ai",
    difficulty: "Warmup",
    durationSec: 12,
    id: "vv-961ff48c1eff64be",
    modelAiProbability: 0.93,
    modelAnswer: "ai",
    reveal:
      "Answer: fake. VigilVid saw a high AI signal here.",
    signalNotes: [
      "This is a clearer fake practice clip.",
      "Look for unstable texture, edges, and small facial movements.",
      "VigilVid’s estimate matched the known answer here.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 02",
    videoSource: require("../assets/game/mintvid_test/vv_961ff48c1eff64be.mp4"),
  },
  {
    correctAnswer: "real",
    difficulty: "Medium",
    durationSec: 12,
    id: "vv-aa81629c64995b75",
    modelAiProbability: 0.216,
    modelAnswer: "real",
    reveal:
      "Answer: real. VigilVid saw a low AI signal here.",
    signalNotes: [
      "This real clip has enough video noise to feel less obvious.",
      "VigilVid still leaned toward real.",
      "Use motion consistency and scene coherence, not just visual quality.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 03",
    videoSource: require("../assets/game/mintvid_test/vv_aa81629c64995b75.mp4"),
  },
  {
    correctAnswer: "ai",
    difficulty: "Medium",
    durationSec: 12,
    id: "vv-36e2af2917cf9d67",
    modelAiProbability: 0.734,
    modelAnswer: "ai",
    reveal:
      "Answer: fake. VigilVid saw a strong AI signal here.",
    signalNotes: [
      "This fake face clip is not an extremely easy case.",
      "Watch whether facial motion, edges, and background timing stay linked.",
      "VigilVid leaned fake, but not with maximum confidence.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 04",
    videoSource: require("../assets/game/mintvid_test/vv_36e2af2917cf9d67.mp4"),
  },
  {
    correctAnswer: "real",
    difficulty: "Hard",
    durationSec: 12,
    id: "vv-e0f03ade4c33340a",
    modelAiProbability: 0.742,
    modelAnswer: "ai",
    reveal:
      "Answer: real. VigilVid saw a high AI signal, so this is a tricky clip.",
    signalNotes: [
      "This real clip can confuse automated checks.",
      "Real videos can show high AI signal when quality or motion is difficult.",
      "This is why results should be treated as estimates, not proof.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 05",
    videoSource: require("../assets/game/mintvid_test/vv_e0f03ade4c33340a.mp4"),
  },
  {
    correctAnswer: "ai",
    difficulty: "Hard",
    durationSec: 12,
    id: "vv-a4a92a6a6d37e5fb",
    modelAiProbability: 0.146,
    modelAnswer: "real",
    reveal:
      "Answer: fake. VigilVid saw a low AI signal, so this is a tricky clip.",
    signalNotes: [
      "This fake clip can confuse automated checks.",
      "Some fake videos can look realistic enough to pass a quick check.",
      "Hard clips are useful for comparing your judgement with VigilVid.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 06",
    videoSource: require("../assets/game/mintvid_test/vv_a4a92a6a6d37e5fb.mp4"),
  },
  {
    correctAnswer: "real",
    difficulty: "Warmup",
    durationSec: 12,
    id: "vv-8ef1c8a4b043d44e",
    modelAiProbability: 0.002,
    modelAnswer: "real",
    reveal:
      "Answer: real. VigilVid saw a very low AI signal here.",
    signalNotes: [
      "This is another clear real reference clip.",
      "Low AI signal does not mean perfect certainty.",
      "Use it as a baseline for natural motion and timing.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 07",
    videoSource: require("../assets/game/mintvid_test/vv_8ef1c8a4b043d44e.mp4"),
  },
  {
    correctAnswer: "ai",
    difficulty: "Warmup",
    durationSec: 12,
    id: "vv-6ffe12c23568b319",
    modelAiProbability: 1,
    modelAnswer: "ai",
    reveal:
      "Answer: fake. VigilVid saw the strongest AI signal here.",
    signalNotes: [
      "This is a strong fake reference clip.",
      "VigilVid was highly confident on this practice clip.",
      "Compare it with harder fake clips later in the round.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 08",
    videoSource: require("../assets/game/mintvid_test/vv_6ffe12c23568b319.mp4"),
  },
  {
    correctAnswer: "real",
    difficulty: "Medium",
    durationSec: 18,
    id: "vv-a5358ba96a17a81b",
    modelAiProbability: 0.301,
    modelAnswer: "real",
    reveal:
      "Answer: real. VigilVid saw a lower AI signal here.",
    signalNotes: [
      "This real clip is harder than the warmup clips.",
      "Do not confuse ordinary video noise with signs of a fake.",
      "VigilVid still leaned real.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 09",
    videoSource: require("../assets/game/mintvid_test/vv_a5358ba96a17a81b.mp4"),
  },
  {
    correctAnswer: "ai",
    difficulty: "Medium",
    durationSec: 12,
    id: "vv-5c708e20658cdff4",
    modelAiProbability: 0.781,
    modelAnswer: "ai",
    reveal:
      "Answer: fake. VigilVid saw a high AI signal here.",
    signalNotes: [
      "This fake clip is convincing but still raised strong signals.",
      "Watch for small inconsistencies in face detail and motion timing.",
      "Medium examples should be harder than simple obvious fakes.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 10",
    videoSource: require("../assets/game/mintvid_test/vv_5c708e20658cdff4.mp4"),
  },
  {
    correctAnswer: "real",
    difficulty: "Hard",
    durationSec: 12,
    id: "vv-29355e1754be8f0a",
    modelAiProbability: 0.439,
    modelAnswer: "real",
    reveal:
      "Answer: real. VigilVid saw a mixed AI signal here.",
    signalNotes: [
      "This real clip is hard to judge.",
      "Hard real clips show why the result is only a clue.",
      "Look for whether the whole scene remains coherent over time.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 11",
    videoSource: require("../assets/game/mintvid_test/vv_29355e1754be8f0a.mp4"),
  },
  {
    correctAnswer: "ai",
    difficulty: "Hard",
    durationSec: 18,
    id: "vv-8d164291fd6c5362",
    modelAiProbability: 0.41,
    modelAnswer: "real",
    reveal:
      "Answer: fake. VigilVid saw a mixed-low AI signal here.",
    signalNotes: [
      "This fake clip is hard to judge.",
      "It is a useful clip for comparing your judgement with VigilVid.",
      "A lower AI signal does not guarantee that a clip is real.",
    ],
    sourceLabel: "Practice clip",
    title: "Practice clip 12",
    videoSource: require("../assets/game/mintvid_test/vv_8d164291fd6c5362.mp4"),
  },
];
