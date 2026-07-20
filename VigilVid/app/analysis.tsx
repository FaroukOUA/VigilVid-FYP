import { useEvent } from "expo";
import * as Haptics from "expo-haptics";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { LayoutChangeEvent } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { AiProbabilityGauge } from "../components/ai-probability-gauge";
import { SignalLoader } from "../components/signal-loader";
import { VideoWindowTimeline } from "../components/video-window-timeline";
import { colors, radius, spacing } from "../constants/theme";
import {
  ApiError,
  createDetection,
  getDetection,
  getVideoPreviewVideoUrl,
} from "../lib/api";
import { detectRoute } from "../lib/routes";
import { useAuth } from "../hooks/use-auth";
import {
  firstParam,
  getFileBackedSourceType,
  getUrlBackedSourceType,
  isFileBackedVideoSource,
  parsePreparedVideoSource,
  validatePreparedVideoSource,
} from "../lib/video-source";
import type {
  DetectionCreateRequest,
  DetectionLabel,
  DetectionResult,
  DetectionWindow,
} from "../types/detection";

type AnalysisStatus = "processing" | "completed" | "failed";

const initialProgressMessage = "Preparing video";
const contentReportUrl = "https://sebenarnya.my/salur/";
const detectionPollIntervalMs = 1000;
const detectionMaxPollAttempts = 480;
const detectionCreateRetryLimit = 3;
const detectionPollTransientFailureLimit = 12;

const progressStages = [
  "Prepare selected part",
  "Check video",
] as const;

function getLabelText(label: DetectionLabel) {
  switch (label) {
    case "real":
      return "Real";
    case "partially_real":
      return "Partially real";
    case "partially_fake":
      return "Partially fake";
    case "fake":
      return "Fake";
  }
}

function getLabelColor(label: DetectionLabel) {
  switch (label) {
    case "real":
      return colors.likelyReal;
    case "partially_real":
      return colors.partiallyReal;
    case "partially_fake":
      return colors.partiallyFake;
    case "fake":
      return colors.likelyAi;
  }
}

function getLabelBackgroundColor(label: DetectionLabel) {
  switch (label) {
    case "real":
      return colors.likelyRealMuted;
    case "partially_real":
      return colors.partiallyRealMuted;
    case "partially_fake":
      return colors.partiallyFakeMuted;
    case "fake":
      return colors.likelyAiMuted;
  }
}

function getProgressIndex(progressMessage: string) {
  return progressMessage === initialProgressMessage ? 0 : 1;
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);

    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        const error = new Error("Request was cancelled.");
        error.name = "AbortError";
        reject(error);
      },
      { once: true },
    );
  });
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isTransientApiError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return false;
  }

  return (
    error.status === 0 ||
    error.status === 408 ||
    error.status === 425 ||
    error.status === 429 ||
    (error.status >= 500 && error.status <= 599)
  );
}

function getReadableError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "VigilVid could not check this video. Try again.";
}

function getStableRequestKey(request: DetectionCreateRequest | null) {
  if (!request) {
    return "";
  }

  const value = JSON.stringify(request);
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `analysis-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function createDetectionWithRetry(
  request: DetectionCreateRequest,
  signal: AbortSignal,
  requestKey: string,
  accessToken: string | undefined,
): Promise<Awaited<ReturnType<typeof createDetection>>> {
  let lastError: unknown;

  for (let attempt = 0; attempt < detectionCreateRetryLimit; attempt += 1) {
    try {
      return await createDetection(request, signal, requestKey, accessToken);
    } catch (error) {
      if (isAbortError(error) || !isTransientApiError(error)) {
        throw error;
      }

      lastError = error;
      if (attempt === detectionCreateRetryLimit - 1) {
        break;
      }

      await wait(1200 + attempt * 900, signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}

function getShareMessage(result: DetectionResult) {
  return [
    "VigilVid video check",
    `Verdict: ${getLabelText(result.label)}`,
    `AI signal: ${result.confidencePercent}%`,
    `Checked in: ${result.processingTimeSec.toFixed(1)}s`,
    `Video length: ${result.videoDurationSec.toFixed(1)}s`,
    "This is an estimate, not proof.",
  ].join("\n");
}

function AnalysisProgressCard({
  elapsedSec,
  progressMessage,
  progressStep,
}: {
  elapsedSec: number;
  progressMessage: string;
  progressStep: number;
}) {
  const sweepProgress = useSharedValue(0);
  const [railWidth, setRailWidth] = useState(0);

  useEffect(() => {
    sweepProgress.value = 0;
    sweepProgress.value = withRepeat(
      withTiming(1, {
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
      }),
      -1,
      false,
    );

    return () => {
      cancelAnimation(sweepProgress);
    };
  }, [sweepProgress]);

  const sweepStyle = useAnimatedStyle(() => ({
    opacity: 0.58 + sweepProgress.value * 0.24,
    transform: [
      {
        translateX: -82 + sweepProgress.value * Math.max(railWidth + 164, 164),
      },
    ],
  }));

  const handleRailLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    setRailWidth((currentWidth) =>
      currentWidth === nextWidth ? currentWidth : nextWidth,
    );
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(220)}
      style={styles.progressCard}
    >
      <View style={styles.progressHeader}>
        <SignalLoader size={72} />
        <View style={styles.progressTextGroup}>
          <Text style={styles.sectionTitle}>Checking video</Text>
          <Text style={styles.statusText}>
            {getProgressStatusText(progressMessage)}
          </Text>
        </View>
        <View style={styles.elapsedPill}>
          <Text style={styles.elapsedLabel}>Elapsed</Text>
          <Text style={styles.elapsedValue}>{formatElapsedTime(elapsedSec)}</Text>
        </View>
      </View>

      <View onLayout={handleRailLayout} style={styles.scannerRail}>
        <Animated.View style={[styles.scannerSweep, sweepStyle]} />
      </View>

      <View style={styles.progressStepList}>
        {progressStages.map((label, index) => (
          <ProgressStepRow
            isActive={index === progressStep}
            isComplete={index < progressStep}
            key={label}
            label={label}
          />
        ))}
      </View>

      <Text style={styles.progressHint}>
        Keep the app open while VigilVid checks the selected part. Your result
        appears automatically.
      </Text>
    </Animated.View>
  );
}

function ProgressStepRow({
  isActive,
  isComplete,
  label,
}: {
  isActive: boolean;
  isComplete: boolean;
  label: string;
}) {
  return (
    <View style={styles.progressStepRow}>
      <View
        style={[
          styles.progressStepDot,
          isComplete && styles.progressStepDotComplete,
          isActive && styles.progressStepDotActive,
        ]}
      />
      <Text
        style={[
          styles.progressStepText,
          isComplete && styles.progressStepTextComplete,
          isActive && styles.progressStepTextActive,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function getProgressStatusText(message: string) {
  switch (message) {
    case "Preparing video":
      return "Preparing the selected part";
    case "Checking video":
    case "Calling Hugging Face detector":
      return "Checking the video";
    case "Analyzing visual windows":
      return "Checking the video";
    case "Calculating probability":
      return "Preparing your result";
    case "Preparing result":
    case "Normalizing model output":
      return "Preparing your result";
    default:
      return "Checking the video";
  }
}

function formatElapsedTime(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatSecondsLabel(seconds: number) {
  return `${Math.max(0, seconds).toFixed(1)}s`;
}

function formatWindowRange(timeWindow: DetectionWindow) {
  return `${formatSecondsLabel(timeWindow.startSec)} to ${formatSecondsLabel(
    timeWindow.endSec,
  )}`;
}

function getVideoAspectRatio(width: number | null, height: number | null) {
  if (width === null || height === null || width <= 0 || height <= 0) {
    return 16 / 9;
  }

  return clampNumber(width / height, 0.42, 2.4);
}

function getWindowPreviewSize({
  aspectRatio,
  screenHeight,
  screenWidth,
}: {
  aspectRatio: number;
  screenHeight: number;
  screenWidth: number;
}) {
  const modalHorizontalPadding = spacing.lg * 4;
  const modalVerticalReserve = 260;
  const maxWidth = Math.max(
    220,
    Math.min(488, screenWidth - modalHorizontalPadding),
  );
  const maxHeight = Math.max(180, screenHeight - modalVerticalReserve);
  let width = maxWidth;
  let height = width / aspectRatio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }

  return {
    height,
    width,
  };
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function WindowVideoPreview({
  endSec,
  height,
  nativeControls,
  startSec,
  uri,
  width,
}: {
  endSec: number;
  height: number;
  nativeControls: boolean;
  startSec: number;
  uri: string;
  width: number;
}) {
  const player = useVideoPlayer(
    {
      contentType: "progressive",
      uri,
      useCaching: uri.startsWith("http"),
    },
    (videoPlayer) => {
      videoPlayer.loop = false;
      videoPlayer.currentTime = startSec;
    },
  );
  const { error, status } = useEvent(player, "statusChange", {
    error: undefined,
    status: player.status,
  });

  useEffect(() => {
    player.currentTime = startSec;
    player.play();

    let didPauseAtWindowEnd = false;
    const interval = setInterval(() => {
      if (!didPauseAtWindowEnd && player.currentTime >= endSec) {
        didPauseAtWindowEnd = true;
        player.pause();
      }
    }, 250);

    return () => {
      clearInterval(interval);
    };
  }, [endSec, player, startSec]);

  return (
    <View style={[styles.windowPreviewFrame, { height, width }]}>
      <VideoView
        contentFit="contain"
        nativeControls={nativeControls}
        player={player}
        surfaceType="textureView"
        style={styles.windowPreviewVideo}
        useExoShutter={false}
      />
      {status === "loading" ? (
        <View style={styles.windowPreviewOverlay}>
          <Text style={styles.windowPreviewOverlayText}>Preparing preview...</Text>
        </View>
      ) : null}
      {status === "error" ? (
        <View style={styles.windowPreviewOverlay}>
          <Text selectable style={styles.windowPreviewOverlayText}>
            {error?.message || "This moment could not be played. Try again."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function WindowPreviewModal({
  fallbackVideoUri,
  onClose,
  previewId,
  selectedWindow,
  trimStartSec,
  videoAspectRatio,
}: {
  fallbackVideoUri: string;
  onClose: () => void;
  previewId: string;
  selectedWindow: DetectionWindow | null;
  trimStartSec: number;
  videoAspectRatio: number;
}) {
  const windowDimensions = useWindowDimensions();

  if (!selectedWindow) {
    return null;
  }

  const previewSize = getWindowPreviewSize({
    aspectRatio: videoAspectRatio,
    screenHeight: windowDimensions.height,
    screenWidth: windowDimensions.width,
  });
  const sourceStartSec = Math.max(0, trimStartSec + selectedWindow.startSec);
  const sourceEndSec = Math.max(
    sourceStartSec + 0.5,
    trimStartSec + selectedWindow.endSec,
  );
  const videoUri = previewId
    ? getVideoPreviewVideoUrl(previewId)
    : fallbackVideoUri;
  const playbackStartSec = sourceStartSec;
  const playbackEndSec = sourceEndSec;

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={Boolean(selectedWindow)}
    >
      <View style={styles.modalBackdrop}>
        <Pressable
          accessibilityLabel="Close moment preview"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.windowModalCard}>
          <View style={styles.windowModalHeader}>
            <View style={styles.windowModalTitleGroup}>
              <Text style={styles.sectionTitle}>
                {formatWindowRange(selectedWindow)}
              </Text>
            </View>
            <View style={styles.windowProbabilityPill}>
              <Text
                style={[
                  styles.windowProbabilityPillText,
                  { color: getLabelColor(getWindowLabel(selectedWindow)) },
                ]}
              >
                {Math.round(selectedWindow.fakeProbability * 100)}%
              </Text>
            </View>
          </View>

          {videoUri ? (
            <WindowVideoPreview
              endSec={playbackEndSec}
              height={previewSize.height}
              key={`${videoUri}-${playbackStartSec}-${playbackEndSec}`}
              nativeControls
              startSec={playbackStartSec}
              uri={videoUri}
              width={previewSize.width}
            />
          ) : (
            <View style={styles.windowPreviewUnavailable}>
              <Text selectable style={styles.windowPreviewUnavailableText}>
                This preview is unavailable. Go back and check the video again
                to create a fresh preview.
              </Text>
            </View>
          )}

          {videoUri ? (
            <Text selectable style={styles.resultSource}>
              Video time: {formatSecondsLabel(sourceStartSec)} to{" "}
              {formatSecondsLabel(sourceEndSec)}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Close preview</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function getWindowLabel(timeWindow: DetectionWindow): DetectionLabel {
  if (timeWindow.fakeProbability >= 0.75) {
    return "fake";
  }

  if (timeWindow.fakeProbability >= 0.5) {
    return "partially_fake";
  }

  if (timeWindow.fakeProbability >= 0.25) {
    return "partially_real";
  }

  return "real";
}

export default function AnalysisScreen() {
  const params = useLocalSearchParams<{
    analysisRequestId?: string | string[];
    durationMs?: string | string[];
    fileName?: string | string[];
    fileSizeBytes?: string | string[];
    fileUri?: string | string[];
    height?: string | string[];
    mimeType?: string | string[];
    previewId?: string | string[];
    sourceType?: string | string[];
    thumbnailStripUrl?: string | string[];
    trimEndSec?: string | string[];
    trimStartSec?: string | string[];
    url?: string | string[];
    width?: string | string[];
  }>();
  const analysisRequestIdParam = firstParam(params.analysisRequestId);
  const durationMsParam = firstParam(params.durationMs);
  const fileNameParam = firstParam(params.fileName);
  const fileSizeBytesParam = firstParam(params.fileSizeBytes);
  const fileUriParam = firstParam(params.fileUri);
  const heightParam = firstParam(params.height);
  const mimeTypeParam = firstParam(params.mimeType);
  const previewIdParam = firstParam(params.previewId);
  const sourceTypeParam = firstParam(params.sourceType);
  const thumbnailStripUrlParam = firstParam(params.thumbnailStripUrl);
  const trimEndSecParam = firstParam(params.trimEndSec);
  const trimStartSecParam = firstParam(params.trimStartSec);
  const urlParam = firstParam(params.url);
  const widthParam = firstParam(params.width);
  const source = useMemo(
    () =>
      parsePreparedVideoSource({
        durationMs: durationMsParam,
        fileName: fileNameParam,
        fileSizeBytes: fileSizeBytesParam,
        fileUri: fileUriParam,
        height: heightParam,
        mimeType: mimeTypeParam,
        previewId: previewIdParam,
        sourceType: sourceTypeParam,
        thumbnailStripUrl: thumbnailStripUrlParam,
        trimEndSec: trimEndSecParam,
        trimStartSec: trimStartSecParam,
        url: urlParam,
        width: widthParam,
      }),
    [
      durationMsParam,
      fileNameParam,
      fileSizeBytesParam,
      fileUriParam,
      heightParam,
      mimeTypeParam,
      previewIdParam,
      sourceTypeParam,
      thumbnailStripUrlParam,
      trimEndSecParam,
      trimStartSecParam,
      urlParam,
      widthParam,
    ],
  );
  const validation = useMemo(
    () => validatePreparedVideoSource(source),
    [source],
  );
  const { isLoading: isAuthLoading, session } = useAuth();
  const accessToken = session?.access_token;
  const isFileBacked = isFileBackedVideoSource(source);
  const sourceDescription =
    isFileBacked
      ? source.fileName || source.fileUri
      : source.url;
  const fallbackVideoUri = isFileBacked ? source.fileUri : "";
  const videoAspectRatio = getVideoAspectRatio(source.width, source.height);

  const [analysisStatus, setAnalysisStatus] =
    useState<AnalysisStatus>("processing");
  const [progressMessage, setProgressMessage] = useState<string>(
    initialProgressMessage,
  );
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedWindow, setSelectedWindow] =
    useState<DetectionWindow | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const hasValidRequest = validation.canAnalyze;
  const detectionRequest = useMemo<DetectionCreateRequest | null>(() => {
    if (!hasValidRequest) {
      return null;
    }

    if (source.previewId) {
      return {
        previewId: source.previewId,
        sourceType: source.sourceType,
        trimEndSec:
          source.trimEndSec ??
          Math.min((source.durationMs ?? 0) / 1000, 120),
        trimStartSec: source.trimStartSec ?? 0,
      };
    }

    if (isFileBacked) {
      return {
        fileName: source.fileName || "vigilvid-upload.mp4",
        fileUri: source.fileUri,
        mimeType: source.mimeType || "video/mp4",
        sourceType: getFileBackedSourceType(source),
        trimEndSec: source.trimEndSec ?? undefined,
        trimStartSec: source.trimStartSec ?? undefined,
      };
    }

    return {
      sourceType: getUrlBackedSourceType(source),
      url: source.url,
    };
  }, [
    hasValidRequest,
    isFileBacked,
    source,
  ]);
  const requestKey = useMemo(
    () => analysisRequestIdParam || getStableRequestKey(detectionRequest),
    [analysisRequestIdParam, detectionRequest],
  );
  const startedRequestKeyRef = useRef("");

  useEffect(() => {
    if (!detectionRequest || !requestKey) {
      startedRequestKeyRef.current = "";
      return;
    }

    if (isAuthLoading) {
      return;
    }

    if (startedRequestKeyRef.current === requestKey) {
      return;
    }

    const request = detectionRequest;
    startedRequestKeyRef.current = requestKey;
    let isActive = true;
    const controller = new AbortController();

    async function runDetection() {
      setAnalysisStatus("processing");
      setProgressMessage(initialProgressMessage);
      setResult(null);
      setErrorMessage("");
      setSelectedWindow(null);
      setElapsedSec(0);

      try {
        const created = await createDetectionWithRetry(
          request,
          controller.signal,
          requestKey,
          accessToken,
        );

        if (!isActive) {
          return;
        }

        let transientPollFailures = 0;

        for (let attempt = 0; attempt < detectionMaxPollAttempts; attempt += 1) {
          let state;

          try {
            state = await getDetection(created.detectionId, controller.signal);
            transientPollFailures = 0;
          } catch (pollError) {
            if (isAbortError(pollError)) {
              throw pollError;
            }

            if (
              isTransientApiError(pollError) &&
              transientPollFailures < detectionPollTransientFailureLimit
            ) {
              transientPollFailures += 1;
              setProgressMessage("Still checking video");
              await wait(
                Math.min(4000, detectionPollIntervalMs + transientPollFailures * 350),
                controller.signal,
              );
              continue;
            }

            throw pollError;
          }

          if (!isActive) {
            return;
          }

          if (state.status === "completed") {
            setResult(state);
            setAnalysisStatus("completed");
            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            );
            return;
          }

          if (state.status === "failed") {
            setErrorMessage(state.message);
            setAnalysisStatus("failed");
            void Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Error,
            );
            return;
          }

          setProgressMessage(state.progressMessage ?? initialProgressMessage);
          await wait(detectionPollIntervalMs, controller.signal);
        }

        throw new Error(
          "Checking is taking longer than expected. Try again with a shorter part.",
        );
      } catch (error) {
        if (!isActive || isAbortError(error)) {
          return;
        }

        setErrorMessage(getReadableError(error));
        setAnalysisStatus("failed");
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }

    void runDetection();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [accessToken, detectionRequest, isAuthLoading, requestKey]);

  const progressStep = getProgressIndex(progressMessage);

  useEffect(() => {
    if (!hasValidRequest || analysisStatus !== "processing") {
      return undefined;
    }

    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [analysisStatus, hasValidRequest, requestKey]);

  const handleShareResultPress = async () => {
    if (!result) {
      return;
    }

    try {
      await Share.share({
        message: getShareMessage(result),
      });
    } catch (error) {
      Alert.alert(
        "Could not share result",
        error instanceof Error ? error.message : "Try again later.",
      );
    }
  };

  const handleReportIssuePress = async () => {
    try {
      await Linking.openURL(contentReportUrl);
    } catch (error) {
      Alert.alert(
        "Could not open report page",
        error instanceof Error ? error.message : "Try again later.",
      );
    }
  };

  const handleWindowPress = (timeWindow: DetectionWindow) => {
    setSelectedWindow(timeWindow);
    void Haptics.selectionAsync();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title:
            analysisStatus === "completed"
              ? "Result"
              : analysisStatus === "failed"
                ? "Check failed"
                : "Checking",
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        {!hasValidRequest ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>No video ready</Text>
            <Text selectable style={styles.body}>
              Go back and choose a video or paste a valid video link.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(detectRoute)}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Back</Text>
            </Pressable>
          </View>
        ) : null}

        {hasValidRequest && analysisStatus === "processing" ? (
          <AnalysisProgressCard
            elapsedSec={elapsedSec}
            progressMessage={progressMessage}
            progressStep={progressStep}
          />
        ) : null}

        {hasValidRequest && analysisStatus === "failed" ? (
          <Animated.View
            entering={FadeInUp.duration(240)}
            style={styles.card}
          >
            <Text style={styles.sectionTitle}>Could not check video</Text>
            <Text selectable style={styles.body}>
              {errorMessage}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(detectRoute)}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Back</Text>
            </Pressable>
          </Animated.View>
        ) : null}

        {result ? (
          <Animated.View
            entering={FadeInUp.duration(260)}
          style={styles.resultCard}
        >
          <View style={styles.resultHeader}>
              <AiProbabilityGauge
                label={result.label}
                probability={result.aiProbability}
              />
              <View style={styles.resultVerdictRow}>
                <View
                  style={[
                    styles.verdictChip,
                    {
                      backgroundColor: getLabelBackgroundColor(result.label),
                      borderColor: getLabelColor(result.label),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.verdictText,
                      { color: getLabelColor(result.label) },
                    ]}
                  >
                    {getLabelText(result.label)}
                  </Text>
                </View>
                <Text style={styles.resultVerdictHint}>
                  {result.confidencePercent}% AI signal
                </Text>
              </View>
            </View>

            <Text style={styles.body}>{result.explanation}</Text>

            <View style={styles.metadataGrid}>
              <View style={styles.metadataItem}>
                <Text style={styles.metadataLabel}>Checked in</Text>
                <Text style={styles.metadataValue}>
                  {result.processingTimeSec.toFixed(1)}s
                </Text>
              </View>
              <View style={styles.metadataItem}>
                <Text style={styles.metadataLabel}>Video length</Text>
                <Text style={styles.metadataValue}>
                  {result.videoDurationSec.toFixed(1)}s
                </Text>
              </View>
            </View>

            <View style={styles.windowList}>
              <Text style={styles.sectionTitle}>Moments to review</Text>
              <VideoWindowTimeline
                durationSec={result.videoDurationSec}
                onWindowPress={handleWindowPress}
                thumbnailStripUrl={result.thumbnailStripUrl}
                windows={result.windows}
              />
              <Text style={styles.windowHint}>
                Tap a moment to review that part of the video.
              </Text>
            </View>

            <Text selectable style={styles.resultSource}>
              Video: {sourceDescription}
            </Text>

            <View style={styles.resultActions}>
              <Pressable
                accessibilityRole="button"
                onPress={handleShareResultPress}
                style={styles.actionButton}
              >
                <Text style={styles.actionButtonText}>Share result</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleReportIssuePress}
                style={styles.actionButton}
              >
                <Text style={styles.actionButtonText}>Report issue</Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace(detectRoute)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Check another video</Text>
            </Pressable>
          </Animated.View>
        ) : null}
      </ScrollView>
      <WindowPreviewModal
        fallbackVideoUri={fallbackVideoUri}
        onClose={() => setSelectedWindow(null)}
        previewId={source.previewId}
        selectedWindow={selectedWindow}
        trimStartSec={source.trimStartSec ?? 0}
        videoAspectRatio={videoAspectRatio}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    gap: spacing.lg,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  statusText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  progressCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  progressHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
  },
  progressTextGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  elapsedPill: {
    alignItems: "flex-end",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    gap: 2,
    minWidth: 72,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  elapsedLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  elapsedValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  scannerRail: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 12,
    overflow: "hidden",
    position: "relative",
  },
  scannerSweep: {
    backgroundColor: "rgba(37, 99, 235, 0.26)",
    borderRadius: radius.sm,
    height: "100%",
    position: "absolute",
    width: 82,
  },
  progressStepList: {
    gap: spacing.sm,
  },
  progressStepRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  progressStepDot: {
    backgroundColor: colors.border,
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  progressStepDotActive: {
    backgroundColor: colors.primaryTeal,
  },
  progressStepDotComplete: {
    backgroundColor: colors.primaryTeal,
  },
  progressStepText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  progressStepTextActive: {
    color: colors.textPrimary,
    fontWeight: "800",
  },
  progressStepTextComplete: {
    color: colors.primaryTeal,
    fontWeight: "700",
  },
  progressHint: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  resultHeader: {
    gap: spacing.sm,
  },
  resultVerdictRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  resultVerdictHint: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    minWidth: 160,
  },
  verdictChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    flexShrink: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  verdictText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  metadataGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  metadataItem: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  metadataLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  metadataValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  windowList: {
    gap: spacing.sm,
  },
  windowHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  resultSource: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primaryTeal,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  resultActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  actionButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 132,
    paddingHorizontal: spacing.md,
  },
  actionButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
  },
  windowModalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    gap: spacing.lg,
    maxWidth: 520,
    padding: spacing.lg,
    width: "100%",
  },
  windowModalHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  windowModalTitleGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  windowProbabilityPill: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  windowProbabilityPillText: {
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  windowPreviewFrame: {
    alignSelf: "center",
    backgroundColor: colors.textPrimary,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  windowPreviewVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  windowPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  windowPreviewOverlayText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    textAlign: "center",
  },
  windowPreviewUnavailable: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  windowPreviewUnavailableText: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
