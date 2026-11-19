import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatInr } from '../lib/format';
import { repo } from '../lib/repo';
import { PROFILE_BIO_MAX, socialRepo } from '../lib/socialRepo';
import type { Profile, Reel } from '../lib/socialRepo';
import type { PollSummary } from '../lib/types';
import { USERNAME_HINT, USERNAME_MAX } from '../lib/username';
import { useApp } from '../ui/AppContext';
import { AppTabs } from '../ui/AppTabs';
import { Banner, Button, Field, Screen } from '../ui/kit';
import { PollThumbnail } from '../ui/PostPresentation';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { SocialIcon } from '../ui/SocialIcon';
import { colors, type } from '../ui/theme';

function ProfileEditor({ userId, profile, onClose, onSaved }: {
  userId: string;
  profile: Profile;
  onClose: () => void;
  onSaved: (profile: Profile) => void;
}) {
  const [username, setUsername] = useState(profile.username ?? '');
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState<{ uri: string } | null>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const preview = avatar === undefined ? profile.avatar : avatar?.uri ?? null;

  async function pickAvatar() {
    setError('');
    try {
      const image = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: false });
      if (!image.canceled) setAvatar({ uri: image.assets[0].uri });
    } catch {
      setError('Could not open your photos. Try again.');
    }
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      onSaved(await socialRepo.saveProfile(userId, { username, bio, avatar }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.avatarTools}>
        <ProfileAvatar name={username || profile.displayName} uri={preview} size={64} />
        <Button label="Choose photo" variant="secondary" disabled={saving} onPress={pickAvatar} />
        {preview && <Button label="Remove photo" variant="quiet" disabled={saving} onPress={() => setAvatar(null)} />}
      </View>
      <Field label="Username" value={username} onChangeText={setUsername} maxLength={USERNAME_MAX} hint={USERNAME_HINT}
        autoCapitalize="none" autoCorrect={false} editable={!saving} />
      <Field label="Bio" value={bio} onChangeText={setBio} multiline maxLength={PROFILE_BIO_MAX} editable={!saving} />
      {error ? <Banner kind="error">{error}</Banner> : null}
      <View style={styles.actions}>
        <Button label="Cancel" variant="secondary" disabled={saving} onPress={onClose} />
        <Button label="Save profile" loading={saving} onPress={save} />
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const { session: { userId } } = useApp();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [polls, setPolls] = useState<PollSummary[]>([]);
  const [reels, setReels] = useState<Reel[]>([]);
  const [filter, setFilter] = useState<'polls' | 'reels'>('polls');
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    let active = true;
    Promise.all([socialRepo.getProfile(userId), repo.listMyPolls(), socialRepo.listReels(userId, userId)])
      .then(([nextProfile, nextPolls, nextReels]) => {
        if (!active) return;
        setProfile(nextProfile);
        setPolls(nextPolls);
        setReels(nextReels);
        setError('');
      }).catch((err) => { if (active) setError(err instanceof Error ? err.message : 'Could not load your profile.'); });
    return () => { active = false; };
  }, [userId]));

  return (
    <View style={styles.page}>
      <Screen>
        {error ? <Banner kind="error">{error}</Banner> : null}
        {!profile && !error ? <ActivityIndicator accessibilityLabel="Loading profile" color={colors.accent} /> : null}
        {profile && (
          <>
            <View style={styles.hero}>
              <View style={styles.cover} />
              <View style={styles.heroBody}>
                <View style={styles.identity}>
                  <View style={styles.avatarFrame}><ProfileAvatar name={profile.username || profile.displayName} uri={profile.avatar} size={76} /></View>
                  {!editing && <Button label="Edit profile" variant="secondary" onPress={() => { setSaved(false); setEditing(true); }} />}
                </View>
                <Text style={type.title} accessibilityRole="header">{profile.username || profile.displayName || 'Guest shopper'}</Text>
                {profile.bio ? <Text style={type.body}>{profile.bio}</Text> : null}
                <View style={styles.stats}>
                  <Text style={type.body}><Text style={styles.count}>{polls.length}</Text> {polls.length === 1 ? 'poll' : 'polls'}</Text>
                  <Text style={type.body}><Text style={styles.count}>{reels.length}</Text> {reels.length === 1 ? 'reel' : 'reels'}</Text>
                </View>
              </View>
            </View>
            {editing && <ProfileEditor key={userId} userId={userId} profile={profile} onClose={() => setEditing(false)}
              onSaved={(next) => { setProfile(next); setEditing(false); setSaved(true); }} />}
            {saved && <Banner kind="ok">Profile saved.</Banner>}

            <View style={styles.tabs}>
              {(['polls', 'reels'] as const).map((tab) => (
                <Pressable key={tab} accessibilityRole="tab" aria-selected={filter === tab} accessibilityState={{ selected: filter === tab }}
                  style={[styles.tab, filter === tab && styles.selected]} onPress={() => setFilter(tab)}>
                  <Text style={[styles.tabText, filter === tab && { color: colors.accent }]}>{tab === 'polls' ? 'Your polls' : 'Your reels'}</Text>
                </Pressable>
              ))}
            </View>
            {filter === 'polls' ? (
              polls.length ? polls.map((poll) => (
                <Pressable key={poll.id} accessibilityRole="link" onPress={() => router.push(`/p/${poll.id}`)} style={styles.post}>
                  <PollThumbnail poll={poll} />
                  <View style={styles.postText}>
                    <Text style={styles.count} numberOfLines={2}>{poll.itemName}</Text>
                    <Text style={type.small}>{formatInr(poll.priceInr)} · {poll.voteCount} {poll.voteCount === 1 ? 'vote' : 'votes'}</Text>
                  </View>
                </Pressable>
              )) : (
                <View style={styles.card}>
                  <Text style={type.small}>You haven’t posted a poll yet.</Text>
                  <Button label="Create a poll" variant="secondary" onPress={() => router.push('/new')} />
                </View>
              )
            ) : (
              reels.length ? reels.map((reel) => (
                <Pressable key={reel.id} accessibilityRole="link" style={styles.post}
                  onPress={() => router.push({ pathname: '/reels', params: { reel: reel.id, mine: '1' } })}>
                  <View style={[styles.thumbnail, styles.reelIcon]}><SocialIcon name="reels" color={colors.accent} /></View>
                  <View style={styles.postText}>
                    <Text style={styles.count} numberOfLines={2}>{reel.caption || 'Your reel'}</Text>
                    <Text style={type.small}>{reel.likes} {reel.likes === 1 ? 'star' : 'stars'}</Text>
                  </View>
                </Pressable>
              )) : (
                <View style={styles.card}>
                  <Text style={type.small}>You haven’t shared a reel yet.</Text>
                  <Button label="Create a reel" variant="secondary" onPress={() => router.push('/new-reel')} />
                </View>
              )
            )}
          </>
        )}
        <Button label={repo.mode === 'local' ? 'Demo tools' : 'Account settings'} variant="quiet" testID="account-link" onPress={() => router.push('/account')} />
      </Screen>
      <AppTabs active="profile" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  hero: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 20, overflow: 'hidden' },
  cover: { height: 96, backgroundColor: colors.tag },
  heroBody: { padding: 17, paddingTop: 0, gap: 8 },
  identity: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, marginTop: -39 },
  avatarFrame: { backgroundColor: colors.surface, borderRadius: 46, padding: 4 },
  stats: { flexDirection: 'row', gap: 20, paddingTop: 4 },
  count: { color: colors.ink, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 15, gap: 13 },
  avatarTools: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.border },
  tab: { flex: 1, minHeight: 45, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  selected: { borderColor: colors.accent },
  tabText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  post: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 11, borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface },
  postText: { flex: 1, gap: 4 },
  thumbnail: { width: 62, height: 62, borderRadius: 10 },
  reelIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
});
