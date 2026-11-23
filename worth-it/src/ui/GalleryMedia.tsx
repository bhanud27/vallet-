import { Image as CachedImage } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { Link, useIsFocused } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  Modal,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openDevicePhoto, openDeviceVideo } from "../lib/socialVideo";
import type { VideoHandle } from "../lib/socialVideo";
import type { PollMedia } from "../lib/types";
import { parseProductUrl } from "../lib/validation";
import { ReelVideo, type VideoTap } from "./ReelVideo";
import { themedStyles, useTheme } from "./theme";

function GalleryVideo({ uri, tap }: { uri: string; tap?: VideoTap }) {
  const focused = useIsFocused();
  return focused ? (
    <ReelVideo tap={tap} source={uri} autoPlay={false} contentFit="contain" />
  ) : null;
}

function useGallerySource(item: PollMedia) {
  const [localUri, setLocalUri] = useState<string>();
  const [failed, setFailed] = useState(false);
  const { device, kind, value } = item;

  useEffect(() => {
    if (!device) return;
    let live = true;
    let handle: VideoHandle | undefined;
    const open = kind === "video" ? openDeviceVideo : openDevicePhoto;
    open(value)
      .then((next) => {
        if (!live) {
          next.release?.();
          return;
        }
        handle = next;
        setLocalUri(next.uri);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
      handle?.release?.();
    };
  }, [device, kind, value]);

  return { uri: device ? localUri : value, failed, setFailed };
}

export function GalleryMedia({
  item,
  label,
  fit = "contain",
  tap,
}: {
  tap?: VideoTap;
  item: PollMedia;
  label: string;
  fit?: "cover" | "contain";
}) {
  const { type } = useTheme();
  const styles = useStyles();

  const { uri, failed, setFailed } = useGallerySource(item);
  if (failed || !uri) {
    return (
      <View style={styles.center}>
        <Text style={type.small}>
          {failed ? "Media unavailable" : "Loading media…"}
        </Text>
      </View>
    );
  }
  return item.kind === "video" ? (
    <GalleryVideo uri={uri} tap={tap} />
  ) : (
    <CachedImage
      source={{ uri }}
      accessibilityLabel={label}
      style={styles.image}
      contentFit={fit}
      cachePolicy="disk"
      onError={() => setFailed(true)}
    />
  );
}

export function FullPhotoButton({
  item,
  label,
}: {
  item: PollMedia;
  label: string;
}) {
  const styles = useStyles();

  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View full-size photo"
        style={styles.expand}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.expandText}>Full size</Text>
      </Pressable>
      {open && (
        <FullPhotoViewer
          item={item}
          label={label}
          close={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FullPhotoViewer({
  item,
  label,
  close,
}: {
  item: PollMedia;
  label: string;
  close: () => void;
}) {
  const styles = useStyles();

  const { uri, failed, setFailed } = useGallerySource(item);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  }>();
  const [zoom, setZoom] = useState(false);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pixelRatio = PixelRatio.get();
  useEffect(() => {
    if (!uri) return;
    let active = true;
    Image.getSize(
      uri,
      (imageWidth, imageHeight) => {
        if (active && imageWidth > 0 && imageHeight > 0)
          setDimensions({ width: imageWidth, height: imageHeight });
      },
      () => {
        /* The image itself displays its load error. */
      },
    );
    return () => {
      active = false;
    };
  }, [uri]);
  const actualSize = dimensions
    ? {
        width: dimensions.width / pixelRatio,
        height: dimensions.height / pixelRatio,
      }
    : {};
  const image = uri ? (
    <Image
      source={{ uri }}
      accessibilityLabel={label}
      style={zoom ? actualSize : styles.image}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  ) : null;

  return (
    <Modal visible animationType="fade" onRequestClose={close}>
      <StatusBar style="light" />
      <View
        style={[
          styles.viewer,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
        accessibilityViewIsModal
      >
        <View style={styles.viewerHeader}>
          <View style={styles.viewerTitle}>
            <Text style={styles.viewerHeading}>Full-size photo</Text>
            {dimensions && (
              <Text style={styles.viewerInfo}>
                {dimensions.width} × {dimensions.height} px
              </Text>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={!dimensions}
            accessibilityState={{ disabled: !dimensions, selected: zoom }}
            style={[styles.viewerButton, !dimensions && styles.disabled]}
            onPress={() => setZoom((value) => !value)}
          >
            <Text style={styles.expandText}>
              {zoom ? "Fit to screen" : "Actual size"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.viewerButton}
            onPress={close}
          >
            <Text style={styles.expandText}>Close</Text>
          </Pressable>
        </View>
        {failed || !uri ? (
          <View style={styles.viewerEmpty}>
            <Text style={styles.viewerInfo}>
              {failed ? "Photo unavailable" : "Loading photo…"}
            </Text>
          </View>
        ) : zoom ? (
          <ScrollView nestedScrollEnabled>
            <ScrollView
              horizontal
              nestedScrollEnabled
              contentContainerStyle={{
                minWidth: width,
                justifyContent: "center",
              }}
            >
              {image}
            </ScrollView>
          </ScrollView>
        ) : (
          <View style={styles.viewerEmpty}>{image}</View>
        )}
      </View>
    </Modal>
  );
}

export function ProductImageLink({ url }: { url?: string }) {
  const styles = useStyles();

  const href = url ? parseProductUrl(url) : null;
  if (!href) return null;
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      accessibilityLabel="View product"
      style={styles.link}
    >
      View product ↗
    </Link>
  );
}

const useStyles = themedStyles(({ colors, glossy }) =>
  StyleSheet.create({
    center: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
    },
    image: { width: "100%", height: "100%" },
    expand: {
      position: "absolute",
      top: 10,
      right: 10,
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 10,
      justifyContent: "center",
      backgroundColor: "#151515E8",
    },
    expandText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    viewer: { flex: 1, backgroundColor: glossy ? colors.bg : "#000000" },
    viewerHeader: {
      minHeight: 66,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    viewerTitle: { flex: 1, gap: 2 },
    viewerHeading: { color: "#fff", fontSize: 16, fontWeight: "800" },
    viewerInfo: { color: "#D4D4D4", fontSize: 12 },
    viewerButton: {
      minHeight: 44,
      paddingHorizontal: 10,
      justifyContent: "center",
      borderRadius: 9,
      backgroundColor: glossy?.navigation ?? "#262626",
    },
    viewerEmpty: { flex: 1, alignItems: "center", justifyContent: "center" },
    disabled: { opacity: 0.5 },
    link: {
      position: "absolute",
      right: 10,
      bottom: 10,
      minHeight: 44,
      paddingHorizontal: 12,
      lineHeight: 44,
      backgroundColor: colors.strong,
      borderRadius: 11,
      overflow: "hidden",
      color: colors.onStrong,
      fontSize: 13,
      fontWeight: "800",
      textDecorationLine: "none",
    },
  }),
);
