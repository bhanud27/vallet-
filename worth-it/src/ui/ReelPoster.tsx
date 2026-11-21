import { isLowData, subscribePreferences } from "../lib/preferences";
import { Image } from "expo-image";
import {
  createVideoPlayer,
  type VideoPlayer,
  type VideoThumbnail,
} from "expo-video";
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, View } from "react-native";
import { createTaskQueue } from "../lib/taskQueue";
import { useReelSource, type PosterMedia } from "./useReelSource";
import { SocialIcon } from "./SocialIcon";
import { themedStyles, useTheme } from "./theme";
const queue = createTaskQueue(2);
function ready(player: VideoPlayer, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      subscription.remove();
      signal.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => finish(new Error("Cancelled"));
    const subscription = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") finish();
      else if (status === "error") finish(new Error("Preview unavailable"));
    });
    const timeout = setTimeout(
      () => finish(new Error("Preview timed out")),
      8000,
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    else if (player.status === "readyToPlay") finish();
    else if (player.status === "error")
      finish(new Error("Preview unavailable"));
  });
}
export function ReelPoster({
  reel,
  active = false,
}: {
  reel: PosterMedia;
  active?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useStyles();

  const lowData = useSyncExternalStore(
    subscribePreferences,
    isLowData,
    () => false,
  );
  const { source } = useReelSource(reel, active && !reel.poster && !lowData);
  const [frame, setFrame] = useState<{
    source: string | number;
    image: VideoThumbnail;
    signal: AbortSignal;
  }>();
  useEffect(() => {
    if (!active || reel.poster || !source) return;
    const controller = new AbortController();
    let image: VideoThumbnail | undefined;
    void queue
      .run(async () => {
        if (controller.signal.aborted) throw new Error("Cancelled");
        const player = createVideoPlayer(source);
        try {
          player.muted = true;
          await ready(player, controller.signal);
          const [next] = await player.generateThumbnailsAsync([0], {
            maxWidth: 360,
            maxHeight: 480,
          });
          if (controller.signal.aborted) {
            next?.release();
            return;
          }
          image = next;
          if (next)
            setFrame({ source, image: next, signal: controller.signal });
        } finally {
          player.release();
        }
      }, controller.signal)
      .catch(() => {
        /* Keep the icon if a legacy asset has no decodable preview. */
      });
    return () => {
      controller.abort();
      image?.release();
    };
  }, [source, active, reel.poster]);
  return (
    <View
      style={styles.poster}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <SocialIcon name="reels" color={colors.accentInk} />
      {reel.poster ? (
        <Image
          source={reel.poster}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="disk"
        />
      ) : active &&
        frame &&
        frame.source === source &&
        !frame.signal.aborted ? (
        <Image
          source={frame.image}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : null}
    </View>
  );
}
const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    poster: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.media,
      alignItems: "center",
      justifyContent: "center",
    },
  }),
);
