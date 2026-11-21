import React, { useState, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { themedStyles } from "./theme";

export function StarButton({
  starred,
  count,
  subject,
  onToggle,
  dark = false,
  disabled = false,
}: {
  starred: boolean;
  count: number;
  subject: "poll" | "reel" | "post";
  onToggle: (starred: boolean) => Promise<void>;
  dark?: boolean;
  disabled?: boolean;
}) {
  const styles = useStyles();

  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const selected = pending && optimistic !== null ? optimistic : starred;
  const shownCount =
    count +
    (pending && optimistic !== null && optimistic !== starred
      ? optimistic
        ? 1
        : -1
      : 0);
  const label = `${starred ? "Unstar" : "Star"} ${subject === "reel" ? "check" : subject}`;
  const pendingRef = useRef(false);

  async function toggle() {
    if (pendingRef.current || disabled) return;
    pendingRef.current = true;
    setOptimistic(!starred);
    setError(false);
    setPending(true);
    try {
      await onToggle(!starred);
    } catch {
      setError(true);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={`${count} ${count === 1 ? "star" : "stars"}`}
        accessibilityState={{
          selected,
          busy: pending,
          disabled: disabled || pending,
        }}
        aria-pressed={selected}
        disabled={disabled || pending}
        onPress={toggle}
        style={({ pressed }) => [
          styles.button,
          dark ? styles.dark : styles.light,
          !dark && selected && styles.selected,
          (pressed || pending) && styles.fade,
        ]}
      >
        <Text
          style={[
            styles.symbol,
            dark && styles.white,
            dark && selected && styles.lime,
          ]}
        >
          {selected ? "★" : "☆"}
        </Text>
        <Text style={[styles.count, dark && styles.white]}>
          {Math.max(0, shownCount)}
        </Text>
      </Pressable>
      {error && (
        <Text
          accessibilityRole="alert"
          style={[styles.error, dark && styles.darkError]}
        >
          Couldn’t save star
        </Text>
      )}
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    group: { alignSelf: "flex-end", alignItems: "center", gap: 3 },
    button: {
      minWidth: 48,
      minHeight: 44,
      paddingHorizontal: 9,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    light: { flexDirection: "row", backgroundColor: colors.surface },
    dark: { minHeight: 60, backgroundColor: "#151515E6", gap: 0 },
    selected: { backgroundColor: colors.accentSoft },
    symbol: { color: colors.accentInk, fontSize: 23, lineHeight: 26 },
    count: { color: colors.ink, fontSize: 13, fontWeight: "700" },
    white: { color: "#fff" },
    lime: { color: colors.tag },
    fade: { opacity: 0.65 },
    error: { color: colors.danger, fontSize: 11 },
    darkError: {
      color: "#fff",
      backgroundColor: "#151515E6",
      padding: 4,
      borderRadius: 4,
    },
  }),
);
