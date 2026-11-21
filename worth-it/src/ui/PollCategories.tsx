import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { POLL_CATEGORIES, PollCategory } from "../lib/types";
import { themedStyles, useTheme } from "./theme";

export function PollCategories({
  value,
  onChange,
  disabled,
  emptyLabel = "Any category",
}: {
  value?: PollCategory;
  onChange: (value?: PollCategory) => void;
  disabled?: boolean;
  emptyLabel?: string;
}) {
  const { type } = useTheme();
  const styles = useStyles();

  const options = [
    [undefined, emptyLabel],
    ...Object.entries(POLL_CATEGORIES),
  ] as [PollCategory | undefined, string][];
  return (
    <View style={styles.group}>
      <Text style={type.h2}>Category</Text>
      <View style={styles.options}>
        {options.map(([key, label]) => {
          const selected = key === value;
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(key)}
              style={[styles.option, selected && styles.selected]}
            >
              <Text style={[styles.text, selected && styles.selectedText]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    group: { gap: 8 },
    options: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    option: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      paddingHorizontal: 12,
      minHeight: 38,
      justifyContent: "center",
    },
    selected: {
      backgroundColor: colors.accentSoft,
      borderColor: colors.accent,
    },
    text: { color: colors.muted, fontSize: 13, fontWeight: "700" },
    selectedText: { color: colors.accentInk },
  }),
);
