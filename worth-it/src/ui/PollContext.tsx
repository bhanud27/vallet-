import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatInr } from "../lib/format";
import { Poll, POLL_CATEGORIES } from "../lib/types";
import { Badge } from "./kit";
import { useTheme } from "./theme";

export function PollContext({ poll }: { poll: Poll }) {
  const { type } = useTheme();

  if (!poll.category && !poll.useCase && !poll.priority && !poll.budgetInr)
    return null;
  return (
    <View style={styles.context}>
      {poll.category ? (
        <Badge label={POLL_CATEGORIES[poll.category]} tone="info" />
      ) : null}
      {poll.useCase ? (
        <Text style={type.small}>
          <Text style={styles.label}>Use case </Text>
          {poll.useCase}
        </Text>
      ) : null}
      {poll.priority ? (
        <Text style={type.small}>
          <Text style={styles.label}>Priority </Text>
          {poll.priority}
        </Text>
      ) : null}
      {poll.budgetInr ? (
        <Text style={type.small}>
          <Text style={styles.label}>Budget </Text>
          {formatInr(poll.budgetInr)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  context: { gap: 4, paddingVertical: 5 },
  label: { fontWeight: "800" },
});
