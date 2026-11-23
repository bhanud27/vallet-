import { FLOATING_NAV, floatingDockHeight } from "../lib/floatingNavigation";
import { FloatingHeader } from "../ui/FloatingHeader";
import { GlossyReflection, ThemeSurface } from "../ui/ThemeSurface";
import { CreationBody } from "../ui/CreationBody";
import { SavePoll } from "../ui/SavePoll";
import { ContentTap } from "../ui/ContentTap";
import { BrandLogo } from "../ui/BrandLogo";
import {
  feedCache,
  loadFeed,
  feedTime,
  feedId,
  type FeedCursor,
  type FeedItem,
} from "../lib/feed";
import { router, useFocusEffect, useIsFocused } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  Pressable,
  RefreshControl,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { repo } from "../lib/repo";
import { CHOICES, CHOICE_LABEL, PollExtras, PollSummary } from "../lib/types";
import { useApp } from "../ui/AppContext";
import { AppTabs } from "../ui/AppTabs";
import { Banner, Button } from "../ui/kit";
import { NotificationsButton } from "../ui/NotificationsButton";
import { PostIdentity, PostPhoto } from "../ui/PostPresentation";
import { FeedReelPost } from "../ui/FeedReelPost";
import { CommentThread } from "../ui/CommentThread";
import { socialLayout } from "../lib/socialLayout";
import { samplesEnabled, subscribePreferences } from "../lib/preferences";
import { getDemoReels } from "../lib/socialRepo";
import { SocialIcon } from "../ui/SocialIcon";
import { ContentStarButton } from "../ui/ContentStarButton";
import { themedStyles, useTheme } from "../ui/theme";

const FEED_VISIBILITY = {
  viewAreaCoveragePercentThreshold: 60,
  minimumViewTime: 200,
};

function PollCard({
  poll,
  extras,
}: {
  poll: PollSummary;
  extras?: PollExtras;
}) {
  const { choiceBackground, choiceColor, colors } = useTheme();
  const styles = useStyles();

  const { session } = useApp();
  const open = () => router.push("/p/" + poll.id);
  const votes = poll.voteCount === 1 ? "1 vote" : poll.voteCount + " votes";

  return (
    <ThemeSurface testID="feed-poll-surface" style={styles.card}>
      <PostIdentity poll={poll} mine={!poll.isDemo && !poll.authorId} />
      {poll.creationSpec ? (
        <CreationBody poll={poll} />
      ) : (
        <PostPhoto
          poll={poll}
          onOpen={open}
          testID={"poll-card-" + poll.id}
          legacySource={extras?.productUrl ?? undefined}
        />
      )}

      <View style={styles.postBody}>
        {!poll.creationSpec && (
          <ContentTap
            expand={false}
            kind="poll"
            id={poll.id}
            onOpen={open}
            starDisabled={poll.isDemo && !repo.demoVotingEnabled}
            accessibilityRole="link"
            accessibilityLabel={"Open " + poll.itemName}
          >
            {poll.contentKind !== "post" && (
              <Text style={styles.itemTitle}>{poll.itemName}</Text>
            )}
            <Text style={styles.caption}>{poll.question}</Text>
          </ContentTap>
        )}
        {poll.contentKind !== "post" &&
        !poll.creationSpec &&
        poll.isDemo &&
        repo.demoVotingEnabled ? (
          <View style={styles.choices}>
            {CHOICES.map((choice) => (
              <Pressable
                key={choice}
                accessibilityRole="button"
                accessibilityLabel={
                  CHOICE_LABEL[choice] + " for " + poll.itemName
                }
                onPress={() =>
                  router.push({
                    pathname: "/p/[id]",
                    params: { id: poll.id, choice },
                  })
                }
                style={({ pressed }) => [
                  styles.choice,
                  { backgroundColor: choiceBackground[choice] },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.choiceText, { color: choiceColor[choice] }]}
                >
                  {CHOICE_LABEL[choice]}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.postFooter}>
          <Pressable
            accessibilityRole="link"
            onPress={open}
            style={({ pressed }) => [
              styles.voteLink,
              pressed && styles.pressed,
            ]}
          >
            <SocialIcon name="message" color={colors.accentInk} />
            <Text style={styles.voteLinkText}>
              {poll.contentKind === "post" ? "Open post" : votes}
            </Text>
            <SocialIcon name="arrow" color={colors.accentInk} />
          </Pressable>
          <View style={styles.postActions}>
            {poll.updateStatus ? (
              <Text style={styles.updateStatus}>
                {poll.updateStatus === "bought"
                  ? "Bought"
                  : poll.updateStatus === "returned"
                    ? "Returned"
                    : "Passed"}
              </Text>
            ) : null}
            <ContentStarButton
              kind="poll"
              post={poll.contentKind === "post"}
              id={poll.id}
              initial={
                extras
                  ? { starred: extras.starred, count: extras.stars }
                  : undefined
              }
              disabled={poll.isDemo && !repo.demoVotingEnabled}
            />
          </View>
        </View>
      </View>
      {poll.creationSpec ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <SavePoll viewer={session.userId} id={poll.id} name={poll.itemName} />
        </View>
      ) : null}
      <CommentThread
        key={poll.id}
        kind="poll"
        id={poll.id}
        label={poll.itemName}
      />
    </ThemeSurface>
  );
}

function Wordmark() {
  const styles = useStyles();

  return (
    <View style={styles.wordmark} accessible accessibilityLabel="Worth It?">
      <BrandLogo />
      <Text style={styles.brand}>Worth It?</Text>
    </View>
  );
}

export default function Home() {
  const { type, colors } = useTheme();
  const styles = useStyles();

  const { session } = useApp();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { feedWidth, reelHeight } = socialLayout(
    width - insets.left - insets.right,
    height,
  );
  const focused = useIsFocused();
  const samples = useSyncExternalStore(
    subscribePreferences,
    samplesEnabled,
    () => true,
  );
  const [sampleItems, setSampleItems] = useState<FeedItem[]>([]);
  const [activeReel, setActiveReel] = useState<string | null>(null);
  const owner = useRef(session.userId);
  useEffect(() => {
    owner.current = session.userId;
  }, [session.userId]);
  const visibleChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item: FeedItem }[] }) => {
      const next = viewableItems.find(
        (token) => token.item.kind === "reel",
      )?.item;
      setActiveReel(next?.kind === "reel" ? next.reel.id : null);
    },
    [],
  );
  const [dataOwner, setDataOwner] = useState(session.userId);
  const [items, setItems] = useState<FeedItem[]>(
    () => feedCache.get(session.userId)?.items || [],
  );
  const [cursor, setCursor] = useState<FeedCursor>();
  const [hasMore, setHasMore] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(
    () => feedCache.get(session.userId)?.fetchedAt || 0,
  );
  const paging = useRef(false);
  const [extras, setExtras] = useState<Record<string, PollExtras>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const userId = session.userId;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setSampleItems([]);
      if (samples)
        void Promise.all([repo.listDemoPolls(), getDemoReels(userId)])
          .then(([polls, reels]) => {
            if (active)
              setSampleItems([
                ...polls.map((poll): FeedItem => ({ kind: "poll", poll })),
                ...reels.map((reel): FeedItem => ({ kind: "reel", reel })),
              ]);
          })
          .catch(() => {
            if (active) setSampleItems([]);
          });
      return () => {
        active = false;
      };
    }, [samples, userId]),
  );
  const shownItems = useMemo(() => {
    const unique = new Map<string, FeedItem>();
    for (const item of [...items, ...sampleItems]) {
      const demo =
        item.kind === "poll"
          ? item.poll.isDemo
          : item.reel.media.kind === "demo";
      if (!demo || samples) unique.set(item.kind + ":" + feedId(item), item);
    }
    return [...unique.values()].sort((a, b) =>
      feedTime(b).localeCompare(feedTime(a)),
    );
  }, [items, sampleItems, samples]);

  const load = useCallback(
    async (manual = false) => {
      const generation = ++request.current;
      if (manual) setRefreshing(true);
      try {
        const posts = await loadFeed(userId);
        if (generation !== request.current) return;
        setDataOwner(userId);
        setItems(posts);
        setFetchedAt(Date.now());
        const last = posts[posts.length - 1];
        setCursor(
          last ? { time: feedTime(last), id: feedId(last) } : undefined,
        );
        setHasMore(repo.mode !== "local" && posts.length === 12);
        const reactions = await repo
          .getPollExtras(
            posts.flatMap((item) =>
              item.kind === "poll" ? [item.poll.id] : [],
            ),
          )
          .catch(() => ({}));
        if (generation !== request.current) return;
        setExtras(reactions);
        setError(null);
      } catch (e) {
        if (generation !== request.current) return;
        setError(e instanceof Error ? e.message : "Could not load polls.");
      } finally {
        if (generation === request.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [userId],
  );
  useFocusEffect(
    useCallback(() => {
      const cached = feedCache.get(userId);
      if (cached) {
        setDataOwner(userId);
        setItems(cached.items);
        setFetchedAt(cached.fetchedAt);
        setCursor(cached.cursor);
        setHasMore(cached.hasMore);
        setExtras(cached.extras);
      }
      if (!cached) {
        setItems([]);
        setExtras({});
        setCursor(undefined);
      }
      setLoading(!cached);
      if (!cached) void load();
      return () => {
        request.current++;
      };
    }, [load, userId]),
  );

  useEffect(() => {
    if (!loading && dataOwner === userId)
      feedCache.set(
        userId,
        { fetchedAt, items, cursor, hasMore, extras },
        Math.max(0, 30000 - (Date.now() - fetchedAt)),
      );
  }, [userId, items, cursor, hasMore, extras, loading, fetchedAt, dataOwner]);
  async function loadMore() {
    if (!hasMore || !cursor || paging.current || loading) return;
    paging.current = true;
    const generation = request.current;
    try {
      const next = await loadFeed(userId, cursor);
      if (generation !== request.current) return;
      setItems((current) => {
        const ids = new Set(current.map(feedId));
        return [...current, ...next.filter((item) => !ids.has(feedId(item)))];
      });
      const last = next[next.length - 1];
      if (last) setCursor({ time: feedTime(last), id: feedId(last) });
      setHasMore(next.length === 12);
      const reactions = await repo.getPollExtras(
        next.flatMap((item) => (item.kind === "poll" ? [item.poll.id] : [])),
      );
      if (generation === request.current)
        setExtras((current) => ({ ...current, ...reactions }));
    } catch (e) {
      if (generation === request.current)
        setError(e instanceof Error ? e.message : "Could not load more posts.");
    } finally {
      paging.current = false;
    }
  }
  const local = repo.mode === "local";
  const newPoll = () => router.push("/new");
  const navigation = <AppTabs active="feed" />;

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
        leading={<Wordmark />}
        trailing={<NotificationsButton />}
        testID="feed-header-surface"
        containerStyle={{
          position: "absolute",
          top: insets.top,
          left: insets.left,
          right: insets.right,
          width: undefined,
          zIndex: 20,
        }}
      />
      <View style={styles.shell}>
        <FlatList
          testID="feed-list"
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
          viewabilityConfig={FEED_VISIBILITY}
          onViewableItemsChanged={visibleChanged}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: FLOATING_NAV.headerHeight + FLOATING_NAV.gap * 2 + 17,
              paddingBottom: floatingDockHeight(insets.bottom) + 28,
            },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
            />
          }
          data={dataOwner === userId ? shownItems : []}
          keyExtractor={(item) => item.kind + ":" + feedId(item)}
          initialNumToRender={4}
          windowSize={5}
          onEndReached={() => {
            void loadMore();
          }}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <View
              style={[styles.feed, { width: feedWidth, alignSelf: "center" }]}
            >
              <View style={styles.feedHeader}>
                <View style={styles.feedTitle}>
                  <Text accessibilityRole="header" style={type.title}>
                    Shopping feed
                  </Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Discover questions"
                onPress={() => router.push("/discover")}
                style={({ pressed }) => [
                  styles.discovery,
                  pressed && styles.pressed,
                ]}
              >
                <GlossyReflection />
                <View style={styles.discoveryIcon}>
                  <SocialIcon name="search" color={colors.accentInk} />
                </View>
                <View style={styles.discoveryText}>
                  <Text style={type.h2}>Discover questions</Text>
                  <Text style={type.small}>
                    Browse buying advice by category and price.
                  </Text>
                </View>
                <SocialIcon name="arrow" color={colors.accentInk} />
              </Pressable>
              {local && (
                <View style={styles.mode} testID="mode-banner">
                  <Text style={styles.modeText}>
                    <Text style={styles.modeTitle}>Local demo mode</Text> · New
                    polls stay in this browser or app.
                  </Text>
                </View>
              )}
              {error && <Banner kind="error">{error}</Banner>}
              {loading ? (
                <Text style={type.small}>Loading your feed…</Text>
              ) : (
                !error &&
                shownItems.length === 0 && (
                  <View style={styles.empty}>
                    <Text style={type.h2}>Your feed is empty</Text>
                    <Button
                      label={local ? "Create a poll" : "Find people to follow"}
                      onPress={
                        local ? newPoll : () => router.navigate("/search")
                      }
                    />
                  </View>
                )
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View
              style={{ width: feedWidth, alignSelf: "center", marginTop: 13 }}
            >
              {item.kind === "reel" ? (
                <FeedReelPost
                  key={item.reel.id}
                  reel={item.reel}
                  active={focused && activeReel === item.reel.id}
                  mediaHeight={reelHeight}
                />
              ) : (
                <PollCard poll={item.poll} extras={extras[item.poll.id]} />
              )}
            </View>
          )}
        />
      </View>
      {navigation}
    </View>
  );
}

const useStyles = themedStyles(({ colors, pageBackground, glossy }) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: pageBackground },
    shell: {
      flex: 1,
      width: "100%",
      maxWidth: 960,
      flexDirection: "row",
      alignSelf: "center",
    },
    wordmark: { flexDirection: "row", alignItems: "center", gap: 11 },
    brand: {
      color: colors.ink,
      fontSize: 21,
      fontWeight: "900",
      letterSpacing: -1.25,
    },
    scroll: { flex: 1, minWidth: 0 },
    scrollContent: { paddingHorizontal: 0, paddingTop: 17, paddingBottom: 28 },
    feed: { gap: 13 },
    feedHeader: { gap: 11, paddingTop: 2 },
    feedTitle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    discovery: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 13,
      backgroundColor: glossy ? colors.surface : colors.accentSoft,
      overflow: glossy ? "hidden" : undefined,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    discoveryIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: glossy?.elevated ?? colors.surface,
      justifyContent: "center",
      alignItems: "center",
    },
    discoveryText: { flex: 1 },
    mode: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.accentSoft,
    },
    modeText: { color: colors.infoInk, fontSize: 12, lineHeight: 17 },
    modeTitle: { fontWeight: "700" },
    card: {
      borderRadius: glossy ? 22 : 17,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    postBody: {
      paddingHorizontal: 15,
      paddingTop: 13,
      paddingBottom: 4,
      gap: 6,
    },
    itemTitle: {
      color: colors.ink,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: -0.28,
    },
    caption: { color: colors.muted, fontSize: 14, lineHeight: 20 },
    choices: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
    choice: {
      flexGrow: 1,
      minHeight: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    choiceText: { fontSize: 13, fontWeight: "700" },
    postFooter: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
      justifyContent: "space-between",
      alignItems: "center",
      borderTopWidth: glossy ? StyleSheet.hairlineWidth : 0,
      borderColor: colors.border,
    },
    postActions: { flexDirection: "row", alignItems: "center", gap: 6 },
    commentsLink: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    voteLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      minHeight: 44,
      alignSelf: "flex-start",
    },
    voteLinkText: { color: colors.accentInk, fontSize: 13, fontWeight: "700" },
    updateStatus: { color: colors.buy, fontSize: 13, fontWeight: "700" },
    empty: {
      backgroundColor: colors.surface,
      padding: 20,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 17,
    },
    pressed: { opacity: 0.76 },
  }),
);
