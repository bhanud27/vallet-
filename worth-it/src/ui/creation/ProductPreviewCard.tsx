import React, { useEffect, useState } from "react";
import {
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import type { CreationMedia, ProductDraft } from "../../lib/creationDraft";
import { formatProductPrice } from "../../lib/productPrice";
import { canonicalPollProductUrl } from "../../lib/validation";
import { SocialIcon } from "../SocialIcon";
import { Button, PriceTag } from "../kit";
import { GlossyReflection } from "../ThemeSurface";
import { useTheme } from "../theme";
import { CreationIconButton } from "./CreationIconButton";
import { mediaFor } from "./productMedia";

export const domainFor = (url: string) =>
  new URL(url).hostname.replace(/^www\./i, "");

export function ProductPreviewCard({
  product,
  media,
  compact = false,
  onEdit,
  onPhoto,
}: {
  product: ProductDraft;
  media: CreationMedia[];
  compact?: boolean;
  onEdit?: () => void;
  onPhoto?: () => void;
}) {
  const { colors, type, glossy, creation: tokens } = useTheme();
  const [badImage, setBadImage] = useState("");
  const url = canonicalPollProductUrl(product.canonicalUrl || product.url);
  const domain = url ? domainFor(url) : undefined;
  const photo = mediaFor(product, media).find((m) => m.kind === "image");
  const hasVideo = mediaFor(product, media).some((m) => m.kind === "video");
  const imageUri = photo?.file.uri ?? product.importedImageUrl;
  const imageKey = photo?.id ?? imageUri;
  const showImage = imageUri && badImage !== imageKey;
  const currency = product.fields.currency || null;
  const price = Number(product.fields.price.replace(/,/g, ""));
  const original = Number(product.originalPrice?.replace(/,/g, ""));
  const discount =
    price > 0 && original > price
      ? Math.round((1 - price / original) * 100)
      : 0;
  const formatted = (value: number) =>
    currency
      ? formatProductPrice(value, currency)
      : value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return (
    <View
      testID={compact ? "comparison-product-card" : "product-preview-card"}
      style={[
        styles.card,
        { backgroundColor: tokens.card, borderColor: tokens.border },
        compact && { flex: 1, minWidth: 0 },
      ]}
    >
      <View
        style={[
          showImage || compact ? styles.imageFrame : styles.noImage,
          { backgroundColor: tokens.media },
        ]}
      >
        {showImage ? (
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={imageKey}
            accessible
            accessibilityLabel={
              product.name ? "Photo of " + product.name : "Product photo"
            }
            onError={() => setBadImage(imageKey ?? "")}
          />
        ) : onPhoto ? (
          <Button label="Add photo" variant="quiet" onPress={onPhoto} />
        ) : (
          <SocialIcon
            name={hasVideo ? "reels" : "photo"}
            color={tokens.secondary}
          />
        )}
      </View>
      <View
        style={{
          paddingHorizontal: compact ? 10 : 14,
          paddingBottom: url ? 0 : 12,
          paddingTop: 8,
          gap: 4,
        }}
      >
        <GlossyReflection />
        <View
          style={[
            styles.line,
            {
              minHeight: 23,
              position: "relative",
              paddingRight: onEdit ? 30 : 0,
            },
          ]}
        >
          <Text
            numberOfLines={1}
            style={[styles.retailer, { color: tokens.secondary }]}
          >
            {product.retailer || domain || (compact ? "" : "Your product")}
          </Text>
          {onEdit ? (
            <View style={{ position: "absolute", top: -8, right: -11 }}>
              <CreationIconButton
                label={compact ? "Edit second product" : "Edit product"}
                icon="pencil"
                color={tokens.secondary}
                onPress={onEdit}
              />
            </View>
          ) : null}
        </View>
        {product.name ? (
          <Text style={[type.body, { fontWeight: "600" }]}>{product.name}</Text>
        ) : onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add product title"
            onPress={onEdit}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Text style={[type.small, { color: colors.accentInk }]}>
              Add product title
            </Text>
          </Pressable>
        ) : null}
        {Number.isFinite(price) && price > 0 ? (
          <View style={[styles.line, { flexWrap: "wrap", gap: 6 }]}>
            {glossy ? (
              <PriceTag
                price={price}
                currency={currency}
                size="inline"
                label="Store"
              />
            ) : (
              <Text
                style={[compact ? type.body : type.h2, { fontWeight: "800" }]}
              >
                {formatted(price)}
              </Text>
            )}
            {Number.isFinite(original) && original > price ? (
              <Text
                style={[
                  type.small,
                  {
                    color: tokens.secondary,
                    textDecorationLine: "line-through",
                  },
                ]}
              >
                {formatted(original)}
              </Text>
            ) : null}
            {discount > 0 ? (
              <Text
                style={[
                  type.small,
                  { color: colors.accentInk, fontWeight: "700" },
                ]}
              >
                {discount}% off
              </Text>
            ) : null}
          </View>
        ) : null}
        {url ? (
          <View
            style={[
              styles.line,
              {
                borderTopColor: tokens.divider,
                borderTopWidth: 1,
                gap: 6,
                marginTop: 4,
              },
            ]}
          >
            {!compact ? (
              <Text
                numberOfLines={1}
                style={[type.small, { color: tokens.secondary, flex: 1 }]}
              >
                {domain}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={
                compact ? "View product " + product.name : "View product"
              }
              onPress={() => void Linking.openURL(url).catch(() => undefined)}
              style={{ justifyContent: "center", minHeight: 44 }}
            >
              <Text
                style={[
                  type.small,
                  { color: colors.accentInk, fontWeight: "700" },
                ]}
              >
                View product ↗
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function PreviewSkeleton() {
  const { creation: tokens, reducedEffects } = useTheme();
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reducedEffects) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 650,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity, reducedEffects]);
  return (
    <View
      testID="product-preview-skeleton"
      accessibilityRole="progressbar"
      accessibilityLabel="Getting your preview"
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={[
        styles.card,
        { backgroundColor: tokens.card, borderColor: tokens.border },
      ]}
    >
      <Animated.View style={{ opacity }} accessible={false}>
        <View style={[styles.imageFrame, { backgroundColor: tokens.media }]} />
        <View style={{ padding: 14, gap: 12 }}>
          {(["24%", "75%", "38%"] as const).map((width, index) => (
            <View
              key={width}
              style={{
                width,
                height: index === 1 ? 16 : 10,
                borderRadius: 4,
                backgroundColor: tokens.media,
              }}
            />
          ))}
          <View style={{ height: 1, backgroundColor: tokens.divider }} />
          <View
            style={{
              height: 10,
              width: "26%",
              borderRadius: 4,
              backgroundColor: tokens.media,
            }}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, overflow: "hidden" },
  imageFrame: {
    width: "100%",
    aspectRatio: 5 / 4,
    alignItems: "center",
    justifyContent: "center",
  },
  noImage: {
    width: "100%",
    minHeight: 84,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { flexDirection: "row", alignItems: "center" },
  retailer: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
});
