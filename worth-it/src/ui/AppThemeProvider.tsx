import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import React, {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Appearance, Platform, View, useColorScheme } from "react-native";
import { isColorMode, type ColorMode } from "../lib/colorTheme";
import { ThemeContext, createTheme, type AppearanceStyle } from "./theme";
import { ThemeBackdrop } from "./ThemeBackdrop";
import { useReducedEffects } from "./useReducedEffects";
export type { AppearanceStyle } from "./theme";
export const APPEARANCE_KEY = "worthit:appearance:v1";
export const COLOR_MODE_KEY = "worthit:color-mode:v1";
type Preference = ColorMode | "system";
const ThemeActions = createContext<{
  setMode: (mode: Preference) => Promise<void>;
  preference: Preference;
  appearance: AppearanceStyle;
  setAppearance: (value: AppearanceStyle) => Promise<void>;
}>({
  preference: "system",
  appearance: "normal",
  setAppearance: async () => undefined,
  setMode: async () => {
    throw new Error("Theme provider is unavailable.");
  },
});
export const useThemeActions = () => useContext(ThemeActions);
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<Preference>("system"),
    [ready, setReady] = useState(false);
  const [appearance, setAppearanceState] = useState<AppearanceStyle>("normal");
  const system = useColorScheme(),
    mode =
      preference === "system"
        ? system === "dark"
          ? "dark"
          : "light"
        : preference,
    reducedEffects = useReducedEffects(),
    theme = useMemo(
      () => createTheme(mode, appearance, reducedEffects),
      [mode, appearance, reducedEffects],
    ),
    colors = theme.colors;
  useEffect(() => {
    let active = true;
    void Promise.all([
      AsyncStorage.getItem(COLOR_MODE_KEY),
      AsyncStorage.getItem(APPEARANCE_KEY),
    ])
      .then(([value, style]) => {
        if (active && (style === "normal" || style === "glass"))
          setAppearanceState(style);
        if (active && (isColorMode(value) || value === "system"))
          setPreference(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (Platform.OS !== "web") {
      Appearance.setColorScheme(preference === "system" ? "auto" : mode);
      void SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
      return;
    }
    document.documentElement.style.colorScheme = mode;
    document.body.style.backgroundColor = colors.bg;
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = colors.bg;
  }, [mode, colors.bg, preference]);
  async function setMode(next: Preference) {
    const old = preference;
    setPreference(next);
    try {
      await AsyncStorage.setItem(COLOR_MODE_KEY, next);
    } catch (error) {
      setPreference(old);
      throw error;
    }
  }
  async function setAppearance(value: AppearanceStyle) {
    const previous = appearance;
    setAppearanceState(value);
    try {
      await AsyncStorage.setItem(APPEARANCE_KEY, value);
    } catch (e) {
      setAppearanceState(previous);
      throw e;
    }
  }
  const base = mode === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeActions.Provider
      value={{ setMode, preference, appearance, setAppearance }}
    >
      <ThemeContext.Provider value={theme}>
        <NavigationThemeProvider
          value={{
            ...base,
            colors: {
              ...base.colors,
              primary: colors.accent,
              background: theme.pageBackground,
              card: colors.surface,
              text: colors.ink,
              border: colors.border,
              notification: colors.danger,
            },
          }}
        >
          <StatusBar style={mode === "dark" ? "light" : "dark"} />
          <View
            testID="app-theme-root"
            style={{ flex: 1, backgroundColor: colors.bg }}
          >
            <ThemeBackdrop>{ready ? children : null}</ThemeBackdrop>
          </View>
        </NavigationThemeProvider>
      </ThemeContext.Provider>
    </ThemeActions.Provider>
  );
}
