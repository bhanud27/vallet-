import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Member } from "../lib/community";
import { ProfileAvatar } from "./ProfileAvatar";
import { SocialIcon } from "./SocialIcon";
import { themedStyles, useTheme } from "./theme";

export function MemberRow({
  member,
  ownId,
}: {
  member: Member;
  ownId?: string;
}) {
  const { type, colors } = useTheme();
  const styles = useStyles();

  const name = member.username ? "@" + member.username : "Worth It? member";
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}'s profile`}
      onPress={() =>
        router.push(
          member.id === ownId
            ? "/profile"
            : { pathname: "/member/[id]", params: { id: member.id } },
        )
      }
      style={styles.row}
    >
      <ProfileAvatar
        name={member.username ?? ""}
        uri={member.avatar}
        size={44}
      />
      <View style={styles.identity}>
        <Text style={type.h2} numberOfLines={1}>
          {name}
        </Text>
        {member.privateAccount && (
          <Text style={type.small}>Private account</Text>
        )}
      </View>
      <SocialIcon name="arrow" color={colors.muted} />
    </Pressable>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderColor: colors.border,
      borderWidth: 1,
    },
    identity: { flex: 1, minWidth: 0 },
  }),
);
