import LottieView from "lottie-react-native";
import { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

import { colors } from "../constants/theme";

const signalScanAnimation = require("../assets/animations/signal-scan.json");

type SignalLoaderProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function SignalLoader({ size = 72, style }: SignalLoaderProps) {
  const [isReduceMotionEnabled, setIsReduceMotionEnabled] = useState(false);
  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        height: size,
        width: size,
      },
      style,
    ],
    [size, style],
  );

  useEffect(() => {
    let isMounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((isEnabled) => {
      if (isMounted) {
        setIsReduceMotionEnabled(isEnabled);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setIsReduceMotionEnabled,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  return (
    <View
      accessibilityLabel="VigilVid signal scan animation"
      accessible
      style={containerStyle}
    >
      <LottieView
        autoPlay={!isReduceMotionEnabled}
        loop={!isReduceMotionEnabled}
        progress={isReduceMotionEnabled ? 0.42 : undefined}
        resizeMode="cover"
        source={signalScanAnimation}
        style={styles.animation}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  animation: {
    height: "124%",
    width: "124%",
  },
  container: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden",
  },
});
