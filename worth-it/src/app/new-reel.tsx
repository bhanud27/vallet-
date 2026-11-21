import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { router, Stack } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { repo } from "../lib/repo";
import { REEL_CAPTION_MAX, socialRepo } from "../lib/socialRepo";
import { validateSelectedVideo } from "../lib/socialVideo";
import type { SelectedVideo } from "../lib/socialVideo";
import { LIMITS } from "../lib/validation";
import { useApp } from "../ui/AppContext";
import { Banner, Button, Field, Screen } from "../ui/kit";
import { ReelVideo } from "../ui/ReelVideo";
import { SocialIcon } from "../ui/SocialIcon";
import { themedStyles, useTheme } from "../ui/theme";

export default function NewReel() {
  const { type, colors } = useTheme();
  const styles = useStyles();

  const { session } = useApp();
  const [requestId] = useState(() => randomUUID());
  const [video, setVideo] = useState<SelectedVideo | null>(null);
  const [caption, setCaption] = useState("");
  const [productLink, setProductLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function pickVideo() {
    setError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
      });
      if (result.canceled) return;
      const selected = result.assets[0];
      validateSelectedVideo(selected);
      setVideo(selected);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not open your videos.",
      );
    }
  }

  async function publish() {
    if (saving) return;
    if (!video) return setError("Choose an MP4 video first.");
    setSaving(true);
    setError("");
    try {
      const reel = await socialRepo.postReel(
        session.userId,
        caption,
        video,
        productLink,
        requestId,
      );
      router.replace({ pathname: "/reels", params: { reel, mine: "1" } });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not publish your check.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Publish check from header"
              disabled={saving || !video}
              onPress={() => void publish()}
              style={{
                minHeight: 44,
                paddingHorizontal: 12,
                justifyContent: "center",
                opacity: saving || !video ? 0.5 : 1,
              }}
            >
              <Text style={{ color: colors.accentInk, fontWeight: "700" }}>
                {saving ? "Saving..." : "Publish"}
              </Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.card}>
        <Text style={type.h2}>Video</Text>
        {video ? (
          <View style={styles.preview}>
            <ReelVideo key={video.uri} source={video.uri} autoPlay={false} />
          </View>
        ) : (
          <View style={styles.placeholder}>
            <SocialIcon name="reels" color={colors.accentInk} />
            <Text style={type.small}>MP4 · Up to 20 MB</Text>
          </View>
        )}
        <Button
          label={video ? "Replace video" : "Choose video"}
          variant="secondary"
          onPress={pickVideo}
          disabled={saving}
        />
        <Field
          label="Caption (optional)"
          placeholder="What was worth the price?"
          value={caption}
          onChangeText={setCaption}
          maxLength={REEL_CAPTION_MAX}
          multiline
          editable={!saving}
        />
        <Field
          label="Product link (optional)"
          placeholder="https://store.example/product"
          value={productLink}
          onChangeText={setProductLink}
          maxLength={LIMITS.productUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!saving}
        />
        <Text style={type.small}>
          {repo.mode === "local"
            ? "This check stays on this device in local demo mode."
            : "Your account privacy controls who can see this check and its product link."}
        </Text>
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <Button
        label={saving ? "Publishing…" : "Publish check"}
        onPress={publish}
        loading={saving}
      />
    </Screen>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      gap: 13,
      padding: 15,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 17,
      backgroundColor: colors.surface,
    },
    placeholder: {
      minHeight: 142,
      gap: 8,
      borderRadius: 12,
      backgroundColor: colors.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    preview: {
      width: "100%",
      maxWidth: 245,
      aspectRatio: 9 / 16,
      alignSelf: "center",
      backgroundColor: "#000000",
      overflow: "hidden",
      borderRadius: 12,
    },
  }),
);
