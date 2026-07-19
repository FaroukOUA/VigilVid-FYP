import { useVideoPlayer, VideoView } from "expo-video";
import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../constants/theme";

export function LocalVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
  });

  return (
    <View style={styles.frame}>
      <VideoView
        contentFit="contain"
        nativeControls
        player={player}
        style={styles.video}
      />
      <View style={styles.captionBar}>
        <Text style={styles.caption}>Video preview</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.textPrimary,
    borderRadius: radius.md,
    gap: spacing.sm,
    overflow: "hidden",
  },
  video: {
    aspectRatio: 9 / 16,
    width: "100%",
  },
  captionBar: {
    backgroundColor: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  caption: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: "700",
  },
});
