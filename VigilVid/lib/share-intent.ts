import type { ShareIntent, ShareIntentFile } from "expo-share-intent";

export type ResolvedSharedSource =
  | {
      kind: "url";
      url: string;
      displayText: string;
    }
  | {
      kind: "video-file";
      file: ShareIntentFile;
      displayText: string;
    }
  | {
      kind: "unsupported";
      displayText: string;
    };

export function resolveSharedSource(
  shareIntent: ShareIntent,
): ResolvedSharedSource {
  const sharedUrl = getSharedUrl(shareIntent);

  if (sharedUrl) {
    return {
      kind: "url",
      url: sharedUrl,
      displayText: sharedUrl,
    };
  }

  const firstVideoFile = shareIntent.files?.find((file) =>
    file.mimeType?.startsWith("video/"),
  );

  if (firstVideoFile) {
    return {
      kind: "video-file",
      file: firstVideoFile,
      displayText: firstVideoFile.fileName || firstVideoFile.path,
    };
  }

  const firstFile = shareIntent.files?.[0];
  if (firstFile) {
    return {
      kind: "unsupported",
      displayText: firstFile.fileName || firstFile.path,
    };
  }

  if (shareIntent.text) {
    return {
      kind: "unsupported",
      displayText: shareIntent.text,
    };
  }

  return {
    kind: "unsupported",
    displayText: "No video link was found in what you shared.",
  };
}

export function isHttpUrl(value: string) {
  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

function getSharedUrl(shareIntent: ShareIntent) {
  if (shareIntent.webUrl && isHttpUrl(shareIntent.webUrl)) {
    return shareIntent.webUrl;
  }

  if (!shareIntent.text) {
    return null;
  }

  const matches = shareIntent.text.match(/\bhttps?:\/\/[^\s<>"']+/gi) ?? [];

  for (const match of matches) {
    const candidate = match.replace(/[),.;\]]+$/, "");
    if (isHttpUrl(candidate)) {
      return candidate;
    }
  }

  return null;
}
