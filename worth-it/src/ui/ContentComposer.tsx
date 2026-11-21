import React, { useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Image, Pressable, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { pollDraftStore } from "../lib/pollDraft";
import type { PollDraft } from "../lib/draftStore";
import { productFields, productDetails } from "../lib/productDetails";
import { normalizeCreationSpec, type CreationSpec } from "../lib/creationSpec";
import type {
  CreationDraft,
  CreationMedia,
  ProductDraft,
} from "../lib/creationDraft";
import { parsePrice, detectProductUrl } from "../lib/validation";
import type { Poll, PollCategory, PublishProgress } from "../lib/types";
import { supabase } from "../lib/supabase";
import { optionalRpc } from "../lib/backendRpc";
import { repo } from "../lib/repo";
import { socialRepo } from "../lib/socialRepo";
import { useApp } from "./AppContext";
import { useTheme } from "./theme";
import { Banner, Button, Field } from "./kit";
import { DraftProductCover, ProductEditor } from "./creation/ProductEditor";
import { CreationScreen as Screen, CreationSurface } from "./creation/Surface";
import { CreationBody } from "./CreationBody";
import { PostIdentity } from "./PostPresentation";
import { PollCategories } from "./PollCategories";
import { SocialIcon } from "./SocialIcon";
const makeProduct = (): ProductDraft => ({
  id: randomUUID(),
  name: "",
  url: "",
  fields: productFields(),
  mediaIds: [],
});
const initial = (post: boolean): CreationDraft => ({
  step: "product",
  subtype: post ? "post" : "opinion",
  products: [makeProduct()],
  options: [
    { id: randomUUID(), label: "Worth it" },
    { id: randomUUID(), label: "Not worth it" },
    { id: randomUUID(), label: "Wait for sale" },
  ],
  description: "",
  location: "",
  editing: 0,
});
function Workspace({ kind }: { kind: "poll" | "post" }) {
  const { session } = useApp(),
    { type, colors } = useTheme(),
    post = kind === "post";
  const params = useLocalSearchParams<{ productUrl?: string }>();
  const store = useMemo(
    () => pollDraftStore(session.userId, kind),
    [session.userId, kind],
  );
  const [state, setState] = useState(() => initial(post)),
    [media, setMedia] = useState<CreationMedia[]>([]),
    [question, setQuestion] = useState(post ? "" : "Is this worth buying?"),
    [category, setCategory] = useState<PollCategory | undefined>(),
    [requestId, setRequestId] = useState(randomUUID),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [locked, setLocked] = useState(false),
    [more, setMore] = useState(false),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [progress, setProgress] = useState<PublishProgress>(),
    [username, setUsername] = useState("");
  const [useCase, setUseCase] = useState(""),
    [priority, setPriority] = useState(""),
    [budget, setBudget] = useState("");
  const [publishAvailable, setPublishAvailable] = useState(!supabase);
  useEffect(() => {
    let active = true;
    if (supabase)
      void optionalRpc<boolean>(supabase, "worthit_creation_ready")
        .then((r) => {
          if (active) setPublishAvailable(r.available && !!r.data);
        })
        .catch(() => {
          if (active)
            setError(
              "Could not verify publishing availability. Reopen this draft to retry.",
            );
        });
    return () => {
      active = false;
    };
  }, []);
  const sending = useRef(false),
    completed = useRef(false),
    controller = useRef<AbortController | null>(null),
    latest = useRef<PollDraft | null>(null);
  const current = state.products[state.editing] ?? state.products[0];
  const draft = useMemo(
    () => ({
      requestId,
      itemName: state.products[0]?.name ?? "",
      price: state.products[0]?.fields.price ?? "",
      question,
      storeLink: state.products[0]?.url ?? "",
      category,
      useCase,
      priority,
      budget,
      media,
      creationDraft: state,
    }),
    [requestId, state, question, category, media, useCase, priority, budget],
  );
  useEffect(() => {
    if (ready) latest.current = draft;
  }, [ready, draft]);
  useEffect(() => {
    let active = true;
    void socialRepo
      .getProfile(session.userId)
      .then((p) => {
        if (active) setUsername(p.username ?? p.displayName);
      })
      .catch(() => undefined);
    void store
      .load()
      .then((saved) => {
        if (!active) return;
        if (saved) {
          const d = saved.draft;
          setRequestId(d.requestId);
          setQuestion(d.question);
          setCategory(d.category);
          setUseCase(d.useCase);
          setPriority(d.priority);
          setBudget(d.budget);
          setMedia(d.media);
          setState(
            d.creationDraft ?? {
              ...initial(post),
              products: [
                {
                  ...makeProduct(),
                  name: d.itemName,
                  url: d.storeLink,
                  fields: {
                    ...productFields(),
                    ...d.productFields,
                    price: d.productFields?.price ?? d.price,
                    currency:
                      d.productFields?.currency ?? (d.price ? "INR" : ""),
                  },
                  mediaIds: d.media.map((m) => m.id),
                  resolvedUrl: detectProductUrl(d.storeLink) ?? undefined,
                },
              ],
            },
          );
          setNote(
            saved.missing
              ? "Draft restored. Some files are missing; select them again."
              : "Your saved draft has been restored.",
          );
        } else if (params.productUrl)
          setState((s) => ({
            ...s,
            products: [
              {
                ...s.products[0],
                url: detectProductUrl(params.productUrl!) ?? "",
              },
            ],
          }));
      })
      .catch(() => {
        if (active)
          setError("Could not restore the draft. Check device storage.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
      if (!completed.current && latest.current)
        void store.save(latest.current).catch(() => undefined);
      store.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, session.userId, post]);
  useEffect(() => {
    if (!ready || busy || completed.current) return;
    const timer = setTimeout(() => {
      void store
        .save(draft)
        .then(() => {
          if (!completed.current) setNote("Draft saved on this device.");
        })
        .catch(() =>
          setError(
            "Could not save your draft. Keep this page open and check storage.",
          ),
        );
    }, 500);
    return () => clearTimeout(timer);
  }, [ready, busy, draft, store]);
  function back() {
    if (busy || locked) return;
    if (state.step === "preview") setState((s) => ({ ...s, step: "edit" }));
    else if (state.step === "edit")
      setState((s) => ({ ...s, step: post ? "product" : "intent" }));
    else if (state.step === "intent")
      setState((s) => ({ ...s, step: "product", editing: 0 }));
    else if (state.editing > 0) setState((s) => ({ ...s, step: "edit" }));
    else router.back();
  }
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (state.step === "product" && state.editing === 0) return false;
        back();
        return true;
      },
    );
    return () => subscription.remove();
  });
  const activeProducts =
    state.subtype === "compare" ? state.products : state.products.slice(0, 1);
  const attachments = (
    post ? state.products.slice(0, 1) : activeProducts
  ).flatMap((p) =>
    p.mediaIds
      .map((id) => media.find((m) => m.id === id))
      .filter((m): m is CreationMedia => !!m),
  );
  function spec(): CreationSpec {
    return normalizeCreationSpec({
      version: 1,
      subtype: state.subtype,
      products: post
        ? []
        : activeProducts.map((p) => ({
            id: p.id,
            name: p.name,
            url: p.url ? (detectProductUrl(p.url) ?? p.url) : undefined,
            details: productDetails(p.fields),
            media: p.mediaIds
              .map((id) => attachments.findIndex((m) => m.id === id))
              .filter((i) => i >= 0),
          })),
      options: post
        ? []
        : state.subtype === "compare"
          ? activeProducts.map((p) => ({
              id: p.id,
              label: p.name.trim(),
              productId: p.id,
            }))
          : state.options,
      description: state.description,
      location: state.location,
    })!;
  }
  function validateProduct(p: ProductDraft, first: boolean) {
    if (!post && !p.name.trim()) throw new Error("Enter a product name.");
    if (p.url.trim() && !detectProductUrl(p.url))
      throw new Error("Enter a valid public HTTPS product link.");
    if (
      first &&
      !p.mediaIds.some((id) => media.some((m) => m.id === id)) &&
      (post || !detectProductUrl(p.url))
    )
      throw new Error(
        post
          ? "Add photos or a video first."
          : "Add a product photo or link first.",
      );
    productDetails(p.fields);
  }
  function nextProduct() {
    try {
      validateProduct(current, state.editing === 0);
      setError("");
      setState((s) => ({
        ...s,
        step: post ? "edit" : !s.intentChosen ? "intent" : "edit",
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the product.");
    }
  }
  function preview() {
    try {
      if (post) validateProduct(state.products[0], true);
      if (post && !attachments.length) throw new Error("Add a photo or video.");
      if (!post) {
        activeProducts.forEach((p, i) => validateProduct(p, i === 0));
        if (!question.trim()) throw new Error("Write your poll question.");
      }
      if (budget.trim() && parsePrice(budget) === null)
        throw new Error("Enter a budget in whole rupees.");
      spec();
      setError("");
      setState((s) => ({ ...s, step: "preview" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check your content.");
    }
  }
  async function publish() {
    if (sending.current || !ready || !publishAvailable) return;
    try {
      const value = spec();
      if (post) validateProduct(state.products[0], true);
      if (post && !attachments.length) throw new Error("Add a photo or video.");
      sending.current = true;
      controller.current = new AbortController();
      setBusy(true);
      setError("");
      await store.save(draft);
      const first = value.products[0];
      const poll = await repo.createPoll(
        {
          contentKind: kind,
          requestId,
          signal: controller.current.signal,
          itemName: post
            ? question.trim().slice(0, 80) || "Fashion post"
            : first.name,
          priceInr:
            first?.details?.currency === "INR" &&
            Number.isInteger(first.details.price)
              ? (first.details.price ?? 0)
              : 0,
          question: question.trim(),
          media: attachments,
          productUrl: post
            ? (detectProductUrl(state.products[0].url) ?? undefined)
            : first?.url,
          productDetails:
            post && state.products[0]?.url
              ? productDetails(state.products[0].fields)
              : first?.details,
          category,
          creationSpec: value,
          useCase,
          priority,
          budgetInr: budget.trim()
            ? (parsePrice(budget) ?? undefined)
            : undefined,
        },
        (p) => {
          setProgress(p);
          if (p.stage === "publishing") setLocked(true);
        },
      );
      completed.current = true;
      await store.clear().catch(() => undefined);
      router.replace("/p/" + poll.id);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not publish. Your draft is kept; retry safely.",
      );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  const mock: Poll = {
    id: requestId,
    itemName: post ? "Fashion post" : state.products[0].name,
    priceInr:
      state.products[0]?.fields.currency === "INR"
        ? Number(state.products[0].fields.price) || 0
        : 0,
    question,
    productDetails: (() => {
      try {
        return state.products[0]?.url
          ? productDetails(state.products[0].fields)
          : undefined;
      } catch {
        return undefined;
      }
    })(),
    contentKind: kind,
    category,
    useCase,
    priority,
    budgetInr: budget.trim() ? (parsePrice(budget) ?? undefined) : undefined,
    imageUrl: attachments.find((m) => m.kind === "image")?.file.uri ?? null,
    media: attachments.map((m) => ({ kind: m.kind, value: m.file.uri })),
    isDemo: false,
    demoImage: null,
    createdAt: new Date().toISOString(),
    username,
    authorId: undefined,
    creationSpec: (() => {
      try {
        return spec();
      } catch {
        return undefined;
      }
    })(),
  };
  const title =
    state.step === "product"
      ? post
        ? "Create Post"
        : state.editing
          ? "Add another product"
          : "Add your product"
      : state.step === "intent"
        ? "What do you want to know?"
        : state.step === "preview"
          ? "Preview"
          : post
            ? "Write your caption"
            : state.subtype === "compare"
              ? "Which is better?"
              : "Worth It?";
  return (
    <Screen>
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            state.step === "intent" ? null : (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Appearance"
                  disabled={busy}
                  onPress={() =>
                    router.push({
                      pathname: "/settings/[section]",
                      params: { section: "appearance" },
                    })
                  }
                  style={{
                    width: 44,
                    height: 44,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <SocialIcon name="settings" />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    state.step === "preview"
                      ? "Publish from header"
                      : state.step === "product"
                        ? "Continue creation"
                        : "Preview content"
                  }
                  disabled={
                    busy ||
                    (state.step === "preview" ? !publishAvailable : locked)
                  }
                  onPress={() =>
                    state.step === "preview"
                      ? void publish()
                      : state.step === "product"
                        ? nextProduct()
                        : preview()
                  }
                  style={{
                    minHeight: 44,
                    paddingHorizontal: 10,
                    justifyContent: "center",
                    opacity: busy || locked ? 0.5 : 1,
                  }}
                >
                  <Text
                    style={{
                      color: colors.accentInk,
                      fontWeight: "700",
                      fontSize: 14,
                    }}
                  >
                    {busy
                      ? "Saving..."
                      : state.step === "preview"
                        ? "Publish"
                        : state.step === "product"
                          ? "Continue"
                          : "Preview"}
                  </Text>
                </Pressable>
              </View>
            ),
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={back}
              disabled={busy}
              style={{ padding: 10 }}
            >
              <View style={{ transform: [{ rotate: "180deg" }] }}>
                <SocialIcon name="arrow" />
              </View>
            </Pressable>
          ),
        }}
      />
      <Text style={type.small}>
        {post
          ? "Photos → Caption → Preview"
          : "Product → Poll or Compare → Details → Preview"}
      </Text>
      {note ? <Text style={type.small}>{note}</Text> : null}
      {error ? <Banner kind="error">{error}</Banner> : null}
      {!ready ? (
        <Text style={type.body}>Restoring draft...</Text>
      ) : (
        <>
          {state.step === "product" ? (
            <>
              {state.editing > 0 ? (
                <CreationSurface style={{ padding: 14 }}>
                  <Text style={type.small}>Already selected</Text>
                  <Text style={type.h2}>{state.products[0].name}</Text>
                </CreationSurface>
              ) : null}
              <ProductEditor
                key={current.id}
                product={current}
                media={media}
                setMedia={setMedia}
                disabled={busy || locked}
                post={post}
                update={(fn) =>
                  setState((s) => ({
                    ...s,
                    products: s.products.map((p) =>
                      p.id === current.id ? fn(p) : p,
                    ),
                  }))
                }
              />
              <Button label="Continue" disabled={busy} onPress={nextProduct} />
            </>
          ) : null}
          {state.step === "intent" ? (
            <>
              <CreationSurface style={{ padding: 16 }}>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 14,
                    alignItems: "center",
                  }}
                >
                  {mock.imageUrl ? (
                    <Image
                      source={{ uri: mock.imageUrl }}
                      style={{ width: 64, height: 80, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                  ) : null}
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text style={type.h2}>{state.products[0].name}</Text>
                    <Text style={type.small}>
                      {[
                        state.products[0].fields.brand,
                        state.products[0].fields.currency,
                        state.products[0].fields.price,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                </View>
              </CreationSurface>
              {[
                {
                  subtype: "opinion",
                  title: "Poll — Worth It?",
                  subtitle: "Ask if this product is worth buying.",
                  icon: "feed",
                },
                {
                  subtype: "compare",
                  title: "Compare",
                  subtitle: "Compare it with another product.",
                  icon: "grid",
                },
              ].map((option) => (
                <CreationSurface
                  key={option.subtype}
                  style={{
                    borderWidth: state.subtype === option.subtype ? 1 : 0,
                    borderColor: colors.accentInk,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={option.title}
                    disabled={busy}
                    onPress={() => {
                      setError("");
                      setQuestion(
                        option.subtype === "compare"
                          ? "Which one should I buy?"
                          : "Is this worth buying?",
                      );
                      setState((s) => ({
                        ...s,
                        subtype: option.subtype as "opinion" | "compare",
                        intentChosen: true,
                        products:
                          option.subtype === "compare" && s.products.length < 2
                            ? [...s.products, makeProduct()]
                            : s.products,
                        editing: option.subtype === "compare" ? 1 : 0,
                        step:
                          option.subtype === "compare" && s.products.length < 2
                            ? "product"
                            : "edit",
                      }));
                    }}
                    style={{ padding: 22, gap: 10 }}
                  >
                    <SocialIcon name={option.icon as "feed" | "grid"} />
                    <Text style={type.h2}>{option.title}</Text>
                    <Text style={type.small}>{option.subtitle}</Text>
                  </Pressable>
                </CreationSurface>
              ))}
            </>
          ) : null}
          {state.step === "edit" ? (
            <>
              {post ? (
                <>
                  <CreationBody
                    poll={{
                      ...mock,
                      creationSpec: {
                        version: 1,
                        subtype: "post",
                        products: [],
                        options: [],
                      },
                      question: "",
                    }}
                    preview
                  />
                  <Field
                    label="Caption"
                    placeholder="Tell us about your look..."
                    value={question}
                    onChangeText={setQuestion}
                    multiline
                    maxLength={2000}
                    editable={!busy && !locked}
                  />
                </>
              ) : (
                <>
                  <Field
                    label={
                      state.subtype === "compare"
                        ? "Comparison question"
                        : "Poll question"
                    }
                    value={question}
                    onChangeText={setQuestion}
                    maxLength={200}
                    editable={!busy && !locked}
                  />
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}
                  >
                    {activeProducts.map((p, i) => (
                      <CreationSurface
                        key={p.id}
                        style={{
                          flexBasis:
                            state.subtype === "compare" ? "45%" : "100%",
                          flexGrow: 1,
                          padding: 14,
                          gap: 8,
                        }}
                      >
                        <DraftProductCover product={p} media={media} />
                        <Text style={type.h2}>{p.name || "Add product"}</Text>
                        {p.fields.brand ? (
                          <Text style={type.small}>{p.fields.brand}</Text>
                        ) : null}
                        {p.fields.price ? (
                          <Text style={type.small}>
                            {p.fields.currency ? p.fields.currency + " " : ""}
                            {p.fields.price}
                            {!p.fields.currency ? " · currency unknown" : ""}
                          </Text>
                        ) : null}
                        <Button
                          variant="secondary"
                          label={"Edit product " + (i + 1)}
                          disabled={locked}
                          onPress={() =>
                            setState((s) => ({
                              ...s,
                              step: "product",
                              editing: i,
                            }))
                          }
                        />
                        {state.subtype === "compare" &&
                        activeProducts.length > 1 ? (
                          <Button
                            variant="quiet"
                            label={"Remove product " + (i + 1)}
                            disabled={locked}
                            onPress={() => {
                              setState((s) => ({
                                ...s,
                                products: s.products.filter(
                                  (v) => v.id !== p.id,
                                ),
                              }));
                              setMedia((old) =>
                                old.filter((m) => !p.mediaIds.includes(m.id)),
                              );
                            }}
                          />
                        ) : null}
                      </CreationSurface>
                    ))}
                  </View>
                  {state.subtype === "compare" ? (
                    <Button
                      label="Add another product"
                      variant="secondary"
                      disabled={activeProducts.length >= 4 || locked}
                      onPress={() =>
                        setState((s) => ({
                          ...s,
                          products: [...s.products, makeProduct()],
                          editing: s.products.length,
                          step: "product",
                        }))
                      }
                    />
                  ) : (
                    <CreationSurface style={{ padding: 16, gap: 10 }}>
                      <Text style={type.h2}>Voting options</Text>
                      {state.options.map((o, index) => (
                        <View key={o.id} style={{ gap: 5 }}>
                          <Field
                            label={"Option " + (index + 1)}
                            value={o.label}
                            maxLength={80}
                            editable={!locked}
                            onChangeText={(label) =>
                              setState((s) => ({
                                ...s,
                                options: s.options.map((v) =>
                                  v.id === o.id ? { ...v, label } : v,
                                ),
                              }))
                            }
                          />
                          {state.options.length > 2 ? (
                            <Button
                              variant="quiet"
                              label={"Remove option " + (index + 1)}
                              disabled={locked}
                              onPress={() =>
                                setState((s) => ({
                                  ...s,
                                  options: s.options.filter(
                                    (v) => v.id !== o.id,
                                  ),
                                }))
                              }
                            />
                          ) : null}
                        </View>
                      ))}
                      <Button
                        variant="secondary"
                        label="Add option"
                        disabled={state.options.length >= 4 || locked}
                        onPress={() =>
                          setState((s) => ({
                            ...s,
                            options: [
                              ...s.options,
                              { id: randomUUID(), label: "" },
                            ],
                          }))
                        }
                      />
                    </CreationSurface>
                  )}
                  <Field
                    label="Short description (optional)"
                    value={state.description}
                    onChangeText={(description) =>
                      setState((s) => ({ ...s, description }))
                    }
                    maxLength={500}
                    multiline
                    editable={!locked}
                  />
                </>
              )}
              <Button
                label={more ? "Hide More Options" : "More Options"}
                variant="quiet"
                onPress={() => setMore(!more)}
              />
              {more ? (
                <CreationSurface style={{ padding: 16, gap: 16 }}>
                  {post ? (
                    <Field
                      label="Location (optional)"
                      value={state.location}
                      maxLength={120}
                      editable={!locked}
                      onChangeText={(location) =>
                        setState((s) => ({ ...s, location }))
                      }
                    />
                  ) : null}
                  {post ? (
                    <Field
                      label="Product link (optional)"
                      value={state.products[0].url}
                      maxLength={2048}
                      autoCapitalize="none"
                      editable={!locked}
                      onChangeText={(url) =>
                        setState((s) => ({
                          ...s,
                          products: [{ ...s.products[0], url }],
                        }))
                      }
                    />
                  ) : null}
                  {!post ? (
                    <>
                      <Field
                        label="What will you use it for? (optional)"
                        placeholder="Work calls, daily walks..."
                        value={useCase}
                        onChangeText={setUseCase}
                        maxLength={120}
                        editable={!locked}
                      />
                      <Field
                        label="What matters most? (optional)"
                        value={priority}
                        onChangeText={setPriority}
                        maxLength={120}
                        editable={!locked}
                      />
                      <Field
                        label="Your budget (INR, optional)"
                        value={budget}
                        onChangeText={setBudget}
                        inputMode="numeric"
                        editable={!locked}
                      />
                    </>
                  ) : null}
                  <PollCategories
                    value={category}
                    onChange={(c) => setCategory(c ?? undefined)}
                  />
                  {post ? (
                    <Text style={type.small}>
                      Add hashtags in your caption. Product links are optional;
                      use a shopping Poll to attach independent product details.
                    </Text>
                  ) : null}
                </CreationSurface>
              ) : null}
              <Button label="Preview" onPress={preview} disabled={locked} />
            </>
          ) : null}
          {state.step === "preview" ? (
            <>
              <CreationSurface
                frost={false}
                style={{ gap: 14, paddingBottom: 16 }}
              >
                <PostIdentity poll={mock} mine={true} />
                <CreationBody
                  poll={mock}
                  preview
                  storeFacts={Object.fromEntries(
                    activeProducts
                      .filter(
                        (p) =>
                          p.intelligence &&
                          p.resolvedUrl === detectProductUrl(p.url),
                      )
                      .map((p) => [
                        p.id,
                        { value: p.intelligence!, manual: p.manual || [] },
                      ]),
                  )}
                />
                <View
                  style={{
                    flexDirection: "row",
                    gap: 18,
                    paddingHorizontal: 16,
                  }}
                >
                  <Text style={type.small}>☆ 0 Stars</Text>
                  <Text style={type.small}>Comments</Text>
                  <Text style={type.small}>Save</Text>
                </View>
              </CreationSurface>
              <Text style={type.small}>
                Preview · interactions become available after publishing.
              </Text>
              {progress ? (
                <Text style={type.small}>
                  {progress.stage} · {progress.completed}/{progress.total}
                </Text>
              ) : null}
              {locked ? (
                <Banner kind="info">
                  Retry checks this same publication. Your content is kept
                  unchanged until its result is confirmed.
                </Banner>
              ) : (
                <Button
                  label="Back to editing"
                  variant="secondary"
                  disabled={busy}
                  onPress={() => setState((s) => ({ ...s, step: "edit" }))}
                />
              )}
              {!publishAvailable ? (
                <Banner kind="info">
                  Connected publishing needs the creation database update. Your
                  draft stays saved on this device.
                </Banner>
              ) : null}
              <Button
                disabled={!publishAvailable}
                label={
                  post
                    ? "Publish Post"
                    : state.subtype === "compare"
                      ? "Publish Comparison"
                      : "Publish Poll"
                }
                loading={busy}
                onPress={() => {
                  void publish();
                }}
              />
              {busy && progress?.stage !== "publishing" ? (
                <Button
                  label="Pause upload"
                  variant="quiet"
                  onPress={() => controller.current?.abort()}
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}
export function ContentComposer({ kind }: { kind: "poll" | "post" }) {
  const { session } = useApp();
  return <Workspace key={kind + session.userId} kind={kind} />;
}
