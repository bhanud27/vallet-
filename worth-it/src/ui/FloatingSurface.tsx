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
  creation = false,
  ...props
}: ViewProps & {
  tone?: "theme" | "dark";
  radius?: number;
  creation?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const {
    glass,
    glossy,
    reducedEffects,
    mode,
    colors,
    creation: tokens,
  } = useTheme();
  const dark = tone === "dark" || mode === "dark";
  return (
    <View
      pointerEvents="box-none"
      style={[
        {
          backgroundColor: "transparent",
          borderRadius: radius,
          boxShadow: glossy
            ? reducedEffects
              ? undefined
              : `0px 5px 18px ${glossy.shadow}`
            : creation
              ? undefined
              : dark
                ? "0px 4px 16px rgba(0,0,0,0.20)"
                : "0px 4px 14px rgba(0,0,0,0.08)",
        },
        containerStyle,
      ]}
    >
      <ThemeSurface
        {...props}
        tone={tone}
        creation={creation}
        frost
        material="navigation"
        style={[
          {
            backgroundColor: creation
              ? tokens.navigation
              : tone === "dark"
                ? "#171717"
                : colors.surface,
            borderRadius: radius,
            borderWidth: 1,
            borderColor: creation
              ? tokens.border
              : tone === "dark"
                ? "#383838"
                : colors.border,
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
