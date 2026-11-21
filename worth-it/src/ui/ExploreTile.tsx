import { ContentTap } from "./ContentTap";
import { repo } from "../lib/repo";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { formatInr } from "../lib/format";
import { GalleryMedia } from "./GalleryMedia";
import { ReelPoster } from "./ReelPoster";
import { PollImage } from "./kit";
import { SocialIcon } from "./SocialIcon";
import { themedStyles } from "./theme";
import { exploreId, type ExploreItem } from "../lib/exploreGrid";
export { mixExplore, exploreId, type ExploreItem } from "../lib/exploreGrid";
export function ExploreTile({
  item,
  size,
  active,
}: {
  item: ExploreItem;
  size: number;
  active: boolean;
}) {
  const styles = useStyles();

  const poll = item.kind === "poll" ? item.poll : undefined;
  const reel = item.kind === "reel" ? item.reel : undefined;
  const media = poll?.media?.[0];
  const video = !!reel || media?.kind === "video";
  const label = reel
    ? "Watch check: " + (reel.caption || reel.author.username || "Check")
    : (poll!.contentKind === "post" ? "Open post: " : "Open poll: ") +
      poll!.itemName +
      (poll!.contentKind === "post" ? "" : ", " + formatInr(poll!.priceInr));
  const open = () =>
    reel
      ? router.push({
          pathname: "/reels",
          params: {
            reel: reel.id,
          },
        })
      : router.push("/p/" + poll!.id);
  return (
    <ContentTap
      kind={item.kind}
      id={poll?.id ?? reel!.id}
      starDisabled={!!poll?.isDemo && !repo.demoVotingEnabled}
      testID={"explore-" + exploreId(item)}
      accessibilityRole="link"
      accessibilityLabel={label}
      onOpen={open}
      style={({ pressed }) => [
        styles.tile,
        { width: size, height: size },
        pressed && { opacity: 0.8 },
      ]}
    >
      {reel ? (
        <ReelPoster reel={reel} active={active} />
      ) : media?.kind === "video" ? (
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
      ) : media ? (
        <GalleryMedia item={media} label={label} fit="cover" />
      ) : (
        <PollImage
          poll={poll!}
          style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
          fit="cover"
        />
      )}
      {(poll?.isDemo || reel?.media.kind === "demo") && (
        <View pointerEvents="none" style={styles.demo}>
          <Text style={styles.count}>Demo</Text>
        </View>
      )}
      {video ? (
        <View pointerEvents="none" style={styles.badge}>
          <SocialIcon name="reels" color="#fff" />
        </View>
      ) : (poll?.media?.length || 0) > 1 ? (
        <View pointerEvents="none" style={styles.badge}>
          <SocialIcon name="photo" color="#fff" />
          <Text style={styles.count}>{poll!.media!.length}</Text>
        </View>
      ) : null}
    </ContentTap>
  );
}
const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    demo: {
      position: "absolute",
      left: 5,
      bottom: 5,
      padding: 4,
      borderRadius: 5,
      backgroundColor: "#000000AA",
    },
    tile: { overflow: "hidden", backgroundColor: colors.media },
    badge: {
      position: "absolute",
      right: 5,
      top: 5,
      borderRadius: 7,
      padding: 3,
      backgroundColor: "#00000080",
      flexDirection: "row",
      alignItems: "center",
    },
    count: { color: "#fff", fontSize: 11, fontWeight: "800", paddingRight: 3 },
  }),
);
