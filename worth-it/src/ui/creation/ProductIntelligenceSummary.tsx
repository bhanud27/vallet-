import React, { useState } from "react";
import { Linking, Text, View } from "react-native";
import type { ProductIntelligence } from "../../lib/productPreview";
import { Button } from "../kit";
import { useTheme } from "../theme";
export function ProductIntelligenceSummary({
  value,
  manual,
  comparison = false,
}: {
  value: ProductIntelligence;
  manual: string[];
  comparison?: boolean;
}) {
  const { type } = useTheme(),
    [expanded, setExpanded] = useState(false);
  const p = value.product,
    price = p.price;
  const store =
    value.source.retailer === "other" ? "Store" : value.source.retailer;
  return (
    <View style={{ gap: 8 }}>
      <Text style={type.small}>
        {store} ·{" "}
        {value.extraction.cache === "stale"
          ? "Saved details — verify on store"
          : "Extracted from store — verify before buying"}
      </Text>
      {!manual.includes("price") && price.original != null ? (
        <Text style={type.small}>
          Original {price.currency || ""} {price.original.toLocaleString()}
          {price.discount_percentage != null
            ? ` · ${price.discount_percentage}% off`
            : ""}
        </Text>
      ) : null}
      {manual.length ? (
        <Text style={type.small}>
          Your edits are kept. Store facts below describe the imported version.
        </Text>
      ) : null}
      {comparison && p.retailer_rating ? (
        <Text style={type.small}>
          Store rating {p.retailer_rating.value}/{p.retailer_rating.best}
        </Text>
      ) : null}
      {comparison
        ? Object.entries(p.specifications || {})
            .slice(0, 3)
            .map(([k, v]) => (
              <Text key={k} style={type.small}>
                {k}: {v}
              </Text>
            ))
        : null}
      <Button
        variant="quiet"
        label={expanded ? "Hide store facts" : "View store facts"}
        onPress={() => setExpanded(!expanded)}
      />
      {expanded ? (
        <View style={{ gap: 6 }}>
          {p.retailer_rating ? (
            <Text style={type.small}>
              Store rating {p.retailer_rating.value}/{p.retailer_rating.best}
              {p.retailer_rating.rating_count != null
                ? ` · ${p.retailer_rating.rating_count} ratings`
                : ""}
            </Text>
          ) : null}
          <Text style={type.small}>
            Availability: {p.availability.replace(/_/g, " ")}
          </Text>
          {Object.entries(p.specifications || {})
            .slice(0, 12)
            .map(([key, v]) => (
              <Text key={key} style={type.small}>
                {key}: {v}
              </Text>
            ))}
          {p.variants?.slice(0, 12).map((v, i) => (
            <Text key={v.id || i} style={type.small}>
              {Object.values(v.attributes).join(" · ") || v.id}
              {v.price != null
                ? ` · ${v.currency || "(currency unknown)"} ${v.price}`
                : ""}{" "}
              · {v.availability.replace(/_/g, " ")}
            </Text>
          ))}
          <Text style={type.small}>
            {p.images.filter((i) => i.status === "validated").length} verified
            photos · {p.images.filter((i) => i.status === "failed").length}{" "}
            unavailable photos
          </Text>
          <Text style={type.small}>
            Store facts checked{" "}
            {new Date(value.extraction.extracted_at).toLocaleString()}. Ratings
            belong to the retailer.
          </Text>
        </View>
      ) : null}
      <Button
        variant="quiet"
        label="View original product"
        onPress={() => {
          const url = value.source.original_url;
          if (/^https:\/\//i.test(url))
            void Linking.openURL(url).catch(() => {});
        }}
      />
    </View>
  );
}
