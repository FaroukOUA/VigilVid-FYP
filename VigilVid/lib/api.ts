import type {
  DetectionCreateRequest,
  DetectionCreateResponse,
  DetectionFeedbackRequest,
  DetectionFeedbackResponse,
  DetectionHistoryResponse,
  DetectionState,
  DetectionUploadCreateRequest,
} from "../types/detection";
import type {
  GameClipsResponse,
  GameScoreSyncRequest,
  GameScoreSyncResponse,
} from "../types/game";
import type {
  UploadVideoPreviewRequest,
  VideoPreviewRequest,
  VideoPreviewResponse,
} from "../types/video";

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

const missingApiBaseUrlMessage =
  "VigilVid is not connected yet. Please try again later.";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export function getVideoPreviewVideoUrl(previewId: string) {
  assertApiBaseUrl();

  return `${apiBaseUrl}/api/video-previews/${encodeURIComponent(
    previewId,
  )}/video.mp4`;
}

export function getVideoPreviewWindowClipUrl(
  previewId: string,
  startSec: number,
  endSec: number,
) {
  assertApiBaseUrl();

  const startParam = encodeURIComponent(startSec.toFixed(3));
  const endParam = encodeURIComponent(endSec.toFixed(3));

  return `${apiBaseUrl}/api/video-previews/${encodeURIComponent(
    previewId,
  )}/window-clip.mp4?startSec=${startParam}&endSec=${endParam}`;
}

export function getDetectionWindowClipUrl(
  detectionId: string,
  startSec: number,
  endSec: number,
) {
  assertApiBaseUrl();

  const startParam = encodeURIComponent(startSec.toFixed(3));
  const endParam = encodeURIComponent(endSec.toFixed(3));

  return `${apiBaseUrl}/api/detections/${encodeURIComponent(
    detectionId,
  )}/window-clip.mp4?startSec=${startParam}&endSec=${endParam}`;
}

export async function createDetection(
  request: DetectionCreateRequest,
  signal?: AbortSignal,
  idempotencyKey?: string,
  accessToken?: string,
) {
  if (isUploadRequest(request)) {
    const formData = new FormData();
    const file: ReactNativeFile = {
      name: request.fileName || "vigilvid-upload.mp4",
      type: request.mimeType || "video/mp4",
      uri: request.fileUri,
    };

    formData.append("sourceType", request.sourceType);
    if (request.trimStartSec !== undefined) {
      formData.append("trimStartSec", String(request.trimStartSec));
    }
    if (request.trimEndSec !== undefined) {
      formData.append("trimEndSec", String(request.trimEndSec));
    }
    formData.append("file", file as unknown as Blob);

    return fetchJson<DetectionCreateResponse>("/api/detections", {
      body: formData,
      headers: {
        ...getIdempotencyHeaders(idempotencyKey),
        ...getAuthHeaders(accessToken),
      },
      method: "POST",
      signal,
    });
  }

  return fetchJson<DetectionCreateResponse>("/api/detections", {
    body: JSON.stringify(request),
    headers: {
      "Content-Type": "application/json",
      ...getIdempotencyHeaders(idempotencyKey),
      ...getAuthHeaders(accessToken),
    },
    method: "POST",
    signal,
  });
}

function getIdempotencyHeaders(
  idempotencyKey: string | undefined,
): Record<string, string> {
  return idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {};
}

function getAuthHeaders(accessToken: string | undefined): Record<string, string> {
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

type ReactNativeFile = {
  name: string;
  type: string;
  uri: string;
};

function isUploadRequest(
  request: DetectionCreateRequest,
): request is DetectionUploadCreateRequest {
  return "fileUri" in request;
}

export async function getDetection(
  detectionId: string,
  signal?: AbortSignal,
) {
  return fetchJson<DetectionState>(
    `/api/detections/${encodeURIComponent(detectionId)}`,
    { signal },
  );
}

export async function submitDetectionFeedback(
  detectionId: string,
  request: DetectionFeedbackRequest,
  signal?: AbortSignal,
  accessToken?: string,
) {
  return fetchJson<DetectionFeedbackResponse>(
    `/api/detections/${encodeURIComponent(detectionId)}/feedback`,
    {
      body: JSON.stringify(request),
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(accessToken),
      },
      method: "POST",
      signal,
    },
  );
}

export async function getDetectionHistory(
  accessToken: string,
  signal?: AbortSignal,
) {
  return fetchJson<DetectionHistoryResponse>("/api/history", {
    headers: getAuthHeaders(accessToken),
    signal,
  });
}

export async function createVideoPreview(
  request: VideoPreviewRequest,
  signal?: AbortSignal,
) {
  return fetchJson<VideoPreviewResponse>("/api/video-previews", {
    body: JSON.stringify(request),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
}

export async function createUploadVideoPreview(
  request: UploadVideoPreviewRequest,
  signal?: AbortSignal,
) {
  const formData = new FormData();
  const file: ReactNativeFile = {
    name: request.fileName || "vigilvid-upload.mp4",
    type: request.mimeType || "video/mp4",
    uri: request.fileUri,
  };

  formData.append("sourceType", request.sourceType);
  formData.append("file", file as unknown as Blob);

  return fetchJson<VideoPreviewResponse>("/api/video-previews/upload", {
    body: formData,
    method: "POST",
    signal,
  });
}

export async function submitGameScore(
  request: GameScoreSyncRequest,
  accessToken: string,
  signal?: AbortSignal,
) {
  return fetchJson<GameScoreSyncResponse>("/api/game/scores", {
    body: JSON.stringify(request),
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(accessToken),
    },
    method: "POST",
    signal,
  });
}

export async function getGameClips(limit = 12, signal?: AbortSignal) {
  const searchParams = new URLSearchParams({ limit: String(limit) });
  return fetchJson<GameClipsResponse>(`/api/game/clips?${searchParams}`, {
    signal,
  });
}

async function fetchJson<T>(path: string, options: RequestInit = {}) {
  assertApiBaseUrl();

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, options);
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new ApiError(
      "VigilVid cannot connect right now. Check your internet connection and try again.",
      0,
    );
  }

  const json = await readJson(response);

  if (!response.ok) {
    throw new ApiError(getErrorMessage(json) ?? "Request failed.", response.status);
  }

  return json as T;
}

function assertApiBaseUrl() {
  if (!apiBaseUrl) {
    throw new ApiError(missingApiBaseUrlMessage, 0);
  }
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function getErrorMessage(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }

  const detail = value.detail;
  if (typeof detail === "string") {
    return detail;
  }

  const message = value.message;
  return typeof message === "string" ? message : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
