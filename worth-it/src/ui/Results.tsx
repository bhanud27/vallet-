import React, { useState } from "react";
import { Text, View } from "react-native";
import { timeAgo } from "../lib/format";
import { CHOICES, CHOICE_LABEL, VoteEntry, VoteSummary } from "../lib/types";
import { Badge, Banner, Button } from "./kit";
import { useTheme } from "./theme";

export function Results({
  votes,
  summary,
  onHelpful,
}: {
  votes: VoteEntry[];
  summary?: VoteSummary;
  onHelpful?: (id: string, helpful: boolean) => Promise<void>;
}) {
  const { colors, type, choiceColor } = useTheme();

  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const total = summary
    ? summary.buy + summary.wait + summary.skip
    : votes.length;
  const counts = Object.fromEntries(
    CHOICES.map((c) => [
      c,
      summary ? summary[c] : votes.filter((v) => v.choice === c).length,
    ]),
  ) as Record<string, number>;
  const owners = votes.filter((v) => v.ownsItem);
  const ownerTotal = summary
    ? summary.ownerBuy + summary.ownerWait + summary.ownerSkip
    : owners.length;
  const reasons = votes
    .filter((v) => v.reason?.trim())
    .sort(
      (a, b) =>
        Number(!!b.helpful) - Number(!!a.helpful) ||
        Number(b.ownsItem) - Number(a.ownsItem),
    );
  const buyReason = reasons.find((entry) => entry.choice === "buy");
  const waitReason = reasons.find((entry) => entry.choice !== "buy");
  const highlights = new Map([
    [buyReason?.id, "Reason to buy"],
    [waitReason?.id, "Reason to wait or skip"],
  ]);
  const ordered = [
    ...reasons.filter((entry) => highlights.has(entry.id)),
    ...reasons.filter((entry) => !highlights.has(entry.id)),
  ];

  async function mark(vote: VoteEntry) {
    if (!onHelpful || busy) return;
    setBusy(vote.id);
    setError("");
    try {
      await onHelpful(vote.id, !vote.helpful);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update this reply.",
      );
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <View
      style={{
        gap: 12,
        backgroundColor: colors.surface,
        padding: 15,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 17,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <Text style={type.h2}>Results</Text>
        <Text testID="total-votes" style={[type.body, { fontWeight: "800" }]}>
          {total} {total === 1 ? "vote" : "votes"}
        </Text>
      </View>

      {total === 0 ? (
        <Text style={type.body}>
          No votes yet. Share the link to get the first one.
        </Text>
      ) : (
        CHOICES.map((c) => {
          const pct = Math.round((counts[c] / total) * 100);
          return (
            <View
              key={c}
              style={{ gap: 4 }}
              accessible
              accessibilityLabel={`${CHOICE_LABEL[c]}: ${counts[c]} votes, ${pct} percent`}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text style={[type.body, { fontWeight: "700" }]}>
                  {CHOICE_LABEL[c]}
                </Text>
                <Text testID={`count-${c}`} style={type.body}>
                  {counts[c]} · {pct}%
                </Text>
              </View>
              <View
                style={{
                  height: 8,
                  borderRadius: 5,
                  backgroundColor: colors.media,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    backgroundColor: choiceColor[c],
                  }}
                />
              </View>
            </View>
          );
        })
      )}

      {ownerTotal > 0 && (
        <View
          style={{
            gap: 5,
            backgroundColor: colors.accentSoft,
            padding: 11,
            borderRadius: 11,
          }}
        >
          <Text style={type.h2}>Self-reported owners</Text>
          <Text style={type.small}>
            {ownerTotal} {ownerTotal === 1 ? "response" : "responses"} from
            people who say they own it
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {CHOICES.map((choice) => (
              <Text
                key={choice}
                style={[
                  type.small,
                  { color: choiceColor[choice], fontWeight: "700" },
                ]}
              >
                {CHOICE_LABEL[choice]}{" "}
                {summary
                  ? {
                      buy: summary.ownerBuy,
                      wait: summary.ownerWait,
                      skip: summary.ownerSkip,
                    }[choice]
                  : owners.filter((vote) => vote.choice === choice).length}
              </Text>
            ))}
          </View>
        </View>
      )}
      {total > 0 ? (
        <View style={{ gap: 10, marginTop: 4 }}>
          <Text style={type.h2}>Why they voted that way</Text>
          {error ? <Banner kind="error">{error}</Banner> : null}
          {ordered.length === 0 ? (
            <Text style={type.small}>Nobody left a reason yet.</Text>
          ) : (
            ordered.map((v) => (
              <View
                key={v.id}
                testID="reason"
                style={{
                  backgroundColor: colors.bg,
                  borderRadius: 11,
                  padding: 12,
                  gap: 6,
                }}
              >
                {highlights.has(v.id) ? (
                  <Text style={[type.small, { fontWeight: "800" }]}>
                    {highlights.get(v.id)}
                  </Text>
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Text
                    style={{ fontWeight: "800", color: v.choice?choiceColor[v.choice]:colors.muted }}
                  >
                    {v.choice?CHOICE_LABEL[v.choice]:"Product vote"}
                  </Text>
                  {v.ownsItem ? (
                    <Badge tone="info" label="Owns this item" />
                  ) : null}
                  {v.helpful ? (
                    <Badge tone="ok" label="Shopper found helpful" />
                  ) : null}
                  <Text style={type.small}>{timeAgo(v.createdAt)}</Text>
                </View>
                <Text style={type.body}>{v.reason}</Text>
                {onHelpful && (
                  <Button
                    label={v.helpful ? "Remove helpful mark" : "Mark helpful"}
                    variant="secondary"
                    loading={busy === v.id}
                    disabled={!!busy}
                    onPress={() => {
                      void mark(v);
                    }}
                  />
                )}
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}
