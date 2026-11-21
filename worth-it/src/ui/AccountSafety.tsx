import { accountSafetyStatus } from "../lib/accountSafetyStatus";
import { supabase } from "../lib/supabase";
import { readableRpcError } from "../lib/backendRpc";
import React, { useEffect, useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import { blockAccount, safetyRpc } from "../lib/safety";
import { Banner, Button } from "./kit";
import { useTheme } from "./theme";
export function AccountSafety() {
  const { type } = useTheme();

  const [blocks, setBlocks] = useState<{ id: string; username: string }[]>([]),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [requested, setRequested] = useState(false),
    [moderator, setModerator] = useState(false),
    [available, setAvailable] = useState(false),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    if (!supabase) return;
    void accountSafetyStatus(supabase)
      .then((status) => {
        if (live) {
          setBlocks(status.blocks);
          setModerator(status.moderator);
          setAvailable(status.available);
        }
      })
      .catch((error) => {
        if (live)
          setError(
            readableRpcError(
              error,
              "Could not load account safety tools. Please try again.",
            ),
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <View>
      <Text style={type.h2}>Safety and data</Text>
      {!loading && !available && !error ? (
        <Text style={type.small}>
          Account safety tools are temporarily unavailable. Please try again
          later.
        </Text>
      ) : null}
      {error ? <Banner kind="error">{error}</Banner> : null}
      {blocks.map((b) => (
        <Button
          key={b.id}
          label={"Unblock " + b.username}
          variant="secondary"
          onPress={async () => {
            try {
              await blockAccount(b.id, false);
              setBlocks((v) => v.filter((x) => x.id !== b.id));
            } catch (e) {
              setError(String(e));
            }
          }}
        />
      ))}
      {moderator ? (
        <Button
          label="Review reports"
          onPress={() => router.push("/moderation")}
        />
      ) : null}
      {available &&
        (requested ? (
          <Banner kind="info">
            Deletion requested. Your profile is hidden and new publishing is
            disabled while processing is pending.
          </Banner>
        ) : confirm ? (
          <>
            <Text style={type.body}>
              Delete your account and all associated posts and media? This
              cannot be undone. Your profile will be hidden immediately while
              deletion is pending.
            </Text>
            <Button
              label="Confirm account deletion"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                try {
                  await safetyRpc("request_account_deletion");
                  setRequested(true);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "Could not request deletion.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button
              label="Keep account"
              variant="quiet"
              onPress={() => setConfirm(false)}
            />
          </>
        ) : (
          <Button
            label="Delete account"
            variant="quiet"
            disabled={loading || !available}
            onPress={() => setConfirm(true)}
          />
        ))}
      <Button
        label="Privacy and community rules"
        variant="quiet"
        onPress={() => router.push("/privacy")}
      />
    </View>
  );
}
