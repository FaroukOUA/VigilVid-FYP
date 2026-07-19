import type { DetectionSourceType } from "./detection";

export type PreparedVideoSource = {
  sourceType: DetectionSourceType;
  url: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  previewId: string;
  thumbnailStripUrl: string;
  trimStartSec: number | null;
  trimEndSec: number | null;
};

export type VideoValidation = {
  canAnalyze: boolean;
  issues: string[];
  notices: string[];
};

export type VideoPreviewRequest = {
  url: string;
  sourceType: "url" | "share";
};

export type UploadVideoPreviewRequest = {
  fileUri: string;
  fileName: string;
  mimeType: string;
  sourceType: "upload" | "share";
};

export type VideoPreviewResponse = {
  previewId: string;
  sourceType: DetectionSourceType;
  originalUrl: string;
  durationMs: number;
  fileSizeBytes: number;
  width: number | null;
  height: number | null;
  contentType: string;
  thumbnailStripUrl: string | null;
  requiresTrim: boolean;
  maxSegmentDurationMs: number;
  canAnalyze: boolean;
  issues: string[];
};
