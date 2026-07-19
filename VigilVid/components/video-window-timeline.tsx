import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../constants/theme";
import type { DetectionWindow } from "../types/detection";

type VideoWindowTimelineProps = {
  durationSec: number;
  onWindowPress?: (timeWindow: DetectionWindow) => void;
  thumbnailStripUrl?: string | null;
  windows: DetectionWindow[];
};

const placeholderFrames = Array.from({ length: 8 }, (_, index) => index);

export function VideoWindowTimeline({
  durationSec,
  onWindowPress,
  thumbnailStripUrl,
  windows,
}: VideoWindowTimelineProps) {
  const timelineDuration = getTimelineDuration(durationSec, windows);

  return (
    <View style={styles.container}>
      <View style={styles.thumbnailTrack}>
        {thumbnailStripUrl ? (
          <Image
            contentFit="cover"
            source={{ uri: thumbnailStripUrl }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <View style={styles.placeholderStrip}>
            {placeholderFrames.map((frame) => (
              <View key={frame} style={styles.placeholderFrame}>
                <View style={styles.placeholderHorizon} />
                <View style={styles.placeholderSubject} />
              </View>
            ))}
          </View>
        )}

        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {windows.map((timeWindow) => {
            const layout = getWindowLayout(timeWindow, timelineDuration);

            return (
              <View
                key={`${timeWindow.startSec}-${timeWindow.endSec}`}
                style={[
                  styles.probabilityOverlay,
                  {
                    backgroundColor: getProbabilityColor(
                      timeWindow.fakeProbability,
                      0.54,
                    ),
                    left: `${layout.leftPercent}%`,
                    width: `${layout.widthPercent}%`,
                  },
                ]}
              />
            );
          })}
        </View>
      </View>

      <View style={styles.scaleRow}>
        <Text style={styles.scaleLabel}>Lower AI signal</Text>
        <Text style={styles.scaleLabel}>Higher AI signal</Text>
      </View>

      <View style={styles.windowList}>
        {windows.map((timeWindow) => (
          <Pressable
            accessibilityLabel={`Preview moment ${timeWindow.startSec.toFixed(
              1,
            )} seconds to ${timeWindow.endSec.toFixed(1)} seconds`}
            accessibilityRole={onWindowPress ? "button" : undefined}
            disabled={!onWindowPress}
            key={`row-${timeWindow.startSec}-${timeWindow.endSec}`}
            onPress={() => onWindowPress?.(timeWindow)}
            style={({ pressed }) => [
              styles.windowRow,
              onWindowPress ? styles.windowRowPressable : null,
              pressed ? styles.windowRowPressed : null,
            ]}
          >
            <View
              style={[
                styles.windowStatusDot,
                {
                  backgroundColor: getProbabilityColor(
                    timeWindow.fakeProbability,
                    1,
                  ),
                },
              ]}
            />
            <Text style={styles.windowTime}>
              {timeWindow.startSec.toFixed(1)}s to{" "}
              {timeWindow.endSec.toFixed(1)}s
            </Text>
            <Text
              style={[
                styles.windowProbability,
                {
                  color: getProbabilityColor(timeWindow.fakeProbability, 1),
                },
              ]}
            >
              {Math.round(timeWindow.fakeProbability * 100)}%
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function getTimelineDuration(durationSec: number, windows: DetectionWindow[]) {
  if (durationSec > 0) {
    return durationSec;
  }

  return Math.max(...windows.map((timeWindow) => timeWindow.endSec), 1);
}

function getWindowLayout(
  timeWindow: DetectionWindow,
  timelineDuration: number,
) {
  const startPercent = clamp(
    (timeWindow.startSec / timelineDuration) * 100,
    0,
    100,
  );
  const endPercent = clamp((timeWindow.endSec / timelineDuration) * 100, 0, 100);
  const widthPercent = Math.max(endPercent - startPercent, 1.5);

  return {
    leftPercent: Math.min(startPercent, 100 - widthPercent),
    widthPercent,
  };
}

function getProbabilityColor(fakeProbability: number, alpha: number) {
  const probability = clamp(fakeProbability, 0, 1);
  const low = hexToRgb(colors.likelyReal);
  const mid = hexToRgb(colors.uncertain);
  const high = hexToRgb(colors.likelyAi);
  const start = probability <= 0.5 ? low : mid;
  const end = probability <= 0.5 ? mid : high;
  const amount = probability <= 0.5 ? probability / 0.5 : (probability - 0.5) / 0.5;
  const red = Math.round(lerp(start.red, end.red, amount));
  const green = Math.round(lerp(start.green, end.green, amount));
  const blue = Math.round(lerp(start.blue, end.blue, amount));

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function hexToRgb(hex: string) {
  const normalizedHex = hex.replace("#", "");
  const value = Number.parseInt(normalizedHex, 16);

  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  thumbnailTrack: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 72,
    overflow: "hidden",
  },
  placeholderStrip: {
    flex: 1,
    flexDirection: "row",
    gap: 1,
  },
  placeholderFrame: {
    backgroundColor: "#CBD5E1",
    flex: 1,
    overflow: "hidden",
  },
  placeholderHorizon: {
    backgroundColor: "#E0F2FE",
    height: "55%",
  },
  placeholderSubject: {
    alignSelf: "center",
    backgroundColor: "#64748B",
    borderRadius: 10,
    height: 20,
    marginTop: -10,
    opacity: 0.55,
    width: 20,
  },
  probabilityOverlay: {
    bottom: 0,
    position: "absolute",
    top: 0,
  },
  scaleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  scaleLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  windowList: {
    gap: spacing.sm,
  },
  windowRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    padding: spacing.md,
  },
  windowRowPressable: {
    backgroundColor: colors.surface,
  },
  windowRowPressed: {
    backgroundColor: colors.surfaceMuted,
    transform: [{ scale: 0.99 }],
  },
  windowStatusDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  windowTime: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  windowProbability: {
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "800",
  },
});
