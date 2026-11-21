import React, { useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { randomUUID } from "expo-crypto";
import type { ProductDraft, CreationMedia } from "../../lib/creationDraft";
import { productFields } from "../../lib/productDetails";
import type { ProductFields } from "../../lib/productDetails";
import { detectProductUrl } from "../../lib/validation";
import {
  getProductPreview,
  productPhoto,
  type ProductPreview,
} from "../../lib/productPreview";
import { validateSelectedVideo } from "../../lib/socialVideo";
import { MAX_POLL_PHOTO_MB, MAX_POLL_PHOTO_PIXELS } from "../../lib/image";
import { MAX_POLL_MEDIA } from "../../lib/types";
import { GalleryMedia } from "../GalleryMedia";
import { ProductDetailsFields } from "../ProductDetailsFields";
import { Banner, Button, Field, PriceTag } from "../kit";
import { SocialIcon } from "../SocialIcon";
import { useTheme } from "../theme";
import { ProductIntelligenceSummary } from "./ProductIntelligenceSummary";
import { CreationSurface } from "./Surface";
export function ProductEditor({
  product,
  media,
  update,
  setMedia,
  disabled,
  post = false,
}: {
  product: ProductDraft;
  media: CreationMedia[];
  update: (fn: (p: ProductDraft) => ProductDraft) => void;
  setMedia: React.Dispatch<React.SetStateAction<CreationMedia[]>>;
  disabled: boolean;
  post?: boolean;
}) {
  const { type, colors } = useTheme(),
    [more, setMore] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [loadingPhotos, setLoadingPhotos] = useState(false),
    [attempt, setAttempt] = useState(0),
    [notice, setNotice] = useState("");
  const current = useRef(product);
  const mediaNow = useRef(media);
  useEffect(() => {
    current.current = product;
    mediaNow.current = media;
  }, [product, media]);
  const url = detectProductUrl(product.url);
  const [resolved, setResolved] = useState(product.resolvedUrl);
  const items = product.mediaIds
    .map((id) => media.find((m) => m.id === id))
    .filter((m): m is CreationMedia => !!m);
  useEffect(() => {
    if (!url || url === resolved || disabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setLoadingPhotos(false);
      setError("");
      const timeout = setTimeout(() => {
        setError("The store took too long. Add details and photos manually.");
        setLoading(false);
        controller.abort();
      }, 30000);
      void getProductPreview(url, controller.signal, attempt > 0, true)
        .then(async (result) => {
          const apply = (result: ProductPreview) => {
            if (
              controller.signal.aborted ||
              detectProductUrl(current.current.url) !== url
            )
              return;
            const incoming: CreationMedia[] = result.images.map((image) => ({
              id: randomUUID(),
              kind: "image",
              file: productPhoto(image),
              sourceUrl: url,
            }));
            const room = MAX_POLL_MEDIA - mediaNow.current.length;
            const additions = incoming
              .filter(
                (m) =>
                  !mediaNow.current.some(
                    (old) =>
                      old.sourceUrl === url && old.file.uri === m.file.uri,
                  ),
              )
              .slice(0, Math.max(0, room));
            setNotice(
              result.warning ||
                (result.intelligence?.status === "partial"
                  ? "Some store details are unavailable. Edit or add anything missing below."
                  : ""),
            );

            setMedia((old) =>
              [
                ...old,
                ...additions.filter((m) => !old.some((v) => v.id === m.id)),
              ].slice(0, MAX_POLL_MEDIA),
            );
            update((p) => {
              if (detectProductUrl(p.url) !== url) return p;
              const manual = new Set(p.manual ?? []);
              const fetched = productFields({
                description: result.description,
                brand: result.brand,
                category: result.category,
                currency: result.currency ?? undefined,
                price: result.price ?? undefined,
              });
              const fields = { ...p.fields };
              for (const key of Object.keys(fields) as (keyof ProductFields)[])
                if (!manual.has(key)) fields[key] = fetched[key];
              return {
                ...p,
                name: manual.has("name") ? p.name : (result.name ?? p.name),
                fields,
                mediaIds: [...p.mediaIds, ...additions.map((m) => m.id)],
                resolvedUrl: url,
                intelligence: result.intelligence,
              };
            });
          };
          apply(result);
          if (result.imagesPending && !controller.signal.aborted) {
            setLoadingPhotos(true);
            try {
              apply(await getProductPreview(url, controller.signal));
            } catch {
              if (!controller.signal.aborted)
                setNotice(
                  "Product details are ready. Store photos could not load; upload your own photos or retry.",
                );
            }
          }
          if (!controller.signal.aborted) {
            setLoading(false);
            setLoadingPhotos(false);
            setResolved(url);
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setError(
              e instanceof Error
                ? e.message
                : "Could not fetch this product. Add details manually.",
            );
        })
        .finally(() => {
          clearTimeout(timeout);
          if (!controller.signal.aborted) {
            setLoading(false);
            setLoadingPhotos(false);
          }
        });
      controller.signal.addEventListener("abort", () => clearTimeout(timeout), {
        once: true,
      });
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // Use the latest controlled values when an asynchronous import completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, resolved, attempt, disabled, post]);
  function changeLink(value: string) {
    const next = detectProductUrl(value);
    const changed =
      next !== detectProductUrl(product.url) || (!value && !!product.url);
    if (changed) {
      setLoading(false);
      setResolved(undefined);
      setError("");
      setNotice("");
      const stale = new Set(
        product.mediaIds.filter((id) =>
          media.some((m) => m.id === id && m.sourceUrl),
        ),
      );
      update((p) => ({
        ...p,
        url: next && /\s/.test(value.trim()) ? next : value,
        resolvedUrl: undefined,
        intelligence: undefined,
        mediaIds: p.mediaIds.filter((id) => !stale.has(id)),
      }));
      setMedia((old) => old.filter((m) => !stale.has(m.id)));
    } else update((p) => ({ ...p, url: value }));
  }
  function field(key: string, value: string) {
    update((p) => ({
      ...p,
      ...(key === "name"
        ? { name: value }
        : { fields: { ...p.fields, [key]: value } }),
      manual: [...new Set([...(p.manual ?? []), key])],
    }));
  }
  async function pick() {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: MAX_POLL_MEDIA - media.length,
        quality: 1,
      });
      if (picked.canceled) return;
      const next: CreationMedia[] = [];
      for (const asset of picked.assets) {
        if (asset.type === "video") {
          validateSelectedVideo(asset);
          next.push({ id: randomUUID(), kind: "video", file: asset });
        } else {
          if (
            (asset.fileSize ?? 0) > MAX_POLL_PHOTO_MB * 1024 * 1024 ||
            asset.width * asset.height > MAX_POLL_PHOTO_PIXELS
          )
            throw new Error("Choose photos up to 15 MB and 60 megapixels.");
          next.push({
            id: randomUUID(),
            kind: "image",
            file: {
              uri: asset.uri,
              mimeType: asset.mimeType,
              width: asset.width,
              height: asset.height,
            },
          });
        }
      }
      const limited = next.slice(0, MAX_POLL_MEDIA - media.length);
      setMedia((old) => [...old, ...limited]);
      update((p) => ({
        ...p,
        mediaIds: [...p.mediaIds, ...limited.map((m) => m.id)],
      }));
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open your media library.",
      );
    }
  }
  const price = Number(product.fields.price.replace(/,/g, ""));
  const priceBadge =
    Number.isFinite(price) && price > 0 ? (
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: 12, bottom: 12 }}
      >
        <PriceTag
          price={price}
          currency={product.fields.currency || null}
          label="Store"
          size="small"
        />
      </View>
    ) : null;
  return (
    <View style={{ gap: 16 }}>
      <>
        <Field
          label="Product link (optional)"
          placeholder="Paste a shopping product link"
          value={product.url}
          editable={!disabled}
          keyboardType="url"
          autoCapitalize="none"
          maxLength={2048}
          onChangeText={changeLink}
          trailingAction={
            product.url ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear product link"
                accessibilityHint="Remove this link and its imported photos so you can paste another link."
                disabled={disabled}
                onPress={() => changeLink("")}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
                })}
              >
                <Text
                  style={{ color: colors.muted, fontSize: 26, lineHeight: 30 }}
                >
                  ×
                </Text>
              </Pressable>
            ) : null
          }
          labelAction={
            <Button
              label="Paste link"
              variant="quiet"
              disabled={disabled}
              onPress={async () => {
                try {
                  const value = detectProductUrl(
                    await Clipboard.getStringAsync(),
                  );
                  if (value) changeLink(value);
                  else setError("Copy a product page link first.");
                } catch {
                  setError("Paste directly into the product link field.");
                }
              }}
            />
          }
        />
        {loading ? (
          <Banner kind="info">
            {loadingPhotos
              ? "Product details ready. Loading photos..."
              : "Fetching product details..."}
          </Banner>
        ) : null}
        {error ? (
          <>
            <Banner kind="info">
              {error} You can continue with manual details.
            </Banner>
            {url ? (
              <Button
                label="Retry product fetch"
                variant="quiet"
                disabled={disabled}
                onPress={() => {
                  setResolved(undefined);
                  setAttempt((v) => v + 1);
                }}
              />
            ) : null}
          </>
        ) : null}
      </>
      {notice ? <Banner kind="info">{notice}</Banner> : null}
      {notice && !loading && url && resolved === url ? (
        <Button
          label="Retry product fetch"
          variant="quiet"
          disabled={disabled}
          onPress={() => {
            setResolved(undefined);
            setAttempt((v) => v + 1);
          }}
        />
      ) : null}
      {product.intelligence && url === product.resolvedUrl ? (
        <ProductIntelligenceSummary
          value={product.intelligence}
          manual={product.manual || []}
        />
      ) : null}
      <CreationSurface frost={false} style={{ padding: 12, gap: 12 }}>
        {items[0] ? (
          <View
            style={{
              height: 300,
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: colors.media,
            }}
          >
            <GalleryMedia
              item={{ kind: items[0].kind, value: items[0].file.uri }}
              label={post ? "Selected post photo" : "Selected product photo"}
            />
            {priceBadge}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              post ? "Add photos or videos" : "Upload product photo"
            }
            disabled={disabled || media.length >= MAX_POLL_MEDIA}
            onPress={() => {
              void pick();
            }}
            style={{
              minHeight: 220,
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              backgroundColor: colors.media,
              borderRadius: 16,
            }}
          >
            <SocialIcon name="photo" />
            <Text style={type.h2}>
              {post ? "Add your photos" : "Add a product photo"}
            </Text>
            <Text style={type.small}>Choose from your gallery</Text>
            {priceBadge}
          </Pressable>
        )}
        {items.map((item, index) => (
          <View
            key={item.id}
            style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
          >
            {item.kind === "image" ? (
              <Image
                source={{ uri: item.file.uri }}
                style={{ width: 44, height: 50, borderRadius: 7 }}
              />
            ) : (
              <SocialIcon name="reels" />
            )}
            <Text style={[type.small, { flex: 1 }]}>
              {index + 1} · {item.kind === "image" ? "Photo" : "Video"}
            </Text>
            <Pressable
              accessibilityLabel={"Move photo " + (index + 1) + " earlier"}
              accessibilityRole="button"
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
              disabled={disabled || index === 0}
              onPress={() =>
                update((p) => {
                  const ids = [...p.mediaIds];
                  [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
                  return { ...p, mediaIds: ids };
                })
              }
            >
              <Text style={type.h2}>↑</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={"Remove photo " + (index + 1)}
              accessibilityRole="button"
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
              disabled={disabled}
              onPress={() => {
                setMedia((old) => old.filter((m) => m.id !== item.id));
                update((p) => ({
                  ...p,
                  mediaIds: p.mediaIds.filter((id) => id !== item.id),
                }));
              }}
            >
              <Text style={type.h2}>×</Text>
            </Pressable>
          </View>
        ))}
        {items.length ? (
          <Button
            testID="pick-photo"
            label="Add more photos or video"
            variant="secondary"
            disabled={disabled || media.length >= MAX_POLL_MEDIA}
            onPress={() => {
              void pick();
            }}
          />
        ) : null}
      </CreationSurface>
      {!post && !items.length && !product.url && !more ? (
        <Button
          label="Enter product details manually"
          variant="quiet"
          onPress={() => setMore(true)}
          disabled={disabled}
        />
      ) : null}
      {(items.length > 0 || product.url || more) && (!post || product.url) ? (
        <>
          <Field
            label="Product name"
            value={product.name}
            editable={!disabled}
            maxLength={80}
            placeholder="Name your fashion find"
            onChangeText={(v) => field("name", v)}
          />
          <Button
            label={more ? "Hide product details" : "Edit product details"}
            variant="quiet"
            onPress={() => setMore(!more)}
          />
          {more ? (
            <CreationSurface style={{ padding: 16 }}>
              <ProductDetailsFields
                showAskingHint={false}
                value={product.fields}
                disabled={disabled}
                onChange={(key, value) => field(key, value)}
              />
            </CreationSurface>
          ) : product.fields.price || product.fields.brand ? (
            <Text style={type.small}>
              {[
                product.fields.brand,
                [product.fields.currency, product.fields.price]
                  .filter(Boolean)
                  .join(" "),
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function DraftProductCover({
  product,
  media,
}: {
  product: ProductDraft;
  media: CreationMedia[];
}) {
  const { type, colors } = useTheme();
  const item = product.mediaIds
    .map((id) => media.find((m) => m.id === id))
    .find(Boolean);
  return (
    <View
      style={{
        aspectRatio: 1,
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: colors.media,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {item ? (
        <GalleryMedia
          item={{ kind: item.kind, value: item.file.uri }}
          label={"Preview of " + product.name}
        />
      ) : (
        <Text style={type.small}>No photo added</Text>
      )}
    </View>
  );
}
