import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatInr } from "../lib/format";
import { repo } from "../lib/repo";
import type { ProductHistoryEntry } from "../lib/types";
import { themedStyles, useTheme } from "./theme";

export function ProductHistory({
  productUrl,
  current,
  showEmpty = false,
}: {
  productUrl: string;
  current?: string;
  showEmpty?: boolean;
}) {
  const { type } = useTheme();
  const styles = useStyles();

  const [entries, setEntries] = useState<ProductHistoryEntry[] | null>(null);
  const [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setEntries(null);
      setError("");
      void repo
        .listProductHistory(productUrl, current)
        .then((rows) => {
          if (active) setEntries(rows);
        })
        .catch((reason) => {
          if (active && showEmpty)
            setError(
              reason instanceof Error
                ? reason.message
                : "Could not load product history.",
            );
        });
      return () => {
        active = false;
      };
    }, [productUrl, current, showEmpty]),
  );

  if (!showEmpty && !entries?.length) return null;
  return (
    <View style={styles.card}>
      <Text style={type.h2}>Product history</Text>
      <Text style={type.small}>
        Earlier polls with the same store link. Prices are reported by shoppers.
      </Text>
      {error ? (
        <Text style={type.small}>{error}</Text>
      ) : entries === null ? (
        <Text style={type.small}>Looking for earlier polls…</Text>
      ) : entries.length === 0 ? (
        <Text style={type.small}>No earlier polls match this link.</Text>
      ) : (
        entries.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="link"
            style={styles.entry}
            onPress={() =>
              router.push({ pathname: "/p/[id]", params: { id: entry.id } })
            }
          >
            <Text style={type.body}>{entry.itemName}</Text>
            <Text style={type.small}>
              {entry.pricePaidInr !== null
                ? (entry.status === "returned"
                    ? "Returned · paid "
                    : "Reported paid ") + formatInr(entry.pricePaidInr)
                : "Asked at " + formatInr(entry.priceInr)}
              {" · "}
              {new Date(
                entry.purchasedAt ?? entry.createdAt,
              ).toLocaleDateString("en-IN")}
            </Text>
          </Pressable>
        ))
      )}
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 15,
      padding: 14,
      gap: 9,
    },
    entry: {
      minHeight: 45,
      borderTopWidth: 1,
      borderColor: colors.border,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 2,
    },
  }),
);
