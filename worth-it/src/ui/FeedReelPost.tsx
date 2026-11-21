import { ThemeSurface } from "./ThemeSurface";
import { ReportButton } from "./ReportButton";
import { router, useIsFocused } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import type { Reel } from "../lib/socialRepo";
import { repo } from "../lib/repo";
import { timeAgo } from "../lib/format";
import { parseProductUrl } from "../lib/validation";
import { ProfileAvatar } from "./ProfileAvatar";
import { StoredReelVideo } from "./ReelVideo";
import { ReelPoster } from "./ReelPoster";
import { CommentThread } from "./CommentThread";
import { ContentStarButton } from "./ContentStarButton";
import { ContentTap } from "./ContentTap";
import { Banner } from "./kit";
import { themedStyles, useTheme } from "./theme";
export function FeedReelPost({
  reel,
  active,
  mediaHeight,
  showOpen = true,
  initialComments = false,
  sound,
}: {
  reel: Reel;
  active: boolean;
  mediaHeight: number;
  showOpen?: boolean;
  initialComments?: boolean;
  sound?: { muted: boolean; onChange: (muted: boolean) => void };
}) {
  const { type } = useTheme();
  const styles = useStyles();

  const focused = useIsFocused();
  const [commentsOpen, setCommentsOpen] = useState(initialComments),
    [error, setError] = useState("");
  const name = reel.author.username
    ? "@" + reel.author.username
    : reel.author.displayName || "Worth It? member";
  const canOpenProfile = repo.mode === "supabase" && !!reel.authorId;
  const product = reel.productUrl ? parseProductUrl(reel.productUrl) : null;
  const open = () =>
    router.push({ pathname: "/reels", params: { reel: reel.id } });
  return (
    <ThemeSurface testID={"feed-reel-" + reel.id} style={styles.post}>
      <View style={styles.header}>
        <Pressable
          disabled={!canOpenProfile}
          accessibilityRole={canOpenProfile ? "link" : undefined}
          accessibilityLabel={"Open " + name + " profile"}
          style={styles.identity}
          onPress={() =>
            router.push({
              pathname: "/member/[id]",
              params: { id: reel.authorId },
            })
          }
        >
          <ProfileAvatar name={name} uri={reel.author.avatar} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.body, styles.name]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={type.small}>
              {reel.media.kind === "demo"
                ? "Demo check"
                : timeAgo(reel.createdAt)}
            </Text>
          </View>
        </Pressable>
        {showOpen && (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open full check"
            style={styles.open}
            onPress={() =>
              router.push({
                pathname: "/reels",
                params: {
                  reel: reel.id,
                },
              })
            }
          >
            <Text style={styles.link}>Open check</Text>
          </Pressable>
        )}
      </View>
      <View style={[styles.media, { height: mediaHeight }]}>
        {active ? (
          <StoredReelVideo
            tap={{
              kind: "reel",
              id: reel.id,
              onOpen: showOpen ? open : undefined,
            }}
            reel={reel}
            paused={commentsOpen}
            sound={sound}
            contentFit="contain"
          />
        ) : (
          <ContentTap
            kind="reel"
            id={reel.id}
            onOpen={open}
            style={{ flex: 1 }}
            accessibilityRole="link"
            accessibilityLabel="Open check"
          >
            <ReelPoster reel={reel} active={commentsOpen && focused} />
          </ContentTap>
        )}
      </View>
      <View style={styles.body}>
        {reel.caption ? <Text style={type.body}>{reel.caption}</Text> : null}
        <View style={styles.actions}>
          {product ? (
            <Pressable
              accessibilityRole="link"
              style={styles.product}
              onPress={() => {
                void Linking.openURL(product).catch(() =>
                  setError("Could not open the product link."),
                );
              }}
            >
              <Text style={styles.link}>View product</Text>
            </Pressable>
          ) : (
            <Text style={type.small}>Check</Text>
          )}
          <ContentStarButton
            kind="reel"
            id={reel.id}
            initial={{ starred: reel.liked, count: reel.likes }}
          />
        </View>
        {error ? <Banner kind="error">{error}</Banner> : null}
      </View>
      <CommentThread
        key={reel.id + ":" + initialComments}
        kind="reel"
        id={reel.id}
        label={reel.caption || name}
        initialOpen={initialComments}
        onOpenChange={setCommentsOpen}
      />
      {!showOpen && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          {reel.media.kind !== "demo" && (
            <ReportButton kind="reel" id={reel.id} />
          )}
        </View>
      )}
    </ThemeSurface>
  );
}
const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    post: {
      width: "100%",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      overflow: "hidden",
    },
    header: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    identity: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      gap: 9,
      alignItems: "center",
    },
    name: { fontWeight: "800" },
    open: { minHeight: 44, justifyContent: "center", paddingLeft: 8 },
    link: { fontSize: 13, fontWeight: "700", color: colors.accentInk },
    media: { width: "100%", backgroundColor: "#000000" },
    body: { paddingHorizontal: 15, paddingTop: 12, gap: 6 },
    actions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    product: { minHeight: 44, justifyContent: "center" },
  }),
);
