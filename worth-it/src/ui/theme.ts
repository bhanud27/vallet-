import { createContext, useContext } from "react";
import type { Choice } from "../lib/types";
import { colorPalettes, type ColorMode } from "../lib/colorTheme";
export type { ColorMode, ThemeColors } from "../lib/colorTheme";

export type AppearanceStyle = "normal" | "glass";
export function createTheme(
  mode: ColorMode,
  appearance: AppearanceStyle = "normal",
  reducedEffects = false,
) {
  const glass = appearance === "glass" && !reducedEffects;
  const base = colorPalettes[mode];
  // Solid equivalents also theme inputs/rows that do not need a native blur view.
  const colors =
    appearance === "glass"
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
    pageBackground: glass ? "transparent" : colors.bg,
    surfaceFill: glass
      ? mode === "dark"
        ? "rgba(18,18,18,0.82)"
        : "rgba(255,255,255,0.88)"
      : colors.surface,
    colors,
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
