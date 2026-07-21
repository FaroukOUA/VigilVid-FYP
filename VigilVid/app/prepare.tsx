import * as Haptics from "expo-haptics";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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

import { LocalVideoPreview } from "../components/local-video-preview";
import { SignalLoader } from "../components/signal-loader";
import {
  VideoTrimSelector,
  type TrimSegment,
} from "../components/video-trim-selector";
import { colors, radius, spacing } from "../constants/theme";
import { useAuth } from "../hooks/use-auth";
import { createUploadVideoPreview, createVideoPreview } from "../lib/api";
import { detectRoute } from "../lib/routes";
import {
  formatBytes,
  formatDimensions,
  formatDuration,
  getFileBackedSourceType,
  getUrlBackedSourceType,
  isFileBackedVideoSource,
  MAX_VIDEO_DURATION_MS,
  parsePreparedVideoSource,
  validatePreparedVideoSource,
} from "../lib/video-source";
import type { VideoPreviewResponse } from "../types/video";

export default function PrepareScreen() {
  const params = useLocalSearchParams<{
    durationMs?: string | string[];
    fileName?: string | string[];
    fileSizeBytes?: string | string[];
    fileUri?: string | string[];
    height?: string | string[];
    mimeType?: string | string[];
    sourceType?: string | string[];
    url?: string | string[];
    width?: string | string[];
  }>();
  const { isLoading: isAuthLoading } = useAuth();
  const [segmentSelection, setSegmentSelection] = useState<TrimSegment>({
    endSec: 0,
    startSec: 0,
  });
  const [urlPreview, setUrlPreview] = useState<VideoPreviewResponse | null>(
    null,
  );
  const [urlPreviewError, setUrlPreviewError] = useState("");
  const [urlPreviewStatus, setUrlPreviewStatus] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");
  const [filePreview, setFilePreview] = useState<VideoPreviewResponse | null>(
    null,
  );
  const [filePreviewError, setFilePreviewError] = useState("");
  const [filePreviewStatus, setFilePreviewStatus] = useState<
    "idle" | "loading" | "ready" | "failed"
  >("idle");

  const source = useMemo(() => parsePreparedVideoSource(params), [params]);
  const validation = useMemo(
    () => validatePreparedVideoSource(source),
    [source],
  );
  const isFileBacked = isFileBackedVideoSource(source);
  const isUrlBacked = !isFileBacked && source.url.length > 0;
  const fileBackedSourceType = getFileBackedSourceType(source);
  const urlBackedSourceType = getUrlBackedSourceType(source);
  const filePreviewForAnalysis =
    filePreviewStatus === "ready" ? filePreview : null;
  const trimDurationMs = isFileBacked
    ? filePreviewForAnalysis?.durationMs ?? source.durationMs
    : urlPreview?.durationMs ?? null;
  const maxSegmentDurationMs = isFileBacked
    ? filePreviewForAnalysis?.maxSegmentDurationMs ?? MAX_VIDEO_DURATION_MS
    : urlPreview?.maxSegmentDurationMs ?? MAX_VIDEO_DURATION_MS;
  const selectedSegment = getSelectedSegment(
    segmentSelection,
    trimDurationMs,
    maxSegmentDurationMs,
  );
  const canSelectSegment =
    trimDurationMs !== null && Number.isFinite(trimDurationMs) && trimDurationMs > 0;
  const isLongerThanAnalysisLimit =
    canSelectSegment && trimDurationMs > MAX_VIDEO_DURATION_MS;
  const shouldSendFileTrim =
    isFileBacked &&
    canSelectSegment &&
    shouldSendTrimSelection(trimDurationMs, selectedSegment);
  const displayDurationMs = isFileBacked
    ? filePreviewForAnalysis?.durationMs ?? source.durationMs
    : urlPreview?.durationMs ?? null;
  const displayFileSizeBytes = isFileBacked
    ? filePreviewForAnalysis?.fileSizeBytes ?? source.fileSizeBytes
    : urlPreview?.fileSizeBytes ?? null;
  const displayWidth = isFileBacked
    ? filePreviewForAnalysis?.width ?? source.width
    : urlPreview?.width ?? null;
  const displayHeight = isFileBacked
    ? filePreviewForAnalysis?.height ?? source.height
    : urlPreview?.height ?? null;
  const canSubmit =
    validation.canAnalyze &&
    !isAuthLoading &&
    (!isUrlBacked || urlPreviewStatus === "ready") &&
    (!isFileBacked || filePreviewStatus !== "loading");

  useEffect(() => {
    if (!isUrlBacked || !validation.canAnalyze) {
      setUrlPreview(null);
      setUrlPreviewError("");
      setUrlPreviewStatus("idle");
      return undefined;
    }

    let isActive = true;
    const controller = new AbortController();
    setUrlPreview(null);
    setUrlPreviewError("");
    setUrlPreviewStatus("loading");
    setSegmentSelection({ endSec: 0, startSec: 0 });

    async function loadUrlPreview() {
      try {
        const preview = await createVideoPreview(
          {
            sourceType: urlBackedSourceType,
            url: source.url,
          },
          controller.signal,
        );

        if (!isActive) {
          return;
        }

        setUrlPreview(preview);
        setSegmentSelection(
          getInitialSegment(preview.durationMs, preview.maxSegmentDurationMs),
        );
        setUrlPreviewStatus("ready");
      } catch (error) {
        if (!isActive || isAbortError(error)) {
          return;
        }

        setUrlPreviewError(
          error instanceof Error
            ? error.message
            : "Video preview could not be prepared.",
        );
        setUrlPreviewStatus("failed");
      }
    }

    void loadUrlPreview();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [isUrlBacked, source.url, urlBackedSourceType, validation.canAnalyze]);

  useEffect(() => {
    if (!isFileBacked || !source.fileUri || !validation.canAnalyze) {
      setFilePreview(null);
      setFilePreviewError("");
      setFilePreviewStatus("idle");
      return undefined;
    }

    let isActive = true;
    const controller = new AbortController();
    setFilePreview(null);
    setFilePreviewError("");
    setFilePreviewStatus("loading");
    setSegmentSelection(
      getInitialSegment(source.durationMs, MAX_VIDEO_DURATION_MS),
    );

    async function loadFilePreview() {
      try {
        const preview = await createUploadVideoPreview(
          {
            fileName: source.fileName || "vigilvid-upload.mp4",
            fileUri: source.fileUri,
            mimeType: source.mimeType || "video/mp4",
            sourceType: fileBackedSourceType,
          },
          controller.signal,
        );

        if (!isActive) {
          return;
        }

        setFilePreview(preview);
        setSegmentSelection(
          getInitialSegment(preview.durationMs, preview.maxSegmentDurationMs),
        );
        setFilePreviewStatus("ready");
      } catch (error) {
        if (!isActive || isAbortError(error)) {
          return;
        }

        setFilePreviewError(
          error instanceof Error
            ? error.message
            : "Upload preview could not be prepared.",
        );
        setFilePreviewStatus("failed");
      }
    }

    void loadFilePreview();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [
    fileBackedSourceType,
    isFileBacked,
    source.durationMs,
    source.fileName,
    source.fileUri,
    source.mimeType,
    validation.canAnalyze,
  ]);

  useEffect(() => {
    if (!isFileBacked) {
      return;
    }

    setSegmentSelection(
      getInitialSegment(source.durationMs, MAX_VIDEO_DURATION_MS),
    );
  }, [isFileBacked, source.durationMs, source.fileUri]);

  const handleAnalyzePress = () => {
    if (!canSubmit) {
      return;
    }

    const analysisRequestId = createAnalysisRequestId();

    void Haptics.selectionAsync();

    if (isFileBacked) {
      if (filePreviewForAnalysis) {
        router.replace({
          pathname: "/analysis",
          params: {
            analysisRequestId,
            durationMs: filePreviewForAnalysis.durationMs.toString(),
            fileName: source.fileName,
            fileSizeBytes: filePreviewForAnalysis.fileSizeBytes.toString(),
            fileUri: source.fileUri,
            height: filePreviewForAnalysis.height?.toString() ?? "",
            mimeType: filePreviewForAnalysis.contentType,
            previewId: filePreviewForAnalysis.previewId,
            sourceType: filePreviewForAnalysis.sourceType,
            thumbnailStripUrl: filePreviewForAnalysis.thumbnailStripUrl ?? "",
            trimEndSec: selectedSegment.endSec.toString(),
            trimStartSec: selectedSegment.startSec.toString(),
            width: filePreviewForAnalysis.width?.toString() ?? "",
          },
        });
        return;
      }

      const analysisParams: Record<string, string> = {
        durationMs: source.durationMs?.toString() ?? "",
        fileName: source.fileName,
        fileSizeBytes: source.fileSizeBytes?.toString() ?? "",
        fileUri: source.fileUri,
        height: source.height?.toString() ?? "",
        mimeType: source.mimeType,
        analysisRequestId,
        sourceType: fileBackedSourceType,
        width: source.width?.toString() ?? "",
      };

      if (shouldSendFileTrim) {
        analysisParams.trimStartSec = selectedSegment.startSec.toString();
        analysisParams.trimEndSec = selectedSegment.endSec.toString();
      }

      router.replace({
        pathname: "/analysis",
        params: analysisParams,
      });
      return;
    }

    if (urlPreview) {
      router.replace({
        pathname: "/analysis",
        params: {
          analysisRequestId,
          durationMs: urlPreview.durationMs.toString(),
          fileSizeBytes: urlPreview.fileSizeBytes.toString(),
          height: urlPreview.height?.toString() ?? "",
          mimeType: urlPreview.contentType,
          previewId: urlPreview.previewId,
          sourceType: source.sourceType,
          thumbnailStripUrl: urlPreview.thumbnailStripUrl ?? "",
          trimEndSec: selectedSegment.endSec.toString(),
          trimStartSec: selectedSegment.startSec.toString(),
          url: urlPreview.originalUrl,
          width: urlPreview.width?.toString() ?? "",
        },
      });
      return;
    }

    router.replace({
      pathname: "/analysis",
      params: {
        analysisRequestId,
        sourceType: source.sourceType,
        url: source.url,
      },
    });
  };

  const handleBackPress = () => {
    router.replace(detectRoute);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Preview video" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        <View style={styles.header}>
          <Text style={styles.body}>
            Confirm the video and choose the part you want checked. This keeps
            longer videos within the limit.
          </Text>
        </View>

        {isFileBacked && source.fileUri ? (
          <>
            <LocalVideoPreview uri={source.fileUri} />
            <FileTrimPanel
              canSelectSegment={canSelectSegment}
              errorMessage={filePreviewError}
              isLongerThanAnalysisLimit={isLongerThanAnalysisLimit}
              onSegmentChange={setSegmentSelection}
              previewStatus={filePreviewStatus}
              segment={selectedSegment}
              sourceDurationMs={trimDurationMs}
              thumbnailStripUrl={filePreviewForAnalysis?.thumbnailStripUrl ?? null}
            />
          </>
        ) : isUrlBacked ? (
          <UrlPreviewPanel
            errorMessage={urlPreviewError}
            onSegmentChange={setSegmentSelection}
            preview={urlPreview}
            segment={selectedSegment}
            status={urlPreviewStatus}
          />
        ) : null}

        <View style={styles.sourceCard}>
          <Text style={styles.sourceLabel}>
            {isFileBacked ? "Selected video" : "Video link"}
          </Text>
          {isFileBacked && source.fileUri ? (
            <Text
              ellipsizeMode="middle"
              numberOfLines={1}
              selectable
              style={styles.sourceText}
            >
              {source.fileName || source.fileUri}
            </Text>
          ) : validation.issues.length === 0 ? (
            <Text
              ellipsizeMode="middle"
              numberOfLines={1}
              selectable
              style={styles.sourceText}
            >
              {source.url}
            </Text>
          ) : (
            <Text selectable style={styles.errorText}>
              {validation.issues[0]}
            </Text>
          )}
        </View>

        <View style={styles.metadataGrid}>
          <View style={styles.metadataItem}>
            <Text style={styles.metadataLabel}>Length</Text>
            <Text style={styles.metadataValue}>
              {formatDuration(displayDurationMs)}
            </Text>
          </View>
          <View style={styles.metadataItem}>
            <Text style={styles.metadataLabel}>File size</Text>
            <Text style={styles.metadataValue}>
              {formatBytes(displayFileSizeBytes)}
            </Text>
          </View>
          <View style={styles.metadataItem}>
            <Text style={styles.metadataLabel}>Video size</Text>
            <Text style={styles.metadataValue}>
              {formatDimensions(displayWidth, displayHeight)}
            </Text>
          </View>
        </View>

        {validation.issues.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Cannot check yet</Text>
            <View style={styles.validationList}>
              {validation.issues.map((issue) => (
                <ValidationRow
                  color={colors.likelyAi}
                  key={issue}
                  label={issue}
                />
              ))}
            </View>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{
            disabled: !canSubmit,
          }}
          disabled={!canSubmit}
          onPress={handleAnalyzePress}
          style={[
            styles.primaryButton,
            !canSubmit && styles.disabledButton,
          ]}
        >
          <Text
            style={[
              styles.primaryButtonText,
              !canSubmit && styles.disabledButtonText,
            ]}
          >
            {source.sourceType === "upload"
              ? shouldSendFileTrim
                ? "Check selected part"
                : "Check this video"
              : isFileBacked
                ? shouldSendFileTrim
                  ? "Check selected part"
                  : "Check shared video"
                : urlPreview
                  ? "Check selected part"
                  : urlPreviewStatus === "loading"
                    ? "Preparing video"
                    : "Check video"}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={handleBackPress}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function UrlPreviewPanel({
  errorMessage,
  onSegmentChange,
  preview,
  segment,
  status,
}: {
  errorMessage: string;
  onSegmentChange: (segment: TrimSegment) => void;
  preview: VideoPreviewResponse | null;
  segment: TrimSegment;
  status: "idle" | "loading" | "ready" | "failed";
}) {
  if (status === "loading") {
    return <PreviewLoadingCard />;
  }

  if (status === "failed") {
    return (
      <View style={styles.previewCard}>
        <Text style={styles.sectionTitle}>Preview unavailable</Text>
        <Text selectable style={styles.errorText}>
          {errorMessage}
        </Text>
        <Text style={styles.helpText}>
          You can still continue, but VigilVid may not know the video length
          before checking.
        </Text>
      </View>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <View style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <Text style={styles.sectionTitle}>Video preview</Text>
        <Text style={styles.helpText}>
          {preview.requiresTrim
            ? "Choose the two-minute section to check."
            : "This video can be checked as-is."}
        </Text>
      </View>

      <View style={styles.segmentSummary}>
        <Text style={styles.metadataLabel}>Selected part</Text>
        <Text style={styles.segmentTime}>
          {formatSeconds(segment.startSec)} to {formatSeconds(segment.endSec)}
        </Text>
      </View>

      <VideoTrimSelector
        durationMs={preview.durationMs}
        maxDurationMs={preview.maxSegmentDurationMs}
        onChange={onSegmentChange}
        thumbnailStripUrl={preview.thumbnailStripUrl}
        value={segment}
      />
    </View>
  );
}

function FileTrimPanel({
  canSelectSegment,
  errorMessage,
  isLongerThanAnalysisLimit,
  onSegmentChange,
  previewStatus,
  segment,
  sourceDurationMs,
  thumbnailStripUrl,
}: {
  canSelectSegment: boolean;
  errorMessage: string;
  isLongerThanAnalysisLimit: boolean;
  onSegmentChange: (segment: TrimSegment) => void;
  previewStatus: "idle" | "loading" | "ready" | "failed";
  segment: TrimSegment;
  sourceDurationMs: number | null;
  thumbnailStripUrl: string | null;
}) {
  if (previewStatus === "loading") {
    return (
      <PreviewLoadingCard
        description="Preparing your video, checking its length, and creating a preview."
        steps={["Prepare video", "Check length", "Create preview"]}
        title="Preparing video"
      />
    );
  }

  if (!canSelectSegment || sourceDurationMs === null) {
    return (
      <View style={styles.previewCard}>
        <Text style={styles.sectionTitle}>Choose part</Text>
        {previewStatus === "failed" && errorMessage ? (
          <Text selectable style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}
        <Text style={styles.helpText}>
          VigilVid could not read the length yet, so it will check the video as
          selected.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.previewCard}>
      <View style={styles.previewHeader}>
        <Text style={styles.sectionTitle}>Video part</Text>
        <Text style={styles.helpText}>
          {isLongerThanAnalysisLimit
            ? "Choose the two-minute section to check."
            : "Check the full clip, or drag the handles to focus on a shorter section."}
        </Text>
      </View>

      {previewStatus === "failed" && errorMessage ? (
        <Text selectable style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}

      <View style={styles.segmentSummary}>
        <Text style={styles.metadataLabel}>Selected part</Text>
        <Text style={styles.segmentTime}>
          {formatSeconds(segment.startSec)} to {formatSeconds(segment.endSec)}
        </Text>
      </View>

      <VideoTrimSelector
        durationMs={sourceDurationMs}
        maxDurationMs={MAX_VIDEO_DURATION_MS}
        onChange={onSegmentChange}
        thumbnailStripUrl={thumbnailStripUrl}
        value={segment}
      />
      <Text style={styles.helpText}>
        {thumbnailStripUrl
          ? "These preview frames will be reused for the check."
          : "Preview frames are unavailable, but VigilVid can still check the selected part."}
      </Text>
    </View>
  );
}

function PreviewLoadingCard({
  description = "Opening the link, checking the video length, and preparing frames for review.",
  steps = ["Open link", "Check length", "Prepare preview"],
  title = "Preparing video",
}: {
  description?: string;
  steps?: readonly string[];
  title?: string;
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
        translateX:
          -82 + sweepProgress.value * Math.max(railWidth + 164, 164),
      },
    ],
  }));

  const handleRailLayout = (event: LayoutChangeEvent) => {
    const nextRailWidth = event.nativeEvent.layout.width;
    setRailWidth((currentRailWidth) =>
      currentRailWidth === nextRailWidth ? currentRailWidth : nextRailWidth,
    );
  };

  return (
    <Animated.View entering={FadeInUp.duration(220)} style={styles.previewCard}>
      <View style={styles.loadingHeader}>
        <SignalLoader size={68} />
        <View style={styles.loadingHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.helpText}>
            {description}
          </Text>
        </View>
      </View>

      <View onLayout={handleRailLayout} style={styles.loadingRail}>
        <Animated.View style={[styles.loadingSweep, sweepStyle]} />
      </View>

      <View style={styles.loadingSteps}>
        {steps.map((step) => (
          <LoadingStep isActive key={step} label={step} />
        ))}
      </View>
    </Animated.View>
  );
}

function LoadingStep({ isActive, label }: { isActive: boolean; label: string }) {
  return (
    <View style={styles.loadingStep}>
      <View
        style={[
          styles.loadingStepDot,
          isActive && styles.loadingStepDotActive,
        ]}
      />
      <Text style={styles.loadingStepText}>{label}</Text>
    </View>
  );
}

function createAnalysisRequestId() {
  return `analysis-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function ValidationRow({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.validationRow}>
      <View style={[styles.validationDot, { backgroundColor: color }]} />
      <Text selectable style={styles.validationText}>
        {label}
      </Text>
    </View>
  );
}

function getInitialSegment(
  durationMs: number | null,
  maxSegmentDurationMs: number,
): TrimSegment {
  if (durationMs === null || durationMs <= 0) {
    return { endSec: 0, startSec: 0 };
  }

  const durationSec = durationMs / 1000;
  const maxSegmentDurationSec = maxSegmentDurationMs / 1000;
  return {
    endSec: Math.min(durationSec, maxSegmentDurationSec),
    startSec: 0,
  };
}

function getSelectedSegment(
  segment: TrimSegment,
  durationMs: number | null,
  maxSegmentDurationMs: number,
): TrimSegment {
  if (durationMs === null || durationMs <= 0) {
    return { endSec: 0, startSec: 0 };
  }

  const durationSec = Math.max(0, durationMs / 1000);
  const maxSegmentDurationSec = Math.min(
    durationSec,
    Math.max(1, maxSegmentDurationMs / 1000),
  );
  const minSegmentDurationSec = Math.min(durationSec, maxSegmentDurationSec, 5);
  let startSec = Math.min(Math.max(0, segment.startSec), durationSec);
  let endSec = Math.min(Math.max(startSec, segment.endSec), durationSec);

  if (endSec - startSec < minSegmentDurationSec) {
    endSec = Math.min(durationSec, startSec + minSegmentDurationSec);
  }

  if (endSec - startSec > maxSegmentDurationSec) {
    endSec = startSec + maxSegmentDurationSec;
  }

  if (endSec > durationSec) {
    endSec = durationSec;
    startSec = Math.max(0, endSec - maxSegmentDurationSec);
  }

  return {
    endSec: Math.round(endSec * 100) / 100,
    startSec: Math.round(startSec * 100) / 100,
  };
}

function shouldSendTrimSelection(durationMs: number, segment: TrimSegment) {
  const durationSec = durationMs / 1000;
  return (
    durationMs > MAX_VIDEO_DURATION_MS ||
    segment.startSec > 0.01 ||
    segment.endSec < durationSec - 0.01
  );
}

function formatSeconds(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
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
  header: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  previewCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  previewHeader: {
    gap: spacing.xs,
  },
  loadingHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  loadingHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  loadingRail: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 12,
    overflow: "hidden",
  },
  loadingSweep: {
    backgroundColor: "rgba(37, 99, 235, 0.26)",
    borderRadius: radius.sm,
    height: "100%",
    width: 82,
  },
  loadingSteps: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  loadingStep: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: spacing.xs,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  loadingStepDot: {
    backgroundColor: colors.border,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  loadingStepDotActive: {
    backgroundColor: colors.primaryTeal,
  },
  loadingStepText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  segmentSummary: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    gap: spacing.xs,
    padding: spacing.md,
  },
  segmentTime: {
    color: colors.textPrimary,
    fontSize: 16,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
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
  helpText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  sourceText: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  sourceCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  sourceLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  errorText: {
    color: colors.likelyAi,
    fontSize: 15,
    lineHeight: 22,
  },
  metadataGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  metadataItem: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
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
    fontSize: 13,
    fontWeight: "700",
  },
  validationList: {
    gap: spacing.md,
  },
  validationRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
  },
  validationDot: {
    borderRadius: 5,
    height: 10,
    marginTop: 6,
    width: 10,
  },
  validationText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primaryTeal,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  disabledButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "700",
  },
  disabledButtonText: {
    color: colors.textSecondary,
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
});
