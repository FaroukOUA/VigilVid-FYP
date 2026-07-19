import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../constants/theme";
import type { DetectionLabel } from "../types/detection";

const tickCount = 31;
const tickIndexes = Array.from({ length: tickCount }, (_, index) => index);

type AiProbabilityGaugeProps = {
  label: DetectionLabel;
  probability: number;
};

export function AiProbabilityGauge({
  label,
  probability,
}: AiProbabilityGaugeProps) {
  const clampedProbability = clamp(probability, 0, 1);
  const percentage = Math.round(clampedProbability * 100);
  const size = 232;
  const radiusPx = 92;
  const centerX = size / 2;
  const centerY = 120;
  const gaugeHeight = 160;

  const signalLabel = useMemo(
    () => getSignalLabel(label, clampedProbability),
    [clampedProbability, label],
  );

  return (
    <View
      accessibilityLabel={`AI signal ${percentage} percent, ${signalLabel}`}
      accessible
      style={styles.shell}
    >
      <View style={[styles.gauge, { height: gaugeHeight, width: size }]}>
        {tickIndexes.map((index) => {
          const ratio = index / (tickCount - 1);
          const theta = Math.PI - ratio * Math.PI;
          const tickX = centerX + Math.cos(theta) * radiusPx;
          const tickY = centerY - Math.sin(theta) * radiusPx;
          const isActive = ratio <= clampedProbability + 0.001;
          const tickColor = isActive
            ? getProbabilityColor(ratio)
            : colors.border;
          const tickOpacity = isActive ? 1 : 0.58;

          return (
            <View
              key={index}
              style={[
                styles.tick,
                {
                  backgroundColor: tickColor,
                  left: tickX - 2,
                  opacity: tickOpacity,
                  top: tickY - 8,
                  transform: [{ rotate: `${(theta * 180) / Math.PI - 90}deg` }],
                },
              ]}
            />
          );
        })}

        <View style={styles.scoreGroup}>
          <Text style={styles.score}>{percentage}%</Text>
          <Text style={styles.scoreLabel}>AI signal</Text>
        </View>
      </View>

      <View style={styles.captionRow}>
        <Text style={styles.captionLabel}>Real</Text>
        <Text style={styles.captionSignal}>{signalLabel}</Text>
        <Text style={styles.captionLabel}>Fake</Text>
      </View>
    </View>
  );
}

function getSignalLabel(label: DetectionLabel, probability: number) {
  switch (label) {
    case "real":
      return "low signal";
    case "partially_real":
      return probability > 0.4 ? "mixed-low signal" : "low-mixed signal";
    case "partially_fake":
      return probability > 0.62 ? "mixed-high signal" : "review signal";
    case "fake":
      return "high signal";
  }
}

function getProbabilityColor(probability: number) {
  if (probability <= 0.5) {
    return mixHex(colors.likelyReal, colors.rewardMango, probability / 0.5);
  }

  return mixHex(colors.rewardMango, colors.likelyAi, (probability - 0.5) / 0.5);
}

function mixHex(startHex: string, endHex: string, amount: number) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  const value = clamp(amount, 0, 1);
  const red = Math.round(lerp(start.red, end.red, value));
  const green = Math.round(lerp(start.green, end.green, value));
  const blue = Math.round(lerp(start.blue, end.blue, value));

  return `rgb(${red}, ${green}, ${blue})`;
}

function hexToRgb(hex: string) {
  const normalizedHex = hex.replace("#", "");
  const value = Number.parseInt(normalizedHex, 16);

  return {
    blue: value & 255,
    green: (value >> 8) & 255,
    red: (value >> 16) & 255,
  };
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

const styles = StyleSheet.create({
  captionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  captionRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  captionSignal: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  gauge: {
    alignItems: "center",
    alignSelf: "center",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  score: {
    color: colors.textPrimary,
    fontSize: 42,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    lineHeight: 48,
  },
  scoreGroup: {
    alignItems: "center",
    bottom: spacing.md,
    gap: 2,
    position: "absolute",
  },
  scoreLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  shell: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.md,
  },
  tick: {
    borderRadius: 999,
    height: 16,
    position: "absolute",
    width: 4,
  },
});
