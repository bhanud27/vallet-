import React, { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Text, View, useWindowDimensions } from "react-native";
import {
  activity,
  deleteOwnComment,
  saveCheck,
  type ActivityEntry,
  type ActivitySection,
} from "../../lib/activity";
import { savedPolls } from "../../lib/engagement";
import { useApp } from "../AppContext";
import { useTheme } from "../theme";
import { SocialIcon } from "../SocialIcon";
import { Banner, Button } from "../kit";
export function ActivitySettings({ section }: { section: ActivitySection }) {
  const { session } = useApp(),
    { type, colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [availableWidth, setAvailableWidth] = useState(0);
  const grid = section !== "saved";
  const columns = (availableWidth || screenWidth - 32) >= 540 ? 3 : 2;
  const tileWidth = Math.max(
    0,
    ((availableWidth || Math.min(screenWidth - 32, 568)) - (columns - 1) * 12) /
      columns,
  );
  const [rows, setRows] = useState<ActivityEntry[]>([]),
    [ready, setReady] = useState(false),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState("");
  const load = useCallback(
    async (before?: ActivityEntry) => {
      setBusy(true);
      setError("");
      try {
        const next = await activity(session.userId, section, before);
        setRows((old) =>
          before
            ? [
                ...old,
                ...next.filter(
                  (row) => !old.some((v) => v.entry_id === row.entry_id),
                ),
              ]
            : next,
        );
        setMore(next.length === 30);
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load activity.");
      } finally {
        setBusy(false);
      }
    },
    [session.userId, section],
  );
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return (
    <>
      {error ? (
        <>
          <Banner kind="error">{error}</Banner>
          <Button
            label="Try again"
            onPress={() => {
              void load();
            }}
          />
        </>
      ) : null}
      {!ready && !error ? (
        <Text style={type.small}>Loading activity...</Text>
      ) : null}
      {ready && rows.length === 0 ? (
        <Text style={type.body}>
          Nothing here yet. Your activity will appear as you use Worth It.
        </Text>
      ) : null}
      {section === "stars" ? (
        <Text style={type.small}>
          Older Stars may use the original content date because their Star time
          was not recorded.
        </Text>
      ) : null}
      <View
        testID="activity-grid"
        onLayout={(e) => setAvailableWidth(e.nativeEvent.layout.width)}
        style={{
          flexDirection: grid ? "row" : "column",
          flexWrap: grid ? "wrap" : "nowrap",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        {rows.map((row) => (
          <View
            key={row.entry_id}
            style={{
              width: grid ? tileWidth : "100%",
              minHeight: grid ? 200 : undefined,
              backgroundColor: colors.surface,
              padding: grid ? 12 : 14,
              gap: 10,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
            }}
          >
            {grid ? (
              <View
                style={{
                  height: 56,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.media,
                  borderRadius: 10,
                }}
              >
                <SocialIcon
                  name={
                    section === "comments"
                      ? "message"
                      : row.kind === "reel"
                        ? "reels"
                        : "grid"
                  }
                  color={colors.accentInk}
                />
              </View>
            ) : null}
            <Text
              numberOfLines={grid ? 2 : undefined}
              style={grid ? [type.body, { fontWeight: "700" }] : type.h2}
            >
              {row.title || "Check"}
            </Text>
            <Text numberOfLines={grid ? 3 : undefined} style={type.small}>
              {row.entry_id.startsWith("vote:")
                ? "Participated in poll · "
                : row.entry_id.startsWith("created:")
                  ? "Created poll · "
                  : row.kind === "reel"
                    ? "Check · "
                    : "Poll / Post · "}
              {new Date(row.created_at).toLocaleDateString()}
            </Text>
            {row.body ? (
              <Text numberOfLines={grid ? 4 : undefined} style={type.body}>
                {row.body}
              </Text>
            ) : null}
            <Button
              label="Open content"
              variant="secondary"
              onPress={() =>
                row.kind === "poll"
                  ? router.push({
                      pathname: "/p/[id]",
                      params: { id: row.content_id },
                    })
                  : router.push({
                      pathname: "/reels",
                      params: { reel: row.content_id },
                    })
              }
            />
            {section === "saved" ? (
              <Button
                label="Remove from saved"
                variant="quiet"
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    if (row.kind === "poll")
                      await savedPolls(session.userId, {
                        id: row.content_id,
                        itemName: row.title,
                        value: false,
                      });
                    else
                      await saveCheck(
                        session.userId,
                        row.content_id,
                        row.title,
                        false,
                      );
                    setRows((old) =>
                      old.filter((v) => v.entry_id !== row.entry_id),
                    );
                  } catch {
                    setError("Could not remove saved content.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : null}
            {row.comment_id ? (
              <>
                <Button
                  label={
                    confirm === row.comment_id
                      ? "Cancel deletion"
                      : "Delete comment"
                  }
                  variant="quiet"
                  onPress={() =>
                    setConfirm(
                      confirm === row.comment_id ? "" : row.comment_id!,
                    )
                  }
                />
                {confirm === row.comment_id ? (
                  <Button
                    label="Confirm delete comment"
                    disabled={busy}
                    onPress={async () => {
                      setBusy(true);
                      try {
                        await deleteOwnComment(session.userId, row.comment_id!);
                        setRows((old) =>
                          old.filter((v) => v.comment_id !== row.comment_id),
                        );
                        setConfirm("");
                      } catch {
                        setError("Could not delete your comment.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                ) : null}
              </>
            ) : null}
          </View>
        ))}
      </View>
      {more ? (
        <Button
          label="Load more activity"
          loading={busy}
          onPress={() => {
            void load(rows.at(-1));
          }}
        />
      ) : null}
    </>
  );
}
