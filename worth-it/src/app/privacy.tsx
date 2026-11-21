import React from "react";
import { Text } from "react-native";
import { Screen } from "../ui/kit";
import { useTheme } from "../ui/theme";
export default function Privacy() {
  const { type } = useTheme();

  const contact = process.env.EXPO_PUBLIC_SUPPORT_EMAIL;
  return (
    <Screen>
      <Text style={type.title}>Privacy and community rules</Text>
      <Text style={type.body}>
        Your public posts can appear in discovery. Private posts are available
        to approved followers. Signed media links may remain usable for up to
        ten minutes after access changes. Avoid posting addresses, identity
        documents, payment information, or photos of people without permission.
      </Text>
      <Text style={type.h2}>Community</Text>
      <Text style={type.body}>
        No harassment, scams, illegal content, impersonation, or undisclosed
        promotional voting. Ownership and purchase outcomes are self-reported.
        Report harmful content and block abusive accounts. Moderators can remove
        content or suspend accounts.
      </Text>
      <Text style={type.h2}>Your data</Text>
      <Text style={type.body}>
        Drafts and data saver settings stay on your device. Connected account
        data and media are stored in Supabase. Feedback is visible to
        moderators. Device diagnostics contain counts and timings, without
        message text, product URLs, passwords, or access tokens. They reset when
        the app restarts.
      </Text>
      <Text style={type.body}>
        Request account deletion in Account settings. Your profile becomes
        hidden while the request is pending. Clear the device storage for this
        app separately to remove local drafts and downloaded files. Copies
        shared or saved by other people may remain outside this app.
      </Text>
      {contact ? (
        <Text selectable style={type.body}>
          Privacy and support: {contact}
        </Text>
      ) : (
        <Text style={type.small}>
          This preview has no public support contact configured.
        </Text>
      )}
    </Screen>
  );
}
