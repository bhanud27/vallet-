import { createContext, useContext } from "react";
import type { Choice } from "../lib/types";
import {
  colorPalettes,
  glossyColors,
  glossyMaterials,
  type ColorMode,
} from "../lib/colorTheme";
export type { ColorMode, ThemeColors } from "../lib/colorTheme";

export const appearanceLabels = {
  normal: "Normal",
  glossy: "Glossy Dark",
  glass: "Liquid Glass",
} as const;
export type AppearanceStyle = keyof typeof appearanceLabels;
export const isAppearanceStyle = (value: unknown): value is AppearanceStyle =>
  typeof value === "string" && Object.hasOwn(appearanceLabels, value);
export function createTheme(
  preferredMode: ColorMode,
  appearance: AppearanceStyle = "normal",
  reducedEffects = false,
) {
  const glossy = appearance === "glossy" ? glossyMaterials : undefined;
  const mode = glossy ? "dark" : preferredMode;
  const glass = appearance === "glass" && !reducedEffects;
  const base = colorPalettes[mode];
  // Solid equivalents also theme inputs/rows that do not need a native blur view.
  const colors = glossy
    ? glossyColors
    : appearance === "glass"
      ? {
          ...base,
          bg: mode === "dark" ? "#000000" : "#FFFFFF",
          surface: mode === "dark" ? "#121212" : "#FFFFFF",
          border: mode === "dark" ? "#454545" : "#DCDCDC",
          media: mode === "dark" ? "#1C1C1C" : "#F3F3F3",
        }
      : base;
  return {
    mode,
    appearance,
    reducedEffects,
    glass,
    glossy,
    pageBackground: glass ? "transparent" : colors.bg,
    surfaceFill: glass
      ? mode === "dark"
        ? "rgba(18,18,18,0.82)"
        : "rgba(255,255,255,0.88)"
      : colors.surface,
    colors,
    creation: glossy
      ? {
          page: colors.bg,
          card: colors.surface,
          navigation: glossy.navigation,
          secondary: colors.muted,
          border: glossy.border,
          divider: glossy.border,
          media: glossy.secondary,
          glassFill: glossy.cardFill,
          glassBorder: glossy.border,
        }
      : {
          page: mode === "dark" ? "#111310" : "#F7F8F4",
          card: mode === "dark" ? "#1C1E1A" : "#FFFFFF",
          navigation: mode === "dark" ? "#20221E" : "#FFFFFF",
          secondary: mode === "dark" ? "#A5A8A0" : "#54594E",
          border: mode === "dark" ? "#393D33" : "#D8DCCF",
          divider: mode === "dark" ? "#30332C" : "#E4E7DE",
          media: mode === "dark" ? "#282B25" : "#EDF0E8",
          glassFill:
            mode === "dark" ? "rgba(39,43,33,0.84)" : "rgba(255,255,255,0.86)",
          glassBorder: mode === "dark" ? "#FFFFFF29" : "#A0A99266",
        },
    choiceColor: {
      buy: colors.buy,
      wait: colors.wait,
      skip: colors.skip,
    } as Record<Choice, string>,
    choiceBackground: {
      buy: colors.buyBg,
      wait: colors.waitBg,
      skip: colors.skipBg,
    } as Record<Choice, string>,
    type: {
      title: {
        fontSize: 27,
        lineHeight: 32,
        fontWeight: "800" as const,
        color: colors.ink,
        letterSpacing: -0.65,
      },
      h2: {
        fontSize: 18,
        lineHeight: 24,
        fontWeight: "800" as const,
        color: colors.ink,
        letterSpacing: -0.2,
      },
      body: { fontSize: 16, lineHeight: 22, color: colors.ink },
      small: { fontSize: 13, lineHeight: 18, color: colors.muted },
    },
  };
}
export const themes = {
  light: createTheme("light"),
  dark: createTheme("dark"),
};
export type AppTheme = ReturnType<typeof createTheme>;
export const ThemeContext = createContext<AppTheme>(themes.light);
export function useTheme() {
  return useContext(ThemeContext);
}
/** Cache each component's styles by immutable theme, retaining state on appearance changes. */
export function themedStyles<T>(factory: (theme: AppTheme) => T) {
  const cache = new WeakMap<AppTheme, T>();
  return function useThemedStyles(): T {
    const theme = useTheme();
    if (!cache.has(theme)) cache.set(theme, factory(theme));
    return cache.get(theme)!;
  };
}
