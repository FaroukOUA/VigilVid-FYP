import Feather from "@expo/vector-icons/Feather";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "../../constants/theme";
import {
  educationTopics,
  type EducationTopic,
} from "../../data/education";
import { detectRoute } from "../../lib/routes";

export default function EducationScreen() {
  const [expandedTopicId, setExpandedTopicId] = useState(
    educationTopics[0]?.id ?? "",
  );

  const handleTopicPress = (topicId: string) => {
    setExpandedTopicId((currentTopicId) =>
      currentTopicId === topicId ? "" : topicId,
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Learn before sharing</Text>
        <Text style={styles.body}>
          Short guides for checking videos, understanding AI media, and reading
          VigilVid results without overclaiming certainty.
        </Text>
      </View>

      <View style={styles.topicList}>
        {educationTopics.map((topic) => (
          <EducationCard
            isExpanded={expandedTopicId === topic.id}
            key={topic.id}
            onPress={() => handleTopicPress(topic.id)}
            topic={topic}
          />
        ))}
      </View>

      <View style={styles.actionRow}>
        <Link href={detectRoute} asChild>
          <Pressable accessibilityRole="button" style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Scan a video</Text>
          </Pressable>
        </Link>
        <Link href="/privacy" asChild>
          <Pressable accessibilityRole="button" style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Privacy</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

function EducationCard({
  isExpanded,
  onPress,
  topic,
}: {
  isExpanded: boolean;
  onPress: () => void;
  topic: EducationTopic;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: isExpanded }}
      onPress={onPress}
      style={styles.topicCard}
    >
      <View
        style={[styles.topicAccent, { backgroundColor: topic.accentColor }]}
      />
      <View style={styles.topicBody}>
        <View style={styles.topicHeader}>
          <View style={styles.topicTitleGroup}>
            <Text style={[styles.topicCategory, { color: topic.accentColor }]}>
              {topic.category}
            </Text>
            <Text style={styles.topicTitle}>{topic.title}</Text>
          </View>
          <Feather
            color={colors.textSecondary}
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={20}
          />
        </View>

        <Text style={styles.topicSummary}>{topic.summary}</Text>

        {isExpanded ? (
          <View style={styles.keyPointList}>
            {topic.keyPoints.map((point) => (
              <View key={point} style={styles.keyPointRow}>
                <View
                  style={[
                    styles.keyPointDot,
                    { backgroundColor: topic.accentColor },
                  ]}
                />
                <Text style={styles.keyPointText}>{point}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
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
  header: {
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: "700",
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  topicList: {
    gap: spacing.md,
  },
  topicCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    overflow: "hidden",
  },
  topicAccent: {
    width: 5,
  },
  topicBody: {
    flex: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  topicHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  topicTitleGroup: {
    flex: 1,
    gap: spacing.xs,
  },
  topicCategory: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  topicTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 24,
  },
  topicSummary: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  keyPointList: {
    gap: spacing.sm,
  },
  keyPointRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
  },
  keyPointDot: {
    borderRadius: 4,
    height: 8,
    marginTop: 7,
    width: 8,
  },
  keyPointText: {
    color: colors.textSecondary,
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
  },
  actionRow: {
    gap: spacing.md,
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
