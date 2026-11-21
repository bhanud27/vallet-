import { normalizeProductDetails, type ProductDetails } from "./productDetails";
import { validatePollDetails, parseProductUrl } from "./validation";
export interface PostCursor {
  time: string;
  id: string;
}
export type PostAction = "edit" | "archive" | "restore" | "delete";
export interface PollEdit {
  productDetails?: ProductDetails;
  creationSpec?: import("./creationSpec").CreationSpec;
  contentKind?: "poll" | "post";
  itemName: string;
  priceInr: number;
  question: string;
  productUrl: string;
}
export interface ReelEdit {
  caption: string;
  productUrl: string;
}
export function pollEdit(
  values?: PollEdit,
  storedKind?: "poll" | "post",
): PollEdit {
  if (!values) throw new Error("Enter the poll details.");
  const contentKind = storedKind ?? values.contentKind ?? "poll";
  validatePollDetails({ ...values, contentKind });
  return {
    ...(contentKind === "post" ? { contentKind } : {}),
    ...(values.creationSpec ? { creationSpec: values.creationSpec } : {}),
    priceInr: contentKind === "post" ? 0 : values.priceInr,
    ...(values.productDetails
      ? { productDetails: normalizeProductDetails(values.productDetails) ?? {} }
      : {}),
    itemName:
      contentKind === "post"
        ? values.question.trim().slice(0, 80) || "Fashion post"
        : values.itemName.trim(),
    question: values.question.trim(),
    productUrl: values.productUrl
      ? parseProductUrl(values.productUrl) || ""
      : "",
  };
}
export function reelEdit(values?: ReelEdit): ReelEdit {
  if (!values) throw new Error("Enter the check details.");
  const caption = values.caption.trim();
  if (caption.length > 180)
    throw new Error("Keep your caption under 180 characters.");
  const productUrl = values.productUrl.trim()
    ? parseProductUrl(values.productUrl)
    : "";
  if (productUrl === null) throw new Error("Enter a valid HTTPS product link.");
  return { caption, productUrl };
}
export function postAction(action: PostAction) {
  if (!["edit", "archive", "restore", "delete"].includes(action))
    throw new Error("Invalid post action.");
}
export function postMutationError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST202" || error.code === "PGRST204")
    return new Error(
      "Post management is not available on the server yet. Please try again later.",
    );
  if (error.code === "42501")
    return new Error("Only the owner can manage this post.");
  if (error.code === "P0002")
    return new Error("This post is no longer available.");
  if (error.code?.startsWith("22") || error.code === "23514")
    return new Error("Check the details and product link, then try again.");
  return new Error(
    "Could not save this change. Check your connection and try again.",
  );
}
