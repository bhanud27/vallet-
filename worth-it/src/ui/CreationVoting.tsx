import React, { useState } from "react";
import { Text } from "react-native";
import type { PollView } from "../lib/types";
import { repo } from "../lib/repo";
import { CreationBody } from "./CreationBody";
import { Banner, Button } from "./kit";
import { useTheme } from "./theme";
import { useAuth } from "./AppContext";
export function CreationVoting({
  view,
  onVoted,
  initial,
}: {
  view: PollView;
  onVoted: () => void;
  initial?: string;
}) {
  const { session } = useAuth(),
    { type } = useTheme(),
    [choice, setChoice] = useState<string | undefined>(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const canVote = !!session && !view.isAuthor && !view.myOption;
  return (
    <>
      <CreationBody
        poll={view.poll}
        counts={view.optionSummary?.counts}
        total={view.optionSummary?.total}
        selected={view.myOption ?? choice}
        onOption={setChoice}
        disabled={!canVote || busy}
      />
      {error ? <Banner kind="error">{error}</Banner> : null}
      {view.myOption ? (
        <Text style={[type.small, { padding: 16 }]}>
          You voted. Each account has one vote per poll.
        </Text>
      ) : null}
      {canVote ? (
        <Button
          label="Submit vote"
          disabled={!choice}
          loading={busy}
          onPress={async () => {
            if (!choice || busy) return;
            setBusy(true);
            setError("");
            try {
              await repo.castVote(view.poll.id, {
                choice: null,
                optionId: choice,
                reason: "",
                ownsItem: false,
              });
              onVoted();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not submit your vote.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
    </>
  );
}
