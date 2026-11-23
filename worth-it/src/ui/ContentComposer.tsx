import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
} from "react-native";
import {
  router,
  useLocalSearchParams,
  usePreventRemove,
  type Href,
} from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { randomUUID } from "expo-crypto";
import {
  productShareInbox,
  sharedProductUrl as readSharedProductUrl,
} from "../lib/incomingProductShare";
import { pollDraftStore } from "../lib/pollDraft";
import type { PollDraft } from "../lib/draftStore";
import { productFields, productDetails } from "../lib/productDetails";
import { normalizeCreationSpec } from "../lib/creationSpec";
import type {
  CreationDraft,
  CreationMedia,
  ProductDraft,
} from "../lib/creationDraft";
import { parsePrice, detectProductUrl, validatePoll } from "../lib/validation";
import { MAX_POLL_MEDIA, type NewPollInput } from "../lib/types";
import { supabase } from "../lib/supabase";
import { optionalRpc } from "../lib/backendRpc";
import { repo } from "../lib/repo";
import { floatingDockHeight } from "../lib/floatingNavigation";
import { useApp } from "./AppContext";
import { useTheme } from "./theme";
import { Banner, Button, Field } from "./kit";
import {
  PostAttachments,
  ProductEditor,
  hasProductPreview,
} from "./creation/ProductEditor";
import { CreationIconButton } from "./creation/CreationIconButton";
import { AppTabs } from "./AppTabs";
import { FloatingHeader } from "./FloatingHeader";
import { BrandLogo } from "./BrandLogo";
import { ThemeSurface } from "./ThemeSurface";
import { SocialIcon } from "./SocialIcon";

type Entry = "create" | "poll" | "post";
type Subtype = CreationDraft["subtype"];

const actions = [
  {
    type: "opinion",
    title: "Poll",
    subtitle: "Ask opinions",
    icon: "bars",
    publish: "Publish poll",
  },
  {
    type: "compare",
    title: "Compare",
    subtitle: "Find the best",
    icon: "compare",
    publish: "Publish comparison",
  },
  {
    type: "post",
    title: "Post",
    subtitle: "Share a find",
    icon: "compose",
    publish: "Publish post",
  },
] as const;

const questions: Record<Subtype, string> = {
  opinion: "Is this worth buying?",
  compare: "Which one is more worth buying?",
  post: "",
};

const makeProduct = (): ProductDraft => ({
  id: randomUUID(),
  name: "",
  url: "",
  fields: productFields(),
  mediaIds: [],
});

function initial(entry: Entry): CreationDraft {
  return {
    step: "product",
    subtype: entry === "post" ? "post" : "opinion",
    intentChosen: entry !== "create",
    products: [makeProduct(), makeProduct()],
    options: ["Worth it", "Not worth it", "Wait for a sale"].map((label) => ({
      id: randomUUID(),
      label,
    })),
    description: "",
    location: "",
    editing: 0,
  };
}

function restore(d: PollDraft, entry: Entry): CreationDraft {
  if (d.creationDraft) {
    const saved = d.creationDraft;
    const products = [...saved.products];
    while (products.length < 2) products.push(makeProduct());
    const postMediaIds =
      saved.postMediaIds ??
      (saved.subtype === "post" ? products[0].mediaIds.slice(1) : []);
    if (saved.subtype === "post" && !saved.postMediaIds)
      products[0] = {
        ...products[0],
        mediaIds: products[0].mediaIds.slice(0, 1),
      };
    return {
      ...saved,
      postMediaIds,
      intentChosen:
        saved.intentChosen ??
        (saved.subtype === "post" || saved.step !== "product"),
      products,
      questions: saved.questions ?? { [saved.subtype]: d.question },
    };
  }
  const current = initial(entry);
  current.products[0] = {
    ...current.products[0],
    name: d.itemName,
    url: d.storeLink,
    fields: {
      ...productFields(),
      ...d.productFields,
      price: d.productFields?.price ?? d.price,
      currency: d.productFields?.currency ?? (d.price ? "INR" : ""),
    },
    mediaIds: d.media.map((m) => m.id),
    resolvedUrl: detectProductUrl(d.storeLink) ?? undefined,
  };
  current.questions = { [current.subtype]: d.question };
  return current;
}

function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") {
      const viewport = window.visualViewport;
      const onResize = () =>
        setOpen(!!viewport && window.innerHeight - viewport.height > 120);
      viewport?.addEventListener("resize", onResize);
      return () => viewport?.removeEventListener("resize", onResize);
    }
    const show = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

function Workspace({
  entry,
  sharedProductUrl,
}: {
  entry: Entry;
  sharedProductUrl: string | null;
}) {
  const { session } = useApp();
  const { colors, type, glossy, creation: tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const keyboardOpen = useKeyboardOpen();
  const params = useLocalSearchParams<{ productUrl?: string }>();
  const shared = !!sharedProductUrl;
  const store = useMemo(
    () =>
      pollDraftStore(
        session.userId,
        shared ? "shared-product" : entry === "post" ? "post" : "poll",
      ),
    [entry, session.userId, shared],
  );
  const [appliedShare, setAppliedShare] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<{
    state: CreationDraft;
    media: CreationMedia[];
  }>(() => ({
    state: initial(entry),
    media: [],
  }));
  const { state, media } = workspace;
  const [requestId, setRequestId] = useState(randomUUID);
  const [legacy, setLegacy] = useState<
    Pick<PollDraft, "category" | "useCase" | "priority" | "budget">
  >({ useCase: "", priority: "", budget: "" });
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isPublishing, setPublishing] = useState(false);
  const [publishAvailable, setPublishAvailable] = useState(!supabase);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [leaving, setLeaving] = useState<(() => void) | null>(null);
  const [published, setPublished] = useState("");
  const sending = useRef(false);
  const releaseShares = useRef<(() => void) | undefined>(undefined);
  const routing = useRef(false);
  const completed = useRef(false);
  const latest = useRef<PollDraft | null>(null);
  const activeStore = useRef(store);
  const question = state.questions?.[state.subtype] ?? questions[state.subtype];
  const draft: PollDraft = useMemo(
    () => ({
      ...legacy,
      requestId,
      itemName: state.products[0].name,
      price: state.products[0].fields.price,
      question,
      storeLink: state.products[0].url,
      media,
      creationDraft: state,
    }),
    [legacy, requestId, state, question, media],
  );

  useEffect(() => {
    latest.current = ready && dirty ? draft : null;
  }, [ready, dirty, draft]);

  useEffect(() => {
    let active = true;
    if (supabase) {
      void optionalRpc<boolean>(supabase, "worthit_creation_ready")
        .then((result) => {
          if (active) setPublishAvailable(result.available && !!result.data);
        })
        .catch(() => {
          if (active)
            setError(
              "Publishing is unavailable. Your draft is saved on this device.",
            );
        });
    }
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const oldPostStore =
      entry === "create" && !shared
        ? pollDraftStore(session.userId, "post")
        : undefined;
    void (async () => {
      let saved = await store.load();
      if (!active) return;
      if (!saved && oldPostStore) {
        saved = await oldPostStore.load();
        if (!active) return;
        if (saved) activeStore.current = oldPostStore;
      }
      if (saved) {
        const d = saved.draft;
        setRequestId(d.requestId);
        setLegacy({
          category: d.category,
          useCase: d.useCase,
          priority: d.priority,
          budget: d.budget,
        });
        setWorkspace({
          state: restore(
            d,
            activeStore.current === oldPostStore ? "post" : entry,
          ),
          media: d.media,
        });
        setDirty(true);
        if (saved.missing)
          setStorageError(
            "Some draft photos are missing. You can add them again.",
          );
      } else if (!shared && typeof params.productUrl === "string") {
        const url = detectProductUrl(params.productUrl);
        if (url) {
          setWorkspace(({ state, media }) => ({
            state: {
              ...state,
              products: [{ ...state.products[0], url }, state.products[1]],
            },
            media,
          }));
          setDirty(true);
        }
      }
    })()
      .catch(() => {
        if (active) setStorageError("Could not restore your draft.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      releaseShares.current?.();
      if (!completed.current && latest.current)
        void activeStore.current.save(latest.current).catch(() => undefined);
      store.release();
      oldPostStore?.release();
    };
    // Ordinary product deep links seed an empty draft when opening the workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const editingReady =
    ready &&
    (!sharedProductUrl || appliedShare === sharedProductUrl || isPublishing);
  if (
    ready &&
    sharedProductUrl &&
    appliedShare !== sharedProductUrl &&
    !isPublishing &&
    !published
  ) {
    setAppliedShare(sharedProductUrl);
    if (detectProductUrl(state.products[0].url) !== sharedProductUrl) {
      // Reset the share slot before its editor can fetch the previous product.
      const next = initial(entry);
      next.products[0].url = sharedProductUrl;
      setWorkspace({ state: next, media: [] });
      setRequestId(randomUUID());
      setLegacy({ useCase: "", priority: "", budget: "" });
      setError("");
      setStorageError("");
      setDirty(true);
    }
  }

  useEffect(() => {
    if (!editingReady || !dirty || isPublishing || completed.current) return;
    const timer = setTimeout(() => {
      void activeStore.current.save(draft).catch(() => {
        if (!completed.current)
          setStorageError(
            "Could not save your draft. Keep this page open and check storage.",
          );
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [editingReady, dirty, isPublishing, draft]);

  const allowRemoval = usePreventRemove(
    (dirty || isPublishing) && !published,
    ({ repeat }) => {
      if (!sending.current) setLeaving(() => repeat);
    },
  );

  useEffect(() => {
    if (published) router.replace("/p/" + published);
  }, [published]);

  function exit(close: boolean) {
    if (sending.current || routing.current) return;
    if (!close && router.canGoBack()) router.back();
    else router.dismissTo("/");
  }

  async function discard() {
    if (!leaving || sending.current || completed.current) return;
    completed.current = true;
    try {
      await activeStore.current.clear();
      const close = leaving;
      setLeaving(null);
      setDirty(false);
      close();
    } catch {
      completed.current = false;
      setLeaving(null);
      setStorageError("Could not discard your draft. Try again.");
    }
  }

  function updateDraft(change: (state: CreationDraft) => CreationDraft) {
    setDirty(true);
    setError("");
    setWorkspace(({ state, media }) => ({ state: change(state), media }));
  }

  const updateProduct =
    (index: number): React.ComponentProps<typeof ProductEditor>["update"] =>
    (change) => {
      setDirty(true);
      setWorkspace(({ state, media }) => {
        const products = [...state.products];
        const [product, files] = change(products[index], media);
        if (product === products[index] && files === media)
          return { state, media };
        products[index] = product;
        return { state: { ...state, products }, media: files };
      });
    };

  function updatePostMedia(additions: CreationMedia[], remove?: string) {
    setDirty(true);
    setWorkspace(({ state, media }) => {
      const accepted = additions.slice(0, MAX_POLL_MEDIA - media.length);
      return {
        state: {
          ...state,
          postMediaIds: [
            ...(state.postMediaIds ?? []).filter((id) => id !== remove),
            ...accepted.map((item) => item.id),
          ],
        },
        media: [...media.filter((item) => item.id !== remove), ...accepted],
      };
    });
  }

  const first = state.products[0];
  const second = state.products[1];
  const hasPreview = hasProductPreview(first, media);
  const selected =
    hasPreview && state.intentChosen
      ? actions.find((action) => action.type === state.subtype)
      : undefined;
  const comparing = selected?.type === "compare";
  const posting = selected?.type === "post";
  const disabled = isPublishing || !!state.publishLocked;

  async function publish() {
    if (
      sending.current ||
      routing.current ||
      !ready ||
      !publishAvailable ||
      !selected
    )
      return;
    let input: NewPollInput;
    try {
      const products = comparing ? state.products : [first];
      const attachments: CreationMedia[] = [];
      const setup = products.map((product, index) => {
        const url = detectProductUrl(product.url);
        const ids = posting
          ? [...product.mediaIds, ...(state.postMediaIds ?? [])]
          : product.mediaIds;
        const files = ids.flatMap((id) => {
          const item = media.find((file) => file.id === id);
          return item ? [item] : [];
        });
        if (product.url.trim() && !url)
          throw new Error("Enter a valid public product link.");
        if (!posting && !product.name.trim())
          throw new Error(
            index
              ? "Add a title for the second product."
              : "Add a product title.",
          );
        if (!url && !files.length)
          throw new Error(
            index
              ? "Add a link or photo for the second product."
              : "Add a product link or photo.",
          );
        const offset = attachments.length;
        attachments.push(...files);
        return {
          id: product.id,
          name: product.name.trim(),
          url: url ?? undefined,
          details: productDetails(product.fields),
          media: files.map((_, i) => offset + i),
        };
      });
      const firstProduct = setup[0];
      const creationSpec = normalizeCreationSpec({
        version: 1,
        subtype: state.subtype,
        products: posting ? [] : setup,
        options: posting
          ? []
          : comparing
            ? setup.map((p) => ({ id: p.id, label: p.name, productId: p.id }))
            : state.options,
        description: state.description,
        location: state.location,
      });
      const price = firstProduct.details?.price ?? 0;
      input = {
        contentKind: posting ? "post" : "poll",
        requestId,
        itemName:
          firstProduct.name || question.trim().slice(0, 80) || "Fashion post",
        priceInr:
          !posting &&
          firstProduct.details?.currency === "INR" &&
          Number.isInteger(price)
            ? price
            : 0,
        question: question.trim(),
        media: attachments,
        productUrl: firstProduct.url,
        productDetails: firstProduct.details,
        category: legacy.category,
        useCase: legacy.useCase,
        priority: legacy.priority,
        budgetInr: parsePrice(legacy.budget) ?? undefined,
        creationSpec,
      };
      validatePoll(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your draft.");
      return;
    }

    sending.current = true;
    if (Platform.OS === "android")
      releaseShares.current = productShareInbox.hold();
    setPublishing(true);
    setError("");
    try {
      await activeStore.current.save(draft);
      const result = await repo.createPoll(input, (progress) => {
        if (progress.stage !== "publishing") return;
        const locked = { ...state, publishLocked: true };
        setWorkspace((current) => ({ ...current, state: locked }));
        const saved = { ...draft, creationDraft: locked };
        latest.current = saved;
        void activeStore.current.save(saved).catch(() => undefined);
      });
      completed.current = true;
      await activeStore.current.clear().catch(() => undefined);
      setPublished(result.id);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not publish. Your draft is saved.",
      );
    } finally {
      // Successful publishing releases the next share when this workspace exits.
      if (!completed.current) releaseShares.current?.();
      sending.current = false;
      setPublishing(false);
    }
  }

  async function goTo(path: Href) {
    if (path === "/add" || sending.current || routing.current) return;
    routing.current = true;
    try {
      if (dirty) await activeStore.current.save(draft);
      setDirty(false);
      allowRemoval();
      router.dismissTo(path);
    } catch {
      setStorageError(
        "Could not save your draft before leaving. Please try again.",
      );
    } finally {
      routing.current = false;
    }
  }

  const columnWidth = Math.max(insets.left, insets.right);
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.page,
        paddingTop: insets.top,
        paddingHorizontal: columnWidth,
      }}
    >
      <FloatingHeader
        creation
        center={<BrandLogo size={34} />}
        leading={
          <CreationIconButton
            label="Back"
            icon="back"
            disabled={isPublishing}
            onPress={() => exit(false)}
          />
        }
        trailing={
          <CreationIconButton
            label="Close creation"
            icon="close"
            disabled={isPublishing}
            onPress={() => exit(true)}
          />
        }
      />
      <ScrollView
        testID="create-scroll"
        style={{
          flex: 1,
          marginBottom: keyboardOpen
            ? 0
            : floatingDockHeight(insets.bottom) - 4,
        }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            width: "100%",
            maxWidth: 480,
            gap: 14,
            alignSelf: "center",
            paddingTop: 6,
          }}
        >
          <View style={{ gap: 2 }}>
            <Text accessibilityRole="header" style={type.title}>
              Is it really worth it?
            </Text>
            <Text style={[type.small, { color: tokens.secondary }]}>
              Find it. Share it. Decide together.
            </Text>
          </View>

          {storageError ? <Banner kind="info">{storageError}</Banner> : null}
          {editingReady ? (
            <>
              <ProductEditor
                key={first.id}
                product={first}
                media={media}
                update={updateProduct(0)}
                disabled={disabled}
                allowInitialVideo={entry === "post"}
              />
              {hasPreview ? (
                <View style={{ gap: 8 }}>
                  <Text accessibilityRole="header" style={type.h2}>
                    What would you like to create?
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {actions.map((action) => {
                      const active = action.type === selected?.type;
                      return (
                        <ThemeSurface
                          key={action.type}
                          creation
                          style={{
                            flex: 1,
                            minWidth: 0,
                            borderRadius: 14,
                            borderWidth: 1,
                            backgroundColor: tokens.card,
                            borderColor: tokens.border,
                          }}
                        >
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={action.title}
                            accessibilityState={{ selected: active }}
                            aria-pressed={active}
                            disabled={disabled}
                            onPress={() =>
                              updateDraft((s) => ({
                                ...s,
                                subtype: action.type,
                                intentChosen: true,
                              }))
                            }
                            style={({ pressed }) => [
                              styles.action,
                              { opacity: pressed ? 0.7 : 1 },
                              active && {
                                backgroundColor: colors.accentSoft,
                                borderColor: colors.accentInk,
                              },
                            ]}
                          >
                            <SocialIcon
                              name={action.icon}
                              color={colors.accentInk}
                              size={21}
                            />
                            <Text
                              style={{
                                color: colors.ink,
                                fontSize: 14,
                                fontWeight: "700",
                              }}
                            >
                              {action.title}
                            </Text>
                            <Text
                              style={{
                                color: tokens.secondary,
                                fontSize: 11,
                                lineHeight: 15,
                                textAlign: "center",
                              }}
                            >
                              {action.subtitle}
                            </Text>
                          </Pressable>
                        </ThemeSurface>
                      );
                    })}
                  </View>
                </View>
              ) : null}
              <ProductEditor
                key={second.id}
                product={second}
                media={media}
                update={updateProduct(1)}
                visible={comparing}
                disabled={disabled}
                comparison
                comparisonWith={first}
              />
              {comparing
                ? state.products
                    .slice(2)
                    .map((product, i) => (
                      <ProductEditor
                        key={product.id}
                        product={product}
                        media={media}
                        update={updateProduct(i + 2)}
                        disabled={disabled}
                      />
                    ))
                : null}
              {selected ? (
                <ThemeSurface
                  creation
                  style={{
                    backgroundColor: tokens.card,
                    borderColor: tokens.border,
                    borderWidth: 1,
                    borderRadius: 16,
                    padding: 14,
                    gap: 10,
                  }}
                >
                  <Field
                    label={
                      posting
                        ? "Caption"
                        : comparing
                          ? "Comparison question"
                          : "Poll question"
                    }
                    multiline={posting}
                    placeholder={
                      posting ? "What makes this worth sharing?" : undefined
                    }
                    maxLength={posting ? 2000 : 200}
                    value={question}
                    editable={!disabled}
                    onChangeText={(text) =>
                      updateDraft((s) => ({
                        ...s,
                        questions: { ...s.questions, [s.subtype]: text },
                      }))
                    }
                  />
                  {selected.type === "opinion" ? (
                    <>
                      {state.options.map((option, index) => (
                        <View
                          key={option.id}
                          style={{
                            flexDirection: "row",
                            alignItems: "flex-end",
                            gap: 4,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Field
                              label={"Option " + (index + 1)}
                              value={option.label}
                              maxLength={80}
                              editable={!disabled}
                              onChangeText={(label) =>
                                updateDraft((s) => ({
                                  ...s,
                                  options: s.options.map((o) =>
                                    o.id === option.id ? { ...o, label } : o,
                                  ),
                                }))
                              }
                            />
                          </View>
                          {state.options.length > 2 ? (
                            <CreationIconButton
                              label={"Remove option " + (index + 1)}
                              icon="close"
                              disabled={disabled}
                              onPress={() =>
                                updateDraft((s) => ({
                                  ...s,
                                  options: s.options.filter(
                                    (o) => o.id !== option.id,
                                  ),
                                }))
                              }
                            />
                          ) : null}
                        </View>
                      ))}
                      {state.options.length < 4 ? (
                        <Button
                          label="Add option"
                          variant="quiet"
                          disabled={disabled}
                          onPress={() => {
                            const id = randomUUID();
                            updateDraft((s) => ({
                              ...s,
                              options: [...s.options, { id, label: "" }],
                            }));
                          }}
                          style={{ alignSelf: "flex-start" }}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {posting ? (
                    <PostAttachments
                      media={media}
                      mediaIds={state.postMediaIds ?? []}
                      coverCount={first.mediaIds.length}
                      onChange={updatePostMedia}
                      disabled={disabled}
                    />
                  ) : null}
                  {error ? <Banner kind="error">{error}</Banner> : null}
                  {!publishAvailable ? (
                    <Text style={type.small}>
                      Publishing is unavailable. Your draft is kept.
                    </Text>
                  ) : null}
                  {state.publishLocked && !isPublishing ? (
                    <Text style={type.small}>
                      Retry to check the status of this publication.
                    </Text>
                  ) : null}
                  <Button
                    label={selected.publish}
                    disabled={!publishAvailable}
                    loading={isPublishing}
                    onPress={() => void publish()}
                  />
                </ThemeSurface>
              ) : null}
            </>
          ) : (
            <Text accessibilityLiveRegion="polite" style={type.small}>
              Restoring draft…
            </Text>
          )}
        </View>
      </ScrollView>
      {!keyboardOpen ? (
        <AppTabs
          active="add"
          creation
          onNavigate={(path) => void goTo(path)}
          safeAreaSides={false}
        />
      ) : null}
      {leaving ? (
        <Modal
          visible
          transparent
          animationType="none"
          onRequestClose={() => setLeaving(null)}
        >
          <View
            style={[
              styles.dialogBackdrop,
              glossy && { backgroundColor: glossy.scrim },
            ]}
          >
            <ThemeSurface
              creation
              frost
              material="sheet"
              accessibilityViewIsModal
              style={{
                margin: 16,
                width: "90%",
                maxWidth: 380,
                padding: 18,
                gap: 12,
                backgroundColor: tokens.card,
              }}
            >
              <Text accessibilityRole="header" style={type.h2}>
                Discard this draft?
              </Text>
              <Text style={type.small}>
                Your product and changes will be removed.
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "flex-end",
                  gap: 8,
                }}
              >
                <Button
                  label="Keep editing"
                  variant="quiet"
                  onPress={() => setLeaving(null)}
                />
                <Button label="Discard" onPress={() => void discard()} />
              </View>
            </ThemeSurface>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

export function ContentComposer({ kind = "create" }: { kind?: Entry }) {
  const { session } = useApp();
  const { sharedProductUrl } = useLocalSearchParams<{
    sharedProductUrl?: string;
  }>();
  const url =
    kind === "create" && typeof sharedProductUrl === "string"
      ? readSharedProductUrl([{ value: sharedProductUrl }])
      : null;
  return (
    <Workspace
      key={kind + session.userId + (url ? ":shared" : "")}
      entry={kind}
      sharedProductUrl={url}
    />
  );
}

const styles = StyleSheet.create({
  action: {
    minHeight: 83,
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 3,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 13,
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: "#00000080",
    justifyContent: "center",
    alignItems: "center",
  },
});
