import { ProductDetailsFields } from "../ui/ProductDetailsFields";
import {
  productDetails,
  productFields,
  type ProductFields,
} from "../lib/productDetails";
import React, { useCallback, useRef, useState } from "react";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { repo } from "../lib/repo";
import { socialRepo } from "../lib/socialRepo";
import { managePost } from "../lib/postManagement";
import { isThreadKind, type ThreadKind } from "../lib/comments";
import { parsePrice } from "../lib/validation";
import type { PostAction } from "../lib/postEdits";
import { useApp } from "../ui/AppContext";
import { Screen, Banner, Button, Field } from "../ui/kit";
import { useTheme } from "../ui/theme";

export default function ManagePost() {
  const { session } = useApp(),
    params = useLocalSearchParams<{
      kind?: string;
      id?: string;
      archived?: string;
    }>();
  return (
    <Editor
      key={session.userId + ":" + params.kind + ":" + params.id}
      kind={params.kind}
      id={params.id}
      archived={params.archived === "1"}
      userId={session.userId}
    />
  );
}
function Editor({
  kind,
  id,
  archived,
  userId,
}: {
  kind?: string;
  id?: string;
  archived: boolean;
  userId: string;
}) {
  const { type, colors } = useTheme();
  const [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [creationSpec, setCreationSpec] =
    useState<import("../lib/creationSpec").CreationSpec>();
  const [isPost, setIsPost] = useState(false);
  const [detailsFields, setDetailsFields] = useState<ProductFields>(() =>
    productFields(),
  );
  const [title, setTitle] = useState(""),
    [question, setQuestion] = useState(""),
    [price, setPrice] = useState(""),
    [url, setUrl] = useState("");
  const [isArchived, setArchived] = useState(archived),
    [confirmation, setConfirmation] = useState<PostAction | null>(null),
    [busy, setBusy] = useState(false);
  const working = useRef(false),
    active = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      active.current = true;
      setLoading(true);
      setReady(false);
      async function load() {
        if (!isThreadKind(kind) || !id)
          throw new Error("This post is unavailable.");
        if (kind === "poll") {
          const view = await repo.getPollView(id);
          if (!view?.isAuthor)
            throw new Error("Only the owner can manage this post.");
          const extras = (await repo.getPollExtras([id]))[id];
          if (live) {
            setIsPost(view.poll.contentKind === "post");
            setCreationSpec(view.poll.creationSpec);
            setTitle(view.poll.itemName);
            setDetailsFields(productFields(view.poll.productDetails));
            setQuestion(view.poll.question);
            setPrice(String(view.poll.priceInr));
            setUrl(extras?.productUrl || "");
            setArchived(!!view.poll.archivedAt);
          }
        } else {
          const reel = await socialRepo.getOwnedReel(userId, id);
          if (!reel) throw new Error("This check is unavailable.");
          if (live) {
            setTitle(reel.caption);
            setUrl(reel.productUrl || "");
            setArchived(!!reel.archivedAt);
          }
        }
        if (live) setReady(true);
      }
      void load()
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
      return () => {
        live = false;
        active.current = false;
      };
    }, [kind, id, userId]),
  );
  async function apply(action: PostAction) {
    if (
      !active.current ||
      working.current ||
      !ready ||
      !isThreadKind(kind) ||
      !id
    )
      return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const values =
        kind === "poll"
          ? {
              contentKind: isPost ? ("post" as const) : ("poll" as const),
              itemName: title,
              creationSpec,
              productDetails: productDetails(detailsFields) ?? {},
              question,
              priceInr: isPost ? 0 : (parsePrice(price) ?? 0),
              productUrl: url,
            }
          : { caption: title, productUrl: url };
      await managePost(
        kind as ThreadKind,
        id,
        action,
        action === "edit" ? values : undefined,
      );
      if (active.current)
        router.dismissTo(isArchived ? "/archive" : "/profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this change.");
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <Screen>
      <Text style={type.title}>
        Manage {kind === "reel" ? "check" : isPost ? "post" : "poll"}
      </Text>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {loading ? (
        <ActivityIndicator
          color={colors.accentInk}
          accessibilityLabel="Loading post details"
        />
      ) : null}
      {ready ? (
        <View style={{ gap: 18 }}>
          {isArchived ? (
            <Banner kind="info">Archived. Only you can see this post.</Banner>
          ) : null}
          {creationSpec ? (
            <Text style={type.small}>
              Published product details and voting options stay fixed. You can
              edit the question or caption and manage this content below.
            </Text>
          ) : null}
          {!isPost && !creationSpec && (
            <Field
              label={kind === "poll" ? "Item name" : "Caption"}
              accessibilityLabel={kind === "poll" ? "Item name" : "Caption"}
              value={title}
              onChangeText={setTitle}
              maxLength={kind === "poll" ? 80 : 180}
              multiline={kind === "reel"}
              editable={!busy}
            />
          )}
          {kind === "poll" ? (
            <>
              {creationSpec ? (
                <Text style={type.small}>
                  Published product details and voting options stay fixed. You
                  can edit the question or caption and manage this content
                  below.
                </Text>
              ) : null}
              {!isPost && !creationSpec && (
                <Field
                  label="Asking price (INR)"
                  accessibilityLabel="Asking price"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="number-pad"
                  editable={!busy}
                />
              )}
              <Field
                label={isPost ? "Caption" : "Your question"}
                accessibilityLabel={isPost ? "Caption" : "Your question"}
                value={question}
                onChangeText={setQuestion}
                maxLength={isPost ? 2000 : 200}
                multiline
                editable={!busy}
              />
            </>
          ) : null}
          <Field
            label="Product link (optional)"
            accessibilityLabel="Product link"
            value={url}
            onChangeText={setUrl}
            maxLength={2048}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy && (!creationSpec || isPost)}
          />
          {kind === "poll" && !isPost && !creationSpec && (
            <ProductDetailsFields
              value={detailsFields}
              onChange={(key, value) =>
                setDetailsFields((current) => ({ ...current, [key]: value }))
              }
              disabled={busy}
            />
          )}
          <Text style={type.small}>
            {kind === "poll"
              ? "Existing votes, comments and photos stay with the poll."
              : "Existing likes, comments and video stay with the check."}
          </Text>
          <Button
            label="Save changes"
            onPress={() => void apply("edit")}
            loading={busy}
            disabled={!!confirmation}
          />
          <Button
            label={isArchived ? "Restore post" : "Archive post"}
            variant="secondary"
            disabled={busy || !!confirmation}
            onPress={() => setConfirmation(isArchived ? "restore" : "archive")}
          />
          <Button
            label="Delete post"
            variant="quiet"
            disabled={busy || !!confirmation}
            onPress={() => setConfirmation("delete")}
          />
          {confirmation ? (
            <View
              style={{
                gap: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 16,
              }}
            >
              <Text style={type.h2}>
                {confirmation === "delete"
                  ? "Delete this post permanently?"
                  : confirmation === "restore"
                    ? "Restore this post?"
                    : "Archive this post?"}
              </Text>
              <Text style={type.body}>
                {confirmation === "delete"
                  ? "This removes the post and its votes, likes, comments and saved references. This cannot be undone."
                  : confirmation === "restore"
                    ? "It will appear on your profile and in eligible feeds again."
                    : "It will disappear from feeds, search and your profile. You can restore it from Archive."}
              </Text>
              <Button
                label={
                  confirmation === "delete"
                    ? "Delete permanently"
                    : confirmation === "restore"
                      ? "Confirm restore"
                      : "Confirm archive"
                }
                onPress={() => void apply(confirmation)}
                loading={busy}
              />
              <Button
                label="Cancel"
                variant="secondary"
                disabled={busy}
                onPress={() => setConfirmation(null)}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}
