import Feather from "@expo/vector-icons/Feather";
import { Link } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

import { colors, radius, spacing } from "../../constants/theme";
import { useAuth } from "../../hooks/use-auth";
import { getDetectionHistory } from "../../lib/api";
import { detectRoute } from "../../lib/routes";
import type {
  DetectionHistoryItem,
  DetectionLabel,
  DetectionSourceType,
} from "../../types/detection";

type HistoryStatus = "idle" | "loading" | "loaded" | "failed";
type FeatherIconName = keyof typeof Feather.glyphMap;
const verdictOrder: DetectionLabel[] = [
  "real",
  "partially_real",
  "fake",
  "partially_fake",
];

export default function HistoryScreen() {
  const { isConfigured, isLoading: isAuthLoading, session, user } = useAuth();
  const [items, setItems] = useState<DetectionHistoryItem[]>([]);
  const [status, setStatus] = useState<HistoryStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const accessToken = session?.access_token;
  const summary = useMemo(() => getHistorySummary(items), [items]);

  const loadHistory = useCallback(
    async (signal?: AbortSignal) => {
      if (!accessToken) {
        setItems([]);
        return;
      }

      setStatus("loading");
      setErrorMessage("");

      try {
        const response = await getDetectionHistory(accessToken, signal);
        setItems(response.items);
        setStatus("loaded");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }

        setStatus("failed");
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load history.",
        );
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!accessToken) {
      setItems([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    void loadHistory(controller.signal);

    return () => controller.abort();
  }, [accessToken, isAuthLoading, loadHistory]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Saved video checks</Text>
      </View>

        {!isConfigured ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>History is not available</Text>
            <Text selectable style={styles.body}>
              History is not set up on this device. You can still check videos
              without an account.
            </Text>
          </View>
        ) : null}

        {isConfigured && isAuthLoading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.analysisBlue} />
            <Text style={styles.sectionTitle}>Checking account</Text>
          </View>
        ) : null}

        {isConfigured && !isAuthLoading && !user ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Sign in to view history</Text>
            <Text style={styles.body}>
              Video checking works without an account. Sign in when you want
              saved results across sessions.
            </Text>
            <Link href="/account" asChild>
              <Pressable accessibilityRole="button" style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Go to account</Text>
              </Pressable>
            </Link>
          </View>
        ) : null}

        {isConfigured && !isAuthLoading && user ? (
          <>
            {items.length > 0 ? (
              <View style={styles.summaryGrid}>
                <SummaryTile
                  icon="archive"
                  label="Saved checks"
                  value={items.length.toString()}
                />
                <SummaryTile
                  icon="calendar"
                  label="Latest"
                  value={summary.latestDateLabel}
                />
              </View>
            ) : null}

            {items.length > 0 ? (
              <VerdictBreakdown counts={summary.verdictCounts} />
            ) : null}

            <View style={styles.toolbar}>
              <Text selectable style={styles.toolbarText}>
                Result summaries only. Videos are not stored in History.
              </Text>
              <Pressable
                accessibilityRole="button"
                disabled={status === "loading"}
                onPress={() => {
                  void loadHistory();
                }}
                style={[
                  styles.refreshButton,
                  status === "loading" && styles.disabledButton,
                ]}
              >
                <Text
                  style={[
                    styles.refreshButtonText,
                    status === "loading" && styles.disabledButtonText,
                  ]}
                >
                  {status === "loading" ? "Loading" : "Refresh"}
                </Text>
              </Pressable>
            </View>

            {status === "failed" ? (
              <Text selectable style={styles.errorText}>
                {errorMessage}
              </Text>
            ) : null}

            {status === "loading" && items.length === 0 ? (
              <View style={styles.card}>
                <ActivityIndicator color={colors.analysisBlue} />
                <Text style={styles.sectionTitle}>Loading history</Text>
              </View>
            ) : null}

            {status !== "loading" && items.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>No saved results yet</Text>
                <Text style={styles.body}>
                  Sign in, then check a video. VigilVid saves result summaries
                  to your History automatically.
                </Text>
                <Link href={detectRoute} asChild>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.primaryButton}
                  >
                    <Text style={styles.primaryButtonText}>Check a video</Text>
                  </Pressable>
                </Link>
              </View>
            ) : null}

            {items.map((item) => (
              <HistoryCard item={item} key={item.detectionId} />
            ))}
          </>
        ) : null}
    </ScrollView>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: FeatherIconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.summaryTile}>
      <View style={styles.summaryIconFrame}>
        <Feather color={colors.primaryTeal} name={icon} size={18} />
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function VerdictBreakdown({
  counts,
}: {
  counts: Record<DetectionLabel, number>;
}) {
  return (
    <View style={styles.breakdownCard}>
      <View style={styles.breakdownHeader}>
        <View style={styles.breakdownIconFrame}>
          <Feather color={colors.primaryTeal} name="pie-chart" size={17} />
        </View>
        <Text style={styles.breakdownTitle}>Result breakdown</Text>
      </View>
      <View style={styles.breakdownGrid}>
        {verdictOrder.map((label) => {
          const color = getLabelColor(label);

          return (
            <View
              key={label}
              style={styles.breakdownItem}
            >
              <View style={styles.breakdownLabelGroup}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  style={[styles.breakdownDot, { backgroundColor: color }]}
                />
                <Text style={styles.breakdownLabel}>{getLabelText(label)}</Text>
              </View>
              <Text style={[styles.breakdownValue, { color }]}>
                {counts[label]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function HistoryCard({ item }: { item: DetectionHistoryItem }) {
  return (
    <Animated.View
      entering={FadeInUp.duration(180)}
      style={styles.historyCard}
    >
      <View style={styles.historyHeader}>
        <View style={styles.historyTitleGroup}>
          <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
          <Text style={styles.historySource}>
            {getSourceLabel(item.sourceType)}
          </Text>
        </View>
        <View
          style={[
            styles.verdictChip,
            { borderColor: getLabelColor(item.label) },
          ]}
        >
          <Text
            style={[styles.verdictText, { color: getLabelColor(item.label) }]}
          >
            {getLabelText(item.label)}
          </Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <Metric label="AI signal" value={`${item.confidencePercent}%`} />
        <Metric
          label="Checked in"
          value={formatSeconds(item.processingTimeSec)}
        />
        <Metric label="Length" value={formatSeconds(item.videoDurationSec)} />
      </View>
    </Animated.View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

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

function getSourceLabel(sourceType: DetectionSourceType) {
  switch (sourceType) {
    case "share":
      return "Shared video";
    case "upload":
      return "Chosen video";
    case "url":
      return "Link";
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return date.toLocaleString();
}

function getHistorySummary(items: DetectionHistoryItem[]) {
  const latestItem = items[0];

  return {
    latestDateLabel: latestItem ? formatShortDate(latestItem.createdAt) : "-",
    verdictCounts: getVerdictCounts(items),
  };
}

function getVerdictCounts(items: DetectionHistoryItem[]) {
  const counts: Record<DetectionLabel, number> = {
    fake: 0,
    partially_fake: 0,
    partially_real: 0,
    real: 0,
  };

  for (const item of items) {
    counts[item.label] += 1;
  }

  return counts;
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function formatSeconds(value: number | null) {
  return value === null ? "Unknown" : `${value.toFixed(1)}s`;
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
  historyCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
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
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  summaryTile: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    gap: spacing.xs,
    minWidth: 116,
    padding: spacing.md,
  },
  summaryIconFrame: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  summaryValue: {
    color: colors.textPrimary,
    fontSize: 22,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
  summaryLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  breakdownCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  breakdownHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  breakdownIconFrame: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  breakdownTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  breakdownGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  breakdownItem: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    borderColor: colors.border,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
    minHeight: 54,
    minWidth: 124,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  breakdownLabelGroup: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: spacing.sm,
    minWidth: 0,
  },
  breakdownDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  breakdownValue: {
    fontSize: 20,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
    minWidth: 28,
    textAlign: "right",
  },
  breakdownLabel: {
    color: colors.textSecondary,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  toolbarText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  refreshButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  refreshButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  historyHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  historyTitleGroup: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 180,
  },
  historyDate: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  historySource: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  verdictChip: {
    borderRadius: radius.sm,
    borderWidth: 1,
    flexShrink: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  verdictText: {
    fontSize: 13,
    fontWeight: "700",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  metric: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  metricLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
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
  disabledButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
  },
  disabledButtonText: {
    color: colors.textSecondary,
  },
  errorText: {
    color: colors.likelyAi,
    fontSize: 14,
    lineHeight: 20,
  },
});
