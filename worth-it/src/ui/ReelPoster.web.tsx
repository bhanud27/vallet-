import { isLowData, subscribePreferences } from "../lib/preferences";
import { Asset } from "expo-asset";
import { Image } from "expo-image";
import React, { useSyncExternalStore, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SocialIcon } from "./SocialIcon";
import { themedStyles, useTheme } from "./theme";
import { useReelSource, type PosterMedia } from "./useReelSource";
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
  const [failed, setFailed] = useState<string>();
  const { source } = useReelSource(reel, active && !reel.poster && !lowData);
  const uri =
    typeof source === "number" ? Asset.fromModule(source).uri : source;
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
          contentFit="cover"
          cachePolicy="disk"
          style={StyleSheet.absoluteFill}
        />
      ) : active && uri && failed !== uri ? (
        <video
          key={uri}
          src={uri}
          muted
          playsInline
          preload="metadata"
          aria-hidden
          tabIndex={-1}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
          onError={() => setFailed(uri)}
          onLoadedData={(event) => {
            const video = event.currentTarget;
            if (
              video.currentTime < 0.01 &&
              Number.isFinite(video.duration) &&
              video.duration > 0.1
            )
              video.currentTime = 0.05;
          }}
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
