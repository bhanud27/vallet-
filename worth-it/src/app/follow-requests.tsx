import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { getFollowRequests, Member, respondToFollow } from "../lib/community";
import { Banner, Button, Screen } from "../ui/kit";
import { MemberRow } from "../ui/MemberRow";
import { useTheme } from "../ui/theme";

export default function FollowRequestsScreen() {
  const { type } = useTheme();

  const [requests, setRequests] = useState<Member[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError("");
      setRequests(null);
      void getFollowRequests()
        .then((next) => {
          if (active) setRequests(next);
        })
        .catch((reason) => {
          if (active)
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not load requests.",
            );
        });
      return () => {
        active = false;
      };
    }, []),
  );

  async function respond(id: string, accept: boolean) {
    if (busy) return;
    setBusy(id);
    setError("");
    try {
      await respondToFollow(id, accept);
      setRequests((items) => items?.filter((item) => item.id !== id) ?? []);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update this request.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {!requests && !error ? (
        <Text style={type.small}>Loading requests…</Text>
      ) : null}
      {requests?.length === 0 && (
        <Text style={type.body}>No pending follow requests.</Text>
      )}
      {requests?.map((member) => (
        <View key={member.id} style={styles.request}>
          <MemberRow member={member} />
          <View style={styles.actions}>
            <Button
              label="Decline"
              variant="secondary"
              disabled={!!busy}
              onPress={() => {
                void respond(member.id, false);
              }}
            />
            <Button
              label="Accept"
              loading={busy === member.id}
              disabled={!!busy}
              onPress={() => {
                void respond(member.id, true);
              }}
            />
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  request: { gap: 6 },
  actions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
});
