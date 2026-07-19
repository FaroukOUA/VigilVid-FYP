import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radius, spacing } from "../../constants/theme";
import { useAuth } from "../../hooks/use-auth";
import { useSoloGameProgress } from "../../hooks/use-solo-game-progress";
import { getDetectionHistory } from "../../lib/api";
import type { DetectionSourceType } from "../../types/detection";

type InputMode = Extract<DetectionSourceType, "url" | "upload">;
type HistoryStatus = "idle" | "loading" | "loaded" | "failed";
type FeatherIconName = keyof typeof Feather.glyphMap;

const inputModes: { label: string; value: InputMode }[] = [
  { label: "Link", value: "url" },
  { label: "Phone", value: "upload" },
];
const logoIcon = require("../../assets/images/favicon.png");

export default function Index() {
  const { hasShareIntent } = useShareIntentContext();
  const { isLoading: isAuthLoading, session, user } = useAuth();
  const {
    isLoading: isGameProgressLoading,
    progress,
  } = useSoloGameProgress();
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [videoUrl, setVideoUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isPickingVideo, setIsPickingVideo] = useState(false);
  const [savedCheckCount, setSavedCheckCount] = useState(0);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("idle");

  const accessToken = session?.access_token;
  const trimmedUrl = videoUrl.trim();
  const hasPlayedGame = progress.roundsPlayed > 0;
  const gameAccuracyPercent = getAccuracyPercent(
    progress.correctAnswers,
    progress.roundsPlayed,
  );

  useEffect(() => {
    if (hasShareIntent) {
      router.replace("/share");
    }
  }, [hasShareIntent]);

  useEffect(() => {
    if (isAuthLoading) {
      return undefined;
    }

    const token = accessToken;
    if (!token) {
      setSavedCheckCount(0);
      setHistoryStatus("idle");
      return undefined;
    }

    const controller = new AbortController();

    async function loadSavedChecks(authToken: string) {
      setHistoryStatus("loading");

      try {
        const response = await getDetectionHistory(authToken, controller.signal);
        setSavedCheckCount(response.items.length);
        setHistoryStatus("loaded");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setHistoryStatus("failed");
      }
    }

    void loadSavedChecks(token);

    return () => {
      controller.abort();
    };
  }, [accessToken, isAuthLoading]);

  const urlError = useMemo(() => {
    if (inputMode !== "url" || trimmedUrl.length === 0) {
      return "";
    }

    try {
      const parsedUrl = new URL(trimmedUrl);
      return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
        ? ""
        : "Paste a full video link.";
    } catch {
      return "Paste a valid video link.";
    }
  }, [inputMode, trimmedUrl]);

  const canAnalyze =
    inputMode === "url" && trimmedUrl.length > 0 && urlError.length === 0;

  const handleAnalyzePress = async () => {
    if (!canAnalyze) {
      return;
    }

    await Haptics.selectionAsync();
    router.push({
      pathname: "/prepare",
      params: {
        sourceType: inputMode,
        url: trimmedUrl,
      },
    });
  };

  const handleChooseVideoPress = async () => {
    if (isPickingVideo) {
      return;
    }

    setIsPickingVideo(true);
    setUploadError("");

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setUploadError("Allow photo and video access to choose a file.");
        return;
      }

      await Haptics.selectionAsync();
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: false,
        mediaTypes: ["videos"],
        quality: 1,
        selectionLimit: 1,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      if (!asset || asset.type !== "video") {
        setUploadError("Choose a video file.");
        return;
      }

      router.push({
        pathname: "/prepare",
        params: {
          durationMs:
            asset.duration !== null && asset.duration !== undefined
              ? String(asset.duration)
              : "",
          fileName: asset.fileName ?? "",
          fileSizeBytes:
            asset.fileSize !== undefined ? String(asset.fileSize) : "",
          fileUri: asset.uri,
          height: asset.height ? String(asset.height) : "",
          mimeType: asset.mimeType ?? "",
          sourceType: "upload",
          width: asset.width ? String(asset.width) : "",
        },
      });
    } catch (error) {
      setUploadError(
        error instanceof Error
          ? error.message
          : "Could not open the video picker.",
      );
    } finally {
      setIsPickingVideo(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={styles.screen}
    >
        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.title}>VigilVid</Text>
            <Text style={styles.body}>
              Check videos, learn the clues, and train your eye.
            </Text>
          </View>
          <Image source={logoIcon} style={styles.heroLogo} />
        </View>

        <View style={styles.statsRow}>
          <HomeStat
            accentColor={colors.analysisBlue}
            helperText={getSavedChecksHelperText(historyStatus, user)}
            icon="check-circle"
            label="Saved checks"
            value={getSavedChecksValue(historyStatus, user, savedCheckCount)}
          />
          <HomeStat
            accentColor={colors.gameAccent}
            helperText={
              hasPlayedGame ? `${progress.roundsPlayed} clips` : "Play to start"
            }
            icon="target"
            label="Game accuracy"
            value={
              isGameProgressLoading
                ? "..."
                : hasPlayedGame
                  ? `${gameAccuracyPercent}%`
                  : "0%"
            }
          />
          <HomeStat
            accentColor={colors.rewardMango}
            helperText="Best score"
            icon="award"
            label="High score"
            value={isGameProgressLoading ? "..." : progress.highScore.toString()}
          />
        </View>

        <View style={styles.checkCard}>
          <View style={styles.cardTitleRow}>
            <View style={styles.smallIconFrame}>
              <Feather color={colors.primaryTeal} name="search" size={18} />
            </View>
            <View style={styles.cardTitleCopy}>
              <Text style={styles.sectionTitle}>Check a video</Text>
              <Text style={styles.helpText}>
                Shared videos still open the preview page automatically.
              </Text>
            </View>
          </View>

          <View style={styles.segmentedControl}>
            {inputModes.map((mode) => {
              const isSelected = inputMode === mode.value;

              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  key={mode.value}
                  onPress={() => setInputMode(mode.value)}
                  style={[
                    styles.segmentButton,
                    isSelected && styles.segmentButtonSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      isSelected && styles.segmentLabelSelected,
                    ]}
                  >
                    {mode.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {inputMode === "url" ? (
            <View style={styles.fieldGroup}>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="url"
                onChangeText={setVideoUrl}
                placeholder="Paste link"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, urlError && styles.inputError]}
                value={videoUrl}
              />
              {urlError ? (
                <Text selectable style={styles.errorText}>
                  {urlError}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAnalyze }}
                disabled={!canAnalyze}
                onPress={handleAnalyzePress}
                style={[
                  styles.primaryButton,
                  !canAnalyze && styles.disabledButton,
                ]}
              >
                <Text
                  style={[
                    styles.primaryButtonText,
                    !canAnalyze && styles.disabledButtonText,
                  ]}
                >
                  Preview video
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.fieldGroup}>
              <Pressable
                accessibilityRole="button"
                disabled={isPickingVideo}
                onPress={handleChooseVideoPress}
                style={[
                  styles.primaryButton,
                  isPickingVideo && styles.disabledButton,
                ]}
              >
                <Text
                  style={[
                    styles.primaryButtonText,
                    isPickingVideo && styles.disabledButtonText,
                  ]}
                >
                  {isPickingVideo ? "Opening gallery" : "Choose from phone"}
                </Text>
              </Pressable>
              {uploadError ? (
                <Text selectable style={styles.errorText}>
                  {uploadError}
                </Text>
              ) : (
                <Text style={styles.helpText}>
                  You can preview the video before checking it.
                </Text>
              )}
            </View>
          )}
        </View>
    </ScrollView>
  );
}

function HomeStat({
  accentColor,
  helperText,
  icon,
  label,
  value,
}: {
  accentColor: string;
  helperText: string;
  icon: FeatherIconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconFrame, { backgroundColor: `${accentColor}14` }]}>
        <Feather color={accentColor} name={icon} size={16} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.statHelper}>
        {helperText}
      </Text>
    </View>
  );
}

function getSavedChecksValue(
  status: HistoryStatus,
  user: unknown,
  count: number,
) {
  if (!user) {
    return "0";
  }

  return status === "loading" ? "..." : count.toString();
}

function getSavedChecksHelperText(status: HistoryStatus, user: unknown) {
  if (!user) {
    return "Sign in to save";
  }

  if (status === "failed") {
    return "Not available now";
  }

  return "In History";
}

function getAccuracyPercent(correct: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((correct / total) * 100);
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  hero: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    padding: spacing.lg,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  heroLogo: {
    borderRadius: 24,
    height: 48,
    width: 48,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 32,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minHeight: 116,
    padding: spacing.md,
  },
  statIconFrame: {
    alignItems: "center",
    borderRadius: radius.sm,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  statLabel: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 14,
  },
  statHelper: {
    color: colors.textSecondary,
    fontSize: 10,
    lineHeight: 13,
  },
  checkCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  smallIconFrame: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  cardTitleCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 19,
    fontWeight: "800",
  },
  helpText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  segmentedControl: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
  },
  segmentButton: {
    alignItems: "center",
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingVertical: spacing.sm,
  },
  segmentButtonSelected: {
    backgroundColor: colors.surface,
  },
  segmentLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  segmentLabelSelected: {
    color: colors.primaryTeal,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 14,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  inputError: {
    borderColor: colors.likelyAi,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.primaryTeal,
    borderRadius: radius.md,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: "800",
  },
  disabledButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  disabledButtonText: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.likelyAi,
    fontSize: 12,
    lineHeight: 17,
  },
});
