export type EducationTopic = {
  accentColor: string;
  category: string;
  id: string;
  keyPoints: string[];
  summary: string;
  title: string;
};

export const educationTopics: EducationTopic[] = [
  {
    accentColor: "#2563EB",
    category: "Spot",
    id: "spotting-deepfakes",
    keyPoints: [
      "Check whether trusted websites or news reports say the same thing before sharing.",
      "Look for mismatched lighting, blurred edges, odd lip sync, or unstable details across frames.",
      "Treat one suspicious clue as a reason to verify, not as proof.",
      "Use VigilVid as one clue alongside trusted websites and news reports.",
    ],
    summary: "Practical checks to slow down before trusting or forwarding a clip.",
    title: "How to spot suspicious videos",
  },
  {
    accentColor: "#0F766E",
    category: "Basics",
    id: "synthetic-media-basics",
    keyPoints: [
      "AI-made media can be fully generated, edited, translated, face-swapped, or voice-cloned.",
      "Real videos can still be misleading when context, captions, or timing are changed.",
      "Generation tools improve quickly, so visible artifacts are becoming less reliable.",
      "The safest habit is to verify where the video came from and what it claims.",
    ],
    summary: "A short explanation of AI-made media in daily feeds.",
    title: "AI-made media basics",
  },
  {
    accentColor: "#F59E0B",
    category: "Malaysia",
    id: "malaysian-legal-context",
    keyPoints: [
      "Malaysia does not treat every edited video the same way; context and harm matter.",
      "Online posts may raise Communications and Multimedia Act 1998 issues when they involve improper network use.",
      "Some cases can also involve Penal Code offences such as cheating, threats, harassment, or impersonation.",
      "This app gives media-literacy guidance only, not legal advice.",
    ],
    summary: "Where harmful fake media may fit in Malaysian legal and reporting contexts.",
    title: "Malaysian legal context",
  },
  {
    accentColor: "#DC2626",
    category: "Risk",
    id: "social-risk",
    keyPoints: [
      "Fake clips can damage reputations faster than corrections can spread.",
      "Political, disaster, celebrity, and conflict videos are common high-risk contexts.",
      "Sharing privately can still amplify harm if the clip reaches a wider group later.",
      "When unsure, save the link, check who posted it, and avoid forwarding immediately.",
    ],
    summary: "Why a convincing fake can still cause real-world damage.",
    title: "Social risks of fake content",
  },
  {
    accentColor: "#0F766E",
    category: "Guide",
    id: "how-vigilvid-works",
    keyPoints: [
      "VigilVid checks the video safely and keeps private settings out of the app.",
      "The result is an estimate with moments that deserve review.",
      "A high AI signal means VigilVid found patterns linked to fake or edited media, not proof.",
      "Feedback can help improve future checks without saving videos in History.",
    ],
    summary: "What a VigilVid result can and cannot say.",
    title: "How VigilVid works",
  },
];
