import * as Clipboard from "expo-clipboard";
import React, { useState } from "react";
import { Linking, Platform, Share, Text, View } from "react-native";
import { repo } from "../lib/repo";
import { pollLink } from "../lib/share";
import { Banner, Button } from "./kit";
import { GlossyReflection } from "./ThemeSurface";
import { useTheme } from "./theme";

export function SharePanel({
  pollId,
  post = false,
}: {
  pollId: string;
  post?: boolean;
}) {
  const { colors, type, glossy } = useTheme();

  const { url, reachable } = pollLink(pollId);
  const message = post ? "See my style on Worth It?" : "Is this worth it?";
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function copy() {
    setErr(null);
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setErr(
        "Couldn’t copy automatically. Press and hold the link above to copy it.",
      );
    }
  }
  async function share() {
    setErr(null);
    try {
      if (
        Platform.OS === "web" &&
        typeof navigator !== "undefined" &&
        navigator.share
      ) {
        await navigator.share({
          title: "Worth It?",
          text: message,
          url,
        });
      } else {
        await Share.share({ message: `${message} ${url}`, url });
      }
    } catch {
      await copy();
    }
  }

  function shareWhatsApp() {
    setErr(null);
    void Linking.openURL(
      "https://wa.me/?text=" + encodeURIComponent(message + " " + url),
    ).catch(() =>
      setErr("Couldn’t open WhatsApp. You can copy the link instead."),
    );
  }
  const canShare =
    Platform.OS !== "web" ||
    (typeof navigator !== "undefined" && !!(navigator as Navigator).share);

  return (
    <View
      style={{
        backgroundColor: glossy?.cardFill ?? colors.surface,
        overflow: glossy ? "hidden" : undefined,
        borderRadius: 16,
        padding: 14,
        gap: 10,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <GlossyReflection />
      <Text style={type.h2}>
        {post ? "Share this post" : "Share this poll"}
      </Text>
      <Text
        selectable
        testID="share-url"
        style={{
          fontSize: 14,
          color: colors.ink,
          backgroundColor: colors.media,
          padding: 10,
          borderRadius: 8,
        }}
      >
        {url}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          testID="copy-link"
          style={{ flex: 1 }}
          label={copied ? "Link copied" : "Copy link"}
          onPress={copy}
        />
        {canShare ? (
          <Button
            style={{ flex: 1 }}
            variant="secondary"
            label="Share…"
            onPress={share}
          />
        ) : null}
      </View>
      {reachable && (
        <Button
          label="Share to WhatsApp"
          variant="secondary"
          onPress={shareWhatsApp}
        />
      )}
      {err ? <Banner kind="error">{err}</Banner> : null}
      <Banner kind="warn">
        {post
          ? "Post links follow the author’s account privacy. Private posts are visible to approved followers."
          : "Poll links follow the author’s account privacy. Private polls are visible to approved followers."}
      </Banner>
      {!reachable ? (
        <Banner kind="info" testID="unreachable-note">
          {repo.mode === "local"
            ? "Local demo mode: this link only works in this browser on this device. To let a friend open it on their phone, connect Supabase and host the web build (see the README)."
            : "This link points to a local address that other phones can’t reach. Host the web build or set EXPO_PUBLIC_WEB_URL (see the README)."}
        </Banner>
      ) : null}
    </View>
  );
}
