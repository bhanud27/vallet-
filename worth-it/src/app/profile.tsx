import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "expo-router/react-navigation";
import { floatingDockHeight } from "../lib/floatingNavigation";
import { ThemeSurface } from "../ui/ThemeSurface";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { getMemberProfile, MemberProfile } from "../lib/community";
import { repo } from "../lib/repo";
import { PROFILE_BIO_MAX, socialRepo } from "../lib/socialRepo";
import type { Profile, Reel } from "../lib/socialRepo";
import type { PollSummary } from "../lib/types";
import { USERNAME_HINT, USERNAME_MAX } from "../lib/username";
import { useApp } from "../ui/AppContext";
import { AppTabs } from "../ui/AppTabs";
import { FollowCounts } from "../ui/FollowCounts";
import { Banner, Button, Field } from "../ui/kit";
import { ProfileMediaCollection } from "../ui/ProfileMediaCollection";
import { ProfileAvatar } from "../ui/ProfileAvatar";
import { themedStyles, useTheme } from "../ui/theme";

function ProfileEditor({
  userId,
  profile,
  onClose,
  onSaved,
}: {
  userId: string;
  profile: Profile;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
}) {
  const styles = useStyles();

  const [username, setUsername] = useState(profile.username ?? "");
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState<{ uri: string } | null>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const preview = avatar === undefined ? profile.avatar : (avatar?.uri ?? null);

  async function pickAvatar() {
    setError("");
    try {
      const image = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        exif: false,
      });
      if (!image.canceled) setAvatar({ uri: image.assets[0].uri });
    } catch {
      setError("Could not open your photos. Try again.");
    }
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      onSaved(await socialRepo.saveProfile(userId, { username, bio, avatar }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save your profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.avatarTools}>
        <ProfileAvatar
          name={username || profile.displayName}
          uri={preview}
          size={64}
        />
        <Button
          label="Choose photo"
          variant="secondary"
          disabled={saving}
          onPress={pickAvatar}
        />
        {preview && (
          <Button
            label="Remove photo"
            variant="quiet"
            disabled={saving}
            onPress={() => setAvatar(null)}
          />
        )}
      </View>
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        maxLength={USERNAME_MAX}
        hint={USERNAME_HINT}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!saving}
      />
      <Field
        label="Bio"
        value={bio}
        onChangeText={setBio}
        multiline
        maxLength={PROFILE_BIO_MAX}
        editable={!saving}
      />
      {error ? <Banner kind="error">{error}</Banner> : null}
      <View style={styles.actions}>
        <Button
          label="Cancel"
          variant="secondary"
          disabled={saving}
          onPress={onClose}
        />
        <Button label="Save profile" loading={saving} onPress={save} />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { session } = useApp();
  return <ProfileWorkspace key={session.userId} />;
}
function ProfileWorkspace() {
  const insets = useSafeAreaInsets(),
    headerOverlayHeight = useHeaderHeight();
  const { colors, type } = useTheme();
  const styles = useStyles();

  const {
    session: { userId },
  } = useApp();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [filter, setFilter] = useState<"polls" | "reels">("polls");
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [community, setCommunity] = useState<MemberProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (repo.mode === "supabase") {
        void getMemberProfile(userId)
          .then((next) => {
            if (active) setCommunity(next);
          })
          .catch(() => {
            if (active) setCommunity(null);
          });
      }
      Promise.all([
        socialRepo.getProfile(userId),
        repo.listMyPolls(),
        socialRepo.listReels(userId, userId),
      ])
        .then(([nextProfile, nextPolls, nextReels]) => {
          if (!active) return;
          setProfile(nextProfile);
          setPolls(nextPolls);
          setReels(nextReels);
          setError("");
        })
        .catch((err) => {
          if (active)
            setError(
              err instanceof Error
                ? err.message
                : "Could not load your profile.",
            );
        });
      return () => {
        active = false;
      };
    }, [userId]),
  );

  return (
    <View style={styles.page}>
      <ProfileMediaCollection
        polls={polls}
        reels={reels}
        tab={filter}
        onTabChange={setFilter}
        mine
        topOverlayHeight={headerOverlayHeight}
        bottomOverlayHeight={floatingDockHeight(insets.bottom)}
        showCollection={!!profile}
        empty={
          <View style={styles.card}>
            <Text style={type.small}>
              {filter === "polls"
                ? "You have not posted a poll yet."
                : "You have not posted a check yet."}
            </Text>
            <Button
              label={filter === "polls" ? "Create a poll" : "Create a check"}
              variant="secondary"
              onPress={() =>
                router.push(filter === "polls" ? "/new" : "/new-reel")
              }
            />
          </View>
        }

        header={
          <>
            {error ? <Banner kind="error">{error}</Banner> : null}
            {!profile && !error ? (
              <ActivityIndicator
                accessibilityLabel="Loading profile"
                color={colors.accentInk}
              />
            ) : null}
            {profile && (
              <>
                <ThemeSurface
                  frost
                  testID="profile-surface"
                  style={styles.hero}
                >
                  <View style={styles.cover} />
                  <View style={styles.heroBody}>
                    <View style={styles.identity}>
                      <View style={styles.avatarFrame}>
                        <ProfileAvatar
                          name={profile.username || profile.displayName}
                          uri={profile.avatar}
                          size={76}
                        />
                      </View>
                      <View style={{ flex: 1, paddingTop: 40 }}>
                        <FollowCounts
                          followers={community?.followers ?? 0}
                          following={community?.following ?? 0}
                          userId={userId}
                        />
                      </View>
                    </View>
                    <Text style={type.title} accessibilityRole="header">
                      {profile.username ||
                        profile.displayName ||
                        "Guest shopper"}
                    </Text>
                    {profile.bio ? (
                      <Text style={type.body}>{profile.bio}</Text>
                    ) : null}
                    {profile.displayName &&
                    profile.displayName !== profile.username ? (
                      <Text style={type.small}>{profile.displayName}</Text>
                    ) : null}
                    <View style={styles.stats}>
                      <Text style={type.body}>
                        <Text style={styles.count}>{polls.length}</Text>{" "}
                        {polls.length === 1 ? "poll or post" : "polls & posts"}
                      </Text>
                      <Text style={type.body}>
                        <Text style={styles.count}>{reels.length}</Text>{" "}
                        {reels.length === 1 ? "check" : "checks"}
                      </Text>
                    </View>
                    {!editing && (
                      <Button
                        label="Edit profile"
                        variant="secondary"
                        onPress={() => {
                          setSaved(false);
                          setEditing(true);
                        }}
                      />
                    )}
                  </View>
                </ThemeSurface>
                {editing && (
                  <ProfileEditor
                    key={userId}
                    userId={userId}
                    profile={profile}
                    onClose={() => setEditing(false)}
                    onSaved={(next) => {
                      setProfile(next);
                      setEditing(false);
                      setSaved(true);
                      if (repo.mode === "supabase")
                        void getMemberProfile(userId)
                          .then(setCommunity)
                          .catch(() => undefined);
                    }}
                  />
                )}
                {saved && <Banner kind="ok">Profile saved.</Banner>}
              </>
            )}
          </>
        }
      />
      <AppTabs active="profile" safeAreaSides />
    </View>
  );
}

const useStyles = themedStyles(({ colors, pageBackground }) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: pageBackground },
    hero: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      overflow: "hidden",
    },
    cover: { height: 96, backgroundColor: colors.tag },
    heroBody: { padding: 17, paddingTop: 0, gap: 8 },
    identity: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      gap: 10,
      marginTop: -39,
    },
    avatarFrame: {
      backgroundColor: colors.surface,
      borderRadius: 46,
      padding: 4,
    },
    stats: { flexDirection: "row", gap: 20, paddingTop: 4 },
    count: { color: colors.ink, fontWeight: "800" },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 15,
      gap: 13,
    },
    avatarTools: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 8,
    },
    actions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      justifyContent: "flex-end",
    },
  }),
);
