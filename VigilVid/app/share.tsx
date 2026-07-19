import { Stack, router } from "expo-router";
import { useShareIntentContext } from "expo-share-intent";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, radius, spacing } from "../constants/theme";
import { detectRoute } from "../lib/routes";
import { resolveSharedSource } from "../lib/share-intent";

export default function ShareScreen() {
  const { error, hasShareIntent, isReady, resetShareIntent, shareIntent } =
    useShareIntentContext();
  const hasRoutedRef = useRef(false);

  const sharedSource = useMemo(
    () => resolveSharedSource(shareIntent),
    [shareIntent],
  );

  useEffect(() => {
    if (
      !isReady ||
      error ||
      !hasShareIntent ||
      (sharedSource.kind !== "url" && sharedSource.kind !== "video-file") ||
      hasRoutedRef.current
    ) {
      return;
    }

    hasRoutedRef.current = true;
    resetShareIntent();

    if (sharedSource.kind === "video-file") {
      router.replace({
        pathname: "/prepare",
        params: {
          durationMs: sharedSource.file.duration?.toString() ?? "",
          fileName: sharedSource.file.fileName ?? "",
          fileSizeBytes: sharedSource.file.size?.toString() ?? "",
          fileUri: sharedSource.file.path,
          height: sharedSource.file.height?.toString() ?? "",
          mimeType: sharedSource.file.mimeType ?? "",
          sourceType: "share",
          width: sharedSource.file.width?.toString() ?? "",
        },
      });
      return;
    }

    router.replace({
      pathname: "/prepare",
      params: {
        sourceType: "share",
        url: sharedSource.url,
      },
    });
  }, [error, hasShareIntent, isReady, resetShareIntent, sharedSource]);

  const handleBackPress = () => {
    resetShareIntent();
    router.replace(detectRoute);
  };

  return (
    <>
      <Stack.Screen options={{ title: "Shared video" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        style={styles.screen}
      >
        {!isReady ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.analysisBlue} />
            <Text style={styles.sectionTitle}>Opening shared video</Text>
            <Text style={styles.body}>
              VigilVid is opening what you shared.
            </Text>
          </View>
        ) : null}

        {isReady && error ? (
          <StatusCard
            actionLabel="Back"
            body={error}
            onActionPress={handleBackPress}
            title="Could not open shared video"
          />
        ) : null}

        {isReady && !error && !hasShareIntent ? (
          <StatusCard
            actionLabel="Back"
            body="Open another app, share a video or video link, then choose VigilVid."
            onActionPress={handleBackPress}
            title="Nothing was shared"
          />
        ) : null}

        {isReady && !error && hasShareIntent && sharedSource.kind === "url" ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.analysisBlue} />
            <Text style={styles.sectionTitle}>Opening preview</Text>
            <Text selectable style={styles.sourceText}>
              {sharedSource.displayText}
            </Text>
          </View>
        ) : null}

        {isReady &&
        !error &&
        hasShareIntent &&
        sharedSource.kind === "video-file" ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.analysisBlue} />
            <Text style={styles.sectionTitle}>Opening preview</Text>
            <Text selectable style={styles.sourceText}>
              {sharedSource.displayText}
            </Text>
          </View>
        ) : null}

        {isReady &&
        !error &&
        hasShareIntent &&
        sharedSource.kind === "unsupported" ? (
          <StatusCard
            actionLabel="Back"
            body={`VigilVid can open video links and video files. This item is not supported yet: ${sharedSource.displayText}`}
            onActionPress={handleBackPress}
            title="This share is not supported"
          />
        ) : null}
      </ScrollView>
    </>
  );
}

function StatusCard({
  actionLabel,
  body,
  onActionPress,
  title,
}: {
  actionLabel: string;
  body: string;
  onActionPress: () => void;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text selectable style={styles.body}>
        {body}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onActionPress}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
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
  sourceText: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    padding: spacing.md,
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
});
