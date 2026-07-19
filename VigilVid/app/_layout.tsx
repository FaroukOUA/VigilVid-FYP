import { Stack, router, usePathname } from "expo-router";
import { ShareIntentProvider, useShareIntentContext } from "expo-share-intent";
import { useEffect } from "react";

import { colors } from "../constants/theme";
import { AuthProvider } from "../hooks/use-auth";

export default function RootLayout() {
  return (
    <ShareIntentProvider options={{ resetOnBackground: false }}>
      <AuthProvider>
        <ShareIntentGate />
        <Stack
          screenOptions={{
            headerShadowVisible: true,
            headerStyle: {
              backgroundColor: colors.primaryTeal,
            },
            headerTintColor: colors.surface,
            headerTitleStyle: {
              color: colors.surface,
              fontSize: 20,
              fontWeight: "700",
            },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </ShareIntentProvider>
  );
}

function ShareIntentGate() {
  const pathname = usePathname();
  const { hasShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (hasShareIntent && pathname !== "/share") {
      router.replace("/share");
    }
  }, [hasShareIntent, pathname]);

  return null;
}
