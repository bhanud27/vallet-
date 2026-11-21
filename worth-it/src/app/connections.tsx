import React, { useEffect, useState } from "react";
import { useLocalSearchParams, Stack } from "expo-router";
import { Text } from "react-native";
import { getConnections, type Member } from "../lib/community";
import { repo } from "../lib/repo";
import { useApp } from "../ui/AppContext";
import { MemberRow } from "../ui/MemberRow";
import { Banner, Button, Screen } from "../ui/kit";
import { useTheme } from "../ui/theme";
export default function Connections() {
  const { id, kind } = useLocalSearchParams<{ id: string; kind: string }>(),
    { session } = useApp(),
    { type } = useTheme();
  const section = kind === "following" ? "following" : "followers";
  const [members, setMembers] = useState<Member[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [more, setMore] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void (
      repo.mode === "local" ? Promise.resolve([]) : getConnections(id, section)
    )
      .then((rows) => {
        if (active) {
          setMembers(rows);
          setMore(rows.length === 50);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [id, section, retry]);
  async function loadMore() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const rows = await getConnections(id, section, members.at(-1)?.id);
      setMembers((prev) => [
        ...prev,
        ...rows.filter((row) => !prev.some((item) => item.id === row.id)),
      ]);
      setMore(rows.length === 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load connections.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Stack.Screen
        options={{ title: section === "followers" ? "Followers" : "Following" }}
      />
      {error ? (
        <>
          <Banner kind="error">{error}</Banner>
          <Button
            label="Try again"
            onPress={() => {
              setBusy(true);
              setError("");
              setRetry((v) => v + 1);
            }}
          />
        </>
      ) : null}
      {members.map((member) => (
        <MemberRow key={member.id} member={member} ownId={session.userId} />
      ))}
      {!busy && !members.length && !error ? (
        <Text style={type.small}>
          {section === "followers"
            ? "No followers yet."
            : "Not following anyone yet."}
        </Text>
      ) : null}
      {busy ? <Text style={type.small}>Loading...</Text> : null}
      {more ? (
        <Button
          label="Load more"
          variant="secondary"
          loading={busy}
          onPress={() => void loadMore()}
        />
      ) : null}
    </Screen>
  );
}
