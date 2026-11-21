import { FeatureUnavailableError } from "../lib/backendRpc";
import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { cachedSavedPolls, savedPolls } from "../lib/engagement";
import { Banner, Button } from "./kit";
export function SavePoll({
  viewer,
  id,
  name,
}: {
  viewer: string;
  id: string;
  name: string;
}) {
  const [available, setAvailable] = useState(true);
  const [saved, setSaved] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => {
    const request = ++generation.current;
    let live = true;
    void cachedSavedPolls(viewer)
      .then((items) => {
        if (live && request === generation.current)
          setSaved(items.some((item) => item.id === id));
      })
      .catch((e) => {
        if (live && request === generation.current) {
          if (e instanceof FeatureUnavailableError) setAvailable(false);
          else setError("Could not check saved polls. Please try again.");
        }
      });
    return () => {
      live = false;
    };
  }, [viewer, id]);
  if (!available) return null;
  return (
    <View>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <Button
        label={saved ? "Remove from saved" : "Save for later"}
        variant="secondary"
        loading={busy}
        onPress={async () => {
          if (busy) return;
          generation.current++;
          const next = !saved;
          setSaved(next);
          setBusy(true);
          setError("");
          try {
            await savedPolls(viewer, { id, itemName: name, value: next });
          } catch (e) {
            setSaved(!next);
            setError(e instanceof Error ? e.message : "Could not save poll.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}
