import { router } from "expo-router";
import React from "react";
import { Pressable } from "react-native";
import { SocialIcon } from "./SocialIcon";
import { useTheme } from "./theme";
export function SettingsButton() {
  const { colors } = useTheme();
  return (
    <Pressable
      testID="account-link"
      accessibilityRole="button"
      accessibilityLabel="Settings"
      onPress={() => router.push("/account")}
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <SocialIcon name="settings" color={colors.ink} />
    </Pressable>
  );
}
