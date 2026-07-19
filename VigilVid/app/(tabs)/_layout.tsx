import Feather from "@expo/vector-icons/Feather";
import { Tabs, router } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet } from "react-native";

import { colors } from "../../constants/theme";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: true,
        headerRight: () => (
          <Pressable
            accessibilityLabel="Open account"
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => router.push("/account")}
            style={styles.headerIconButton}
          >
            <Feather color={colors.surface} name="user" size={22} />
          </Pressable>
        ),
        headerStyle: {
          backgroundColor: colors.primaryTeal,
        },
        headerTitleStyle: {
          color: colors.surface,
          fontSize: 20,
          fontWeight: "700",
        },
        headerTintColor: colors.surface,
        tabBarActiveTintColor: colors.primaryTeal,
        tabBarHideOnKeyboard: true,
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "700",
        },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: "Home",
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <TabIcon color={color} name="home" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="education"
        options={{
          tabBarLabel: "Learn",
          title: "Education",
          tabBarIcon: ({ color, size }) => (
            <TabIcon color={color} name="book-open" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="game"
        options={{
          tabBarLabel: "Game",
          title: "Real or Fake",
          tabBarIcon: ({ color, size }) => (
            <TabIcon color={color} name="play-circle" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          tabBarLabel: "History",
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <TabIcon color={color} name="clock" size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="privacy"
        options={{
          href: null,
          title: "Privacy",
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  color,
  name,
  size,
}: {
  color: string;
  name: FeatherIconName;
  size: number;
}) {
  return <Feather color={color} name={name} size={size} />;
}

const styles = StyleSheet.create({
  headerIconButton: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginRight: 12,
    width: 40,
  },
});
