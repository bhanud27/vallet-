import { ContentTap } from "./ContentTap";
import { repo } from "../lib/repo";
import React, { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { pollDisplayPrice } from "../lib/productPrice";
import { timeAgo } from "../lib/format";
import { Poll, PollMedia } from "../lib/types";
import { Badge, PollImage, PriceTag } from "./kit";
import {
  FullPhotoButton,
  GalleryMedia,
  ProductImageLink,
} from "./GalleryMedia";
import { SocialIcon } from "./SocialIcon";
import { themedStyles, useTheme } from "./theme";

export function PostIdentity({ poll, mine }: { poll: Poll; mine: boolean }) {
  const { colors, type } = useTheme();
  const styles = useStyles();

  const name = poll.isDemo
    ? "Worth It? demo"
    : mine
      ? poll.contentKind === "post"
        ? "Your post"
        : "Your poll"
      : poll.username
        ? "@" + poll.username
        : poll.contentKind === "post"
          ? "Shared post"
          : "Shared poll";
  const authorId = poll.authorId;
  return (
    <View style={styles.identity}>
      <View style={styles.avatar}>
        <SocialIcon
          name={poll.isDemo ? "photo" : "person"}
          color={colors.accentInk}
        />
      </View>
      <View style={styles.identityText}>
        {authorId ? (
          <Pressable
            accessibilityRole="link"
            onPress={() =>
              router.push({
                pathname: "/member/[id]",
                params: { id: authorId },
              })
            }
          >
            <Text style={styles.author}>{name}</Text>
          </Pressable>
        ) : (
          <Text style={styles.author}>{name}</Text>
        )}
        <Text style={type.small}>{timeAgo(poll.createdAt)}</Text>
      </View>
      {poll.isDemo ? <Badge label="DEMO" tone="info" /> : null}
    </View>
  );
}

export function PostPhoto({
  poll,
  onOpen,
  testID,
  legacySource,
  preview = false,
}: {
  poll: Poll;
  onOpen?: () => void;
  testID?: string;
  legacySource?: string;
  preview?: boolean;
}) {
  const displayPrice = pollDisplayPrice(poll);
  const styles = useStyles();

  const media = poll.media ?? [];
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const lastIndex = useRef(0);
  const active = Math.min(index, Math.max(0, media.length - 1));
  const activePhoto: PollMedia | undefined = media.length
    ? media[active]?.kind === "image"
      ? media[active]
      : undefined
    : poll.imageUrl
      ? { kind: "image", value: poll.imageUrl }
      : undefined;

  useEffect(() => {
    if (!width) return;
    const frame = requestAnimationFrame(() =>
      scroll.current?.scrollTo({
        x: lastIndex.current * width,
        animated: false,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [width]);

  const goTo = (next: number) =>
    scroll.current?.scrollTo({ x: next * width, animated: true });
  const photo = (children: React.ReactNode, id?: string) => (
    <ContentTap
      kind="poll"
      id={poll.id}
      starDisabled={preview || (poll.isDemo && !repo.demoVotingEnabled)}
      testID={id}
      accessibilityRole={onOpen ? "link" : "button"}
      accessibilityLabel={`Open ${poll.itemName}`}
      onOpen={onOpen}
      style={styles.image}
    >
      {children}
    </ContentTap>
  );

  return (
    <View
      style={styles.media}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
    >
      {!media.length
        ? photo(
            <PollImage
              poll={poll}
              style={styles.image}
              fit={poll.isDemo ? "cover" : "contain"}
            />,
            testID,
          )
        : width > 0 && (
            <ScrollView
              ref={scroll}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.image}
              scrollEventThrottle={16}
              onScroll={({ nativeEvent }) => {
                const next = Math.max(
                  0,
                  Math.min(
                    media.length - 1,
                    Math.round(nativeEvent.contentOffset.x / width),
                  ),
                );
                if (lastIndex.current !== next) {
                  lastIndex.current = next;
                  setIndex(next);
                }
              }}
            >
              {media.map((item, position) => (
                <View
                  key={item.value}
                  style={{ width, height: (width * 3) / 4 }}
                  aria-hidden={position !== active}
                  importantForAccessibility={
                    position === active ? "auto" : "no-hide-descendants"
                  }
                >
                  {item.kind === "video" ? (
                    position === active ? (
                      <GalleryMedia
                        tap={{
                          kind: "poll",
                          id: poll.id,
                          onOpen,
                          starDisabled:
                            preview || (poll.isDemo && !repo.demoVotingEnabled),
                        }}
                        item={item}
                        label={`Video of ${poll.itemName}`}
                      />
                    ) : null
                  ) : (
                    Math.abs(active - position) <= 1 &&
                    (position === active ? (
                      photo(
                        <GalleryMedia
                          item={item}
                          label={`Photo of ${poll.itemName}`}
                        />,
                        testID,
                      )
                    ) : (
                      <GalleryMedia
                        item={item}
                        label={`Photo of ${poll.itemName}`}
                      />
                    ))
                  )}
                </View>
              ))}
            </ScrollView>
          )}
      {media.length > 1 && (
        <View style={styles.galleryControls}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous media"
            disabled={active === 0}
            onPress={() => goTo(active - 1)}
            style={[styles.step, active === 0 && styles.disabled]}
          >
            <Text style={styles.stepText}>‹</Text>
          </Pressable>
          <Text
            accessibilityLabel={`Media ${active + 1} of ${media.length}`}
            style={styles.counter}
          >
            {active + 1} / {media.length}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next media"
            disabled={active === media.length - 1}
            onPress={() => goTo(active + 1)}
            style={[
              styles.step,
              active === media.length - 1 && styles.disabled,
            ]}
          >
            <Text style={styles.stepText}>›</Text>
          </Pressable>
        </View>
      )}
      {poll.contentKind !== "post" && displayPrice ? (
        <View pointerEvents="none" style={styles.price}>
          <PriceTag {...displayPrice} size="small" />
        </View>
      ) : null}
      <ProductImageLink
        url={
          media.length
            ? media[active]?.sourceUrl
            : poll.imageUrl
              ? legacySource
              : undefined
        }
      />
      {!onOpen && activePhoto && (
        <FullPhotoButton
          key={activePhoto.value}
          item={activePhoto}
          label={`Photo of ${poll.itemName}`}
        />
      )}
    </View>
  );
}

export function PollThumbnail({ poll }: { poll: Poll }) {
  const { colors } = useTheme();
  const styles = useStyles();

  const image = poll.media?.find((item) => item.kind === "image");
  return (
    <View style={styles.thumbnail}>
      {image ? (
        <GalleryMedia item={image} label={`Photo of ${poll.itemName}`} />
      ) : poll.media?.length ? (
        <SocialIcon name="reels" color={colors.accentInk} />
      ) : (
        <PollImage poll={poll} style={styles.image} />
      )}
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    identity: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 15,
      paddingVertical: 11,
    },
    avatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accentSoft,
    },
    identityText: { flex: 1, gap: 1 },
    author: { color: colors.ink, fontSize: 14, fontWeight: "700" },
    media: { width: "100%", aspectRatio: 4 / 3, backgroundColor: colors.media },
    image: { position: "absolute", width: "100%", height: "100%" },
    price: { position: "absolute", left: 12, bottom: 12 },
    galleryControls: {
      position: "absolute",
      top: 8,
      left: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      borderRadius: 12,
      backgroundColor: "#151515E6",
    },
    step: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    stepText: { color: "#fff", fontSize: 24, lineHeight: 26 },
    disabled: { opacity: 0.45 },
    counter: { color: "#fff", fontSize: 12, fontWeight: "700" },
    thumbnail: {
      width: 62,
      height: 62,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);
