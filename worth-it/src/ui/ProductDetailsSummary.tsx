import React from "react";
import { Text, View } from "react-native";
import type { ProductDetails } from "../lib/productDetails";
import { useTheme } from "./theme";
export function ProductDetailsSummary({ value }: { value?: ProductDetails }) {
  const { type } = useTheme();
  if (!value) return null;
  return (
    <View style={{ gap: 6 }}>
      {value.brand ? (
        <Text style={type.small}>Brand: {value.brand}</Text>
      ) : null}
      {value.category ? (
        <Text style={type.small}>Category: {value.category}</Text>
      ) : null}
      {value.description ? (
        <Text style={type.body}>{value.description}</Text>
      ) : null}
      {value.price !== undefined ? (
        <Text style={type.small}>
          Store price: {value.price.toLocaleString("en-IN")}{" "}
          {value.currency ?? "(currency not provided)"}
        </Text>
      ) : null}
    </View>
  );
}
