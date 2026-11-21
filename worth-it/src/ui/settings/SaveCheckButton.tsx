import React, { useEffect, useState } from "react";
import { saveCheck } from "../../lib/activity";
import type { Reel } from "../../lib/socialRepo";
import { useApp } from "../AppContext";
import { Banner, Button } from "../kit";
export function SaveCheckButton({ reel }: { reel: Reel }) {
  const { session } = useApp(),
    [saved, setSaved] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void saveCheck(session.userId, reel.id, reel.caption)
      .then((v) => {
        if (active) {
          setSaved(v);
          setReady(true);
        }
      })
      .catch(() => {
        if (active)
          setError("Saved Checks are unavailable. Please retry later.");
      });
    return () => {
      active = false;
    };
  }, [session.userId, reel.id, reel.caption]);
  return (
    <>
      {error ? <Banner kind="info">{error}</Banner> : null}
      <Button
        label={saved ? "Remove saved Check" : "Save Check"}
        disabled={!ready}
        loading={busy}
        variant="secondary"
        onPress={async () => {
          setBusy(true);
          try {
            setSaved(
              await saveCheck(session.userId, reel.id, reel.caption, !saved),
            );
            setError("");
          } catch {
            setError("Could not save this Check.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
