import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  LayoutChangeEvent,
  PanResponderGestureState,
} from "react-native";

import { colors, radius, spacing } from "../constants/theme";

const MIN_SEGMENT_DURATION_SEC = 5;
const HANDLE_HIT_SLOP_PX = 32;

export type TrimSegment = {
  endSec: number;
  startSec: number;
};

type VideoTrimSelectorProps = {
  durationMs: number;
  maxDurationMs: number;
  onChange: (segment: TrimSegment) => void;
  thumbnailStripUrl: string | null;
  value: TrimSegment;
};

type DragMode = "end" | "range" | "start";
type ActiveDrag = {
  mode: DragMode;
  segment: TrimSegment;
};

export function VideoTrimSelector({
  durationMs,
  maxDurationMs,
  onChange,
  thumbnailStripUrl,
  value,
}: VideoTrimSelectorProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const durationSec = Math.max(0, durationMs / 1000);
  const maxSegmentDurationSec = Math.min(
    durationSec,
    Math.max(1, maxDurationMs / 1000),
  );
  const minSegmentDurationSec = Math.min(
    durationSec,
    maxSegmentDurationSec,
    MIN_SEGMENT_DURATION_SEC,
  );
  const segment = useMemo(
    () =>
      normalizeSegment(
        {
          endSec: value.endSec,
          startSec: value.startSec,
        },
        durationSec,
        maxSegmentDurationSec,
        minSegmentDurationSec,
      ),
    [
      durationSec,
      maxSegmentDurationSec,
      minSegmentDurationSec,
      value.endSec,
      value.startSec,
    ],
  );
  const segmentRef = useRef(segment);
  const activeDragRef = useRef<ActiveDrag | null>(null);

  useEffect(() => {
    segmentRef.current = segment;
  }, [segment]);

  const responder = useMemo(() => {
    function canStartDrag() {
      return trackWidth > 0 && durationSec > 0;
    }

    function configureDrag(locationX: number) {
      const currentSegment = segmentRef.current;
      const startX = secToPx(currentSegment.startSec, durationSec, trackWidth);
      const endX = secToPx(currentSegment.endSec, durationSec, trackWidth);
      const startDistance = Math.abs(locationX - startX);
      const endDistance = Math.abs(locationX - endX);
      let mode: DragMode = "range";
      const baseSegment = currentSegment;

      if (
        startDistance <= HANDLE_HIT_SLOP_PX &&
        startDistance <= endDistance
      ) {
        mode = "start";
      } else if (endDistance <= HANDLE_HIT_SLOP_PX) {
        mode = "end";
      }

      activeDragRef.current = {
        mode,
        segment: baseSegment,
      };
    }

    function moveSegment(
      mode: DragMode,
      baseSegment: TrimSegment,
      gestureState: PanResponderGestureState,
    ) {
      if (trackWidth <= 0 || durationSec <= 0) {
        return;
      }

      const deltaSec = (gestureState.dx / trackWidth) * durationSec;
      let nextSegment = baseSegment;

      if (mode === "start") {
        const lowerBound = Math.max(
          0,
          baseSegment.endSec - maxSegmentDurationSec,
        );
        const upperBound = Math.max(
          0,
          baseSegment.endSec - minSegmentDurationSec,
        );
        nextSegment = {
          endSec: baseSegment.endSec,
          startSec: clamp(
            baseSegment.startSec + deltaSec,
            lowerBound,
            upperBound,
          ),
        };
      }

      if (mode === "end") {
        const lowerBound = Math.min(
          durationSec,
          baseSegment.startSec + minSegmentDurationSec,
        );
        const upperBound = Math.min(
          durationSec,
          baseSegment.startSec + maxSegmentDurationSec,
        );
        nextSegment = {
          endSec: clamp(baseSegment.endSec + deltaSec, lowerBound, upperBound),
          startSec: baseSegment.startSec,
        };
      }

      if (mode === "range") {
        const segmentDurationSec = baseSegment.endSec - baseSegment.startSec;
        const nextStartSec = clamp(
          baseSegment.startSec + deltaSec,
          0,
          Math.max(0, durationSec - segmentDurationSec),
        );
        nextSegment = {
          endSec: nextStartSec + segmentDurationSec,
          startSec: nextStartSec,
        };
      }

      onChange(
        normalizeSegment(
          nextSegment,
          durationSec,
          maxSegmentDurationSec,
          minSegmentDurationSec,
        ),
      );
    }

    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        canStartDrag() &&
        Math.abs(gestureState.dx) > 3 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderGrant: (event, gestureState) => {
        configureDrag(event.nativeEvent.locationX - gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        const activeDrag = activeDragRef.current;

        if (!activeDrag) {
          return;
        }

        moveSegment(activeDrag.mode, activeDrag.segment, gestureState);
      },
      onPanResponderRelease: () => {
        activeDragRef.current = null;
      },
      onPanResponderTerminate: () => {
        activeDragRef.current = null;
      },
      onPanResponderTerminationRequest: () => false,
      onStartShouldSetPanResponder: () => false,
    });
  }, [
    durationSec,
    maxSegmentDurationSec,
    minSegmentDurationSec,
    onChange,
    trackWidth,
  ]);

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    const nextTrackWidth = event.nativeEvent.layout.width;
    setTrackWidth((currentTrackWidth) =>
      currentTrackWidth === nextTrackWidth
        ? currentTrackWidth
        : nextTrackWidth,
    );
  };

  const leftPx =
    durationSec > 0 ? (segment.startSec / durationSec) * trackWidth : 0;
  const widthPx =
    durationSec > 0
      ? ((segment.endSec - segment.startSec) / durationSec) * trackWidth
      : 0;
  const rightDimLeft = leftPx + widthPx;

  return (
    <View style={styles.container}>
      <View onLayout={handleTrackLayout} style={styles.track}>
        {thumbnailStripUrl ? (
          <Image
            contentFit="cover"
            source={{ uri: thumbnailStripUrl }}
            style={styles.thumbnailStrip}
          />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Text style={styles.thumbnailPlaceholderText}>
              Preview frames unavailable
            </Text>
          </View>
        )}

        <View
          pointerEvents="none"
          style={[styles.dimmedRange, { left: 0, width: leftPx }]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.dimmedRange,
            { left: rightDimLeft, right: 0 },
          ]}
        />

        <View
          accessibilityLabel="Selected video part"
          accessibilityRole="adjustable"
          accessible
          pointerEvents="none"
          style={[
            styles.selectionFrame,
            {
              left: leftPx,
              width: widthPx,
            },
          ]}
        >
          <View
            accessibilityLabel="Trim start"
            accessibilityRole="adjustable"
            accessible
            style={[styles.handle, styles.leftHandle]}
          >
            <View style={styles.handleGrip} />
          </View>
          <View style={styles.selectionFill} />
          <View
            accessibilityLabel="Trim end"
            accessibilityRole="adjustable"
            accessible
            style={[styles.handle, styles.rightHandle]}
          >
            <View style={styles.handleGrip} />
          </View>
        </View>
        <View
          {...responder.panHandlers}
          accessibilityLabel="Adjust selected video part"
          accessibilityRole="adjustable"
          accessible
          style={styles.gestureLayer}
        />
      </View>
      <View style={styles.timeScale}>
        <Text style={styles.timeScaleText}>0:00</Text>
        <Text style={styles.timeScaleText}>{formatSeconds(durationSec)}</Text>
      </View>
    </View>
  );
}

function normalizeSegment(
  value: TrimSegment,
  durationSec: number,
  maxSegmentDurationSec: number,
  minSegmentDurationSec: number,
): TrimSegment {
  if (durationSec <= 0) {
    return { endSec: 0, startSec: 0 };
  }

  let startSec = clamp(value.startSec, 0, durationSec);
  let endSec = clamp(value.endSec, startSec, durationSec);

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

  if (endSec - startSec < minSegmentDurationSec) {
    startSec = Math.max(0, endSec - minSegmentDurationSec);
  }

  return {
    endSec: roundSeconds(endSec),
    startSec: roundSeconds(startSec),
  };
}

function clamp(value: number, min: number, max: number) {
  if (max < min) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function roundSeconds(value: number) {
  return Math.round(value * 100) / 100;
}

function secToPx(seconds: number, durationSec: number, trackWidth: number) {
  if (durationSec <= 0 || trackWidth <= 0) {
    return 0;
  }

  return (seconds / durationSec) * trackWidth;
}

function formatSeconds(seconds: number) {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  dimmedRange: {
    backgroundColor: "rgba(15, 23, 42, 0.58)",
    bottom: 0,
    position: "absolute",
    top: 0,
  },
  handle: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.primaryTeal,
    borderWidth: 2,
    bottom: -2,
    justifyContent: "center",
    position: "absolute",
    top: -2,
    width: 22,
    zIndex: 2,
  },
  handleGrip: {
    backgroundColor: colors.primaryTeal,
    borderRadius: 1,
    height: 30,
    width: 3,
  },
  gestureLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 3,
  },
  leftHandle: {
    borderBottomLeftRadius: radius.sm,
    borderTopLeftRadius: radius.sm,
    left: -2,
  },
  rightHandle: {
    borderBottomRightRadius: radius.sm,
    borderTopRightRadius: radius.sm,
    right: -2,
  },
  selectionFill: {
    backgroundColor: "rgba(15, 118, 110, 0.14)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  selectionFrame: {
    borderColor: colors.primaryTeal,
    borderRadius: radius.sm,
    borderWidth: 2,
    bottom: 0,
    overflow: "visible",
    position: "absolute",
    top: 0,
  },
  thumbnailPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  thumbnailPlaceholderText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  thumbnailStrip: {
    backgroundColor: colors.textPrimary,
    height: "100%",
    width: "100%",
  },
  timeScale: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  timeScaleText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
  },
  track: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.sm,
    height: 86,
    overflow: "hidden",
    position: "relative",
    width: "100%",
  },
});
