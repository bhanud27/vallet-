import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { timeAgo } from "../lib/format";
import { getAccountPreferences } from "../lib/accountPreferences";
import { repo } from "../lib/repo";
import { supabase } from "../lib/supabase";
import { readableRpcError } from "../lib/backendRpc";
import {
  notificationData,
  markNotificationsRead,
  type SocialNotification,
} from "../lib/notificationsData";
import { Banner, Button, Screen } from "../ui/kit";
import { SocialIcon } from "../ui/SocialIcon";
import { themedStyles, useTheme } from "../ui/theme";

const messages: Record<SocialNotification["kind"], string> = {
  post_comment: " commented on your post",
  poll_vote: " voted on your poll",
  poll_star: " starred your poll",
  post_star: " starred your post",
  reel_star: " starred your Check",
  poll_mention: " mentioned you",
  reel_mention: " mentioned you",
  feature_announcement: " shared a feature announcement",
  important_update: " shared an app update",
  follow_request: " requested to follow you",
  follow: " followed you",
  poll_comment: " commented on your poll",
  reel_comment: " commented on your check",
  purchase_update: " shared a new purchase outcome",
  after_buy_reminder: " - Would you buy it again at that price?",
};
function open(item: SocialNotification) {
  if (item.kind === "feature_announcement" || item.kind === "important_update")
    return;
  if (
    [
      "poll_vote",
      "poll_star",
      "post_star",
      "poll_mention",
      "post_comment",
    ].includes(item.kind)
  )
    return router.push({ pathname: "/p/[id]", params: { id: item.target_id } });
  if (item.kind === "follow_request") return router.push("/follow-requests");
  if (item.kind === "follow")
    return router.push({
      pathname: "/member/[id]",
      params: { id: item.target_id },
    });
  if (item.kind === "purchase_update" || item.kind === "after_buy_reminder")
    return router.push({ pathname: "/p/[id]", params: { id: item.target_id } });
  return item.kind === "poll_comment"
    ? router.push({
        pathname: "/p/[id]",
        params: { id: item.target_id, comments: "1" },
      })
    : router.push({
        pathname: "/reels",
        params: { reel: item.target_id, comments: "1" },
      });
}
export default function NotificationsScreen() {
  const { type, colors } = useTheme();
  const styles = useStyles();

  const [items, setItems] = useState<SocialNotification[] | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [readAvailable, setReadAvailable] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [marking, setMarking] = useState(false);
  const load = useCallback(async (active: () => boolean, refresh = false) => {
    if (refresh) setRefreshing(true);
    try {
      if (!supabase) {
        const local = await repo.demoTools?.decisionNotifications();
        const viewer = await repo.getSession();
        const preferences = await getAccountPreferences(viewer.userId);
        const allowed = (local ?? []).filter(
          (item) =>
            preferences.value.notification_types[
              item.kind === "purchase_update"
                ? "poll_results"
                : "relevant_activity"
            ] !== false,
        );
        if (active()) {
          setItems(allowed);
          setError("");
        }
        return;
      }
      const result = await notificationData(supabase);
      if (active()) {
        setItems(result.items);
        setReadAt(result.readAt);
        setReadAvailable(result.readAvailable);
        setWarning(result.warning);
        setError("");
      }
    } catch (reason) {
      if (active())
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not load notifications. Please try again.",
        );
    } finally {
      if (active()) setRefreshing(false);
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );
  return (
    <Screen
      refreshing={refreshing}
      onRefresh={() => {
        void load(() => true, true);
      }}
    >
      {readAvailable && (
        <Button
          label="Mark all as read"
          variant="secondary"
          loading={marking}
          onPress={async () => {
            if (!supabase || marking) return;
            setMarking(true);
            try {
              const result = await markNotificationsRead(supabase);
              if (result.available) {
                setReadAt(result.data);
                setWarning("");
              } else {
                setReadAvailable(false);
                setWarning(
                  "Read status is temporarily unavailable. You can still view your notifications.",
                );
              }
            } catch (error) {
              setWarning(
                readableRpcError(
                  error,
                  "Could not mark notifications as read. Please try again.",
                ),
              );
            } finally {
              setMarking(false);
            }
          }}
        />
      )}
      {error ? <Banner kind="error">{error}</Banner> : null}
      {warning ? <Banner kind="info">{warning}</Banner> : null}
      {!error && items === null ? (
        <Text style={type.small}>Loading notifications...</Text>
      ) : null}
      {!error && items?.length === 0 && (
        <Text style={type.body}>No notifications yet.</Text>
      )}
      {items?.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="link"
          onPress={() => open(item)}
          style={styles.item}
        >
          <SocialIcon
            name={item.kind.endsWith("_comment") ? "message" : "person"}
            color={colors.accentInk}
          />
          <View style={styles.content}>
            <Text style={type.body}>
              {readAvailable &&
                (!readAt ||
                  Date.parse(item.created_at) > Date.parse(readAt)) && (
                  <Text style={styles.username}>New - </Text>
                )}
              <Text style={styles.username}>{item.username}</Text>
              {messages[item.kind]}
            </Text>
            {item.detail ? (
              <Text
                style={type.small}
                numberOfLines={
                  item.kind === "feature_announcement" ||
                  item.kind === "important_update"
                    ? undefined
                    : 2
                }
              >
                {item.detail}
              </Text>
            ) : null}
            <Text style={type.small}>{timeAgo(item.created_at)}</Text>
          </View>
        </Pressable>
      ))}
    </Screen>
  );
}
const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      borderColor: colors.border,
      borderWidth: 1,
      backgroundColor: colors.surface,
      borderRadius: 15,
    },
    content: { flex: 1, gap: 2 },
    username: { fontWeight: "800" },
  }),
);
