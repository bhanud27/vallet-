import { FLOATING_NAV, floatingDockHeight } from "../lib/floatingNavigation";
import { router, useFocusEffect, useIsFocused } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { findMembers, type Member } from "../lib/community";
import {
  recommendationScore,
  samplesEnabled,
  subscribePreferences,
} from "../lib/preferences";
import { repo } from "../lib/repo";
import { listMixedReels, type Reel } from "../lib/socialRepo";
import { socialLayout } from "../lib/socialLayout";
import { supabase } from "../lib/supabase";
import type { PollSummary } from "../lib/types";
import { normalizeUsername, USERNAME_MAX } from "../lib/username";
import { useApp } from "../ui/AppContext";
import { FloatingHeader } from "../ui/FloatingHeader";
import { AppTabs } from "../ui/AppTabs";
import { Banner, Field } from "../ui/kit";
import { MemberRow } from "../ui/MemberRow";
import {
  ExploreTile,
  mixExplore,
  exploreId,
  type ExploreItem,
} from "../ui/ExploreTile";
import { themedStyles, useTheme } from "../ui/theme";

const GRID_VISIBILITY = {
  itemVisiblePercentThreshold: 30,
  minimumViewTime: 150,
};
export default function SearchScreen() {
  const { session } = useApp();
  return <SearchWorkspace key={session.userId} />;
}

function SearchWorkspace() {
  const { type } = useTheme();
  const styles = useStyles();

  const { session } = useApp(),
    insets = useSafeAreaInsets(),
    { width, height } = useWindowDimensions(),
    focused = useIsFocused();
  const samples = useSyncExternalStore(
    subscribePreferences,
    samplesEnabled,
    () => true,
  );
  const { gridWidth, tileWidth } = socialLayout(
    width - insets.left - insets.right,
    height,
  );
  const [input, setInput] = useState(""),
    [results, setResults] = useState<Member[] | null>(null),
    [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<{
      polls: PollSummary[];
      reels: Reel[];
    }>(),
    [suggestionsError, setSuggestionsError] = useState(false);
  const [pollMatches, setPollMatches] = useState<PollSummary[]>(),
    [pollSearchError, setPollSearchError] = useState(false);
  const [visible, setVisible] = useState<string[]>([]);
  const raw = input.trim(),
    peopleOnly = raw.startsWith("@"),
    query = normalizeUsername(raw.replace(/^@/, "")),
    userId = session.userId;
  const visibleChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item: ExploreItem }[] }) => {
      const next = viewableItems.map((token) => exploreId(token.item));
      setVisible((current) =>
        current.join("|") === next.join("|") ? current : next,
      );
    },
    [],
  );
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setSuggestionsError(false);
      void Promise.allSettled([
        repo.discoverPolls({ needsAnswer: false }).then(async (polls) => {
          const demos = samples ? await repo.listDemoPolls() : [];
          return [
            ...new Map(
              [
                ...demos,
                ...polls.filter((poll) => samples || !poll.isDemo),
              ].map((poll) => [poll.id, poll]),
            ).values(),
          ];
        }),
        listMixedReels(userId, Math.floor(Math.random() * 0x100000000), 24),
      ]).then(([polls, reels]) => {
        if (!active) return;
        setSuggestions({
          polls: polls.status === "fulfilled" ? polls.value : [],
          reels: reels.status === "fulfilled" ? reels.value : [],
        });
        setSuggestionsError(
          polls.status === "rejected" && reels.status === "rejected",
        );
      });
      return () => {
        active = false;
      };
    }, [userId, samples]),
  );
  useEffect(() => {
    if (!query || !userId) return;
    let active = true;
    const timer = setTimeout(() => {
      if (supabase)
        void findMembers(query)
          .then((members) => {
            if (active) setResults(members);
          })
          .catch((reason) => {
            if (active)
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Could not search usernames.",
              );
          });
      if (!peopleOnly)
        void repo
          .discoverPolls({ query, needsAnswer: false })
          .then((polls) => {
            if (active) setPollMatches(polls.slice(0, 30));
          })
          .catch(() => {
            if (active) {
              setPollMatches([]);
              setPollSearchError(true);
            }
          });
    }, 250);
    return () => {
      clearTimeout(timer);
      active = false;
    };
  }, [query, peopleOnly, userId]);
  const items = useMemo(() => {
    if (peopleOnly) return [];
    const matches = query ? (pollMatches ?? []) : (suggestions?.polls ?? []);
    const demoMatches =
      samples && query
        ? (suggestions?.polls ?? []).filter(
            (poll) =>
              poll.isDemo &&
              [poll.itemName, poll.question].some((value) =>
                value.toLowerCase().includes(query),
              ),
          )
        : [];
    const polls = [
      ...new Map(
        [...demoMatches, ...matches]
          .filter((poll) => samples || !poll.isDemo)
          .map((poll) => [poll.id, poll]),
      ).values(),
    ];
    const reels = (suggestions?.reels ?? []).filter(
      (reel) =>
        (samples || reel.media.kind !== "demo") &&
        (!query ||
          [
            reel.caption,
            reel.author.username ?? "",
            reel.author.displayName,
          ].some((value) => value.toLowerCase().includes(query))),
    );
    return mixExplore(polls, reels).sort((a, b) => {
      const text = (item: ExploreItem) =>
        item.kind === "poll" ? item.poll.itemName : item.reel.caption;
      return recommendationScore(text(b)) - recommendationScore(text(a));
    });
  }, [peopleOnly, query, pollMatches, suggestions, samples]);
  return (
    <View
      style={[
        styles.page,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <FloatingHeader
        title="Spot"
        testID="spot-floating-header"
        containerStyle={{
          position: "absolute",
          top: insets.top,
          left: insets.left,
          right: insets.right,
          width: undefined,
          zIndex: 20,
        }}
      />
      <FlatList
        testID="explore-grid"
        style={[styles.grid, { width: gridWidth }]}
        data={items}
        numColumns={3}
        keyExtractor={exploreId}
        columnWrapperStyle={styles.row}
        ItemSeparatorComponent={GridGap}
        initialNumToRender={12}
        windowSize={5}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: FLOATING_NAV.headerHeight + FLOATING_NAV.gap * 2,
          paddingBottom: floatingDockHeight(insets.bottom) + 24,
        }}
        viewabilityConfig={GRID_VISIBILITY}
        onViewableItemsChanged={visibleChanged}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <Field
              label="Find people and products"
              value={input}
              placeholder="Products or @username"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={peopleOnly ? USERNAME_MAX + 1 : 100}
              onChangeText={(value) => {
                const next = value.trim();
                if (
                  normalizeUsername(next.replace(/^@/, "")) !== query ||
                  next.startsWith("@") !== peopleOnly
                ) {
                  setResults(null);
                  setError("");
                  setPollMatches(undefined);
                  setPollSearchError(false);
                }
                setInput(value);
              }}
            />
            {error ? (
              <Banner kind="error">{error}</Banner>
            ) : query && supabase ? (
              <View style={styles.people}>
                <Text style={type.h2}>People</Text>
                {results === null ? (
                  <Text style={type.small}>Searching usernames...</Text>
                ) : results.length ? (
                  results.map((member) => (
                    <MemberRow key={member.id} member={member} ownId={userId} />
                  ))
                ) : (
                  <Text style={type.small}>No usernames match.</Text>
                )}
              </View>
            ) : null}
            {peopleOnly && !supabase ? (
              <Banner kind="info">
                Username search is available with a connected account.
              </Banner>
            ) : null}
            {!peopleOnly && (
              <>
                <View style={styles.header}>
                  <Text style={type.h2}>{query ? "Results" : "Explore"}</Text>
                  <Pressable
                    accessibilityRole="link"
                    style={styles.advice}
                    onPress={() => router.push("/discover")}
                  >
                    <Text style={styles.link}>Buying advice</Text>
                  </Pressable>
                </View>
                {suggestionsError && !query ? (
                  <Banner kind="error">Could not load suggested posts.</Banner>
                ) : null}
                {pollSearchError ? (
                  <Banner kind="error">Could not search polls.</Banner>
                ) : null}
                {!suggestions && !query && !suggestionsError ? (
                  <Text style={type.small}>Loading suggestions...</Text>
                ) : null}
                {query && pollMatches === undefined ? (
                  <Text style={type.small}>Searching posts...</Text>
                ) : null}
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          !peopleOnly &&
          ((query && pollMatches !== undefined) || (!query && !!suggestions)) &&
          !suggestionsError &&
          !pollSearchError ? (
            <Text style={[type.small, { padding: 16 }]}>
              No posts or checks found.
            </Text>
          ) : undefined
        }
        renderItem={({ item }) => (
          <ExploreTile
            item={item}
            size={tileWidth}
            active={focused && visible.includes(exploreId(item))}
          />
        )}
      />
      <AppTabs active="search" />
    </View>
  );
}
function GridGap() {
  return <View style={{ height: 2 }} />;
}
const useStyles = themedStyles(({ colors, pageBackground }) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: pageBackground },
    grid: { flex: 1, alignSelf: "center" },
    row: { gap: 2 },
    headerContent: { padding: 16, gap: 14 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
    },
    people: { gap: 8 },
    advice: { minHeight: 44, justifyContent: "center", paddingLeft: 8 },
    link: { color: colors.accentInk, fontWeight: "700", fontSize: 13 },
  }),
);
