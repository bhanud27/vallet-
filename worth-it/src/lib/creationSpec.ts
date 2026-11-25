import { normalizeProductDetails, type ProductDetails } from "./productDetails";
import { canonicalPollProductUrl } from "./validation";
export type CreationProduct = {
  id: string;
  name: string;
  url?: string;
  details?: ProductDetails;
  media: number[];
};
export type CreationOption = { id: string; label: string; productId?: string };
export type CreationSpec = {
  version: 1;
  subtype: "opinion" | "compare" | "post";
  products: CreationProduct[];
  options: CreationOption[];
  description?: string;
  location?: string;
};
const identifier = /^[a-zA-Z0-9_-]{1,64}$/;
export function normalizeCreationSpec(
  input?: CreationSpec,
): CreationSpec | undefined {
  if (input === undefined) return;
  if (
    !input ||
    input.version !== 1 ||
    !["opinion", "compare", "post"].includes(input.subtype) ||
    !Array.isArray(input.products) ||
    !Array.isArray(input.options) ||
    JSON.stringify(input).length > 40000
  )
    throw new Error("Invalid content setup.");
  const ids = new Set<string>(),
    media = new Set<number>();
  const products = input.products.map((product) => {
    if (
      !product ||
      typeof product.id!=="string" || !identifier.test(product.id) ||
      ids.has(product.id) ||
      typeof product.name !== "string" ||
      !product.name.trim() ||
      product.name.trim().length > 80 ||
      !Array.isArray(product.media) ||
      product.media.some(
        (i) => !Number.isInteger(i) || i < 0 || i >= 24 || media.has(i),
      )
    )
      throw new Error(
        "Each product needs a name, its own images and a unique ID.",
      );
    ids.add(product.id);
    for (const i of product.media) {
      if (media.has(i))
        throw new Error("An image cannot belong to two products.");
      media.add(i);
    }
    const url = product.url ? canonicalPollProductUrl(product.url) : undefined;
    if (product.url && !url) throw new Error("Check the product link.");
    return {
      id: product.id,
      name: product.name.trim(),
      media: [...product.media],
      ...(url ? { url } : {}),
      ...(product.details
        ? { details: normalizeProductDetails(product.details) }
        : {}),
    };
  });
  const optionIds = new Set<string>(),
    labels = new Set<string>();
  const options = input.options.map((option) => {
    if (
      !option ||
      typeof option.id!=="string" || !identifier.test(option.id) ||
      optionIds.has(option.id) ||
      typeof option.label !== "string" ||
      !option.label.trim() ||
      option.label.trim().length > 80 ||
      labels.has(option.label.trim().toLowerCase())
    )
      throw new Error("Use 2–4 distinct, nonempty voting options.");
    optionIds.add(option.id);
    labels.add(option.label.trim().toLowerCase());
    return {
      id: option.id,
      label: option.label.trim(),
      ...(option.productId ? { productId: option.productId } : {}),
    };
  });
  if (input.subtype === "post") {
    if (products.length || options.length)
      throw new Error("Posts do not have voting options.");
  } else {
    if (options.length < 2 || options.length > 4)
      throw new Error("Use 2–4 voting options.");
    if (
      input.subtype === "opinion" &&
      (products.length !== 1 || options.some((o) => o.productId))
    )
      throw new Error("An opinion poll uses one product.");
    if (
      input.subtype === "compare" &&
      (products.length < 2 ||
        products.length > 4 ||
        options.length !== products.length ||
        new Set(options.map((o) => o.productId)).size !== products.length ||
        options.some(
          (o) =>
            !products.some((p) => p.id === o.productId && p.name === o.label),
        ))
    )
      throw new Error(
        "Compare 2–4 products; each voting option must match its product.",
      );
  }
  for (const key of ["description", "location"] as const)
    if (
      input[key] !== undefined &&
      (typeof input[key] !== "string" ||
        input[key]!.length > (key === "description" ? 500 : 120))
    )
      throw new Error(
        "Keep descriptions to 500 characters and locations to 120.",
      );
  return {
    version: 1,
    subtype: input.subtype,
    products,
    options,
    ...(input.description?.trim()
      ? { description: input.description.trim() }
      : {}),
    ...(input.location?.trim() ? { location: input.location.trim() } : {}),
  };
}
export function optionResults(
  spec: CreationSpec,
  votes: { optionId?: string }[],
) {
  const total = votes.filter((v) =>
    spec.options.some((o) => o.id === v.optionId),
  ).length;
  return spec.options.map((option) => {
    const count = votes.filter((v) => v.optionId === option.id).length;
    return {
      ...option,
      count,
      percent: total ? Math.round((count / total) * 100) : 0,
    };
  });
}
