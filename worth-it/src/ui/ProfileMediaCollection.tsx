import { ProfileStickyStyles } from "./ProfileStickyStyles";
import {
  ProfileStickyHeader,
  ProfileHeaderOffset,
} from "./ProfileStickyHeader";
import { ContentTap } from "./ContentTap";
import { useContentStar } from "./useContentStar";
import { repo } from "../lib/repo";
import React, {
  type ReactNode,
  useCallback,
  useMemo,
  useId,
  useRef,
  useState,
} from "react";
import { router, useIsFocused } from "expo-router";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { PollSummary } from "../lib/types";
import type { Reel } from "../lib/socialRepo";
import { formatInr, timeAgo } from "../lib/format";
import type { ExploreItem } from "../lib/exploreGrid";
import { exploreId } from "../lib/exploreGrid";
import { GalleryMedia } from "./GalleryMedia";
import { PollImage } from "./kit";
import { ReelPoster } from "./ReelPoster";
import { SocialIcon } from "./SocialIcon";
import { themedStyles, useTheme } from "./theme";

export type ProfileTab = "polls" | "reels";
type Display = "grid" | "list";
type Row =
  | { kind: "controls" }
  | { kind: "empty" }
  | { kind: "media"; entries: ExploreItem[] };
const VISIBILITY = { itemVisiblePercentThreshold: 25, minimumViewTime: 100 };
export function ProfileMediaCollection({
  polls,
  reels,
  tab,
  onTabChange,
  header,
  footer,
  empty,
  mine = false,
  authorId,
  showCollection = true,
  onManage,
  onOpenItem,
  onRefresh,
  refreshing = false,
  topOverlayHeight = 0,
  bottomOverlayHeight = 0,
}: {
  polls: PollSummary[];
  reels: Reel[];
  tab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  header: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
  mine?: boolean;
  authorId?: string;
  showCollection?: boolean;
  onManage?: (kind: "poll" | "reel", id: string) => void;
  onOpenItem?: (item: ExploreItem) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  topOverlayHeight?: number;
  bottomOverlayHeight?: number;
}) {
  const stickyId = "profile-sticky-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const { colors } = useTheme(),
    styles = useStyles(),
    focused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  const [display, setDisplay] = useState<Display>("grid"),
    [measuredWidth, setWidth] = useState(0);
  // Native rows need a real initial size while the first layout event is pending.
  const width = measuredWidth > 0 ? measuredWidth : Math.min(windowWidth, 600);
  const [visible, setVisible] = useState<string[]>([]);
  const list = useRef<FlatList<Row>>(null),
    headerHeight = useRef(0);
  const items = useMemo<ExploreItem[]>(
    () =>
      tab === "polls"
        ? polls.map((poll) => ({ kind: "poll", poll }))
        : reels.map((reel) => ({ kind: "reel", reel })),
    [polls, reels, tab],
  );
  const data = useMemo<Row[]>(() => {
    if (!showCollection) return [];
    const rows: Row[] = [{ kind: "controls" }],
      columns = display === "grid" ? 3 : 1;
    if (!items.length) rows.push({ kind: "empty" });
    for (let i = 0; i < items.length; i += columns)
      rows.push({ kind: "media", entries: items.slice(i, i + columns) });
    return rows;
  }, [items, display, showCollection]);
  const viewable = useCallback(
    ({ viewableItems }: { viewableItems: { item: Row }[] }) => {
      const ids = viewableItems.flatMap(({ item }) =>
        item.kind === "media" ? item.entries.map(exploreId) : [],
      );
      setVisible((current) =>
        current.join("|") === ids.join("|") ? current : ids,
      );
    },
    [],
  );
  const renderState = useMemo(
    () => ({ display, width, focused, visible, colors, tab }),
    [display, width, focused, visible, colors, tab],
  );
  const collectionTop = () =>
    requestAnimationFrame(() =>
      list.current?.scrollToOffset({
        offset: headerHeight.current,
        animated: false,
      }),
    );
  const open = (item: ExploreItem) =>
    onOpenItem
      ? onOpenItem(item)
      : item.kind === "poll"
        ? router.push("/p/" + item.poll.id)
        : router.push({
            pathname: "/reels",
            params: {
              reel: item.reel.id,
              ...(mine ? { mine: "1" } : authorId ? { author: authorId } : {}),
            },
          });
  return (
    <ProfileHeaderOffset.Provider value={topOverlayHeight}>
      <ProfileStickyStyles id={stickyId} offset={topOverlayHeight} />
      <FlatList
        nativeID={stickyId}
        ref={list}
        testID="profile-collection"
        style={styles.collection}
        data={data}
        extraData={renderState}
        // Android clipping can detach sticky/profile cells after the async header grows.
        // Keep native views attached; FlatList still virtualizes the JS render window.
        removeClippedSubviews={false}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        keyExtractor={(row) =>
          row.kind === "media"
            ? display + ":" + exploreId(row.entries[0])
            : row.kind
        }
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={5}
        onViewableItemsChanged={viewable}
        viewabilityConfig={VISIBILITY}
        stickyHeaderIndices={showCollection ? [1] : undefined}
        StickyHeaderComponent={
          topOverlayHeight > 0 ? ProfileStickyHeader : undefined
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topOverlayHeight,
            paddingBottom: bottomOverlayHeight + 24,
          },
        ]}
        ListHeaderComponent={
          <View
            style={styles.header}
            collapsable={false}
            onLayout={(event) => {
              headerHeight.current = event.nativeEvent.layout.height;
            }}
          >
            {header}
          </View>
        }
        ListFooterComponent={
          footer ? <View style={styles.footer}>{footer}</View> : undefined
        }
        renderItem={({ item }) =>
          item.kind === "controls" ? (
            <View
              testID="profile-media-controls"
              collapsable={false}
              style={styles.controls}
            >
              <View style={styles.tabs} accessibilityRole="tablist">
                {(["polls", "reels"] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      value === "polls" ? "Polls & posts" : "Checks"
                    }
                    accessibilityState={{ selected: tab === value }}
                    aria-selected={tab === value}
                    onPress={() => {
                      onTabChange(value);
                      collectionTop();
                    }}
                    style={[styles.tab, tab === value && styles.selectedTab]}
                  >
                    <SocialIcon
                      name={value === "polls" ? "grid" : "reels"}
                      color={tab === value ? colors.ink : colors.muted}
                    />
                    <Text
                      style={[
                        styles.tabText,
                        tab === value && styles.selectedText,
                      ]}
                    >
                      {value === "polls" ? "Polls & posts" : "Checks"}
                    </Text>
                    <Text style={styles.count}>
                      {value === "polls" ? polls.length : reels.length}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.toolbar}>
                <Text style={styles.caption}>
                  {items.length}{" "}
                  {tab === "polls"
                    ? items.length === 1
                      ? "poll"
                      : "polls"
                    : items.length === 1
                      ? "check"
                      : "checks"}
                </Text>
                <View style={styles.displayControls}>
                  {(["grid", "list"] as const).map((value) => (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={
                        value === "grid" ? "Grid view" : "List view"
                      }
                      accessibilityState={{ selected: display === value }}
                      aria-pressed={display === value}
                      onPress={() => {
                        setDisplay(value);
                        collectionTop();
                      }}
                      style={[
                        styles.displayButton,
                        display === value && styles.activeDisplay,
                      ]}
                    >
                      <SocialIcon
                        name={value}
                        color={display === value ? colors.ink : colors.muted}
                      />
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          ) : item.kind === "empty" ? (
            <View testID="profile-empty" style={styles.empty}>
              {empty ?? (
                <>
                  <SocialIcon
                    name={tab === "polls" ? "photo" : "reels"}
                    color={colors.muted}
                  />
                  <Text style={styles.emptyTitle}>
                    {tab === "polls" ? "No polls yet" : "No checks yet"}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View
              collapsable={false}
              style={[styles.row, display === "list" && styles.listRow]}
            >
              {width > 0 &&
                item.entries.map((entry) => (
                  <View
                    key={exploreId(entry)}
                    style={
                      display === "grid"
                        ? { width: (width - 4) / 3 }
                        : { flex: 1, paddingRight: mine ? 48 : 0 }
                    }
                  >
                    <ProfileMediaItem
                      item={entry}
                      grid={display === "grid"}
                      size={display === "grid" ? (width - 4) / 3 : 80}
                      active={focused && visible.includes(exploreId(entry))}
                      onOpen={() => open(entry)}
                    />
                    {mine && (
                      <Pressable
                        testID={"manage-" + exploreId(entry)}
                        accessibilityRole="button"
                        accessibilityLabel={
                          "Manage " +
                          (entry.kind === "reel"
                            ? "check"
                            : entry.poll.contentKind === "post"
                              ? "post"
                              : "poll") +
                          ": " +
                          (entry.kind === "poll"
                            ? entry.poll.itemName
                            : entry.reel.caption || "Check")
                        }
                        onPress={() => {
                          const id =
                            entry.kind === "poll"
                              ? entry.poll.id
                              : entry.reel.id;
                          if (onManage) onManage(entry.kind, id);
                          else
                            router.push({
                              pathname: "/manage-post",
                              params: { kind: entry.kind, id },
                            });
                        }}
                        style={{
                          position: "absolute",
                          top: 4,
                          right: 4,
                          minHeight: 44,
                          minWidth: 44,
                          borderRadius: 22,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          borderWidth: 1,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.ink,
                            fontSize: 22,
                            fontWeight: "700",
                          }}
                        >
                          {"\u22EF"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                ))}
            </View>
          )
        }
      />
    </ProfileHeaderOffset.Provider>
  );
}
function ProfileMediaItem({
  item,
  grid,
  size,
  active,
  onOpen,
}: {
  item: ExploreItem;
  grid: boolean;
  size: number;
  active: boolean;
  onOpen: () => void;
}) {
  const { colors } = useTheme(),
    styles = useStyles();
  const poll = item.kind === "poll" ? item.poll : undefined,
    reel = item.kind === "reel" ? item.reel : undefined;
  const reaction = useContentStar(
    item.kind,
    poll?.id ?? reel!.id,
    reel ? { starred: reel.liked, count: reel.likes } : undefined,
  );
  const title = poll?.itemName || reel?.caption || "Check";
  const detail = poll
    ? poll.contentKind === "post"
      ? "Post"
      : formatInr(poll.priceInr) +
        " / " +
        poll.voteCount +
        (poll.voteCount === 1 ? " vote" : " votes")
    : reaction.value.count + (reaction.value.count === 1 ? " star" : " stars");
  const video = !!reel || poll?.media?.[0]?.kind === "video";
  const multiple = (poll?.media?.length ?? 0) > 1;
  const height = reel ? (size * 4) / 3 : size;
  return (
    <ContentTap
      kind={item.kind}
      id={poll?.id ?? reel!.id}
      starDisabled={!!poll?.isDemo && !repo.demoVotingEnabled}
      testID={"profile-" + (grid ? "tile-" : "row-") + exploreId(item)}
      accessibilityRole="link"
      accessibilityLabel={
        (reel ? "Watch check: " : "Open poll: ") + title + ", " + detail
      }
      onOpen={onOpen}
      style={({ pressed }) => [
        grid ? { width: size } : styles.listItem,
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.media,
          { width: size, height },
          !grid && styles.listMedia,
        ]}
      >
        <ProfileMediaVisual item={item} active={active} />
        {(video || multiple) && (
          <View pointerEvents="none" style={styles.mediaBadge}>
            <SocialIcon name={video ? "reels" : "photo"} color="#fff" />
            {multiple && (
              <Text style={styles.overlayText}>{poll!.media!.length}</Text>
            )}
          </View>
        )}
        {grid && (
          <View pointerEvents="none" style={styles.overlay}>
            <Text numberOfLines={1} style={styles.overlayText}>
              {poll
                ? poll.contentKind === "post"
                  ? "Post"
                  : formatInr(poll.priceInr)
                : reaction.value.count + " stars"}
            </Text>
          </View>
        )}
      </View>
      {!grid && (
        <View style={styles.details}>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.caption}>{detail}</Text>
          {poll?.question && (
            <Text style={styles.caption} numberOfLines={2}>
              {poll.question}
            </Text>
          )}
          <View style={styles.metadata}>
            <Text style={styles.date}>
              {timeAgo(poll?.createdAt || reel?.createdAt || "")}
            </Text>
            {poll?.updateStatus && (
              <Text style={[styles.date, { color: colors.accentInk }]}>
                {poll.updateStatus === "bought"
                  ? "Bought"
                  : poll.updateStatus === "returned"
                    ? "Returned"
                    : "Passed"}
              </Text>
            )}
          </View>
        </View>
      )}
    </ContentTap>
  );
}
function ProfileMediaVisual({
  item,
  active,
}: {
  item: ExploreItem;
  active: boolean;
}) {
  const styles = useStyles();
  if (item.kind === "reel")
    return <ReelPoster reel={item.reel} active={active} />;
  const media = item.poll.media?.[0];
  if (media?.kind === "video")
    return (
      <ReelPoster
        reel={{
          media: {
            kind: media.device ? "device" : "remote",
            value: media.value,
          },
          poster: media.thumbnail,
        }}
        active={active}
      />
    );
  if (media)
    return (
      <GalleryMedia
        item={media}
        label={"Photo of " + item.poll.itemName}
        fit="cover"
      />
    );
  return <PollImage poll={item.poll} style={styles.image} fit="cover" />;
}
const useStyles = themedStyles(({ colors, pageBackground, glass }) =>
  StyleSheet.create({
    collection: {
      flex: 1,
      width: "100%",
      maxWidth: 600,
      alignSelf: "center",
      backgroundColor: pageBackground,
    },
    content: { paddingBottom: 24 },
    header: { padding: 16, gap: 16 },
    footer: { padding: 16, gap: 12 },
    controls: {
      // Sticky tabs remain readable when media scrolls underneath them.
      backgroundColor: glass ? colors.surface : colors.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tabs: {
      flexDirection: "row",
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tab: {
      flex: 1,
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    selectedTab: { borderBottomColor: colors.ink },
    tabText: { fontSize: 14, fontWeight: "700", color: colors.muted },
    selectedText: { color: colors.ink },
    count: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      backgroundColor: colors.media,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 8,
    },
    toolbar: {
      paddingHorizontal: 16,
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    displayControls: { flexDirection: "row", gap: 3 },
    displayButton: {
      width: 42,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 10,
    },
    activeDisplay: { backgroundColor: colors.media },
    row: { flexDirection: "row", gap: 2, marginTop: 2 },
    listRow: { paddingHorizontal: 16 },
    media: { backgroundColor: colors.media, overflow: "hidden" },
    image: { width: "100%", height: "100%" },
    listMedia: { borderRadius: 8 },
    mediaBadge: {
      position: "absolute",
      left: 4,
      top: 4,
      padding: 2,
      borderRadius: 6,
      backgroundColor: "#0008",
      flexDirection: "row",
      alignItems: "center",
    },
    overlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      padding: 7,
      backgroundColor: "#0008",
    },
    overlayText: { color: "#fff", fontSize: 11, fontWeight: "700" },
    listItem: {
      width: "100%",
      flexDirection: "row",
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
    },
    details: { flex: 1, minWidth: 0, gap: 5 },
    itemTitle: {
      color: colors.ink,
      fontWeight: "700",
      fontSize: 15,
      lineHeight: 20,
    },
    caption: { color: colors.muted, fontSize: 12, lineHeight: 17 },
    date: { color: colors.muted, fontSize: 11 },
    metadata: { flexDirection: "row", gap: 12 },
    pressed: { opacity: 0.75 },
    empty: {
      padding: 24,
      minHeight: 170,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  }),
);
