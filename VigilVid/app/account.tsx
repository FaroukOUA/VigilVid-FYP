import Feather from "@expo/vector-icons/Feather";
import * as Haptics from "expo-haptics";
import { Link, Stack } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radius, spacing } from "../constants/theme";
import { useAuth } from "../hooks/use-auth";

type AuthMode = "sign-in" | "sign-up";
type FeatherIconName = keyof typeof Feather.glyphMap;

export default function AccountScreen() {
  const {
    isConfigured,
    isLoading,
    signIn,
    signOut,
    signUp,
    user,
  } = useAuth();
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedEmail = email.trim();
  const canSubmit = useMemo(
    () =>
      isConfigured &&
      normalizedEmail.includes("@") &&
      password.length >= 6 &&
      !isLoading &&
      !isSubmitting,
    [isConfigured, isLoading, isSubmitting, normalizedEmail, password],
  );

  const handleAuthPress = async () => {
    if (!canSubmit) {
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setIsSubmitting(true);

    try {
      if (authMode === "sign-in") {
        await signIn(normalizedEmail, password);
        setStatusMessage("Signed in.");
      } else {
        await signUp(normalizedEmail, password);
        setStatusMessage("Account created. Check your email if needed.");
      }

      setPassword("");
      void Haptics.selectionAsync();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Account request failed.",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOutPress = async () => {
    setErrorMessage("");
    setStatusMessage("");
    setIsSubmitting(true);

    try {
      await signOut();
      setStatusMessage("Signed out.");
      void Haptics.selectionAsync();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign out failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Account" }} />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        style={styles.screen}
      >
        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <View style={styles.avatarFrame}>
              <Feather
                color={user ? colors.primaryTeal : colors.textSecondary}
                name={user ? "user-check" : "user"}
                size={24}
              />
            </View>
            <View style={styles.accountStatusPill}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: user ? colors.likelyReal : colors.uncertain },
                ]}
              />
              <Text style={styles.accountStatusText}>
                {user ? "Signed in" : "Guest mode"}
              </Text>
            </View>
          </View>

          <View style={styles.profileCopy}>
            <Text style={styles.body}>
              {user
                ? "Your signed-in profile is active on this device."
                : "You can check videos without signing in. Sign in only if you want account saving."}
            </Text>
          </View>

          {user ? (
            <View style={styles.infoPanel}>
              <InfoRow
                icon="mail"
                label="Email"
                value={user.email ?? "Signed-in account"}
              />
            </View>
          ) : null}
        </View>

        {!isConfigured ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Accounts are not available</Text>
            <Text selectable style={styles.body}>
              Account sign-in is not set up on this device. You can still check
              videos without signing in.
            </Text>
          </View>
        ) : null}

        {isConfigured && isLoading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.analysisBlue} />
            <Text style={styles.sectionTitle}>Checking account</Text>
          </View>
        ) : null}

        {isConfigured && !isLoading && user ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Manage account</Text>
            <View style={styles.linkList}>
              <Link href="/privacy" asChild>
                <Pressable accessibilityRole="button" style={styles.linkRow}>
                  <View style={styles.linkIconFrame}>
                    <Feather color={colors.primaryTeal} name="shield" size={18} />
                  </View>
                  <View style={styles.linkCopy}>
                    <Text style={styles.linkTitle}>Privacy</Text>
                    <Text style={styles.linkDescription}>
                      See what VigilVid keeps and what it does not keep.
                    </Text>
                  </View>
                  <Feather color={colors.textSecondary} name="chevron-right" size={18} />
                </Pressable>
              </Link>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting}
              onPress={handleSignOutPress}
              style={[styles.secondaryButton, isSubmitting && styles.disabledButton]}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  isSubmitting && styles.disabledButtonText,
                ]}
              >
                Sign out
              </Text>
            </Pressable>
          </View>
        ) : null}

        {isConfigured && !isLoading && !user ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Account sign-in</Text>
            <View style={styles.segmentedControl}>
              <AuthModeButton
                isSelected={authMode === "sign-in"}
                label="Sign in"
                onPress={() => setAuthMode("sign-in")}
              />
              <AuthModeButton
                isSelected={authMode === "sign-up"}
                label="Create account"
                onPress={() => setAuthMode("sign-up")}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                textContentType="emailAddress"
                value={email}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setPassword}
                placeholder="Minimum 6 characters"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                style={styles.input}
                textContentType={
                  authMode === "sign-in" ? "password" : "newPassword"
                }
                value={password}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              disabled={!canSubmit}
              onPress={handleAuthPress}
              style={[styles.primaryButton, !canSubmit && styles.disabledButton]}
            >
              <Text
                style={[
                  styles.primaryButtonText,
                  !canSubmit && styles.disabledButtonText,
                ]}
              >
                {isSubmitting
                  ? "Working"
                  : authMode === "sign-in"
                    ? "Sign in"
                    : "Create account"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {statusMessage ? (
          <Text selectable style={styles.statusText}>
            {statusMessage}
          </Text>
        ) : null}

        {errorMessage ? (
          <Text selectable style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: FeatherIconName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconFrame}>
        <Feather color={colors.primaryTeal} name={icon} size={16} />
      </View>
      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text selectable={label === "Email"} style={styles.infoValue}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function AuthModeButton({
  isSelected,
  label,
  onPress,
}: {
  isSelected: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      onPress={onPress}
      style={[styles.segmentButton, isSelected && styles.segmentButtonSelected]}
    >
      <Text
        style={[
          styles.segmentLabel,
          isSelected && styles.segmentLabelSelected,
        ]}
      >
        {label}
      </Text>
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
  profileCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.lg,
    overflow: "hidden",
    padding: spacing.lg,
  },
  profileTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
  },
  avatarFrame: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  accountStatusPill: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    flexDirection: "row",
    gap: spacing.sm,
    minHeight: 34,
    paddingHorizontal: spacing.md,
  },
  statusDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  accountStatusText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "800",
  },
  profileCopy: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: "800",
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
  },
  infoPanel: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    gap: spacing.md,
    padding: spacing.md,
  },
  infoRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
  },
  infoIconFrame: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  infoCopy: {
    flex: 1,
    gap: 2,
  },
  infoLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  infoValue: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.lg,
    padding: spacing.lg,
  },
  linkList: {
    gap: spacing.sm,
  },
  linkRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 72,
    padding: spacing.md,
  },
  linkIconFrame: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  linkCopy: {
    flex: 1,
    gap: 2,
  },
  linkTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "800",
  },
  linkDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
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
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  segmentButtonSelected: {
    backgroundColor: colors.surface,
  },
  segmentLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  segmentLabelSelected: {
    color: colors.primaryTeal,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: "700",
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
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
  disabledButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  disabledButtonText: {
    color: colors.textSecondary,
  },
  statusText: {
    color: colors.primaryTeal,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: colors.likelyAi,
    fontSize: 14,
    lineHeight: 20,
  },
});
