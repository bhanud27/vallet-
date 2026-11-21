export const settingsGroups = [
  {
    title: "Account",
    items: [
      { key: "personal", label: "Personal Information", icon: "person" },
      { key: "security", label: "Password & Security", icon: "settings" },
      { key: "privacy", label: "Privacy & Account Visibility", icon: "person" },
    ],
  },
  {
    title: "Preferences",
    items: [
      { key: "appearance", label: "Appearance", icon: "photo" },
      { key: "notifications", label: "Notifications", icon: "bell" },
      { key: "language", label: "Language", icon: "message" },
      { key: "content", label: "Content Preferences", icon: "grid" },
    ],
  },
  {
    title: "Your Activity",
    items: [
      { key: "archive", label: "Archive", icon: "list" },
      { key: "saved", label: "Saved Content", icon: "grid" },
      { key: "stars", label: "Your Stars", icon: "photo" },
      { key: "polls", label: "Poll Activity", icon: "feed" },
      { key: "comments", label: "Your Comments", icon: "message" },
    ],
  },
  {
    title: "Support & Information",
    items: [
      { key: "help", label: "Help & Support", icon: "message" },
      { key: "report", label: "Report a Problem", icon: "message" },
      { key: "guidelines", label: "Community Guidelines", icon: "list" },
      { key: "terms", label: "Terms of Service", icon: "list" },
      { key: "policy", label: "Privacy Policy", icon: "person" },
      { key: "about", label: "About Worth It", icon: "photo" },
    ],
  },
  {
    title: "Account Actions",
    items: [
      { key: "logout", label: "Log Out", icon: "arrow" },
      { key: "deactivate", label: "Deactivate Account", icon: "person" },
      { key: "delete", label: "Delete Account", icon: "person" },
    ],
  },
] as const;
export type SettingsKey =
  (typeof settingsGroups)[number]["items"][number]["key"];
export const settingsTitle = (key: string) =>
  settingsGroups
    .flatMap((group) => [...group.items])
    .find((item) => item.key === key)?.label ?? "Settings";
