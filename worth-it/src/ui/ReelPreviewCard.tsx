import { ContentTap } from "./ContentTap";
import { Image } from "expo-image";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { timeAgo } from "../lib/format";
import type { Reel } from "../lib/socialRepo";
import { ProfileAvatar } from "./ProfileAvatar";
import { SocialIcon } from "./SocialIcon";
import { themedStyles, useTheme } from "./theme";

export function ReelPreviewCard({ reel }: { reel: Reel }) {
  const { colors, type } = useTheme();
  const styles = useStyles();

  const author = reel.author.username
    ? "@" + reel.author.username
    : reel.author.displayName || "Worth It? member";
  return (
    <ContentTap
      expand={false}
      kind="reel"
      id={reel.id}
      accessibilityRole="link"
      accessibilityLabel={`Watch check: ${reel.caption || author}`}
      onOpen={() =>
        router.push({
          pathname: "/reels",
          params: {
            reel: reel.id,
            ...(reel.authorId ? { author: reel.authorId } : {}),
          },
        })
      }
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.preview}>
        {reel.poster ? (
          <Image
            source={reel.poster}
            style={{ width: 58, height: 62 }}
            contentFit="cover"
            cachePolicy="disk"
          />
        ) : (
          <SocialIcon name="reels" color={colors.accentInk} />
        )}
      </View>
      <View style={styles.content}>
        <Text style={type.h2} numberOfLines={2}>
          {reel.caption || "Watch check"}
        </Text>
        <View style={styles.byline}>
          <ProfileAvatar name={author} uri={reel.author.avatar} size={21} />
          <Text style={[type.small, styles.author]} numberOfLines={1}>
            {author}
          </Text>
          {reel.createdAt ? (
            <Text style={type.small}>{timeAgo(reel.createdAt)}</Text>
          ) : null}
        </View>
      </View>
      <SocialIcon name="arrow" color={colors.accentInk} />
    </ContentTap>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 16,
      backgroundColor: colors.surface,
    },
    preview: {
      width: 58,
      height: 62,
      borderRadius: 11,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    content: { flex: 1, minWidth: 0, gap: 5 },
    byline: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      flexWrap: "wrap",
    },
    author: { fontWeight: "700", flexShrink: 1 },
    pressed: { opacity: 0.8 },
  }),
);
