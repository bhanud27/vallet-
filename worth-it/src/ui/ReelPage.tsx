import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
  type ViewStyle,
} from "react-native";
import { router } from "expo-router";
import { repo } from "../lib/repo";
import type { Reel } from "../lib/socialRepo";
import { ProfileAvatar } from "./ProfileAvatar";
import { ReelPoster } from "./ReelPoster";
import { StoredReelVideo } from "./ReelVideo";
import { ContentStarButton } from "./ContentStarButton";
import { SocialIcon } from "./SocialIcon";

export function ReelPage({
  reel,
  height,
  active,
  nearby,
  paused,
  sound,
  onComments,
  onDetails,
  bottomOverlayHeight = 0,
}: {
  reel: Reel;
  height: number;
  active: boolean;
  nearby: boolean;
  paused: boolean;
  sound: { muted: boolean; onChange: (muted: boolean) => void };
  onComments: () => void;
  onDetails: () => void;
  bottomOverlayHeight?: number;
}) {
  const name = reel.author.username
    ? "@" + reel.author.username
    : reel.author.displayName || "Worth It? member";
  const profile = repo.mode === "supabase" && !!reel.authorId;
  return (
    <View
      testID={"reel-page-" + reel.id}
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[
        styles.page,
        { height },
        Platform.OS === "web" &&
          ({ scrollSnapAlign: "start", scrollSnapStop: "always" } as ViewStyle),
      ]}
    >
      {active || nearby ? (
        <StoredReelVideo
          tap={{ kind: "reel", id: reel.id }}
          reel={reel}
          active={active}
          paused={paused}
          sound={sound}
          contentFit="contain"
          controlTop={70}
        />
      ) : (
        <ReelPoster reel={reel} active={false} />
      )}
      <View
        pointerEvents="box-none"
        style={[
          styles.footer,
          bottomOverlayHeight > 0 && { bottom: bottomOverlayHeight + 10 },
        ]}
      >
        <View style={styles.caption}>
          <Pressable
            style={styles.identity}
            disabled={!profile}
            accessibilityRole={profile ? "link" : undefined}
            accessibilityLabel={"Open " + name + " profile"}
            onPress={() =>
              router.push({
                pathname: "/member/[id]",
                params: { id: reel.authorId },
              })
            }
          >
            <ProfileAvatar name={name} uri={reel.author.avatar} size={34} />
            <Text numberOfLines={1} style={styles.name}>
              {name}
            </Text>
          </Pressable>
          {reel.media.kind === "demo" && (
            <Text style={styles.demo}>DEMO / fictional product</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read check details"
            onPress={onDetails}
          >
            <Text numberOfLines={2} style={styles.text}>
              {reel.caption || "View check details"}
            </Text>
          </Pressable>
          {reel.productUrl && (
            <Pressable
              accessibilityRole="button"
              onPress={onDetails}
              style={styles.product}
            >
              <Text style={styles.link}>View product</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.actions}>
          <ContentStarButton
            kind="reel"
            id={reel.id}
            initial={{ starred: reel.liked, count: reel.likes }}
            dark
          />
          <Pressable
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel="Show check comments"
            onPress={onComments}
          >
            <SocialIcon name="message" color="#fff" />
            <Text style={styles.actionText}>Comments</Text>
          </Pressable>
          <Pressable
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel="More check options"
            onPress={onDetails}
          >
            <Text style={styles.more}>...</Text>
            <Text style={styles.actionText}>More</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  page: { width: "100%", backgroundColor: "#000000", overflow: "hidden" },
  footer: {
    position: "absolute",
    left: 12,
    right: 10,
    bottom: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  caption: {
    flex: 1,
    minWidth: 0,
    padding: 10,
    borderRadius: 12,
    gap: 7,
    backgroundColor: "#000000B8",
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
  },
  name: { flex: 1, color: "#fff", fontSize: 14, fontWeight: "800" },
  text: { color: "#fff", fontSize: 14, lineHeight: 20 },
  demo: {
    color: "#E7EAB8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  product: { minHeight: 36, justifyContent: "center" },
  link: { color: "#DDECAC", fontSize: 13, fontWeight: "700" },
  actions: { width: 64, alignItems: "center", gap: 14 },
  action: {
    minHeight: 52,
    minWidth: 60,
    alignItems: "center",
    justifyContent: "center",
    padding: 5,
    borderRadius: 14,
    gap: 4,
    backgroundColor: "#151515E6",
  },
  actionText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  more: { color: "#fff", fontSize: 24, fontWeight: "800", lineHeight: 21 },
});
