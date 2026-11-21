import { diagnosticSummary } from "../../lib/diagnostics";
import { supabase } from "../../lib/supabase";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useApp } from "../AppContext";
import { useTheme } from "../theme";
import { Banner, Button, ThemedSwitch } from "../kit";
import { SettingsField as Field } from "./SettingsField";
import {
  defaultPreferences,
  getAccountPreferences,
  saveAccountPreferences,
  notificationLabels,
  type AccountPreferences,
} from "../../lib/accountPreferences";
import {
  loadPreferences,
  samplesEnabled,
  setSamplesEnabled,
} from "../../lib/preferences";
import { usePrivacyFields } from "./PrivacySettings";
export function PreferenceSettings({
  section,
}: {
  section: "privacy" | "notifications" | "content";
}) {
  const { session } = useApp(),
    { type } = useTheme();
  const [value, setValue] = useState(defaultPreferences),
    [ready, setReady] = useState(false),
    [available, setAvailable] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [samples, setSamples] = useState(samplesEnabled);
  useEffect(() => {
    let live = true;
    void getAccountPreferences(session.userId)
      .then((r) => {
        if (live) {
          setValue(r.value);
          setAvailable(r.available);
          setReady(true);
        }
      })
      .catch(() => {
        if (live)
          setError("Could not load settings. Reopen this page to retry.");
      });
    return () => {
      live = false;
    };
  }, [session.userId]);
  const privacy = usePrivacyFields(
    value,
    setValue,
    available && !busy && !!supabase,
    section === "privacy",
  );
  const change = <K extends keyof AccountPreferences>(
    key: K,
    next: AccountPreferences[K],
  ) => setValue((old) => ({ ...old, [key]: next }));
  const toggle = (key: "autoplay" | "data_saver", label: string) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <ThemedSwitch
        accessibilityLabel={label}
        value={value[key]}
        disabled={!available || busy}
        onValueChange={(v) => change(key, v)}
      />
    </View>
  );
  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {note ? <Banner kind="ok">{note}</Banner> : null}
      {!ready ? (
        <Text style={type.small}>Loading preferences...</Text>
      ) : !available ? (
        <Banner kind="info">
          These controls need the latest database update. Your existing account
          privacy remains available.
        </Banner>
      ) : null}
      {section === "privacy" ? (
        privacy
      ) : section === "notifications" ? (
        <>
          <Banner kind="info">
            Push notifications are not configured. These preferences control
            your in-app notifications. Security and verification emails remain
            enabled.
          </Banner>
          {Object.entries(notificationLabels).map(([key, label]) => (
            <View
              key={key}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <Text style={[type.body, { flex: 1 }]}>{label}</Text>
              <ThemedSwitch
                accessibilityLabel={label}
                disabled={!available || busy}
                value={
                  value.notification_types[
                    key as keyof typeof notificationLabels
                  ] !== false
                }
                onValueChange={(v) =>
                  change("notification_types", {
                    ...value.notification_types,
                    [key]: v,
                  })
                }
              />
            </View>
          ))}
        </>
      ) : (
        <>
          <Text style={type.body}>
            Preferences rank matching available content in Spot and Checks. They
            do not hide other categories.
          </Text>
          {(
            [
              "preferred_categories",
              "preferred_brands",
              "preferred_styles",
            ] as const
          ).map((key, index) => (
            <Field
              key={key}
              label={
                [
                  "Preferred fashion categories",
                  "Preferred brands",
                  "Interested fashion styles",
                ][index]
              }
              hint="Separate entries with commas; up to 25."
              value={value[key].join(", ")}
              editable={available && !busy}
              onChangeText={(text) =>
                change(
                  key,
                  text.split(",").map((v) => v.trim()),
                )
              }
            />
          ))}
          <Text style={type.small}>
            {diagnosticSummary()
              .filter((r) => r.count > 0)
              .map(
                (r) =>
                  `${r.name}: ${r.count} attempts, ${r.failed} failed, average ${r.averageMs} ms (this session)`,
              )
              .join("\n")}
          </Text>
          {toggle("autoplay", "Video autoplay")}
          {toggle("data_saver", "Data Saver")}
          <Text style={type.small}>
            Data Saver and disabled autoplay require a tap before playing
            videos.
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={type.body}>Show sample content</Text>
            <ThemedSwitch
              accessibilityLabel="Show sample content"
              value={samples}
              disabled={busy}
              onValueChange={(v) => {
                void setSamplesEnabled(session.userId, v)
                  .then(() => setSamples(v))
                  .catch(() => setError("Could not save sample preference."));
              }}
            />
          </View>
        </>
      )}
      <Button
        label="Save preferences"
        disabled={!available || !ready}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          setNote("");
          try {
            const patch: Partial<AccountPreferences> =
              section === "privacy"
                ? {
                    comments_audience: value.comments_audience,
                    mentions_audience: value.mentions_audience,
                    hidden_words: value.hidden_words.filter(Boolean),
                  }
                : section === "notifications"
                  ? { notification_types: value.notification_types }
                  : {
                      preferred_categories:
                        value.preferred_categories.filter(Boolean),
                      preferred_brands: value.preferred_brands.filter(Boolean),
                      preferred_styles: value.preferred_styles.filter(Boolean),
                      autoplay: value.autoplay,
                      data_saver: value.data_saver,
                    };
            await saveAccountPreferences(session.userId, patch);
            await loadPreferences(session.userId);
            setNote("Preferences saved.");
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not save preferences.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
