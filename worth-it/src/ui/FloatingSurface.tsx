import React from "react";
import {
  View,
  type ViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ThemeSurface } from "./ThemeSurface";
import { useTheme } from "./theme";

/** One shared capsule material for headers and bottom navigation. */
export function FloatingSurface({
  children,
  style,
  containerStyle,
  tone = "theme",
  radius = 32,
  ...props
}: ViewProps & {
  tone?: "theme" | "dark";
  radius?: number;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const { glass, mode, colors } = useTheme();
  const dark = tone === "dark" || mode === "dark";
  return (
    <View
      pointerEvents="box-none"
      style={[
        {
          backgroundColor: "transparent",
          borderRadius: radius,
          boxShadow: dark
            ? "0px 4px 16px rgba(0,0,0,0.20)"
            : "0px 4px 14px rgba(0,0,0,0.08)",
        },
        containerStyle,
      ]}
    >
      <ThemeSurface
        {...props}
        tone={tone}
        frost
        style={[
          {
            backgroundColor: tone === "dark" ? "#171717" : colors.surface,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: tone === "dark" ? "#383838" : colors.border,
          },
          style,
        ]}
      >
        {glass ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 0,
              left: 24,
              right: 24,
              height: 1,
              backgroundColor: dark ? "#FFFFFF20" : "#FFFFFF",
            }}
          />
        ) : null}
        {children}
      </ThemeSurface>
    </View>
  );
}
