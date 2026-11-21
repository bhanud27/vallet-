import React, { useEffect, useState } from "react";
import { Image, Text, View } from "react-native";
import { supabase } from "../lib/supabase";
import { signMediaPaths } from "../lib/storageUrls";
import { safetyRpc } from "../lib/safety";
import { Banner, Button, Screen } from "../ui/kit";
import { useTheme } from "../ui/theme";
type Report = { id: string; kind: string; reason: string; target: string };
type Operations = {
  usage: { day: string; action: string; amount: number }[];
  media: Record<string, number>;
  deletionRequests: number;
  feedback: {
    id: string;
    rating: number;
    message: string;
    screenshot_path?: string;
  }[];
};
export default function Moderation() {
  const { type } = useTheme();

  const [reports, setReports] = useState<Report[]>([]),
    [ops, setOps] = useState<Operations>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [items, operations] = await Promise.all([
        safetyRpc<Report[]>("list_content_reports"),
        safetyRpc<Operations>("worthit_operations"),
      ]);
      setReports(items);
      setOps(operations);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load moderation.");
    }
  }
  useEffect(() => {
    let live = true;
    void Promise.all([
      safetyRpc<Report[]>("list_content_reports"),
      safetyRpc<Operations>("worthit_operations"),
    ])
      .then(([items, operations]) => {
        if (live) {
          setReports(items);
          setOps(operations);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function resolve(id: string, remove: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      await safetyRpc("resolve_content_report", { p_id: id, p_remove: remove });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resolve report.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Text style={type.title}>Moderation</Text>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {reports.map((r) => (
        <View key={r.id} style={{ gap: 8 }}>
          <Text style={type.h2}>{r.kind}</Text>
          <Text style={type.body}>{r.reason}</Text>
          <Text selectable style={type.small}>
            Target: {r.target}
          </Text>
          <Button
            label="Remove content / suspend account"
            disabled={busy}
            onPress={() => {
              void resolve(r.id, true);
            }}
          />
          <Button
            label="Dismiss report"
            disabled={busy}
            variant="secondary"
            onPress={() => {
              void resolve(r.id, false);
            }}
          />
        </View>
      ))}
      {ops ? (
        <>
          <Text style={type.h2}>Operations</Text>
          <Text style={type.body}>
            Pending account deletions: {ops.deletionRequests}
          </Text>
          {Object.entries(ops.media).map(([state, count]) => (
            <Text key={state} style={type.small}>
              Media {state}: {count}
            </Text>
          ))}
          <SupportScreenshots feedback={ops.feedback} />
          <Text style={type.h2}>Member feedback</Text>
          {ops.feedback.map((f) => (
            <Text key={f.id} style={type.body}>
              {f.rating}/5 - {f.message}
            </Text>
          ))}
          <Text style={type.h2}>Activity in the last 30 days</Text>
          {ops.usage.map((u) => (
            <Text key={u.day + u.action} style={type.small}>
              {u.day} - {u.action}: {u.amount}
            </Text>
          ))}
        </>
      ) : null}
      <Button
        label="Refresh"
        onPress={() => {
          void load();
        }}
      />
    </Screen>
  );
}

function SupportScreenshots({
  feedback,
}: {
  feedback: Operations["feedback"];
}) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const { type } = useTheme();
  useEffect(() => {
    let active = true;
    if (supabase)
      void signMediaPaths(
        supabase,
        "poll-photos",
        feedback.map((r) => r.screenshot_path ?? null),
      )
        .then((r) => {
          if (active) setUrls(r);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [feedback]);
  return (
    <>
      {feedback
        .filter((r) => r.screenshot_path)
        .map((r) => (
          <View key={r.id} style={{ gap: 8 }}>
            <Text style={type.body}>{r.message}</Text>
            {urls.get(r.screenshot_path!) ? (
              <Image
                source={{ uri: urls.get(r.screenshot_path!) }}
                accessibilityLabel="Private problem report screenshot"
                resizeMode="contain"
                style={{ height: 240, width: "100%" }}
              />
            ) : (
              <Text style={type.small}>
                Screenshot unavailable. Refresh to retry.
              </Text>
            )}
          </View>
        ))}
    </>
  );
}
