export const notificationLabels = {
  new_votes: "New votes",
  poll_results: "Poll results",
  poll_comments: "Poll comments",
  poll_stars: "Poll Stars",
  new_followers: "New followers",
  follow_requests: "Follow requests",
  mentions: "Mentions and tags",
  content_stars: "Stars on Posts and Checks",
  content_comments: "Content comments",
  relevant_activity: "Relevant activity",
  feature_announcements: "Feature announcements",
  important_updates: "Important updates",
} as const;
export type Audience = "everyone" | "followers" | "nobody";
export interface AccountPreferences {
  comments_audience: Audience;
  mentions_audience: Audience;
  hidden_words: string[];
  notification_types: Partial<Record<keyof typeof notificationLabels, boolean>>;
  preferred_categories: string[];
  preferred_brands: string[];
  preferred_styles: string[];
  autoplay: boolean;
  data_saver: boolean;
  language: "en";
}
export const defaultPreferences = (): AccountPreferences => ({
  comments_audience: "everyone",
  mentions_audience: "everyone",
  hidden_words: [],
  notification_types: {},
  preferred_categories: [],
  preferred_brands: [],
  preferred_styles: [],
  autoplay: true,
  data_saver: false,
  language: "en",
});
export function validatePreferences(patch: Partial<AccountPreferences>) {
  const allowed = Object.keys(defaultPreferences());
  if (Object.keys(patch).some((k) => !allowed.includes(k)))
    throw new Error("Unsupported setting.");
  for (const key of ["comments_audience", "mentions_audience"] as const)
    if (
      key in patch &&
      !["everyone", "followers", "nobody"].includes(patch[key]!)
    )
      throw new Error("Choose a valid audience.");
  for (const key of [
    "hidden_words",
    "preferred_categories",
    "preferred_brands",
    "preferred_styles",
  ] as const) {
    const values = patch[key];
    if (
      values !== undefined &&
      (!Array.isArray(values) ||
        values.length > (key === "hidden_words" ? 50 : 25) ||
        values.some(
          (v) =>
            typeof v !== "string" ||
            !v.trim() ||
            v.length > (key === "hidden_words" ? 40 : 60),
        ))
    )
      throw new Error(
        "Use up to 50 hidden words or 25 preferences, with short nonempty values.",
      );
  }
  for (const key of ["autoplay", "data_saver"] as const)
    if (key in patch && typeof patch[key] !== "boolean")
      throw new Error("Invalid playback preference.");
  if (patch.language !== undefined && patch.language !== "en")
    throw new Error("English is the supported language.");
  if (
    patch.notification_types &&
    Object.entries(patch.notification_types).some(
      ([k, v]) => !(k in notificationLabels) || typeof v !== "boolean",
    )
  )
    throw new Error("Invalid notification preference.");
}
export function preferenceScore(value: AccountPreferences, text: string) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return [
    ...value.preferred_categories,
    ...value.preferred_brands,
    ...value.preferred_styles,
  ].filter((word) =>
    normalized.includes(word.toLowerCase().replace(/[^a-z0-9]/g, "")),
  ).length;
}
