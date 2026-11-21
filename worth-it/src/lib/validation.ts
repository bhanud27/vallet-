import { normalizeCreationSpec } from "./creationSpec";
import { normalizeProductDetails } from "./productDetails";
import {
  AppError,
  CHOICES,
  MAX_POLL_MEDIA,
  NewPollInput,
  POLL_CATEGORIES,
  PurchaseUpdate,
  UpdateInput,
  VoteInput,
} from "./types";

export const LIMITS = {
  itemName: 80,
  question: 200,
  reason: 280,
  review: 280,
  url: 500,
  productUrl: 2048,
  shoppingContext: 120,
  maxPriceInr: 10_000_000,
};

export function parsePrice(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n > 0 && n <= LIMITS.maxPriceInr ? n : null;
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseProductUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > LIMITS.productUrl) return null;
  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      !url.hostname.includes(".") ||
      /^[\d.]+$/.test(url.hostname) ||
      /\.(local|internal|localhost|home|lan)\.?$/i.test(url.hostname)
    )
      return null;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_/i.test(key) || /^(gclid|fbclid|msclkid)$/i.test(key))
        url.searchParams.delete(key);
    }
    return url.href.length <= LIMITS.productUrl ? url.href : null;
  } catch {
    return null;
  }
}

export function detectProductUrl(value: string): string | null {
  const text = value.trim();
  const secure = (url: string) =>
    parseProductUrl(url.replace(/^http:\/\//i, "https://"));
  if (!/\s/.test(text)) return secure(text);
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'\u201c\u201d]+/gi)) {
    const url = secure(match[0].replace(/[.,!?;:)\]}]+$/g, ""));
    if (url) return url;
  }
  return null;
}

export function validatePollDetails(input: NewPollInput): void {
  normalizeProductDetails(input.productDetails);
  const spec = normalizeCreationSpec(input.creationSpec);
  if (spec && (spec.subtype === "post") !== (input.contentKind === "post"))
    throw new AppError("invalid", "Content type does not match its setup.");
  if (
    spec?.products.some((p) =>
      p.media.some(
        (index) => input.media && !["image","video"].includes(input.media[index]?.kind??""),
      ),
    )
  )
    throw new AppError("invalid", "Select the product photos again.");
  const name = input.itemName.trim();
  const q = input.question.trim();
  if (!name) throw new AppError("invalid", "Enter the item name.");
  if (name.length > LIMITS.itemName)
    throw new AppError(
      "invalid",
      `Item name must be ${LIMITS.itemName} characters or fewer.`,
    );
  if (
    input.contentKind !== "post" &&
    !spec &&
    (!Number.isInteger(input.priceInr) ||
      input.priceInr <= 0 ||
      input.priceInr > LIMITS.maxPriceInr)
  )
    throw new AppError(
      "invalid",
      "Enter the asking price in rupees, for example 2499.",
    );
  if (input.contentKind !== "post" && !q)
    throw new AppError("invalid", "Write the question you want answered.");
  if (q.length > (input.contentKind === "post" ? 2000 : LIMITS.question))
    throw new AppError(
      "invalid",
      `Question must be ${LIMITS.question} characters or fewer.`,
    );
  if (input.category && !Object.hasOwn(POLL_CATEGORIES, input.category))
    throw new AppError("invalid", "Choose a valid category.");
  if (
    [input.useCase, input.priority].some(
      (value) => (value?.trim().length ?? 0) > LIMITS.shoppingContext,
    )
  )
    throw new AppError(
      "invalid",
      "Keep shopping details to 120 characters each.",
    );
  if (
    input.budgetInr !== undefined &&
    parsePrice(String(input.budgetInr)) === null
  )
    throw new AppError("invalid", "Enter your budget in whole rupees.");
  if (input.productUrl && !parseProductUrl(input.productUrl))
    throw new AppError("invalid", "Enter a valid HTTPS product link.");
}

export function validatePoll(input: NewPollInput): void {
  validatePollDetails(input);
  if (input.contentKind === "post" && !input.photo && !input.media?.length)
    throw new AppError("invalid", "Add a photo or video to your post.");
  if ((input.media?.length ?? 0) > MAX_POLL_MEDIA)
    throw new AppError("invalid", `Add up to ${MAX_POLL_MEDIA} media items.`);
  if (
    input.media?.some(
      (item) => item.sourceUrl && !parseProductUrl(item.sourceUrl),
    )
  ) {
    throw new AppError(
      "invalid",
      "An imported image has an invalid product link.",
    );
  }
  if (!input.photo && !input.media?.length && !input.productUrl)
    throw new AppError("invalid", "Add one product photo.");
}

export function validateVote(input: VoteInput): void {
  if (
    input.optionId
      ? !/^[a-zA-Z0-9_-]{1,64}$/.test(input.optionId) || input.choice !== null
      : !input.choice || !CHOICES.includes(input.choice)
  )
    throw new AppError("invalid", "Pick Buy, Wait for a sale, or Skip.");
  if (input.reason.trim().length > LIMITS.reason)
    throw new AppError(
      "invalid",
      `Reason must be ${LIMITS.reason} characters or fewer.`,
    );
}

export function validateUpdate(input: UpdateInput): void {
  if (!["bought", "passed", "returned"].includes(input.status))
    throw new AppError("invalid", "Choose Bought, Passed, or Returned.");
  if (input.status === "passed") return;
  if (
    input.pricePaidInr === null ||
    !Number.isInteger(input.pricePaidInr) ||
    input.pricePaidInr <= 0 ||
    input.pricePaidInr > LIMITS.maxPriceInr
  )
    throw new AppError(
      "invalid",
      "Enter the price you actually paid, in rupees.",
    );
  if (input.review.trim().length > LIMITS.review)
    throw new AppError(
      "invalid",
      `Review must be ${LIMITS.review} characters or fewer.`,
    );
  if (input.status === "returned" && !input.review.trim())
    throw new AppError("invalid", "Tell shoppers why you returned it.");
  if (input.status === "returned") return;
  const url = input.storeUrl.trim();
  if (url) {
    if (url.length > LIMITS.url || !isHttpUrl(url))
      throw new AppError(
        "invalid",
        "Store link must start with http:// or https://.",
      );
  }
  if (input.isAffiliate && !url)
    throw new AppError(
      "invalid",
      "Add the store link before marking it as an affiliate link.",
    );
}

/** Normalised values stored for an update (passed updates carry no price, review or link). */
export function normaliseUpdate(
  input: UpdateInput,
): Omit<PurchaseUpdate, "updatedAt" | "purchasedAt"> {
  if (input.status === "passed") {
    return {
      status: "passed" as const,
      pricePaidInr: null,
      review: null,
      storeUrl: null,
      isAffiliate: false,
    };
  }
  const url = input.storeUrl.trim();
  return {
    status: input.status,
    pricePaidInr: input.pricePaidInr,
    review: input.review.trim() || null,
    storeUrl: input.status === "bought" ? url || null : null,
    isAffiliate: input.status === "bought" && !!url && input.isAffiliate,
    ...(input.status === "bought" && input.wouldBuyAgain !== undefined
      ? { wouldBuyAgain: input.wouldBuyAgain }
      : {}),
  };
}
