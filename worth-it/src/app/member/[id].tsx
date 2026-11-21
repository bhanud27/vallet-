import { ReportButton } from "../../ui/ReportButton";
import { blockAccount } from "../../lib/safety";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  followMember,
  getMemberProfile,
  MemberProfile,
} from "../../lib/community";
import { repo } from "../../lib/repo";
import { Reel, socialRepo } from "../../lib/socialRepo";
import type { PollSummary } from "../../lib/types";
import { useApp } from "../../ui/AppContext";
import { FollowCounts } from "../../ui/FollowCounts";
import { Banner, Button } from "../../ui/kit";
import { ProfileMediaCollection } from "../../ui/ProfileMediaCollection";
import { ProfileAvatar } from "../../ui/ProfileAvatar";
import { themedStyles, useTheme } from "../../ui/theme";

interface MemberContent {
  profile: MemberProfile;
  polls: PollSummary[];
  reels: Reel[];
}

export default function MemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useApp();
  return <MemberWorkspace key={session.userId + ":" + id} id={id} />;
}
function MemberWorkspace({ id }: { id: string }) {
  const { colors, type } = useTheme();
  const styles = useStyles();

  const {
    session: { userId },
  } = useApp();
  const [content, setContent] = useState<MemberContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"polls" | "reels">("polls");

  const load = useCallback(async () => {
    if (!id || !/^[a-f0-9-]{36}$/i.test(id)) return null;
    const profile = await getMemberProfile(id);
    if (!profile) return null;
    if (!profile.canView) return { profile, polls: [], reels: [] };
    const [polls, reels] = await Promise.all([
      repo.listSocialPolls?.(id) ?? [],
      socialRepo.listReels(userId, id),
    ]);
    return { profile, polls, reels };
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setLoading(true);
      setError("");
      void load()
        .then((next) => {
          if (active) setContent(next);
        })
        .catch((reason) => {
          if (!active) return;
          setContent(null);
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not open this profile.",
          );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function updateFollow(follow: boolean) {
    setBusy(true);
    setError("");
    try {
      await followMember(id, follow);
      setContent(null);
      setLoading(true);
      setContent(await load());
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not update this follow.",
      );
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }

  const refresh = () => {
    setLoading(true);
    setError("");
    void load()
      .then(setContent)
      .catch((reason) => {
        setContent(null);
        setError(
          reason instanceof Error
            ? reason.message
            : "Could not refresh this profile.",
        );
      })
      .finally(() => setLoading(false));
  };

  const profile = content?.profile;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ProfileMediaCollection
        polls={content?.polls ?? []}
        reels={content?.reels ?? []}
        tab={tab}
        onTabChange={setTab}
        authorId={id}
        showCollection={!loading && !!profile?.canView}
        onRefresh={refresh}
        refreshing={loading && !!content}
        header={
          <>
            {error ? <Banner kind="error">{error}</Banner> : null}
            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Loading profile"
                color={colors.accentInk}
              />
            ) : !content || !profile ? (
              !error && (
                <Text style={type.body}>This profile is unavailable.</Text>
              )
            ) : (
              <>
                <View style={styles.card}>
                  <View style={styles.identity}>
                    <ProfileAvatar
                      name={profile.username ?? ""}
                      uri={profile.avatar}
                      size={66}
                    />
                    <FollowCounts
                      userId={id}
                      followers={profile.followers}
                      following={profile.following}
                    />
                  </View>
                  <Text accessibilityRole="header" style={type.title}>
                    {profile.username
                      ? "@" + profile.username
                      : "Worth It? member"}
                  </Text>
                  {profile.bio ? (
                    <Text style={type.body}>{profile.bio}</Text>
                  ) : null}
                  {profile.privateAccount ? (
                    <Text style={type.small}>Private account</Text>
                  ) : null}
                  {id !== userId ? (
                    <>
                      <ReportButton kind="account" id={id} />
                      <Button
                        label="Block account"
                        variant="quiet"
                        onPress={async () => {
                          try {
                            await blockAccount(id, true);
                            router.replace("/account");
                          } catch (e) {
                            setError(String(e));
                          }
                        }}
                      />
                    </>
                  ) : null}
                  {id === userId ? (
                    <Button
                      label="Edit your profile"
                      onPress={() => router.navigate("/profile")}
                    />
                  ) : (
                    <Button
                      label={
                        profile.relationship === "following"
                          ? "Unfollow"
                          : profile.relationship === "requested"
                            ? "Cancel request"
                            : profile.privateAccount
                              ? "Request to follow"
                              : "Follow"
                      }
                      variant={
                        profile.relationship === "none"
                          ? "primary"
                          : "secondary"
                      }
                      loading={busy}
                      onPress={() => {
                        void updateFollow(profile.relationship === "none");
                      }}
                    />
                  )}
                </View>

                {!profile.canView && (
                  <Banner kind="info">
                    {profile.relationship === "requested"
                      ? "Follow request sent. Their posts and checks will appear after they accept."
                      : "Request to follow this account to see its posts and checks."}
                  </Banner>
                )}
              </>
            )}
          </>
        }
      />
    </View>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      gap: 14,
    },
    identity: { flexDirection: "row", alignItems: "center", gap: 12 },
    label: { flex: 1, minWidth: 0 },
  }),
);
