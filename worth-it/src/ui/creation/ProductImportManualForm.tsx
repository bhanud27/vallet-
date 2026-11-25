import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { Image } from "expo-image";
import type { CreationMedia, ProductDraft } from "../../lib/creationDraft";
import {
  productImportFailureView,
  productPhotoSources,
  type ProductPhotoSource,
} from "../../lib/productImportFailure";
import { MAX_POLL_MEDIA } from "../../lib/types";
import { LIMITS } from "../../lib/validation";
import { Button, Field } from "../kit";
import { useTheme } from "../theme";
import { mediaFor, type UpdateProduct } from "./productMedia";

export function ProductImportManualForm({
  product,
  media,
  update,
  disabled,
  onPhoto,
  onRetry,
}: {
  product: ProductDraft;
  media: CreationMedia[];
  update: UpdateProduct;
  disabled: boolean;
  onPhoto: (source: ProductPhotoSource) => void;
  onRetry: () => void;
}) {
  const { type, colors, creation } = useTheme();
  const [choosingPhoto, setChoosingPhoto] = useState(false);
  const cover = mediaFor(product, media).find((item) => item.kind === "image");
  const photoUri = cover?.file.uri ?? product.importedImageUrl;
  const photoDisabled = disabled || (!cover && media.length >= MAX_POLL_MEDIA);
  const view = productImportFailureView(
    product.importFailure,
    Platform.OS === "web",
  );

  function edit(key: "name" | "price" | "currency", value: string) {
    update((p, m) => [
      {
        ...p,
        ...(key === "name"
          ? { name: value }
          : { fields: { ...p.fields, [key]: value } }),
        manual: [...new Set([...(p.manual ?? []), key])],
      },
      m,
    ]);
  }

  function removePhoto() {
    update((p, m) => {
      const id = mediaFor(p, m).find((item) => item.kind === "image")?.id;
      return [
        {
          ...p,
          mediaIds: p.mediaIds.filter((stored) => stored !== id),
          importedImageUrl: undefined,
          manual: [...new Set([...(p.manual ?? []), "image"])],
        },
        m.filter((item) => item.id !== id),
      ];
    });
  }

  return (
    <View testID="product-import-manual-form" style={{ gap: 10 }}>
      <View style={{ gap: 4 }}>
        <Text accessibilityRole="alert" style={type.small}>
          {view.message}
        </Text>
        {view.hint ? (
          <Text style={[type.small, { color: colors.muted }]}>{view.hint}</Text>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 8,
        }}
      >
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            accessibilityLabel="Product photo"
            contentFit="contain"
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              backgroundColor: creation.media,
            }}
          />
        ) : null}
        <Button
          label={view.photoLabel}
          variant="primary"
          disabled={photoDisabled}
          onPress={() => setChoosingPhoto((open) => !open)}
        />
        {photoUri ? (
          <Button
            label="Remove photo"
            variant="quiet"
            disabled={disabled}
            onPress={removePhoto}
          />
        ) : null}
        {view.retryLabel ? (
          <Button
            label={view.retryLabel}
            variant="quiet"
            disabled={disabled}
            onPress={onRetry}
          />
        ) : null}
      </View>
      {choosingPhoto ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {productPhotoSources.map(({ source, label }) => (
            <Button
              key={source}
              label={label}
              variant="secondary"
              disabled={photoDisabled}
              onPress={() => {
                setChoosingPhoto(false);
                onPhoto(source);
              }}
            />
          ))}
        </View>
      ) : null}
      <Field
        label="Product title"
        value={product.name}
        editable={!disabled}
        autoFocus={!disabled}
        maxLength={LIMITS.itemName}
        onChangeText={(value) => edit("name", value)}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 2 }}>
          <Field
            label="Current price"
            value={product.fields.price}
            editable={!disabled}
            keyboardType="decimal-pad"
            maxLength={16}
            onChangeText={(value) => edit("price", value)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Currency"
            value={product.fields.currency}
            editable={!disabled}
            autoCapitalize="characters"
            maxLength={3}
            onChangeText={(value) => edit("currency", value.toUpperCase())}
          />
        </View>
      </View>
    </View>
  );
}
