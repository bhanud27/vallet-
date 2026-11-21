import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useTheme } from "./theme";
export function FollowCounts({
  followers,
  following,
  userId,
}: {
  followers: number;
  following: number;
  userId?: string;
}) {
  const { type } = useTheme();
  return (
    <View style={styles.counts}>
      {(["followers", "following"] as const).map((kind) => (
        <Pressable
          key={kind}
          accessibilityRole="button"
          accessibilityLabel={`View ${kind}`}
          disabled={!userId}
          onPress={() =>
            router.push({
              pathname: "/connections",
              params: { id: userId, kind },
            })
          }
          style={styles.count}
        >
          <Text style={[type.body, styles.number]}>
            {kind === "followers" ? followers : following}
          </Text>
          <Text style={type.small}>{kind}</Text>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  counts: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-evenly",
    gap: 8,
  },
  count: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 1,
  },
  number: { fontWeight: "800" },
});
