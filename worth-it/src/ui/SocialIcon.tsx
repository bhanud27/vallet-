import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "./theme";

export type SocialIconName =
  | "home"
  | "add"
  | "checks"
  | "settings"
  | "feed"
  | "reels"
  | "plus"
  | "person"
  | "message"
  | "arrow"
  | "photo"
  | "search"
  | "bell"
  | "grid"
  | "list"
  | "heart"
  | "bars"
  | "compare"
  | "pencil"
  | "compose"
  | "link"
  | "back"
  | "close";

export function SocialIcon({
  name,
  color: customColor,
  size = 24,
}: {
  name: SocialIconName;
  color?: string;
  size?: number;
}) {
  const { colors } = useTheme();

  const color = customColor ?? colors.ink;
  const stroke = { borderColor: color };
  const fill = { backgroundColor: color };

  return (
    <View
      style={[
        styles.icon,
        size !== 24 && { transform: [{ scale: size / 24 }] },
      ]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {name === "bars" && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 3,
            height: 20,
          }}
        >
          {[8, 14, 20].map((height) => (
            <View
              key={height}
              style={[{ width: 4, height, borderRadius: 1 }, fill]}
            />
          ))}
        </View>
      )}
      {name === "heart" && (
        <Text style={{ color, fontSize: 26, lineHeight: 26 }}>{"\u2661"}</Text>
      )}
      {name === "compare" && (
        <Text style={{ color, fontSize: 24, lineHeight: 26 }}>{"\u21c4"}</Text>
      )}
      {name === "back" && (
        <View
          style={[
            {
              width: 11,
              height: 11,
              borderLeftWidth: 2,
              borderBottomWidth: 2,
              transform: [{ rotate: "45deg" }],
            },
            stroke,
          ]}
        />
      )}
      {name === "close" && (
        <>
          <View
            style={[
              styles.horizontal,
              fill,
              { transform: [{ rotate: "45deg" }] },
            ]}
          />
          <View
            style={[
              styles.horizontal,
              fill,
              { transform: [{ rotate: "-45deg" }] },
            ]}
          />
        </>
      )}
      {name === "link" && (
        <View
          style={{ flexDirection: "row", transform: [{ rotate: "-42deg" }] }}
        >
          {[0, 1].map((part) => (
            <View
              key={part}
              style={[
                {
                  width: 12,
                  height: 8,
                  borderRadius: 4,
                  borderWidth: 2,
                  marginLeft: part ? -3 : 0,
                },
                stroke,
              ]}
            />
          ))}
        </View>
      )}
      {(name === "pencil" || name === "compose") && (
        <>
          {name === "compose" ? (
            <View
              style={[
                {
                  position: "absolute",
                  bottom: 2,
                  left: 2,
                  width: 16,
                  height: 16,
                  borderWidth: 2,
                  borderRadius: 3,
                },
                stroke,
              ]}
            />
          ) : null}
          <View
            style={[
              {
                width: 4,
                height: 15,
                borderWidth: 1.5,
                borderRadius: 1,
                transform: [
                  { translateX: name === "compose" ? 4 : 0 },
                  { translateY: name === "compose" ? -4 : 0 },
                  { rotate: "42deg" },
                ],
              },
              stroke,
            ]}
          />
        </>
      )}
      {name === "home" && (
        <>
          <View
            style={{
              position: "absolute",
              top: 4,
              width: 15,
              height: 15,
              borderLeftWidth: 2,
              borderTopWidth: 2,
              borderColor: color,
              borderTopLeftRadius: 3,
              transform: [{ rotate: "45deg" }],
            }}
          />
          <View
            style={{
              position: "absolute",
              top: 11,
              width: 21,
              height: 12,
              borderLeftWidth: 2,
              borderRightWidth: 2,
              borderBottomWidth: 2,
              borderColor: color,
              borderBottomLeftRadius: 4,
              borderBottomRightRadius: 4,
            }}
          />
        </>
      )}
      {name === "add" && (
        <View
          style={{
            width: 23,
            height: 23,
            borderRadius: 7,
            borderWidth: 2,
            borderColor: color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View style={[styles.horizontal, fill]} />
          <View style={[styles.vertical, fill]} />
        </View>
      )}
      {name === "checks" && (
        <View
          style={{
            width: 24,
            height: 21,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View style={[styles.play, { borderLeftColor: color }]} />
        </View>
      )}
      {name === "settings" && (
        <>
          <View
            style={{
              width: 17,
              height: 17,
              borderRadius: 9,
              borderWidth: 1.7,
              borderColor: color,
            }}
          />
          <View
            style={{
              position: "absolute",
              width: 6,
              height: 6,
              borderRadius: 3,
              borderWidth: 1.5,
              borderColor: color,
            }}
          />
          {Array.from({ length: 8 }, (_, i) => (
            <View
              key={i}
              style={{
                position: "absolute",
                width: 3,
                height: 4,
                backgroundColor: color,
                transform: [{ rotate: i * 45 + "deg" }, { translateY: -10 }],
              }}
            />
          ))}
        </>
      )}
      {name === "grid" && (
        <View style={styles.grid}>
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={[styles.gridCell, fill]} />
          ))}
        </View>
      )}
      {name === "list" && (
        <View style={styles.listIcon}>
          {[0, 1, 2].map((index) => (
            <View key={index} style={[styles.listLine, fill]} />
          ))}
        </View>
      )}
      {name === "feed" && (
        <View style={[styles.feed, stroke]}>
          <View style={[styles.feedLine, fill]} />
          <View style={[styles.feedLine, fill]} />
        </View>
      )}
      {name === "plus" && (
        <>
          <View style={[styles.horizontal, fill]} />
          <View style={[styles.vertical, fill]} />
        </>
      )}
      {name === "reels" && (
        <View style={[styles.reel, stroke]}>
          <View style={[styles.play, { borderLeftColor: color }]} />
        </View>
      )}
      {name === "person" && (
        <>
          <View style={[styles.head, stroke]} />
          <View style={[styles.shoulders, stroke]} />
        </>
      )}
      {name === "search" && (
        <>
          <View style={[styles.lens, stroke]} />
          <View style={[styles.handle, fill]} />
        </>
      )}
      {name === "bell" && (
        <>
          <View style={[styles.bell, stroke]} />
          <View style={[styles.clapper, fill]} />
        </>
      )}
      {name === "message" && (
        <>
          <View style={[styles.bubble, stroke]} />
          <View style={[styles.tail, stroke]} />
        </>
      )}
      {name === "arrow" && <View style={[styles.arrow, stroke]} />}
      {name === "photo" && (
        <View style={[styles.photo, stroke]}>
          <View style={[styles.sun, fill]} />
          <View style={[styles.mountain, stroke]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: 18,
    height: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  gridCell: { width: 7, height: 7, borderRadius: 1 },
  listIcon: { width: 18, gap: 4 },
  listLine: { width: 18, height: 2, borderRadius: 1 },
  icon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  feed: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderRadius: 5,
    padding: 3,
    gap: 3,
  },
  feedLine: { height: 2, width: "100%", borderRadius: 1 },
  reel: {
    width: 17,
    height: 20,
    borderWidth: 2,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  play: {
    marginLeft: 1,
    borderLeftWidth: 6,
    borderTopWidth: 4,
    borderBottomWidth: 4,
    borderTopColor: "transparent",
    borderBottomColor: "transparent",
  },
  horizontal: { position: "absolute", width: 15, height: 2, borderRadius: 1 },
  vertical: { position: "absolute", width: 2, height: 15, borderRadius: 1 },
  head: {
    position: "absolute",
    top: 3,
    width: 8,
    height: 8,
    borderWidth: 2,
    borderRadius: 4,
  },
  lens: {
    position: "absolute",
    top: 3,
    left: 3,
    width: 14,
    height: 14,
    borderWidth: 2,
    borderRadius: 7,
  },
  handle: {
    position: "absolute",
    width: 8,
    height: 2,
    bottom: 5,
    right: 2,
    borderRadius: 1,
    transform: [{ rotate: "45deg" }],
  },
  bell: {
    width: 15,
    height: 15,
    marginTop: -3,
    borderWidth: 2,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  clapper: {
    position: "absolute",
    width: 5,
    height: 2,
    bottom: 2,
    borderRadius: 2,
  },
  shoulders: {
    position: "absolute",
    bottom: 3,
    width: 16,
    height: 8,
    borderWidth: 2,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  bubble: {
    position: "absolute",
    top: 3,
    width: 17,
    height: 14,
    borderWidth: 2,
    borderRadius: 5,
  },
  tail: {
    position: "absolute",
    left: 6,
    top: 14,
    width: 4,
    height: 6,
    borderLeftWidth: 2,
    transform: [{ rotate: "30deg" }],
  },
  arrow: {
    width: 8,
    height: 8,
    borderRightWidth: 2,
    borderTopWidth: 2,
    transform: [{ rotate: "45deg" }],
  },
  photo: {
    width: 19,
    height: 17,
    borderRadius: 4,
    borderWidth: 2,
    overflow: "hidden",
  },
  sun: {
    position: "absolute",
    width: 4,
    height: 4,
    borderRadius: 2,
    top: 2,
    left: 2,
  },
  mountain: {
    position: "absolute",
    width: 10,
    height: 10,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    top: 7,
    left: 5,
    transform: [{ rotate: "45deg" }],
  },
});
