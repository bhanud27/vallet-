import { diagnosticSummary } from "../lib/diagnostics";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import {
  loadPreferences,
  isLowData,
  setLowData,
  samplesEnabled,
  setSamplesEnabled,
} from "../lib/preferences";
import { AppearanceSettings } from "./AppearanceSettings";
import { Banner, Button, ThemedSwitch as Switch } from "./kit";
import { useTheme } from "./theme";
export function Preferences({ viewer }: { viewer: string }) {
  const { type } = useTheme();

  const [samples, setSamples] = useState(samplesEnabled());
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [low, setLow] = useState(isLowData()),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    void loadPreferences(viewer)
      .then(() => {
        if (live) {
          setLow(isLowData());
          setSamples(samplesEnabled());
        }
      })
      .catch(() => {
        if (live) setError("Could not load preferences.");
      });
    return () => {
      live = false;
    };
  }, [viewer]);
  return (
    <View style={{ gap: 18 }}>
      <AppearanceSettings />
      <Text style={type.h2}>Your experience</Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={type.body}>Data saver: tap to play videos</Text>
        <Switch
          value={low}
          accessibilityLabel="Data saver"
          onValueChange={async (value) => {
            try {
              await setLowData(viewer, value);
              setLow(value);
              setError("");
            } catch {
              setError("Could not save preference.");
            }
          }}
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={type.body}>Show sample content</Text>
          <Text style={type.small}>20 sample products and 10 sample checks</Text>
        </View>
        <Switch
          value={samples}
          accessibilityLabel="Show sample content"
          onValueChange={async (value) => {
            try {
              await setSamplesEnabled(viewer, value);
              setSamples(value);
              setError("");
            } catch {
              setError("Could not save preference.");
            }
          }}
        />
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {__DEV__ && (
        <Button
          label={
            showDiagnostics
              ? "Hide technical diagnostics"
              : "Show technical diagnostics"
          }
          variant="quiet"
          onPress={() => setShowDiagnostics((value) => !value)}
        />
      )}
      {__DEV__ &&
        showDiagnostics &&
        diagnosticSummary()
          .filter((row) => row.count > 0)
          .map((row) => (
            <Text key={row.name} style={type.small}>
              {row.name}: {row.count} attempts, {row.failed} failed, average{" "}
              {row.averageMs} ms (this session)
            </Text>
          ))}
      <Button
        label="Saved polls"
        variant="secondary"
        onPress={() => router.push("/saved")}
      />
      <Button
        label="Share feedback"
        variant="secondary"
        onPress={() => router.push("/feedback")}
      />
    </View>
  );
}
