import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { ProductWebViewImporter } from "../components/ProductWebViewImporter";
import { formatInr, timeAgo } from "../lib/format";
import { repo } from "../lib/repo";
import { Poll, PurchaseStatus, PurchaseUpdate } from "../lib/types";
import { detectProductImportUrl, LIMITS, parsePrice } from "../lib/validation";
import { manualProductMessage, useProductImport } from "../lib/useProductImport";
import { Banner, Button, Field } from "./kit";
import { useTheme } from "./theme";

export const AFFILIATE_DISCLOSURE =
  "Affiliate link: the author may earn a commission if you buy through it.";
const OUTCOME_LABEL: Record<PurchaseStatus, string> = {
  bought: "Bought",
  passed: "Passed",
  returned: "Returned",
};

function UpdateCard({ poll, update }: { poll: Poll; update: PurchaseUpdate }) {
  const { colors, type } = useTheme();

  const bought = update.status === "bought";
  const diff =
    update.pricePaidInr !== null ? poll.priceInr - update.pricePaidInr : 0;
  return (
    <View
      testID="update-card"
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 14,
        gap: 8,
        borderWidth: 2,
        borderColor: bought ? colors.buy : colors.skip,
      }}
    >
      <Text style={type.h2}>{OUTCOME_LABEL[update.status]}</Text>
      {update.status !== "passed" ? (
        <>
          <Text style={type.body} testID="paid-line">
            Asked {formatInr(poll.priceInr)}. Paid{" "}
            <Text style={{ fontWeight: "800" }}>
              {formatInr(update.pricePaidInr ?? 0)}
            </Text>
            {diff > 0
              ? ` (${formatInr(diff)} less)`
              : diff < 0
                ? ` (${formatInr(-diff)} more)`
                : ""}
            .
          </Text>
          {update.review ? (
            <Text style={type.body} testID="review-text">
              “{update.review}”
            </Text>
          ) : null}
          {bought && update.wouldBuyAgain != null ? (
            <Banner kind={update.wouldBuyAgain ? "ok" : "info"}>
              {update.wouldBuyAgain
                ? "Would buy again at this price."
                : "Would pass at this price."}
            </Banner>
          ) : null}
          {bought && update.storeUrl ? (
            <View style={{ gap: 6 }}>
              <Pressable
                testID="store-link"
                accessibilityRole="link"
                onPress={() => Linking.openURL(update.storeUrl!)}
                style={{ minHeight: 48, justifyContent: "center" }}
              >
                <Text
                  style={{
                    color: colors.wait,
                    fontSize: 16,
                    fontWeight: "800",
                    textDecorationLine: "underline",
                  }}
                >
                  Open store link
                </Text>
              </Pressable>
              <Text style={type.small} numberOfLines={1}>
                {update.storeUrl}
              </Text>
              {update.isAffiliate ? (
                <Banner kind="warn" testID="affiliate-disclosure">
                  {AFFILIATE_DISCLOSURE}
                </Banner>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={type.body}>The author decided not to buy this one.</Text>
      )}
      <Text style={type.small}>Updated {timeAgo(update.updatedAt)}</Text>
    </View>
  );
}

function UpdateForm({
  poll,
  existing,
  onSaved,
  onCancel,
}: {
  poll: Poll;
  existing: PurchaseUpdate | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { colors, type } = useTheme();

  const [status, setStatus] = useState<PurchaseStatus | null>(
    existing?.status ?? null,
  );
  const [paid, setPaid] = useState(
    existing?.pricePaidInr
      ? String(existing.pricePaidInr)
      : String(poll.priceInr),
  );
  const [review, setReview] = useState(
    existing?.status === "bought" ? (existing.review ?? "") : "",
  );
  const [returnReason, setReturnReason] = useState(
    existing?.status === "returned" ? (existing.review ?? "") : "",
  );
  const [wouldBuyAgain, setWouldBuyAgain] = useState<
    boolean | null | undefined
  >(existing?.wouldBuyAgain ?? undefined);
  const [url, setUrl] = useState(existing?.storeUrl ?? "");
  const [affiliate, setAffiliate] = useState(existing?.isAffiliate ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<{ url: string; key: number }>();
  const [priceHint, setPriceHint] = useState<number | null>(null);
  const link = detectProductImportUrl(url);
  const { phase, deviceUrl, finishDevice } = useProductImport({
    url: link,
    enabled: status === "bought" && !busy && !!attempt && attempt.url === link,
    attempt,
    onPreview(preview, _source, requestUrl) {
      if (requestUrl === link && preview.currency === "INR" && preview.price && Number.isInteger(preview.price))
        setPriceHint(preview.price);
    },
    onManual() {},
  });

  async function save() {
    if (!status) return setError("Choose Bought, Passed, or Returned first.");
    const pricePaid = status === "passed" ? null : parsePrice(paid);
    if (status !== "passed" && pricePaid === null)
      return setError("Enter the price you actually paid, in rupees.");
    setBusy(true);
    setError(null);
    try {
      await repo.savePurchaseUpdate(poll.id, {
        status,
        pricePaidInr: pricePaid,
        review: status === "returned" ? returnReason : review,
        storeUrl: url,
        isAffiliate: affiliate,
        wouldBuyAgain,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View
      testID="update-form"
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 14,
        gap: 12,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={type.h2}>What did you decide?</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {(Object.keys(OUTCOME_LABEL) as PurchaseStatus[]).map((st) => (
          <Button
            key={st}
            testID={`status-${st}`}
            style={{ flexGrow: 1 }}
            disabled={busy}
            variant={status === st ? "primary" : "secondary"}
            label={OUTCOME_LABEL[st]}
            onPress={() => {
              setStatus(st);
              setError(null);
            }}
          />
        ))}
      </View>
      {status && status !== "passed" && (
        <Field
          testID="paid-input"
          label="Price you paid (₹)"
          value={paid}
          onChangeText={setPaid}
          editable={!busy}
          keyboardType="number-pad"
          inputMode="numeric"
        />
      )}
      {status === "returned" && (
        <Field
          label="Why did you return it?"
          value={returnReason}
          onChangeText={setReturnReason}
          maxLength={LIMITS.review}
          multiline
          editable={!busy}
        />
      )}
      {status === "bought" ? (
        <>
          <Text style={type.h2}>Would you buy it again at that price?</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              label="Yes"
              style={{ flex: 1 }}
              variant={wouldBuyAgain === true ? "primary" : "secondary"}
              disabled={busy}
              onPress={() =>
                setWouldBuyAgain(wouldBuyAgain === true ? null : true)
              }
            />
            <Button
              label="No"
              style={{ flex: 1 }}
              variant={wouldBuyAgain === false ? "primary" : "secondary"}
              disabled={busy}
              onPress={() =>
                setWouldBuyAgain(wouldBuyAgain === false ? null : false)
              }
            />
          </View>
          {wouldBuyAgain == null && (
            <Text style={type.small}>
              You can answer after you’ve used it for a while.
            </Text>
          )}
          <Field
            testID="review-input"
            label="Short review (optional)"
            value={review}
            onChangeText={setReview}
            maxLength={LIMITS.review}
            multiline
            hint={`${review.length}/${LIMITS.review}`}
          />
          <Field
            testID="url-input"
            label="Store link (optional)"
            value={url}
            onChangeText={(value) => {
              setUrl(value);
              setAttempt(undefined);
              setPriceHint(null);
            }}
            autoCapitalize="none"
            keyboardType="url"
            autoComplete="off"
            placeholder="https://example.com/product"
          />
          {link ? (
            <Button variant="quiet" label="Look up store price"
              disabled={busy || phase === "loading" || phase === "device"}
              onPress={() => setAttempt({ url: link, key: (attempt?.key ?? 0) + 1 })} />
          ) : null}
          {phase === "failed" ? <Text style={type.small}>{manualProductMessage}</Text> : null}
          {priceHint && phase !== "loading" && phase !== "device" ? (
            <Button variant="quiet" disabled={busy} label={`Use ${formatInr(priceHint)} as the price paid`}
              onPress={() => { setPaid(String(priceHint)); setPriceHint(null); }} />
          ) : null}
          <Pressable
            testID="affiliate-toggle"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: affiliate, disabled: !url.trim() }}
            onPress={() => url.trim() && setAffiliate(!affiliate)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              minHeight: 48,
              opacity: url.trim() ? 1 : 0.5,
            }}
          >
            <View
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                borderWidth: 2,
                borderColor: colors.ink,
                backgroundColor:
                  affiliate && url.trim() ? colors.ink : colors.surface,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {affiliate && url.trim() ? (
                <Text style={{ color: colors.onStrong, fontWeight: "900" }}>
                  ✓
                </Text>
              ) : null}
            </View>
            <Text style={[type.body, { flex: 1 }]}>
              This is an affiliate link (I may earn a commission)
            </Text>
          </Pressable>
          {affiliate && url.trim() ? (
            <Banner kind="info">
              Visitors will see this next to your link: “{AFFILIATE_DISCLOSURE}”
            </Banner>
          ) : null}
        </>
      ) : null}
      {error ? (
        <Banner kind="error" testID="update-error">
          {error}
        </Banner>
      ) : null}
      {deviceUrl ? <ProductWebViewImporter key={deviceUrl} url={deviceUrl} onFinish={finishDevice} /> : null}
      <Button
        testID="save-update"
        label={busy ? "Saving…" : existing ? "Save changes" : "Post update"}
        loading={busy}
        onPress={save}
      />
      {onCancel ? (
        <Button variant="quiet" label="Cancel" onPress={onCancel} />
      ) : null}
    </View>
  );
}

export function UpdateSection({
  poll,
  update,
  isAuthor,
  onChanged,
}: {
  poll: Poll;
  update: PurchaseUpdate | null;
  isAuthor: boolean;
  onChanged: () => void;
}) {
  const { type } = useTheme();

  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
    }, []),
  );
  if (update && !editing) {
    const due =
      update.status === "bought" &&
      update.wouldBuyAgain == null &&
      now - Date.parse(update.purchasedAt ?? update.updatedAt) >= 7 * 86400_000;
    return (
      <View style={{ gap: 10 }}>
        <Text style={type.h2}>Purchase update</Text>
        <UpdateCard poll={poll} update={update} />
        {isAuthor && due && (
          <Banner kind="info">
            It’s been a week. Would you buy it again at that price?
          </Banner>
        )}
        {isAuthor ? (
          <Button
            testID="edit-update"
            variant="secondary"
            label="Edit update"
            onPress={() => setEditing(true)}
          />
        ) : null}
      </View>
    );
  }
  if (isAuthor) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={type.h2}>Purchase update</Text>
        <UpdateForm
          poll={poll}
          existing={update}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
          onCancel={update ? () => setEditing(false) : undefined}
        />
      </View>
    );
  }
  return null;
}
