import React from "react";
import { Pressable, StyleSheet } from "react-native";
import { SocialIcon, type SocialIconName } from "../SocialIcon";

export function CreationIconButton({
  label,
  icon,
  onPress,
  disabled,
  color,
}: {
  label: string;
  icon: SocialIconName;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.iconButton,
        { opacity: disabled ? 0.45 : pressed ? 0.65 : 1 },
      ]}
    >
      <SocialIcon name={icon} color={color} size={19} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 44,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
});
