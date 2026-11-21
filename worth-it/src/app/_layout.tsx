import { BrandLogo } from "../ui/BrandLogo";
import { AppThemeProvider } from "../ui/AppThemeProvider";
import { AppErrorBoundary } from "../ui/AppErrorBoundary";
import { Stack, router, usePathname } from "expo-router";
import React from "react";
import { ActivityIndicator, Text } from "react-native";
import { Banner, Button, Centered } from "../ui/kit";
import { supabase } from "../lib/supabase";
import { AppProvider, useAuth } from "../ui/AppContext";
import { FloatingStackHeader } from "../ui/FloatingHeader";
import { SettingsButton } from "../ui/SettingsButton";
import { useTheme } from "../ui/theme";

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AppErrorBoundary>
        <AppProvider>
          <Navigation />
        </AppProvider>
      </AppErrorBoundary>
    </AppThemeProvider>
  );
}

function Navigation() {
  const { colors, type, pageBackground, reducedEffects } = useTheme();
  // Main-tab capsules retain their viewport position instead of sliding with a pushed page.
  const mainTransition = {
    animation: reducedEffects ? "none" : "fade",
    animationDuration: 160,
  } as const;

  const {
    session,
    loading,
    error,
    refresh,
    security,
    securityLoading,
    securityError,
  } = useAuth();
  const locked =
    securityLoading ||
    !!securityError ||
    security.mfaRequired ||
    security.deactivated ||
    security.deletion_pending;
  const path = usePathname();
  const publicPage =
    /^\/(p\/|discover|login|signup|auth-confirm|password-reset|verify-human|privacy)/.test(
      path,
    );
  if (loading && !publicPage)
    return (
      <Centered>
        <BrandLogo size={64} />
        <ActivityIndicator size="large" color={colors.ink} />
        <Text style={type.small}>Starting Worth It?</Text>
      </Centered>
    );
  if (!supabase && error)
    return (
      <Centered>
        <Text style={type.h2}>Can’t start the app</Text>
        <Banner kind="error">{error}</Banner>
        <Button
          label="Try again"
          onPress={() => {
            void refresh();
          }}
        />
      </Centered>
    );
  return (
    <>
      {!session && error && process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ? (
        <Button
          label="Continue as a guest"
          onPress={() => router.push("/verify-human")}
        />
      ) : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "transparent" },
          header: (props) => <FloatingStackHeader {...props} />,
          headerShadowVisible: false,
          headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: "800" },
          contentStyle: { backgroundColor: pageBackground },
        }}
      >
        <Stack.Protected guard={!!session && !locked}>
          <Stack.Screen
            name="index"
            options={{
              title: "Worth It?",
              headerShown: false,
              ...mainTransition,
            }}
          />
          <Stack.Screen name="new" options={{ title: "New poll" }} />
          <Stack.Screen name="add" options={{ title: "Create" }} />
          <Stack.Screen name="new-post" options={{ title: "New post" }} />
          <Stack.Screen name="connections" options={{ title: "Connections" }} />
          <Stack.Screen name="archive" options={{ title: "Archive" }} />
          <Stack.Screen name="manage-post" options={{ title: "Manage post" }} />
          <Stack.Screen name="saved" options={{ title: "Saved Content" }} />
          <Stack.Screen name="feedback" options={{ title: "Feedback" }} />
          <Stack.Screen name="moderation" options={{ title: "Moderation" }} />
          <Stack.Screen name="account" options={{ title: "Settings" }} />
          <Stack.Screen
            name="settings/[section]"
            options={{ title: "Settings" }}
          />
          <Stack.Screen
            name="profile"
            options={{
              title: "Profile",
              headerTransparent: true,
              ...mainTransition,
              headerRight: () => <SettingsButton />,
            }}
          />
          <Stack.Screen
            name="search"
            options={{ title: "Spot", headerShown: false, ...mainTransition }}
          />
          <Stack.Screen name="member/[id]" options={{ title: "Profile" }} />
          <Stack.Screen
            name="follow-requests"
            options={{ title: "Follow requests" }}
          />
          <Stack.Screen name="comments" options={{ title: "Comments" }} />
          <Stack.Screen
            name="notifications"
            options={{ title: "Notifications" }}
          />
          <Stack.Screen
            name="reels"
            options={{ title: "Checks", headerShown: false, ...mainTransition }}
          />
          <Stack.Screen name="new-reel" options={{ title: "New check" }} />
        </Stack.Protected>
        <Stack.Protected guard={!!session && locked}>
          <Stack.Screen
            name="account-lock"
            options={{
              title: "Account verification",
              headerBackVisible: false,
            }}
          />
        </Stack.Protected>
        <Stack.Screen name="login" options={{ title: "Sign in" }} />
        <Stack.Screen name="signup" options={{ title: "Create account" }} />
        <Stack.Screen
          name="password-reset"
          options={{ title: "Password reset" }}
        />
        <Stack.Screen name="auth-confirm" options={{ title: "Verify email" }} />
        <Stack.Screen name="p/[id]" options={{ title: "Poll" }} />
        <Stack.Screen
          name="discover"
          options={{ title: "Discover questions" }}
        />
      </Stack>
    </>
  );
}
