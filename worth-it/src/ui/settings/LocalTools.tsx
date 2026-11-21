import React, { useState } from "react";
import { Text } from "react-native";
import { resetLocalComments } from "../../lib/comments";
import { resetLocalSocial } from "../../lib/socialRepo";
import { repo } from "../../lib/repo";
import { useApp } from "../AppContext";
import { Banner, Button } from "../kit";
import { useTheme } from "../theme";
export function LocalTools() {
  const { type } = useTheme();

  const { session, setSession } = useApp();
  const [note, setNote] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(false);
  const t = repo.demoTools!;

  async function reset() {
    setResetting(true);
    setResetError(false);
    setNote(null);
    try {
      await Promise.all([resetLocalSocial(), resetLocalComments()]);
      setSession(await t.resetAll());
      setNote("Demo data reset.");
    } catch {
      setResetError(true);
    } finally {
      setResetting(false);
    }
  }
  return (
    <>
      <Text style={type.title}>Demo tools</Text>
      <Banner kind="demo">
        Local demo mode keeps everything on this device. These tools let you
        test the “friend votes” step on one device by switching who you are. For
        real two-phone sharing, connect Supabase (see the README).
      </Banner>
      <Text style={type.body}>
        Acting as:{" "}
        <Text style={{ fontWeight: "800" }}>{session.userId.slice(0, 8)}…</Text>
      </Text>
      <Button
        testID="act-as-guest"
        label="Act as a new guest"
        disabled={resetting}
        onPress={async () => {
          setSession(await t.actAsNewGuest());
          setNote("You are now a new guest. Open a poll you created and vote.");
        }}
      />
      <Button
        testID="back-to-me"
        variant="secondary"
        label="Back to my identity"
        disabled={resetting}
        onPress={async () => {
          setSession(await t.backToMyIdentity());
          setNote("Back to the identity that created your polls.");
        }}
      />
      <Button
        testID="reset-demo"
        variant="quiet"
        label="Reset all demo data"
        loading={resetting}
        onPress={reset}
      />
      {resetError ? (
        <Banner kind="error">Could not reset all demo data. Try again.</Banner>
      ) : null}
      {note ? <Banner kind="ok">{note}</Banner> : null}
    </>
  );
}
