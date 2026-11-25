import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import { ProductWebViewImporter } from "../../components/ProductWebViewImporter";
import type { CreationMedia, ProductDraft } from "../../lib/creationDraft";
import type { ProductPhotoSource } from "../../lib/productImportFailure";
import { productFields } from "../../lib/productDetails";
import { productPhoto, type ProductPreview } from "../../lib/productPreview";
import { useProductImport } from "../../lib/useProductImport";
import { MAX_POLL_MEDIA } from "../../lib/types";
import {
  canonicalPollProductUrl,
  detectProductImportUrl,
  LIMITS,
  parseProductUrl,
} from "../../lib/validation";
import { Banner, Button } from "../kit";
import { SocialIcon } from "../SocialIcon";
import { ThemeSurface } from "../ThemeSurface";
import { useTheme } from "../theme";
import { CreationIconButton } from "./CreationIconButton";
import { ProductEditSheet } from "./ProductEditSheet";
import { ProductImportManualForm } from "./ProductImportManualForm";
import {
  domainFor,
  ProductPreviewCard,
  PreviewSkeleton,
} from "./ProductPreviewCard";
import {
  mediaFor,
  pickMedia,
  pickProductPhoto,
  type UpdateProduct,
} from "./productMedia";

function mergePreview(
  product: ProductDraft,
  media: CreationMedia[],
  result: ProductPreview,
  url: string,
  importSource: NonNullable<ProductDraft["importSource"]>,
  incomingImage?: CreationMedia,
): [ProductDraft, CreationMedia[]] {
  if (detectProductImportUrl(product.url) !== url) return [product, media];
  const manual = new Set(product.manual);
  const preferComplete =
    product.importSource === "manual" && importSource !== "manual";
  const fields = { ...product.fields };
  const fetched = productFields({
    description: result.description,
    brand: result.brand,
    category: result.category,
    currency: result.currency ?? undefined,
    price: result.price ?? undefined,
  });
  for (const key of Object.keys(fields) as (keyof typeof fields)[]) {
    if (
      fetched[key] &&
      !manual.has(key) &&
      (!fields[key] ||
        preferComplete ||
        (key === "currency" && result.price && !product.fields.price))
    ) {
      fields[key] = fetched[key];
    }
  }
  const existing = mediaFor(product, media);
  const incoming =
    !manual.has("image") &&
    !existing.some((m) => m.kind === "image") &&
    media.length < MAX_POLL_MEDIA
      ? incomingImage
      : undefined;
  const source = canonicalPollProductUrl(result.productUrl) ?? url;
  const original =
    result.originalPrice ?? result.intelligence?.product.price?.original;
  return [
    {
      ...product,
      fields,
      name:
        manual.has("name") ||
        (!preferComplete && product.name && product.name !== product.titleHint)
          ? product.name
          : result.name || product.name,
      retailer: manual.has("retailer")
        ? product.retailer
        : product.retailer ||
          result.intelligence?.source.site_name ||
          domainFor(source),
      originalPrice: manual.has("originalPrice")
        ? product.originalPrice
        : product.originalPrice || (original ? String(original) : undefined),
      resolvedUrl: url,
      canonicalUrl: source,
      importSource,
      importFailure:
        importSource === "manual" ? product.importFailure : undefined,
      importedImageUrl:
        manual.has("image") || incoming
          ? undefined
          : result.imageUrl || product.importedImageUrl,
      intelligence: result.intelligence ?? product.intelligence,
      mediaIds: incoming
        ? [incoming.id, ...product.mediaIds]
        : product.mediaIds,
    },
    incoming ? [...media, incoming] : media,
  ];
}

export function hasProductPreview(
  product: ProductDraft,
  media: CreationMedia[],
) {
  return !!(
    product.name ||
    product.manualPreview ||
    mediaFor(product, media).length
  );
}

export function ProductEditor({
  product,
  media,
  update,
  disabled,
  visible = true,
  comparison = false,
  comparisonWith,
  allowInitialVideo = false,
}: {
  product: ProductDraft;
  media: CreationMedia[];
  update: UpdateProduct;
  disabled: boolean;
  visible?: boolean;
  comparison?: boolean;
  comparisonWith?: ProductDraft;
  allowInitialVideo?: boolean;
}) {
  const { colors, mode, type, creation: tokens } = useTheme();
  const [attempt, setAttempt] = useState<{ url: string; key: number }>();
  const [focus, setFocus] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [pauseImport, setPauseImport] = useState(false);
  const picking = useRef(false);
  const inputRef = useRef<React.ComponentRef<typeof TextInput>>(null);
  const url = detectProductImportUrl(product.url);
  const hasPreview = hasProductPreview(product, media);
  const {
    phase: currentPhase,
    deviceUrl,
    finishDevice,
  } = useProductImport({
    url,
    enabled: visible && !disabled && !pauseImport,
    attempt,
    resolvedUrl: product.resolvedUrl,
    onPreview(result, source, link) {
      const image = result.images[0];
      const incoming = image
        ? {
            id: randomUUID(),
            kind: "image" as const,
            file: productPhoto(image),
            sourceUrl: parseProductUrl(link) ?? undefined,
          }
        : undefined;
      update((p, m) => mergePreview(p, m, result, link, source, incoming));
    },
    onManual(link, code) {
      update((p, m) =>
        detectProductImportUrl(p.url) !== link
          ? [p, m]
          : [
              {
                ...p,
                resolvedUrl: link,
                importSource: "manual",
                importFailure: code,
                name: p.manual?.includes("name")
                  ? p.name
                  : p.name || p.titleHint || "",
                fields: { ...p.fields, currency: p.fields.currency || "INR" },
              },
              m,
            ],
      );
    },
  });

  const loading = currentPhase === "loading" || currentPhase === "device";
  const showManual =
    !loading && (product.importSource === "manual" || pauseImport);
  const previewBlocked = !!product.importFailure && product.resolvedUrl === url;

  function changeLink(value: string) {
    const next = detectProductImportUrl(value);
    const previous = detectProductImportUrl(product.url);
    setError("");
    if (next !== previous || !value) {
      setAttempt(undefined);
      if (showManual) setPauseImport(true);
    }
    update((p, m) => {
      if (next === detectProductImportUrl(p.url) && value)
        return [{ ...p, url: value }, m];
      const hasSource = !!(p.resolvedUrl || detectProductImportUrl(p.url));
      if (!hasSource) return [{ ...p, url: value }, m];
      const removed = new Set(
        p.mediaIds.filter((id) =>
          m.some((item) => item.id === id && item.sourceUrl),
        ),
      );
      const manual = new Set(p.manual);
      const fields = productFields(
        showManual ? { currency: "INR" } : undefined,
      );
      (Object.keys(fields) as (keyof typeof fields)[]).forEach((key) => {
        if (manual.has(key)) fields[key] = p.fields[key];
      });
      return [
        {
          ...p,
          url: value,
          name: manual.has("name") ? p.name : "",
          titleHint: undefined,
          fields,
          retailer: manual.has("retailer") ? p.retailer : undefined,
          originalPrice: manual.has("originalPrice")
            ? p.originalPrice
            : undefined,
          resolvedUrl: undefined,
          canonicalUrl: undefined,
          importSource: showManual ? "manual" : undefined,
          importFailure: undefined,
          importedImageUrl: undefined,
          intelligence: undefined,
          mediaIds: p.mediaIds.filter((id) => !removed.has(id)),
        },
        m.filter((item) => !removed.has(item.id)),
      ];
    });
  }

  async function pasteLink() {
    try {
      const value = detectProductImportUrl(await Clipboard.getStringAsync());
      if (value) {
        changeLink(value);
        return;
      }
    } catch {
      // The system paste action remains available inside the field.
    }
    inputRef.current?.focus();
    setError("Paste a public product link into the field.");
  }

  function retry() {
    if (!url) {
      setError("Enter a valid public product link.");
      return;
    }
    if (currentPhase === "loading" || currentPhase === "device") return;
    setError("");
    setPauseImport(false);
    setAttempt({ url, key: (attempt?.key ?? 0) + 1 });
  }

  function previewLink() {
    if (!previewBlocked) retry();
  }

  function editManually() {
    if (
      url &&
      product.importSource !== "server" &&
      product.importSource !== "device"
    ) {
      setPauseImport(true);
      update((p, m) => [
        {
          ...p,
          resolvedUrl: url,
          importSource: "manual",
          fields: { ...p.fields, currency: p.fields.currency || "INR" },
        },
        m,
      ]);
      return;
    }
    setEditing(true);
  }

  async function append(initialUpload = false, source?: ProductPhotoSource) {
    if (
      picking.current ||
      (media.length >= MAX_POLL_MEDIA &&
        !mediaFor(product, media).some((item) => item.kind === "image"))
    )
      return;
    picking.current = true;
    try {
      const photo = source
        ? await pickProductPhoto(source)
        : (await pickMedia(1, initialUpload && allowInitialVideo))[0];
      if (!photo) return;
      update((p, m) => {
        const cover = mediaFor(p, m).find((item) => item.kind === "image");
        if (!cover && m.length >= MAX_POLL_MEDIA) return [p, m];
        return [
          {
            ...p,
            mediaIds: [
              photo.id,
              ...p.mediaIds.filter((id) => id !== cover?.id),
            ],
            manualPreview: p.manualPreview || !p.url,
            importedImageUrl: undefined,
            manual: [...new Set([...(p.manual ?? []), "image"])],
          },
          [...m.filter((item) => item.id !== cover?.id), photo],
        ];
      });
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open your photo library.",
      );
    } finally {
      picking.current = false;
    }
  }

  if (!visible) return null;
  const placeholder = comparison
    ? "Paste another product link"
    : "Paste any product link";
  return (
    <View style={{ gap: 10 }}>
      <ThemeSurface
        testID={comparison ? "second-product-link-input" : "product-link-input"}
        creation
        frost
        material="field"
        focusColor={focus ? colors.accentInk : undefined}
        style={[
          styles.input,
          { backgroundColor: tokens.card, borderColor: tokens.border },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Paste link from clipboard"
          disabled={disabled}
          onPress={() => void pasteLink()}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <SocialIcon name="link" color={tokens.secondary} size={19} />
        </Pressable>
        <TextInput
          ref={inputRef}
          accessibilityLabel={placeholder}
          placeholder={placeholder}
          placeholderTextColor={tokens.secondary}
          keyboardAppearance={mode}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="go"
          maxLength={LIMITS.productUrl}
          editable={!disabled}
          value={product.url}
          onChangeText={changeLink}
          onSubmitEditing={previewLink}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={[styles.linkInput, { color: colors.ink }]}
        />
        {product.url ? (
          <CreationIconButton
            label={
              comparison ? "Clear second product link" : "Clear product link"
            }
            icon="close"
            color={tokens.secondary}
            disabled={disabled}
            onPress={() => changeLink("")}
          />
        ) : null}
        <Button
          label="Preview"
          disabled={disabled || loading || previewBlocked}
          style={styles.previewButton}
          onPress={previewLink}
        />
      </ThemeSurface>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {loading && !hasPreview ? <PreviewSkeleton /> : null}
      {showManual ? (
        <ProductImportManualForm
          product={product}
          media={media}
          update={update}
          disabled={disabled}
          onPhoto={(source) => void append(false, source)}
          onRetry={retry}
        />
      ) : null}
      {!hasPreview && !showManual ? (
        <Button
          label="Add manually"
          variant="quiet"
          disabled={disabled}
          onPress={editManually}
        />
      ) : null}
      {!hasPreview && !loading && !showManual ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              comparison
                ? "Upload second product photo"
                : allowInitialVideo
                  ? "Upload photo or video"
                  : "Upload photo"
            }
            disabled={disabled || media.length >= MAX_POLL_MEDIA}
            onPress={() => void append(true)}
            style={styles.photoAction}
          >
            <SocialIcon name="photo" color={colors.accentInk} size={17} />
            <Text
              style={[
                type.small,
                { color: colors.accentInk, fontWeight: "700" },
              ]}
            >
              {allowInitialVideo ? "Upload photo or video" : "Upload photo"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {hasPreview && !comparison && !showManual ? (
        <ProductPreviewCard
          product={product}
          media={media}
          onEdit={disabled ? undefined : editManually}
          onPhoto={
            disabled || media.length >= MAX_POLL_MEDIA
              ? undefined
              : () => void append()
          }
        />
      ) : null}
      {hasPreview && comparisonWith && !showManual ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <ProductPreviewCard compact product={comparisonWith} media={media} />
          <ProductPreviewCard
            compact
            product={product}
            media={media}
            onEdit={disabled ? undefined : editManually}
            onPhoto={
              disabled || media.length >= MAX_POLL_MEDIA
                ? undefined
                : () => void append()
            }
          />
        </View>
      ) : null}
      {deviceUrl ? (
        <ProductWebViewImporter
          key={deviceUrl}
          url={deviceUrl}
          onFinish={finishDevice}
        />
      ) : null}
      {editing ? (
        <ProductEditSheet
          product={product}
          media={media}
          update={update}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </View>
  );
}

export function PostAttachments({
  media,
  mediaIds,
  coverCount,
  onChange,
  disabled,
}: {
  media: CreationMedia[];
  mediaIds: string[];
  coverCount: number;
  onChange: (additions: CreationMedia[], remove?: string) => void;
  disabled: boolean;
}) {
  const { type } = useTheme();
  const picking = useRef(false);
  const [error, setError] = useState("");
  async function add() {
    if (picking.current || media.length >= MAX_POLL_MEDIA) return;
    picking.current = true;
    try {
      const selected = await pickMedia(MAX_POLL_MEDIA - media.length, true);
      if (selected.length) onChange(selected);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open your media library.",
      );
    } finally {
      picking.current = false;
    }
  }
  return (
    <View style={{ gap: 4 }}>
      {mediaIds.map((id, index) => {
        const item = media.find((file) => file.id === id);
        const position = coverCount + index + 1;
        return item ? (
          <View key={id} style={styles.line}>
            <Text style={[type.small, { flex: 1 }]}>
              {item.kind === "image" ? "Photo" : "Video"} {position}
            </Text>
            <CreationIconButton
              label={"Remove attachment " + position}
              icon="close"
              disabled={disabled}
              onPress={() => onChange([], id)}
            />
          </View>
        ) : null;
      })}
      {error ? <Banner kind="error">{error}</Banner> : null}
      <Button
        label="Add photos or video"
        variant="quiet"
        disabled={disabled || media.length >= MAX_POLL_MEDIA}
        style={{ alignSelf: "flex-start" }}
        onPress={() => void add()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingLeft: 10,
    paddingRight: 5,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  linkInput: {
    position: "relative",
    zIndex: 1,
    outlineWidth: 0,
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    minHeight: 44,
    fontSize: 15,
  },
  previewButton: { minHeight: 44, paddingHorizontal: 12, borderRadius: 10 },
  photoAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingRight: 10,
  },
  line: { flexDirection: "row", alignItems: "center" },
});
