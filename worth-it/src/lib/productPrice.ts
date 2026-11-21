import type { Poll } from "./types";
// Store currency stays explicit; a missing currency is never converted to INR.
export function pollDisplayPrice(poll: Poll) {
  const details =
    poll.productDetails ?? poll.creationSpec?.products[0]?.details;
  if (
    details?.price != null &&
    Number.isFinite(details.price) &&
    details.price > 0
  )
    return {
      price: details.price,
      currency: details.currency || null,
      label: "Store",
    };
  return poll.priceInr > 0
    ? { price: poll.priceInr, currency: "INR", label: "Asking" }
    : null;
}
export function formatProductPrice(price: number, currency: string | null) {
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency,
        minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(price);
    } catch {
      /* Keep an explicit unknown currency below. */
    }
  }
  return (
    price.toLocaleString("en-IN", { maximumFractionDigits: 2 }) +
    " (currency unknown)"
  );
}
