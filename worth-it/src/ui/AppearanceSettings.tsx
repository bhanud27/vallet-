import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { appearanceLabels, useTheme } from "./theme";
import { useThemeActions } from "./AppThemeProvider";
import { Banner } from "./kit";
import { ThemeSurface } from "./ThemeSurface";
export function AppearanceSettings() {
  const { type, colors, reducedEffects, glossy } = useTheme(),
    { preference, setMode, appearance, setAppearance } = useThemeActions();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <View style={{ gap: 16 }}>
      <Text style={type.h2}>{appearanceLabels[appearance]} theme</Text>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: "row", gap: 8 }}
      >
        {(["normal", "glossy", "glass"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={appearanceLabels[value]}
            aria-checked={appearance === value}
            accessibilityState={{
              checked: appearance === value,
              disabled: busy,
            }}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setError("");
              try {
                await setAppearance(value);
              } catch {
                setError("Could not save theme. Try again.");
              } finally {
                setBusy(false);
              }
            }}
            style={{
              flex: 1,
              paddingHorizontal: 6,
              paddingVertical: 10,
              justifyContent: "center",
              minHeight: 48,
              borderRadius: 12,
              backgroundColor:
                appearance === value ? colors.accent : colors.surface,
            }}
          >
            <Text
              style={[
                type.body,
                {
                  color: appearance === value ? colors.onAccent : colors.ink,
                  textAlign: "center",
                  fontWeight: "700",
                },
              ]}
            >
              {appearanceLabels[value]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.small}>
        Applies across Feed, Spot, Profile, Settings, navigation and creation.
        Android uses a frosted glass style; native Liquid Glass is available on
        supported iPhones.
      </Text>
      <ThemeSurface
        frost
        testID="appearance-preview"
        style={{
          padding: 20,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 8,
        }}
      >
        <Text style={type.h2}>
          {appearance === "glass"
            ? "Glass preview"
            : appearanceLabels[appearance] + " preview"}
        </Text>
        <Text style={type.body}>
          Your selection updates the app immediately.
        </Text>
        {appearance !== "normal" && reducedEffects ? (
          <Text style={type.small}>
            Reduced effects are enabled on this device. Solid surfaces keep
            content readable.
          </Text>
        ) : null}
      </ThemeSurface>
      <Text style={type.body}>
        The familiar Worth It design, with the color mode that suits you.
      </Text>
      <View
        accessibilityRole="radiogroup"
        style={{
          flexDirection: "row",
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 14,
          padding: 4,
          gap: 4,
        }}
      >
        {(["light", "dark", "system"] as const).map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="radio"
            aria-checked={preference === mode}
            aria-disabled={busy || !!glossy}
            accessibilityLabel={
              mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System"
            }
            accessibilityState={{
              checked: preference === mode,
              disabled: busy || !!glossy,
            }}
            disabled={busy || !!glossy}
            onPress={async () => {
              setBusy(true);
              setError("");
              try {
                await setMode(mode);
              } catch {
                setError("Could not save appearance. Try again.");
              } finally {
                setBusy(false);
              }
            }}
            style={{
              flex: 1,
              minHeight: 48,
              borderRadius: 10,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor:
                !glossy && preference === mode ? colors.accent : colors.surface,
            }}
          >
            <Text
              style={[
                type.body,
                {
                  fontWeight: "700",
                  fontSize: 14,
                  color: glossy
                    ? colors.muted
                    : preference === mode
                      ? colors.onAccent
                      : colors.ink,
                },
              ]}
            >
              {mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.small}>
        {glossy
          ? "Glossy Dark uses dark colors. Your color mode is saved for the other themes."
          : "System follows your device. Your selection is saved on this device."}
      </Text>
      {error ? <Banner kind="error">{error}</Banner> : null}
    </View>
  );
}
