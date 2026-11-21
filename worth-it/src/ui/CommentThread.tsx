import React, { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ThreadKind } from "../lib/comments";
import { CommentsSection } from "./CommentsSection";
import { ConversationPanel } from "./ConversationPanel";
import { SocialIcon } from "./SocialIcon";
import { themedStyles, useTheme } from "./theme";

export function CommentThread({
  kind,
  id,
  label,
  initialOpen = false,
  onOpenChange,
}: {
  kind: ThreadKind;
  id: string;
  label: string;
  initialOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { colors, type } = useTheme();
  const styles = useStyles();

  const [open, setOpen] = useState(initialOpen);
  useFocusEffect(
    useCallback(
      () => () => {
        setOpen(false);
        onOpenChange?.(false);
      },
      [onOpenChange],
    ),
  );
  const close = () => {
    setOpen(false);
    onOpenChange?.(false);
  };
  return (
    <View style={styles.thread}>
      <Pressable
        testID={"comments-toggle-" + kind + "-" + id}
        accessibilityRole="button"
        accessibilityLabel={"Show comments for " + label}
        accessibilityState={{ expanded: open }}
        style={styles.toggle}
        onPress={() => {
          setOpen(true);
          onOpenChange?.(true);
        }}
      >
        <SocialIcon name="message" color={colors.accentInk} />
        <Text style={[type.small, styles.label]}>Comments</Text>
      </Pressable>
      {open && (
        <ConversationPanel onClose={close}>
          <CommentsSection
            key={kind + ":" + id}
            kind={kind}
            id={id}
            panel
            onClose={close}
          />
        </ConversationPanel>
      )}
    </View>
  );
}
const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    thread: { borderTopWidth: 1, borderColor: colors.border },
    toggle: {
      minHeight: 48,
      paddingHorizontal: 15,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    label: { color: colors.accentInk, fontWeight: "700" },
  }),
);
