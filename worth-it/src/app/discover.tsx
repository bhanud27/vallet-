import { GlossyReflection } from "../ui/ThemeSurface";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatInr } from "../lib/format";
import { repo } from "../lib/repo";
import type { DiscoverFilters, PollCategory, PollSummary } from "../lib/types";
import { LIMITS, parsePrice, parseProductUrl } from "../lib/validation";
import { useAuth } from "../ui/AppContext";
import { Banner, Button, Field, Screen } from "../ui/kit";
import { PollCategories } from "../ui/PollCategories";
import { PollContext } from "../ui/PollContext";
import { PollThumbnail } from "../ui/PostPresentation";
import { ProductHistory } from "../ui/ProductHistory";
import { themedStyles, useTheme } from "../ui/theme";

const DEFAULT_FILTERS: DiscoverFilters = { needsAnswer: true };
const productLink = (input?: string) =>
  /^(https:\/\/|www\.)/i.test(input ?? "")
    ? parseProductUrl(input ?? "")
    : null;

export default function DiscoverScreen() {
  const { type } = useTheme();
  const styles = useStyles();

  const { session } = useAuth();
  const [query, setQuery] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [category, setCategory] = useState<PollCategory>();
  const [applied, setApplied] = useState(DEFAULT_FILTERS);
  const [polls, setPolls] = useState<PollSummary[] | null>(null);
  const [error, setError] = useState("");
  const [filterError, setFilterError] = useState("");
  const viewerId = session?.userId;
  const historyUrl = productLink(applied.query);

  useFocusEffect(
    useCallback(() => {
      if (!viewerId && repo.mode === "local") return;
      let active = true;
      setPolls(null);
      setError("");
      void repo
        .discoverPolls(applied)
        .then((next) => {
          if (active) setPolls(next);
        })
        .catch((reason) => {
          if (active)
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not load shopping questions.",
            );
        });
      return () => {
        active = false;
      };
    }, [applied, viewerId]),
  );

  function applyFilters() {
    const low = min.trim() ? parsePrice(min) : undefined;
    const high = max.trim() ? parsePrice(max) : undefined;
    if (
      low === null ||
      high === null ||
      (low !== undefined && high !== undefined && low > high)
    ) {
      setFilterError("Enter a valid price range in whole rupees.");
      return;
    }
    setFilterError("");
    const search = query.trim();
    setApplied({
      category,
      min: low,
      max: high,
      query: (productLink(search) ?? search) || undefined,
      needsAnswer: productLink(search) ? false : applied.needsAnswer,
    });
  }

  return (
    <Screen
      onRefresh={() => setApplied((current) => ({ ...current }))}
      refreshing={!polls && !error}
    >
      <View style={styles.card}>
        <GlossyReflection />
        <Field
          label="Spot a product or paste its store link"
          value={query}
          onChangeText={setQuery}
          maxLength={LIMITS.productUrl}
          autoCapitalize="none"
          onSubmitEditing={applyFilters}
        />
        <PollCategories value={category} onChange={setCategory} />
        <View style={styles.range}>
          <View style={styles.grow}>
            <Field
              label="Min price (₹)"
              value={min}
              onChangeText={setMin}
              keyboardType="number-pad"
              maxLength={12}
            />
          </View>
          <View style={styles.grow}>
            <Field
              label="Max price (₹)"
              value={max}
              onChangeText={setMax}
              keyboardType="number-pad"
              maxLength={12}
            />
          </View>
        </View>
        {filterError ? <Banner kind="error">{filterError}</Banner> : null}
        <Button label="Spot questions" onPress={applyFilters} />
      </View>
      <View style={styles.range}>
        <Button
          label="Needs an answer"
          style={styles.grow}
          variant={applied.needsAnswer ? "primary" : "secondary"}
          onPress={() =>
            setApplied((current) => ({ ...current, needsAnswer: true }))
          }
        />
        <Button
          label="All questions"
          style={styles.grow}
          variant={applied.needsAnswer ? "secondary" : "primary"}
          onPress={() =>
            setApplied((current) => ({ ...current, needsAnswer: false }))
          }
        />
      </View>
      {historyUrl && (
        <ProductHistory key={historyUrl} productUrl={historyUrl} showEmpty />
      )}
      {error ? (
        <Banner kind="error">{error}</Banner>
      ) : polls === null ? (
        <Text style={type.small}>Loading questions…</Text>
      ) : polls.length === 0 ? (
        <Text style={type.body}>
          No questions match. Try a wider price range or another category.
        </Text>
      ) : (
        polls.map((poll) => (
          <Pressable
            key={poll.id}
            accessibilityRole="link"
            style={styles.poll}
            onPress={() =>
              router.push({ pathname: "/p/[id]", params: { id: poll.id } })
            }
          >
            <GlossyReflection />
            <PollThumbnail poll={poll} />
            <View style={styles.grow}>
              <Text style={type.h2}>
                {poll.itemName} · {formatInr(poll.priceInr)}
              </Text>
              <Text style={type.body}>{poll.question}</Text>
              <PollContext poll={poll} />
              <Text style={type.small}>
                {poll.voteCount} {poll.voteCount === 1 ? "vote" : "votes"}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const useStyles = themedStyles(({ colors, glossy }) =>
  StyleSheet.create({
    card: {
      backgroundColor: glossy?.cardFill ?? colors.surface,
      overflow: glossy ? "hidden" : undefined,
      padding: 14,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      gap: 12,
    },
    range: { flexDirection: "row", gap: 8 },
    grow: { flex: 1, minWidth: 0 },
    poll: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: glossy?.cardFill ?? colors.surface,
      overflow: glossy ? "hidden" : undefined,
      padding: 12,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 14,
    },
  }),
);
