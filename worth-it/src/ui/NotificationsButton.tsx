import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { SocialIcon } from "./SocialIcon";
import { themedStyles, useTheme } from "./theme";

export function NotificationsButton() {
  const { colors } = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Notifications"
      onPress={() => router.navigate("/notifications")}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <SocialIcon name="bell" color={colors.ink} />
    </Pressable>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    button: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
    },
    pressed: { backgroundColor: colors.accentSoft },
  }),
);
