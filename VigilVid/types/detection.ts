export type DetectionStatus = "queued" | "processing" | "completed" | "failed";

export type DetectionLabel =
  | "real"
  | "partially_real"
  | "partially_fake"
  | "fake";

export type DetectionSourceType = "url" | "upload" | "share";

export type DetectionWindow = {
  startSec: number;
  endSec: number;
  fakeProbability: number;
};

export type DetectionResult = {
  detectionId: string;
  status: "completed";
  label: DetectionLabel;
  aiProbability: number;
  confidencePercent: number;
  processingTimeSec: number;
  videoDurationSec: number;
  thumbnailStripUrl?: string | null;
  windows: DetectionWindow[];
  explanation: string;
  sourceType: DetectionSourceType;
};

export type DetectionUrlCreateRequest = {
  url: string;
  sourceType: "url" | "share";
};

export type DetectionUploadCreateRequest = {
  fileUri: string;
  fileName: string;
  mimeType: string;
  sourceType: "upload" | "share";
  trimStartSec?: number;
  trimEndSec?: number;
};

export type DetectionPreviewCreateRequest = {
  previewId: string;
  sourceType: DetectionSourceType;
  trimStartSec: number;
  trimEndSec: number;
};

export type DetectionCreateRequest =
  | DetectionUrlCreateRequest
  | DetectionUploadCreateRequest
  | DetectionPreviewCreateRequest;

export type DetectionCreateResponse = {
  detectionId: string;
  status: "queued";
};

export type DetectionHistoryItem = {
  detectionId: string;
  sourceType: DetectionSourceType;
  label: DetectionLabel;
  aiProbability: number;
  confidencePercent: number;
  processingTimeSec: number | null;
  videoDurationSec: number | null;
  createdAt: string;
};

export type DetectionHistoryResponse = {
  items: DetectionHistoryItem[];
};

export type DetectionProgressState = {
  detectionId: string;
  status: "queued" | "processing";
  progressMessage?: string;
};

export type DetectionFailedState = {
  detectionId: string;
  status: "failed";
  errorCode: string;
  message: string;
};

export type DetectionState =
  | DetectionProgressState
  | DetectionResult
  | DetectionFailedState;
