import { Link } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, radius, spacing } from "../../constants/theme";
import { detectRoute } from "../../lib/routes";

export default function PrivacyScreen() {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      style={styles.screen}
    >
      <View style={styles.header}>
        <Text style={styles.title}>What VigilVid keeps</Text>
        <Text style={styles.body}>
          You can check videos without an account. When you sign in, VigilVid
          saves result summaries to History automatically.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Video checks</Text>
        <Text style={styles.body}>
          Videos are used only to prepare your result. VigilVid does not keep
          the video after the check.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Saved results</Text>
        <Text style={styles.body}>
          If you are signed in, History keeps the result summary: verdict, AI
          signal, check time, video length, and the date. If you are not signed
          in, the result is not saved to your account.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Manage saved data</Text>
        <Text style={styles.body}>
          Sign out before checking a video if you do not want that result saved
          to your account. For account data help, contact the project owner.
        </Text>
      </View>

      <View style={styles.actions}>
        <Link href={detectRoute} asChild>
          <Pressable accessibilityRole="button" style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Check a video</Text>
          </Pressable>
        </Link>
        <Link href="/account" asChild>
          <Pressable accessibilityRole="button" style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Account</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
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
  card: {
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
  actions: {
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
