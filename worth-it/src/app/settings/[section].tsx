import React from "react";
import { useApp } from "../../ui/AppContext";
import { Stack, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { settingsTitle } from "../../lib/settingsCatalog";
import { Screen } from "../../ui/kit";
import { useTheme } from "../../ui/theme";
import { AppearanceSettings } from "../../ui/AppearanceSettings";
import { PersonalSettings } from "../../ui/settings/PersonalSettings";
import { SecuritySettings } from "../../ui/settings/SecuritySettings";
import { InfoSettings } from "../../ui/settings/InfoSettings";
import { ReportSettings } from "../../ui/settings/ReportSettings";
import { AccountActions } from "../../ui/settings/AccountActions";
import { PreferenceSettings } from "../../ui/settings/PreferenceSettings";
import { RelationshipSettings } from "../../ui/settings/PrivacySettings";
import { ActivitySettings } from "../../ui/settings/ActivitySettings";
import { LocalTools } from "../../ui/settings/LocalTools";
export default function SettingsPage() {
  const { section } = useLocalSearchParams<{ section: string }>(),
    { type } = useTheme();
  const { session } = useApp();
  return (
    <Screen>
      <Stack.Screen
        options={{
          title: section === "demo" ? "Demo tools" : settingsTitle(section),
        }}
      />
      <React.Fragment key={session.userId + section}>
        {section === "personal" ? (
          <PersonalSettings />
        ) : section === "security" ? (
          <SecuritySettings />
        ) : section === "appearance" ? (
          <AppearanceSettings />
        ) : section === "language" ? (
          <>
            <Text style={type.h2}>English</Text>
            <Text style={type.body}>
              Worth It currently supports English. Additional language packs are
              not available.
            </Text>
          </>
        ) : section === "privacy" ||
          section === "notifications" ||
          section === "content" ? (
          <PreferenceSettings section={section} />
        ) : section === "blocked" || section === "muted" ? (
          <RelationshipSettings muted={section === "muted"} />
        ) : section === "saved" ||
          section === "stars" ||
          section === "polls" ||
          section === "comments" ? (
          <ActivitySettings section={section} />
        ) : section === "logout" ||
          section === "deactivate" ||
          section === "delete" ? (
          <AccountActions action={section} />
        ) : section === "help" ||
          section === "guidelines" ||
          section === "terms" ||
          section === "policy" ||
          section === "about" ? (
          <InfoSettings section={section} />
        ) : section === "report" ? (
          <ReportSettings />
        ) : section === "demo" ? (
          <LocalTools />
        ) : (
          <Text style={type.small}>This settings page is unavailable.</Text>
        )}
      </React.Fragment>
    </Screen>
  );
}
