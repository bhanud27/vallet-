import React from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";
import { BlurView } from "expo-blur";
import {
  GlassView,
  isLiquidGlassAvailable,
  isGlassEffectAPIAvailable,
} from "expo-glass-effect";
import { useTheme } from "./theme";
import { useThemeBackdrop } from "./ThemeBackdrop";

/** Reused by creation, profile and navigation. Scrolling cards use tint only. */
export function ThemeSurface({
  children,
  style,
  frost = false,
  tone = "theme",
  ...props
}: ViewProps & { frost?: boolean; tone?: "theme" | "dark" }) {
  const { colors, mode, glass, surfaceFill } = useTheme();
  const target = useThemeBackdrop();
  const surfaceMode = tone === "dark" ? "dark" : mode;
  const fill =
    tone === "dark" ? (glass ? "rgba(18,18,18,0.86)" : "#171717") : surfaceFill;
  const border =
    tone === "dark" ? (glass ? "#FFFFFF42" : "#383838") : colors.border;
  const nativeGlass =
    glass &&
    frost &&
    Platform.OS === "ios" &&
    isLiquidGlassAvailable() &&
    isGlassEffectAPIAvailable();
  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: tone === "dark" ? "#171717" : colors.surface,
          borderWidth: glass ? 1 : 0,
          borderColor: border,
          borderRadius: 20,
          overflow: "hidden",
        },
        style,
        glass && { backgroundColor: fill, borderColor: border },
      ]}
    >
      {glass && frost ? (
        nativeGlass ? (
          <GlassView
            pointerEvents="none"
            colorScheme={surfaceMode}
            glassEffectStyle="regular"
            tintColor={surfaceMode === "dark" ? "#00000033" : "#FFFFFF33"}
            style={StyleSheet.absoluteFill}
          />
        ) : Platform.OS !== "android" || target ? (
          <BlurView
            pointerEvents="none"
            {...(Platform.OS === "android"
              ? {
                  blurTarget: target,
                  blurMethod: "dimezisBlurViewSdk31Plus" as const,
                }
              : {})}
            intensity={28}
            tint={surfaceMode}
            style={StyleSheet.absoluteFill}
          />
        ) : null
      ) : null}
      {glass && frost && tone === "dark" ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: "rgba(12,12,12,0.65)" },
          ]}
        />
      ) : null}
      {glass ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 12,
            right: 12,
            height: 1,
            backgroundColor: surfaceMode === "dark" ? "#FFFFFF4D" : "#FFFFFF",
          }}
        />
      ) : null}
      {children}
    </View>
  );
}
