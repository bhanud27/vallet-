import React, { useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { ProductIntelligenceSummary } from "./creation/ProductIntelligenceSummary";
import type { ProductIntelligence } from "../lib/productPreview";
import type { Poll } from "../lib/types";
import { PostPhoto } from "./PostPresentation";
import { GalleryMedia } from "./GalleryMedia";
import { SocialIcon } from "./SocialIcon";
import { useTheme } from "./theme";
import { ProductDetailsSummary } from "./ProductDetailsSummary";
import { PollContext } from "./PollContext";
import { PriceTag } from "./kit";
import type { ProductDetails } from "../lib/productDetails";
import { ContentTap } from "./ContentTap";
export function CreationBody({
  poll,
  preview = false,
  storeFacts,
  onOption,
  counts,
  total = 0,
  selected,
  disabled = false,
}: {
  poll: Poll;
  preview?: boolean;
  storeFacts?: Record<string, { value: ProductIntelligence; manual: string[] }>;
  onOption?: (id: string) => void;
  counts?: Record<string, number>;
  total?: number;
  selected?: string | null;
  disabled?: boolean;
}) {
  const { type, colors } = useTheme();
  const spec = poll.creationSpec;
  if (!spec) return null;
  return (
    <View style={{ gap: 16 }}>
      {spec.subtype === "post" ? (
        <>
          <PostPhoto
            poll={poll}
            preview={preview}
            onOpen={preview ? undefined : () => router.push("/p/" + poll.id)}
          />
          <View style={{ paddingHorizontal: 16, gap: 6 }}>
            <PollContext poll={poll} />
            {spec.location ? (
              <Text style={type.small}>{spec.location}</Text>
            ) : null}
            <Text style={type.body}>{poll.question}</Text>
            {poll.productDetails ? (
              <ProductDetailsSummary value={poll.productDetails} />
            ) : null}
          </View>
        </>
      ) : (
        <>
          <Text style={[type.h2, { paddingHorizontal: 16, paddingTop: 6 }]}>
            {poll.question}
          </Text>
          {spec.subtype === "opinion" ? (
            <PostPhoto
              poll={poll}
              preview={preview}
              onOpen={preview ? undefined : () => router.push("/p/" + poll.id)}
            />
          ) : null}
          <View
            style={{
              paddingHorizontal: 16,
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {spec.products.map((product) => (
              <View
                key={product.id}
                style={{
                  flexGrow: 1,
                  flexBasis: spec.subtype === "compare" ? "45%" : "100%",
                  minWidth: 0,
                  gap: 7,
                }}
              >
                {spec.subtype === "compare" ? (
                  <ProductGallery
                    poll={poll}
                    indexes={product.media}
                    details={product.details}
                    preview={preview}
                  />
                ) : null}
                <Text style={[type.body, { fontWeight: "700" }]}>
                  {product.name}
                </Text>
                {product.details?.brand ? (
                  <Text style={type.small}>{product.details.brand}</Text>
                ) : null}
                {product.details?.price ? (
                  <Text style={[type.body, { fontWeight: "700" }]}>
                    {product.details.currency === "INR"
                      ? "₹"
                      : product.details.currency
                        ? product.details.currency + " "
                        : ""}
                    {product.details.price.toLocaleString("en-IN")}
                    {!product.details.currency ? " · currency unknown" : ""}
                  </Text>
                ) : null}
                {storeFacts?.[product.id] ? (
                  <ProductIntelligenceSummary
                    value={storeFacts[product.id].value}
                    manual={storeFacts[product.id].manual}
                    comparison
                  />
                ) : null}
                {product.url && !storeFacts?.[product.id] ? (
                  <Pressable
                    disabled={preview}
                    accessibilityRole="link"
                    accessibilityLabel={"View product " + product.name}
                    onPress={() => {
                      void Linking.openURL(product.url!).catch(() => undefined);
                    }}
                  >
                    <Text
                      style={[
                        type.small,
                        {
                          color: colors.accentInk,
                          textDecorationLine: "underline",
                        },
                      ]}
                    >
                      View product
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
          <View style={{ paddingHorizontal: 16 }}>
            <PollContext poll={poll} />
          </View>
          {spec.description ? (
            <Text style={[type.body, { paddingHorizontal: 16 }]}>
              {spec.description}
            </Text>
          ) : null}
          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            {spec.options.map((option) => {
              const count = counts?.[option.id] ?? 0;
              const percent = total ? Math.round((count / total) * 100) : 0;
              const winner =
                total > 0 &&
                count ===
                  Math.max(...spec.options.map((o) => counts?.[o.id] ?? 0));
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="button"
                  aria-disabled={preview || disabled}
                  aria-pressed={selected === option.id}
                  accessibilityLabel={option.label}
                  accessibilityState={{
                    selected: selected === option.id,
                    disabled: preview || disabled,
                  }}
                  disabled={preview || disabled}
                  onPress={() =>
                    onOption
                      ? onOption(option.id)
                      : router.push({
                          pathname: "/p/[id]",
                          params: { id: poll.id, option: option.id },
                        })
                  }
                  style={{
                    minHeight: 48,
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor:
                      selected === option.id ? colors.accentInk : colors.border,
                    backgroundColor:
                      selected === option.id
                        ? colors.accentSoft
                        : colors.surface,
                    overflow: "hidden",
                  }}
                >
                  {counts ? (
                    <View
                      style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: percent + "%",
                        backgroundColor: colors.accentSoft,
                      }}
                    />
                  ) : null}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text style={[type.body, { flex: 1, fontWeight: "600" }]}>
                      {option.label}
                    </Text>
                    {counts ? (
                      <Text style={type.small}>
                        {percent}%
                        {winner && spec.subtype === "compare"
                          ? " · Leading"
                          : ""}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
            {counts ? (
              <Text style={type.small}>
                {total} {total === 1 ? "vote" : "votes"}
              </Text>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}
function ProductGallery({
  poll,
  details,
  indexes,
  preview,
}: {
  poll: Poll;
  details?: ProductDetails;
  indexes: number[];
  preview: boolean;
}) {
  const { colors, type } = useTheme();
  const [width, setWidth] = useState(0);
  const items = indexes.map((i) => poll.media?.[i]).filter(Boolean);
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{
        aspectRatio: 1,
        backgroundColor: colors.media,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      {items.length && width ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
        >
          {items.map((item, index) => (
            <View key={index} style={{ width, height: width }}>
              {preview || item!.kind === "video" ? (
                <GalleryMedia
                  item={item!}
                  label={"Product photo " + (index + 1)}
                  tap={
                    preview
                      ? undefined
                      : {
                          kind: "poll",
                          id: poll.id,
                          onOpen: () => router.push("/p/" + poll.id),
                        }
                  }
                />
              ) : (
                <ContentTap
                  kind="poll"
                  id={poll.id}
                  accessibilityLabel={"Open " + poll.itemName}
                  onOpen={() => router.push("/p/" + poll.id)}
                  style={{ flex: 1 }}
                >
                  <GalleryMedia
                    item={item!}
                    label={"Product photo " + (index + 1)}
                  />
                </ContentTap>
              )}
            </View>
          ))}
        </ScrollView>
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <SocialIcon name="photo" />
          <Text style={type.small}>No photo added</Text>
        </View>
      )}
      {details?.price && details.price > 0 ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", left: 8, bottom: 8 }}
        >
          <PriceTag
            price={details.price}
            currency={details.currency || null}
            label="Store"
            size="small"
          />
        </View>
      ) : null}
      {items.length > 1 ? (
        <Text
          style={[
            type.small,
            {
              position: "absolute",
              right: 8,
              bottom: 8,
              backgroundColor: colors.surface,
              padding: 3,
              borderRadius: 5,
            },
          ]}
        >
          {items.length} photos
        </Text>
      ) : null}
    </View>
  );
}
