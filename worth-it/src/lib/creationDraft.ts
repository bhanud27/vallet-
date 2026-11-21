import type { DraftMedia } from "./draftStore";
import type { ProductFields } from "./productDetails";
export type ProductDraft = {
  id: string;
  name: string;
  url: string;
  fields: ProductFields;
  mediaIds: string[];
  resolvedUrl?: string;
  manual?: string[];
  intelligence?: import("./productPreview").ProductIntelligence;
};
export type CreationDraft = {
  step: "product" | "intent" | "edit" | "preview";
  subtype: "opinion" | "compare" | "post";
  products: ProductDraft[];
  options: { id: string; label: string }[];
  description: string;
  location: string;
  editing: number;
  intentChosen?: boolean;
};
export type CreationMedia = DraftMedia;
