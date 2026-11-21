import { randomUUID } from "expo-crypto";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  addComment,
  type Comment,
  COMMENT_MAX,
  listComments,
  type ThreadKind,
} from "../lib/comments";
import { orderedComments, type CommentSort } from "../lib/commentOrder";
import { isDemoPoll } from "../lib/demoViews";
import { isDemoReel } from "../lib/socialRepo";
import { timeAgo } from "../lib/format";
import { Banner, Button } from "./kit";
import { ProfileAvatar } from "./ProfileAvatar";
import { SocialIcon } from "./SocialIcon";
import { themedStyles, useTheme } from "./theme";

const COMMENT_VISIBILITY = { itemVisiblePercentThreshold: 20 };
const reactions = [
  { emoji: "\u{1F44D}", label: "thumbs up" },
  { emoji: "\u2764\uFE0F", label: "heart" },
  { emoji: "\u{1F525}", label: "fire" },
  { emoji: "\u{1F602}", label: "laughing" },
  { emoji: "\u{1F44F}", label: "clapping" },
  { emoji: "\u{1F60D}", label: "heart eyes" },
];
export function CommentsSection({
  kind,
  id,
  embedded = false,
  panel = false,
  onClose,
}: {
  kind: ThreadKind;
  id: string;
  embedded?: boolean;
  panel?: boolean;
  onClose?: () => void;
}) {
  const { colors, type, mode } = useTheme();
  const styles = useStyles();

  const [comments, setComments] = useState<Comment[] | null>(null);
  const [input, setInput] = useState(""),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<CommentSort>("newest");
  const editor = useRef<React.ComponentRef<typeof TextInput>>(null),
    list = useRef<FlatList<Comment>>(null);
  const draft = useRef<{ body: string; id: string } | null>(null);
  const pendingScroll = useRef<{ id: string; sort: CommentSort } | null>(null);
  const followPostedComment = useCallback(() => {
    if (!pendingScroll.current) return;
    if (pendingScroll.current.sort === "oldest") {
      const scroll = list.current?.getNativeScrollRef();
      // Use the scroll view's actual content size rather than estimated row heights.
      if (
        scroll &&
        "scrollToEnd" in scroll &&
        typeof scroll.scrollToEnd === "function"
      )
        scroll.scrollToEnd({ animated: false });
      else list.current?.scrollToEnd({ animated: false });
    } else list.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);
  const visibleChanged = useCallback(
    ({ viewableItems }: { viewableItems: { item: Comment }[] }) => {
      if (
        viewableItems.some(({ item }) => item.id === pendingScroll.current?.id)
      )
        pendingScroll.current = null;
    },
    [],
  );

  const generation = useRef(0),
    sending = useRef(false),
    live = useRef(false);
  const sample =
    (kind === "poll" && isDemoPoll(id)) || (kind === "reel" && isDemoReel(id));
  const rows = useMemo(
    () => orderedComments(comments ?? [], sort),
    [comments, sort],
  );
  const load = useCallback(
    async (manual = false) => {
      const request = ++generation.current;
      if (manual) setRefreshing(true);
      try {
        const next = await listComments(kind, id);
        if (request === generation.current) {
          setComments(next);
          setError("");
          return true;
        }
        return false;
      } catch (reason) {
        if (request === generation.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load comments.",
          );
      } finally {
        if (request === generation.current) setRefreshing(false);
      }
    },
    [kind, id],
  );
  useFocusEffect(
    useCallback(() => {
      live.current = true;
      void load();
      return () => {
        live.current = false;
        generation.current++;
      };
    }, [load]),
  );
  async function submit() {
    const body = input.trim();
    if (!body || sending.current || comments === null) return;
    if (draft.current?.body !== body)
      draft.current = { body, id: randomUUID() };
    const request = generation.current;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const submittedId = draft.current.id;
      await addComment(kind, id, body, submittedId);
      draft.current = null;
      if (request === generation.current && live.current) {
        setInput("");
        pendingScroll.current = { id: submittedId, sort };
        const loaded = await load();
        if (!loaded) pendingScroll.current = null;
        requestAnimationFrame(() => {
          if (live.current) followPostedComment();
        });
      }
    } catch (reason) {
      if (request === generation.current && live.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not post your comment.",
        );
    } finally {
      sending.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <View
      style={[
        styles.section,
        embedded && styles.embedded,
        panel && styles.panel,
      ]}
    >
      <View style={styles.heading}>
        <Text style={styles.title} accessibilityRole="header">
          Comments
        </Text>
        {comments !== null && (
          <View style={styles.count}>
            <Text style={styles.countText}>
              {comments.length >= 50 ? "50+" : comments.length}
            </Text>
          </View>
        )}
        {onClose && (
          <Pressable
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close comments"
            onPress={onClose}
          >
            <Text style={styles.closeIcon}>{"\u00D7"}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.filters}>
        {(["newest", "oldest"] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={
              value === "newest" ? "Newest comments" : "Oldest comments"
            }
            accessibilityState={{ selected: sort === value, disabled: busy }}
            disabled={busy}
            aria-pressed={sort === value}
            onPress={() => {
              pendingScroll.current = null;
              setSort(value);
              list.current?.scrollToOffset({ offset: 0, animated: false });
            }}
            style={[styles.filter, sort === value && styles.filterActive]}
          >
            <Text
              style={[
                styles.filterText,
                sort === value && styles.filterActiveText,
              ]}
            >
              {value === "newest" ? "Newest" : "Oldest"}
            </Text>
          </Pressable>
        ))}
        {sample && <Text style={styles.deviceNote}>On this device</Text>}
      </View>
      {error ? (
        <View style={styles.error}>
          <Banner kind="error">{error}</Banner>
        </View>
      ) : null}
      <FlatList
        key={sort}
        ref={list}
        testID="comments-list"
        style={panel ? styles.list : undefined}
        data={rows}
        keyExtractor={(comment) => comment.id}
        initialNumToRender={8}
        windowSize={5}
        maxToRenderPerBatch={10}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        viewabilityConfig={COMMENT_VISIBILITY}
        onViewableItemsChanged={visibleChanged}
        onContentSizeChange={followPostedComment}
        onScrollBeginDrag={() => {
          pendingScroll.current = null;
        }}
        refreshing={refreshing}
        onRefresh={() => {
          if (!sending.current) void load(true);
        }}
        contentContainerStyle={[
          styles.listContent,
          !rows.length && styles.emptyList,
        ]}
        ListEmptyComponent={
          comments === null ? (
            error ? (
              <Button
                label="Retry comments"
                variant="secondary"
                onPress={() => {
                  void load();
                }}
              />
            ) : (
              <ActivityIndicator
                accessibilityLabel="Loading comments"
                color={colors.accentInk}
              />
            )
          ) : (
            <View style={styles.empty}>
              <SocialIcon name="message" color={colors.muted} />
              <Text style={styles.emptyTitle}>Be the first to comment</Text>
              <Text style={type.small}>
                Share your thoughts and start a conversation.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          rows.length >= 50 ? (
            <Text style={styles.limit}>Showing up to 50 recent comments.</Text>
          ) : undefined
        }
        renderItem={({ item }) => <CommentRow comment={item} />}
      />
      <View testID="comment-composer" style={styles.composer}>
        <View style={styles.reactions}>
          {reactions.map(({ emoji, label }) => (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityLabel={"Add " + label}
              disabled={busy || comments === null}
              style={styles.reaction}
              onPress={() => {
                if (input.length + emoji.length <= COMMENT_MAX)
                  setInput(input + emoji);
                editor.current?.focus();
              }}
            >
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.editorRow}>
          <ProfileAvatar name="" uri={null} size={32} />
          <TextInput
            ref={editor}
            accessibilityLabel="Add a comment"
            placeholder="Add a comment..."
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.accent}
            keyboardAppearance={mode}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={COMMENT_MAX}
            editable={!busy && comments !== null}
            style={styles.input}
            textAlignVertical="center"
            underlineColorAndroid="transparent"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Post comment"
            accessibilityState={{
              disabled: busy || !input.trim() || comments === null,
              busy,
            }}
            disabled={busy || !input.trim() || comments === null}
            onPress={() => {
              void submit();
            }}
            style={[
              styles.send,
              (busy || !input.trim() || comments === null) &&
                styles.sendDisabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Text style={styles.sendIcon}>{"\u2191"}</Text>
            )}
          </Pressable>
        </View>
        {input.length > COMMENT_MAX - 80 && (
          <Text style={styles.remaining}>
            {input.length} / {COMMENT_MAX}
          </Text>
        )}
        {sample && (
          <Text style={styles.sampleNote}>
            Sample comments stay on this device.
          </Text>
        )}
      </View>
    </View>
  );
}
function CommentRow({ comment }: { comment: Comment }) {
  const styles = useStyles();

  const [expanded, setExpanded] = useState(false);
  const long = comment.body.length > 220;
  return (
    <View testID={"comment-" + comment.id} style={styles.comment}>
      <ProfileAvatar name={comment.username} uri={null} size={34} />
      <View style={styles.commentBody}>
        <View style={styles.byline}>
          <Text style={styles.author}>{comment.username}</Text>
          <Text style={styles.time}>{timeAgo(comment.created_at)}</Text>
        </View>
        <Text
          selectable
          style={styles.body}
          numberOfLines={long && !expanded ? 4 : undefined}
        >
          {comment.body}
        </Text>
        {long && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              (expanded ? "Collapse" : "Read full") +
              " comment by " +
              comment.username
            }
            onPress={() => setExpanded((value) => !value)}
            style={styles.readMore}
          >
            <Text style={styles.time}>
              {expanded ? "Show less" : "Read more"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    section: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      overflow: "hidden",
    },
    embedded: { borderWidth: 0, borderRadius: 0 },
    panel: { flex: 1, borderWidth: 0, borderRadius: 0 },
    heading: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingLeft: 18,
      paddingRight: 10,
      minHeight: 52,
    },
    title: { color: colors.ink, fontSize: 18, fontWeight: "800" },
    count: {
      backgroundColor: colors.media,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    countText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
    close: {
      marginLeft: "auto",
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    closeIcon: { fontSize: 28, lineHeight: 30, color: colors.ink },
    filters: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 18,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    filter: {
      minHeight: 34,
      paddingHorizontal: 13,
      justifyContent: "center",
      borderRadius: 18,
      backgroundColor: colors.media,
    },
    filterActive: { backgroundColor: colors.strong },
    filterText: { color: colors.muted, fontSize: 12, fontWeight: "700" },
    filterActiveText: { color: colors.onStrong },
    deviceNote: { marginLeft: "auto", color: colors.muted, fontSize: 10 },
    error: { paddingHorizontal: 12, paddingTop: 8 },
    list: { flex: 1 },
    listContent: { paddingHorizontal: 18, paddingVertical: 12 },
    emptyList: { flexGrow: 1, justifyContent: "center" },
    empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
    emptyTitle: { color: colors.ink, fontWeight: "700", fontSize: 16 },
    comment: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingBottom: 20,
    },
    commentBody: { flex: 1, minWidth: 0, gap: 4 },
    byline: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "baseline",
      columnGap: 7,
    },
    author: { color: colors.ink, fontWeight: "700", fontSize: 13 },
    time: { color: colors.muted, fontSize: 11 },
    body: { color: colors.ink, fontSize: 14, lineHeight: 20 },
    readMore: {
      minHeight: 30,
      justifyContent: "center",
      alignSelf: "flex-start",
    },
    limit: {
      color: colors.muted,
      fontSize: 11,
      marginTop: 14,
      textAlign: "center",
    },
    composer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingBottom: 8,
    },
    reactions: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingVertical: 4,
    },
    reaction: {
      minWidth: 40,
      minHeight: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    emoji: { fontSize: 23 },
    editorRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
    input: {
      flex: 1,
      minHeight: 42,
      maxHeight: 104,
      backgroundColor: colors.media,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.ink,
      ...(Platform.OS === "web" ? { outlineColor: colors.accent } : {}),
      fontSize: 14,
      lineHeight: 20,
    },
    send: {
      height: 40,
      width: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
      marginBottom: 1,
    },
    sendDisabled: { opacity: 0.35 },
    sendIcon: {
      color: colors.onAccent,
      fontSize: 25,
      lineHeight: 28,
      fontWeight: "700",
    },
    remaining: {
      color: colors.muted,
      fontSize: 10,
      textAlign: "right",
      marginTop: 4,
    },
    sampleNote: {
      color: colors.muted,
      fontSize: 10,
      textAlign: "center",
      marginTop: 7,
    },
  }),
);
