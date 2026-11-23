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

type Material = "card" | "navigation" | "field" | "sheet";

/** A static reflection sits behind content, including photographs and input text. */
export function GlossyReflection({ strong = false }: { strong?: boolean }) {
  const { glossy, reducedEffects } = useTheme();
  if (!glossy) return null;
  const gradient = `linear-gradient(to bottom, ${strong ? glossy.strongReflection : glossy.reflection}, rgba(255,255,255,0))`;
  return (
    <View
      pointerEvents="none"
      aria-hidden
      style={[
        styles.reflection,
        {
          borderTopColor: strong ? glossy.edge : glossy.subtleEdge,
          height: strong ? 48 : 32,
        },
        !reducedEffects && { backgroundImage: gradient },
      ]}
    />
  );
}

/** Scrolling cards use a static reflection. Only floating surfaces use backdrop blur. */
export function ThemeSurface({
  children,
  style,
  frost = false,
  tone = "theme",
  creation = false,
  focusColor,
  material = "card",
  ...props
}: ViewProps & {
  frost?: boolean;
  tone?: "theme" | "dark";
  creation?: boolean;
  focusColor?: string;
  material?: Material;
}) {
  const {
    colors,
    mode,
    glass,
    glossy,
    reducedEffects,
    surfaceFill,
    creation: tokens,
  } = useTheme();
  const target = useThemeBackdrop();
  const surfaceMode = tone === "dark" ? "dark" : mode;
  const fill = creation
    ? tokens.glassFill
    : tone === "dark"
      ? glass
        ? "rgba(18,18,18,0.86)"
        : "#171717"
      : surfaceFill;
  const border = creation
    ? tokens.glassBorder
    : tone === "dark"
      ? glass
        ? "#FFFFFF42"
        : "#383838"
      : colors.border;
  const prominent = material === "navigation" || material === "sheet";
  const android = Platform.OS === "android";
  const canBlur = !android || (!!target && Number(Platform.Version) >= 31);
  const glossyBlur =
    !!glossy &&
    !reducedEffects &&
    frost &&
    prominent &&
    canBlur &&
    !(android && material === "sheet");
  const glossyFill =
    glossy &&
    (material === "field"
      ? glossy.secondary
      : material === "navigation"
        ? glossyBlur
          ? glossy.navigationFill
          : glossy.navigation
        : material === "sheet"
          ? glossyBlur
            ? glossy.sheetFill
            : glossy.elevated
          : reducedEffects
            ? colors.surface
            : glossy.cardFill);
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
        glossy && {
          backgroundColor: glossyFill,
          borderWidth: 1,
          borderColor: prominent ? glossy.emphasizedBorder : glossy.border,
        },
        focusColor && { borderColor: focusColor },
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
      {glossyBlur ? (
        <BlurView
          pointerEvents="none"
          {...(android
            ? {
                blurTarget: target,
                blurMethod: "dimezisBlurViewSdk31Plus" as const,
              }
            : {})}
          intensity={16}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {glossy && material !== "field" ? (
        <GlossyReflection strong={prominent} />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  reflection: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
