import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "./theme";
import { useThemeActions } from "./AppThemeProvider";
import { Banner } from "./kit";
import { ThemeSurface } from "./ThemeSurface";
export function AppearanceSettings() {
  const { type, colors, reducedEffects } = useTheme(),
    { preference, setMode, appearance, setAppearance } = useThemeActions();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <View style={{ gap: 16 }}>
      <Text style={type.h2}>
        {appearance === "normal" ? "Normal theme" : "Liquid Glass theme"}
      </Text>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: "row", gap: 8 }}
      >
        {(["normal", "glass"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityLabel={value === "normal" ? "Normal" : "Liquid Glass"}
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
              padding: 14,
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
              {value === "normal" ? "Normal" : "Liquid Glass"}
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
          {appearance === "glass" ? "Glass preview" : "Normal preview"}
        </Text>
        <Text style={type.body}>
          Your selection updates the app immediately.
        </Text>
        {appearance === "glass" && reducedEffects ? (
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
            aria-disabled={busy}
            accessibilityLabel={
              mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System"
            }
            accessibilityState={{
              checked: preference === mode,
              disabled: busy,
            }}
            disabled={busy}
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
                preference === mode ? colors.accent : colors.surface,
            }}
          >
            <Text
              style={[
                type.body,
                {
                  fontWeight: "700",
                  fontSize: 14,
                  color: preference === mode ? colors.onAccent : colors.ink,
                },
              ]}
            >
              {mode === "light" ? "Light" : mode === "dark" ? "Dark" : "System"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={type.small}>
        System follows your device. Your selection is saved on this device.
      </Text>
      {error ? <Banner kind="error">{error}</Banner> : null}
    </View>
  );
}
