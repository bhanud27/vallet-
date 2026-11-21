export interface ProductDetails {
  description?: string;
  brand?: string;
  category?: string;
  currency?: string;
  price?: number;
}
export type ProductFields = {
  description: string;
  brand: string;
  category: string;
  currency: string;
  price: string;
};
export const productFieldLimits = {
  description: 2000,
  brand: 120,
  category: 160,
  currency: 3,
  price: 16,
};
export function productFields(value?: ProductDetails): ProductFields {
  return {
    description: value?.description ?? "",
    brand: value?.brand ?? "",
    category: value?.category ?? "",
    currency: value?.currency ?? "",
    price: value?.price?.toString() ?? "",
  };
}
export function resolveProductFields(
  imported?: ProductDetails,
  edits: Partial<ProductFields> = {},
): ProductFields {
  return { ...productFields(imported), ...edits };
}
export function productDetails(
  fields: ProductFields,
): ProductDetails | undefined {
  const result: ProductDetails = {};
  for (const key of ["description", "brand", "category"] as const) {
    const value = fields[key].trim();
    if (value.length > productFieldLimits[key])
      throw new Error(
        `Keep ${key} under ${productFieldLimits[key]} characters.`,
      );
    if (value) result[key] = value;
  }
  const currency = fields.currency.trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency))
    throw new Error("Use a three-letter currency code, for example INR.");
  if (currency) result.currency = currency;
  const raw = fields.price.trim().replace(/,/g, "");
  if (raw) {
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(raw) ||
      Number(raw) <= 0 ||
      Number(raw) > 10000000
    )
      throw new Error(
        "Enter a valid store price, with up to two decimal places.",
      );
    result.price = Number(raw);
  }
  return Object.keys(result).length ? result : undefined;
}
export function normalizeProductDetails(
  value?: ProductDetails,
): ProductDetails | undefined {
  return productDetails(productFields(value));
}
export function productPollCategory(
  category?: string,
): import("./types").PollCategory | undefined {
  if (!category) return;
  const text = category.toLowerCase();
  if (
    /shirt|dress|jeans|trouser|pant|fashion|clothing|apparel|footwear|shoe|sneaker|kurta|saree|jacket|hoodie|accessor/.test(
      text,
    )
  )
    return "fashion";
  if (/earbud|headphone|speaker|audio/.test(text)) return "audio";
  if (/electronic|laptop|phone|computer/.test(text)) return "electronics";
  if (/furniture|home|kitchen/.test(text)) return "home";
  if (/fitness|exercise|sport/.test(text)) return "fitness";
}
