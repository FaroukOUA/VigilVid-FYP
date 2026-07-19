import type { DetectionSourceType } from "../types/detection";
import type { PreparedVideoSource, VideoValidation } from "../types/video";
import { isHttpUrl } from "./share-intent";

export const MAX_VIDEO_DURATION_MS = 120_000;
export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;

type ParamValue = string | string[] | undefined;

export function firstParam(value: ParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function parsePreparedVideoSource(params: {
  durationMs?: ParamValue;
  fileName?: ParamValue;
  fileSizeBytes?: ParamValue;
  fileUri?: ParamValue;
  height?: ParamValue;
  mimeType?: ParamValue;
  previewId?: ParamValue;
  sourceType?: ParamValue;
  thumbnailStripUrl?: ParamValue;
  trimEndSec?: ParamValue;
  trimStartSec?: ParamValue;
  url?: ParamValue;
  width?: ParamValue;
}): PreparedVideoSource {
  const sourceTypeParam = firstParam(params.sourceType);
  const sourceType: DetectionSourceType =
    sourceTypeParam === "share" || sourceTypeParam === "upload"
      ? sourceTypeParam
      : "url";

  return {
    sourceType,
    url: firstParam(params.url)?.trim() ?? "",
    fileUri: firstParam(params.fileUri)?.trim() ?? "",
    fileName: firstParam(params.fileName)?.trim() ?? "",
    mimeType: firstParam(params.mimeType)?.trim() ?? "",
    fileSizeBytes: parseNullableNumber(firstParam(params.fileSizeBytes)),
    durationMs: parseNullableNumber(firstParam(params.durationMs)),
    width: parseNullableNumber(firstParam(params.width)),
    height: parseNullableNumber(firstParam(params.height)),
    previewId: firstParam(params.previewId)?.trim() ?? "",
    thumbnailStripUrl: firstParam(params.thumbnailStripUrl)?.trim() ?? "",
    trimStartSec: parseNullableNumber(firstParam(params.trimStartSec)),
    trimEndSec: parseNullableNumber(firstParam(params.trimEndSec)),
  };
}

export function isFileBackedVideoSource(source: PreparedVideoSource) {
  return source.sourceType === "upload" || Boolean(source.fileUri);
}

export function getFileBackedSourceType(
  source: PreparedVideoSource,
): "upload" | "share" {
  return source.sourceType === "share" ? "share" : "upload";
}

export function getUrlBackedSourceType(
  source: PreparedVideoSource,
): "url" | "share" {
  return source.sourceType === "share" ? "share" : "url";
}

export function validatePreparedVideoSource(
  source: PreparedVideoSource,
): VideoValidation {
  const issues: string[] = [];
  const notices: string[] = [];

  if (isFileBackedVideoSource(source)) {
    if (!source.fileUri) {
      issues.push("Choose a video from your phone.");
    }

    if (source.mimeType && !source.mimeType.startsWith("video/")) {
      issues.push("Choose a video file.");
    }

    if (
      source.fileSizeBytes !== null &&
      source.fileSizeBytes > MAX_VIDEO_SIZE_BYTES
    ) {
      issues.push("This video is larger than 100 MB.");
    }

    if (
      source.durationMs !== null &&
      source.durationMs > MAX_VIDEO_DURATION_MS
    ) {
      notices.push(
        "This video is longer than 2 minutes. Choose a 2-minute part before checking.",
      );
    }

    if (source.previewId) {
      notices.push(
        "This video is ready. The selected part will be checked.",
      );
    } else {
      notices.push(
        "VigilVid will prepare a preview before checking. Length checks use your phone's video details when available.",
      );
    }

    return {
      canAnalyze: issues.length === 0,
      issues,
      notices,
    };
  }

  if (source.sourceType === "url" || source.sourceType === "share") {
    if (!isHttpUrl(source.url)) {
      issues.push("Paste a valid video link.");
    }

    if (source.previewId) {
      notices.push(
        "This link is ready. The selected part will be checked.",
      );
    } else {
      notices.push(
        "VigilVid needs to open the link before it can show the video length.",
      );
    }

    return {
      canAnalyze: issues.length === 0,
      issues,
      notices,
    };
  }

  return {
    canAnalyze: false,
    issues: ["Choose a video or paste a video link."],
    notices,
  };
}

export function formatBytes(bytes: number | null) {
  if (bytes === null) {
    return "Unknown";
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(ms: number | null) {
  if (ms === null) {
    return "Unknown";
  }

  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatDimensions(width: number | null, height: number | null) {
  if (width === null || height === null || width <= 0 || height <= 0) {
    return "Unknown";
  }

  return `${width} x ${height}`;
}

function parseNullableNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
