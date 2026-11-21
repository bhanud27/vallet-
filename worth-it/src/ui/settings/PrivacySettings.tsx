import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import {
  type AccountPreferences,
  mutedAccounts,
} from "../../lib/accountPreferences";
import { getAccountPrivacy, changePrivacy } from "../../lib/community";
import { safetyRpc, blockAccount } from "../../lib/safety";
import { supabase } from "../../lib/supabase";
import { useApp } from "../AppContext";
import { useTheme } from "../theme";
import { Banner, Button, ThemedSwitch } from "../kit";
import { SettingsField as Field } from "./SettingsField";
import { feedCache } from "../../lib/feed";
import { loadPreferences } from "../../lib/preferences";
export function usePrivacyFields(
  value: AccountPreferences,
  setValue: React.Dispatch<React.SetStateAction<AccountPreferences>>,
  enabled: boolean,
  active = true,
) {
  const { type } = useTheme();
  const { session } = useApp();
  const [privateAccount, setPrivate] = useState(false),
    [privacyReady, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (supabase && active)
      void getAccountPrivacy(session.userId)
        .then((v) => {
          setPrivate(v ?? false);
          setReady(true);
        })
        .catch(() => setError("Could not load account visibility."));
  }, [session.userId, active]);
  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={type.body}>Private account</Text>
        <ThemedSwitch
          accessibilityLabel="Private account"
          disabled={!privacyReady}
          value={privateAccount}
          onValueChange={(v) => {
            void changePrivacy(v)
              .then(() => setPrivate(v))
              .catch(() => setError("Could not change account visibility."));
          }}
        />
      </View>
      <Text style={type.small}>
        {supabase
          ? privateAccount
            ? "Only approved followers can view your content."
            : "Your content is public."
          : "Account visibility and interaction enforcement require a connected account. Local demo content stays on this device."}
      </Text>
      <Button
        variant="secondary"
        label="Follow requests"
        onPress={() => router.push("/follow-requests")}
      />
      {(["comments_audience", "mentions_audience"] as const).map((key) => (
        <View key={key} style={{ gap: 8 }}>
          <Text style={type.h2}>
            {key === "comments_audience"
              ? "Who can comment"
              : "Who can mention you"}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(["everyone", "followers", "nobody"] as const).map((a) => (
              <Button
                key={a}
                label={
                  a === "everyone"
                    ? "Everyone"
                    : a === "followers"
                      ? "Approved followers"
                      : "Nobody"
                }
                variant={value[key] === a ? "primary" : "secondary"}
                disabled={!enabled}
                onPress={() => setValue((old) => ({ ...old, [key]: a }))}
              />
            ))}
          </View>
        </View>
      ))}
      <Field
        label="Hidden words"
        hint="Comma-separated words or phrases. Matching comments are hidden and new matching comments are rejected."
        value={value.hidden_words.join(", ")}
        editable={enabled}
        multiline
        onChangeText={(s) =>
          setValue((old) => ({
            ...old,
            hidden_words: s.split(",").map((v) => v.trim()),
          }))
        }
      />
      <Button
        variant="secondary"
        label="Blocked accounts"
        onPress={() =>
          router.push({
            pathname: "/settings/[section]",
            params: { section: "blocked" },
          })
        }
      />
      <Button
        variant="secondary"
        label="Muted accounts"
        onPress={() =>
          router.push({
            pathname: "/settings/[section]",
            params: { section: "muted" },
          })
        }
      />
    </>
  );
}
export function RelationshipSettings({ muted }: { muted: boolean }) {
  const { session } = useApp(),
    { type } = useTheme();
  const [rows, setRows] = useState<{ id: string; username: string }[] | null>(
      null,
    ),
    [query, setQuery] = useState(""),
    [members, setMembers] = useState<{ id: string; username: string }[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const task = muted
      ? mutedAccounts(session.userId)
      : supabase
        ? safetyRpc<{ id: string; username: string }[]>("list_account_blocks")
        : Promise.resolve([]);
    void task
      .then((r) => {
        if (active) setRows(r);
      })
      .catch(() => {
        if (active) setError("Could not load accounts. Reopen to retry.");
      });
    return () => {
      active = false;
    };
  }, [session.userId, muted]);
  const change = async (id: string, value: boolean) => {
    setBusy(true);
    setError("");
    try {
      if (muted)
        setRows(await mutedAccounts(session.userId, { id, muted: value }));
      else {
        await blockAccount(id, value);
        setRows(await safetyRpc("list_account_blocks"));
      }
      await loadPreferences(session.userId);
      feedCache.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update account.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <Text style={type.body}>
        {muted
          ? "Muted accounts are excluded from recommendations and notifications. They can still view content according to your privacy."
          : "Blocking prevents viewing and interacting with each other through the app."}
      </Text>
      {supabase ? (
        <>
          <Field
            label="Find account by username"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
          />
          <Button
            label="Find accounts"
            disabled={query.trim().length < 2}
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                const { data, error } = await supabase!.rpc(
                  "search_social_profiles",
                  { p_query: query.trim() },
                );
                if (error) throw error;
                setMembers(
                  (data ?? []).filter(
                    (r: { id: string }) => r.id !== session.userId,
                  ),
                );
              } catch {
                setError("Could not find accounts.");
              } finally {
                setBusy(false);
              }
            }}
          />
          {members.map((row) => (
            <Button
              key={row.id}
              variant="secondary"
              disabled={busy || (rows ?? []).some((r) => r.id === row.id)}
              label={(muted ? "Mute @" : "Block @") + row.username}
              onPress={() => {
                void change(row.id, true);
              }}
            />
          ))}
        </>
      ) : null}
      <Text style={type.h2}>
        {muted ? "Muted accounts" : "Blocked accounts"}
      </Text>
      {rows === null ? (
        <Text style={type.small}>Loading accounts...</Text>
      ) : rows.length === 0 ? (
        <Text style={type.body}>No accounts here.</Text>
      ) : (
        rows.map((row) => (
          <Button
            key={row.id}
            disabled={busy}
            variant="secondary"
            label={(muted ? "Unmute @" : "Unblock @") + row.username}
            onPress={() => {
              void change(row.id, false);
            }}
          />
        ))
      )}
    </>
  );
}
