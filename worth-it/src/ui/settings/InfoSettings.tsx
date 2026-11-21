import React, { useState } from "react";
import Constants from "expo-constants";
import { router } from "expo-router";
import { Linking, Text } from "react-native";
import { approvedUrl } from "../../lib/support";
import { useTheme } from "../theme";
import { Banner, Button } from "../kit";
import { BrandLogo } from "../BrandLogo";
const documents = {
  guidelines: {
    title: "Community Guidelines",
    text: "Treat people respectfully. Do not post harassment, scams, illegal content, impersonation or misleading promotions. Only upload media you have permission to share. Disclose commercial relationships. Report harmful content and block abusive accounts. Moderators can remove content or suspend accounts.",
  },
  terms: {
    title: "Terms of Service — draft",
    text: "Worth It is a social app for sharing fashion, asking purchase questions and discussing products. Votes, ownership claims and purchase outcomes are user opinions. Verify product information and retailer terms before purchasing. You are responsible for your content and must have permission to upload it. Do not impersonate people, manipulate votes or use the service for illegal activity. Moderators may restrict harmful content. These draft terms require review and approved operator, contact, eligibility, jurisdiction and dispute details before public release.",
  },
  policy: {
    title: "Privacy Policy — draft",
    text: "Connected account profiles, content, interactions and preferences are stored in Supabase. The app stores session credentials using its authentication storage adapter, and stores drafts and device preferences locally. Public content can appear in discovery; private content is limited to approved followers. Media links already issued can remain usable until they expire. Problem reports are shared with authorized moderators. Product links may be sent to the configured import service to retrieve public product metadata. Account deletion uses a server worker to remove the account and associated uploads. Device copies, third-party copies and service backups need separate handling. The operator must finalize contact details, legal bases, retention periods, subprocessors and user-rights procedures before public release.",
  },
} as const;
export function InfoSettings({
  section,
}: {
  section: "help" | "guidelines" | "terms" | "policy" | "about";
}) {
  const { type } = useTheme(),
    [error, setError] = useState("");
  const contact = process.env.EXPO_PUBLIC_SUPPORT_EMAIL?.trim();
  const external = approvedUrl(
    section === "terms"
      ? process.env.EXPO_PUBLIC_TERMS_URL
      : section === "policy"
        ? process.env.EXPO_PUBLIC_PRIVACY_URL
        : section === "guidelines"
          ? process.env.EXPO_PUBLIC_GUIDELINES_URL
          : undefined,
  );
  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {section === "help" ? (
        <>
          <Text style={type.h2}>Help & FAQs</Text>
          <Text style={type.h2}>How do I create content?</Text>
          <Text style={type.body}>
            Tap Add and choose Poll for a purchase question or Post for a
            regular fashion post. Paste a product link or add your own photos.
            Review imported details before publishing.
          </Text>
          <Text style={type.h2}>Why did a product link not fill in?</Text>
          <Text style={type.body}>
            Retailers may restrict access or omit details. You can edit the
            fields and upload photos yourself.
          </Text>
          <Text style={type.h2}>Where are my saved and archived posts?</Text>
          <Text style={type.body}>
            Open Settings, then Saved Content or Archive. Archived content can
            be restored using the existing management controls.
          </Text>
          <Text style={type.h2}>How do privacy and Stars work?</Text>
          <Text style={type.body}>
            Private content is visible to approved followers. Manage requests in
            Privacy settings. Double tap adds one Star; your account cannot add
            duplicate Stars to the same item.
          </Text>
          <Button
            label="Share feedback"
            variant="secondary"
            onPress={() => router.push("/feedback")}
          />
          <Text style={type.h2}>Contact Support</Text>
          {contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? (
            <Button
              label={"Email " + contact}
              variant="secondary"
              onPress={() => {
                void Linking.openURL(
                  "mailto:" + encodeURIComponent(contact),
                ).catch(() => setError("Could not open your email app."));
              }}
            />
          ) : (
            <Text style={type.small}>
              A public support email has not been configured. Use Report a
              Problem to contact the app moderators.
            </Text>
          )}
          <Button
            label="Report a Problem"
            onPress={() =>
              router.push({
                pathname: "/settings/[section]",
                params: { section: "report" },
              })
            }
          />
        </>
      ) : section === "about" ? (
        <>
          <BrandLogo size={80} />
          <Text style={type.title}>
            {Constants.expoConfig?.name ?? "Worth It"}
          </Text>
          <Text style={type.body}>
            Version {Constants.expoConfig?.version ?? "Unavailable"}
          </Text>
          <Text style={type.body}>
            Share fashion, ask whether a purchase is worth it, and explore
            community Posts, Polls and Checks.
          </Text>
        </>
      ) : (
        <>
          {external ? (
            <>
              <Text style={type.body}>
                Read the published document provided by the app operator.
              </Text>
              <Button
                label="Open published document"
                onPress={() => {
                  void Linking.openURL(external).catch(() =>
                    setError("Could not open the document."),
                  );
                }}
              />
            </>
          ) : (
            <>
              {section !== "guidelines" ? (
                <Banner kind="warn">
                  Draft for review. Approved legal documents and operator
                  details have not been provided. This is not a final published
                  policy.
                </Banner>
              ) : null}
              <Text style={type.h2}>{documents[section].title}</Text>
              <Text style={type.body}>{documents[section].text}</Text>
            </>
          )}
        </>
      )}
    </>
  );
}
