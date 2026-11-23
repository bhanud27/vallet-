import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import type { CreationMedia, ProductDraft } from "../../lib/creationDraft";
import { productDetails, productFields } from "../../lib/productDetails";
import { MAX_POLL_MEDIA } from "../../lib/types";
import { Banner, Button, Field } from "../kit";
import { ThemeSurface } from "../ThemeSurface";
import { useTheme } from "../theme";
import { CreationIconButton } from "./CreationIconButton";
import { mediaFor, pickMedia, type UpdateProduct } from "./productMedia";

export function ProductEditSheet({
  product,
  media,
  update,
  onClose,
}: {
  product: ProductDraft;
  media: CreationMedia[];
  update: UpdateProduct;
  onClose: () => void;
}) {
  const { type, glossy, creation: tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const [edits, setEdits] = useState<
    Partial<
      Record<
        | "name"
        | "retailer"
        | "brand"
        | "currency"
        | "price"
        | "originalPrice"
        | "description",
        string
      >
    >
  >({});
  const [photo, setPhoto] = useState<CreationMedia>();
  const [error, setError] = useState("");
  const picking = useRef(false);
  const existing = mediaFor(product, media).find(
    (item) => item.kind === "image",
  );
  const priceEdited =
    edits.price !== undefined || edits.originalPrice !== undefined;
  function save() {
    const { name, retailer, originalPrice, ...fields } = edits;
    try {
      productDetails({ ...product.fields, ...fields });
      productDetails({ ...productFields(), price: originalPrice ?? "" });
      update((p, m) => {
        const cover = mediaFor(p, m).find((item) => item.kind === "image");
        const remove = photo && cover ? cover.id : undefined;
        const replace =
          photo && (remove || m.length < MAX_POLL_MEDIA) ? photo : undefined;
        return [
          {
            ...p,
            fields: { ...p.fields, ...fields },
            name: name === undefined ? p.name : name.trim(),
            retailer: retailer === undefined ? p.retailer : retailer.trim(),
            originalPrice:
              originalPrice === undefined
                ? p.originalPrice
                : originalPrice.trim(),
            manualPreview: true,
            manual: [
              ...new Set([
                ...(p.manual ?? []),
                ...Object.keys(edits),
                ...(replace ? ["image"] : []),
              ]),
            ],
            mediaIds: replace
              ? [replace.id, ...p.mediaIds.filter((id) => id !== remove)]
              : p.mediaIds,
          },
          replace ? [...m.filter((item) => item.id !== remove), replace] : m,
        ];
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the product details.");
    }
  }
  async function replacePhoto() {
    if (picking.current) return;
    picking.current = true;
    try {
      const [selected] = await pickMedia(1);
      if (selected) setPhoto(selected);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open your photo library.",
      );
    } finally {
      picking.current = false;
    }
  }
  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.modal, glossy && { backgroundColor: glossy.scrim }]}
      >
        <ThemeSurface
          creation
          frost
          material="sheet"
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: tokens.card,
              borderColor: tokens.border,
              marginTop: insets.top + 20,
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: 16,
              paddingBottom: Math.max(insets.bottom, 16),
              gap: 10,
            }}
          >
            <View style={styles.line}>
              <Text accessibilityRole="header" style={[type.h2, { flex: 1 }]}>
                Edit product
              </Text>
              <CreationIconButton
                label="Close product editor"
                icon="close"
                onPress={onClose}
              />
            </View>
            <View style={[styles.line, { gap: 8 }]}>
              {photo || existing ? (
                <Image
                  source={{ uri: (photo ?? existing)!.file.uri }}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 8,
                    backgroundColor: tokens.media,
                  }}
                  contentFit="contain"
                />
              ) : null}
              <Button
                label={
                  photo || existing ? "Replace photo" : "Upload product photo"
                }
                variant="secondary"
                disabled={!existing && media.length >= MAX_POLL_MEDIA}
                onPress={() => void replacePhoto()}
              />
            </View>
            <Field
              label="Product title"
              value={edits.name ?? product.name}
              maxLength={80}
              onChangeText={(name) => setEdits((e) => ({ ...e, name }))}
            />
            <Field
              label="Retailer"
              value={edits.retailer ?? product.retailer ?? ""}
              maxLength={80}
              onChangeText={(retailer) => setEdits((e) => ({ ...e, retailer }))}
            />
            <Field
              label="Brand"
              value={edits.brand ?? product.fields.brand}
              maxLength={120}
              onChangeText={(brand) => setEdits((e) => ({ ...e, brand }))}
            />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Current price"
                  value={edits.price ?? product.fields.price}
                  keyboardType="decimal-pad"
                  maxLength={16}
                  onChangeText={(price) => setEdits((e) => ({ ...e, price }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Original price"
                  value={edits.originalPrice ?? product.originalPrice ?? ""}
                  keyboardType="decimal-pad"
                  maxLength={16}
                  onChangeText={(originalPrice) =>
                    setEdits((e) => ({ ...e, originalPrice }))
                  }
                />
              </View>
            </View>
            {priceEdited || product.fields.price ? (
              <Field
                label="Currency"
                placeholder="e.g. INR"
                value={edits.currency ?? product.fields.currency}
                autoCapitalize="characters"
                maxLength={3}
                onChangeText={(currency) =>
                  setEdits((e) => ({ ...e, currency: currency.toUpperCase() }))
                }
              />
            ) : null}
            <Field
              label="Description"
              value={edits.description ?? product.fields.description}
              multiline
              maxLength={2000}
              onChangeText={(description) =>
                setEdits((e) => ({ ...e, description }))
              }
            />
            {error ? <Banner kind="error">{error}</Banner> : null}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <Button label="Cancel" variant="quiet" onPress={onClose} />
              <Button label="Save" onPress={save} />
            </View>
          </ScrollView>
        </ThemeSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: "row", alignItems: "center" },
  modal: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    backgroundColor: "#00000080",
  },
  sheet: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "91%",
    borderWidth: 1,
    borderRadius: 20,
  },
});
