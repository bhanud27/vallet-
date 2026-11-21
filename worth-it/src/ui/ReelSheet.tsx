import { SaveCheckButton } from "./settings/SaveCheckButton";
import { router } from "expo-router";
import { useApp } from "./AppContext";
import React, { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Reel } from "../lib/socialRepo";
import { parseProductUrl } from "../lib/validation";
import { CommentsSection } from "./CommentsSection";
import { ConversationPanel } from "./ConversationPanel";
import { ReportButton } from "./ReportButton";
import { Banner, Button } from "./kit";
import { themedStyles, useTheme } from "./theme";
export type ReelPanel = { kind: "comments" | "details"; reel: Reel };
export function ReelSheet({
  panel,
  onClose,
}: {
  panel: ReelPanel | null;
  onClose: () => void;
}) {
  const { session } = useApp();
  const { type } = useTheme();
  const styles = useStyles();

  const [error, setError] = useState("");
  if (!panel) return null;
  const product = panel.reel.productUrl
    ? parseProductUrl(panel.reel.productUrl)
    : null;
  return (
    <ConversationPanel
      onClose={onClose}
      testID="reel-sheet"
      label={panel.kind === "comments" ? "comments" : "check details"}
    >
      {panel.kind === "comments" ? (
        <CommentsSection
          key={panel.reel.id}
          kind="reel"
          id={panel.reel.id}
          panel
          onClose={onClose}
        />
      ) : (
        <>
          <View style={styles.header}>
            <Text style={type.h2} accessibilityRole="header">
              Check details
            </Text>
            <Pressable
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel="Close check details"
              onPress={onClose}
            >
              <Text style={styles.closeIcon}>{"\u00D7"}</Text>
            </Pressable>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
          >
            <Text style={type.body}>{panel.reel.caption || "No caption."}</Text>
            {panel.reel.media.kind === "demo" && (
              <Banner kind="demo">
                Fictional sample product, price and video.
              </Banner>
            )}
            <SaveCheckButton key={panel.reel.id} reel={panel.reel} />
            {product && (
              <Button
                label="Open product website"
                variant="secondary"
                onPress={() => {
                  void Linking.openURL(product).catch(() =>
                    setError("Could not open the product link."),
                  );
                }}
              />
            )}
            {error ? <Banner kind="error">{error}</Banner> : null}
            {panel.reel.authorId === session.userId &&
              panel.reel.media.kind !== "demo" && (
                <Button
                  label="Manage check"
                  variant="secondary"
                  onPress={() => {
                    const id = panel.reel.id;
                    onClose();
                    router.push({
                      pathname: "/manage-post",
                      params: { kind: "reel", id },
                    });
                  }}
                />
              )}
            {panel.reel.media.kind !== "demo" && (
              <ReportButton kind="reel" id={panel.reel.id} />
            )}
          </ScrollView>
        </>
      )}
    </ConversationPanel>
  );
}
const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingLeft: 18,
      paddingRight: 10,
      minHeight: 52,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    close: {
      width: 44,
      height: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    closeIcon: { color: colors.ink, fontSize: 28 },
    content: { padding: 18, paddingBottom: 30, gap: 16 },
  }),
);
