import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { repo } from '../lib/repo';
import { CHOICES, CHOICE_LABEL, PollExtras, PollSummary } from '../lib/types';
import { useApp } from '../ui/AppContext';
import { AppTabs } from '../ui/AppTabs';
import { Banner, Button } from '../ui/kit';
import { PostIdentity, PostPhoto } from '../ui/PostPresentation';
import { SocialIcon } from '../ui/SocialIcon';
import { StarButton } from '../ui/StarButton';
import { choiceBackground, choiceColor, colors, type } from '../ui/theme';

function PollCard({ poll, extras, onStar }: { poll: PollSummary; extras?: PollExtras; onStar: (next: boolean) => Promise<void> }) {
  const open = () => router.push('/p/' + poll.id);
  const votes = poll.voteCount === 1 ? '1 vote' : poll.voteCount + ' votes';

  return (
    <View style={styles.card}>
      <PostIdentity poll={poll} mine={!poll.isDemo} />
      <PostPhoto poll={poll} onOpen={open} testID={'poll-card-' + poll.id} legacySource={extras?.productUrl ?? undefined} />

      <View style={styles.postBody}>
        <Text style={styles.itemTitle}>{poll.itemName}</Text>
        <Text style={styles.caption}>{poll.question}</Text>
        {poll.isDemo && repo.demoVotingEnabled ? (
          <View style={styles.choices}>
            {CHOICES.map((choice) => (
              <Pressable
                key={choice}
                accessibilityRole="button"
                accessibilityLabel={CHOICE_LABEL[choice] + ' for ' + poll.itemName}
                onPress={() => router.push({ pathname: '/p/[id]', params: { id: poll.id, choice } })}
                style={({ pressed }) => [styles.choice, { backgroundColor: choiceBackground[choice] }, pressed && styles.pressed]}
              >
                <Text style={[styles.choiceText, { color: choiceColor[choice] }]}>{CHOICE_LABEL[choice]}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.postFooter}>
          <Pressable accessibilityRole="link" onPress={open} style={({ pressed }) => [styles.voteLink, pressed && styles.pressed]}>
            <SocialIcon name="message" color={colors.accent} />
            <Text style={styles.voteLinkText}>{votes}</Text>
            <SocialIcon name="arrow" color={colors.accent} />
          </Pressable>
          <View style={styles.postActions}>
            {poll.updateStatus ? <Text style={styles.updateStatus}>{poll.updateStatus === 'bought' ? 'Bought' : 'Passed'}</Text> : null}
            <StarButton subject="poll" starred={extras?.starred ?? false} count={extras?.stars ?? 0} onToggle={onStar} />
          </View>
        </View>
      </View>
    </View>
  );
}

function Wordmark() {
  return (
    <View style={styles.wordmark} accessible accessibilityLabel="Worth It?">
      <View style={styles.logo}><Text style={styles.logoMark}>?</Text></View>
      <Text style={styles.brand}>Worth It?</Text>
    </View>
  );
}

export default function Home() {
  const { session } = useApp();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= 880;
  const [mine, setMine] = useState<PollSummary[]>([]);
  const [demo, setDemo] = useState<PollSummary[]>([]);
  const [extras, setExtras] = useState<Record<string, PollExtras>>({});
  const [filter, setFilter] = useState<'feed' | 'mine'>('feed');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [myPolls, demoPolls] = await Promise.all([repo.listMyPolls(), repo.listDemoPolls()]);
      setMine(myPolls);
      setDemo(demoPolls);
      const reactions = await repo.getPollExtras([...myPolls, ...demoPolls].map((poll) => poll.id)).catch(() => ({}));
      setExtras(reactions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load polls.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { if (session.userId) void load(); }, [load, session.userId]));

  const polls = filter === 'mine' ? mine : [...mine, ...demo];
  const local = repo.mode === 'local';
  const newPoll = () => router.push('/new');
  const navigation = <AppTabs active="feed" desktop={desktop} onFeed={() => setFilter('feed')} />;

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      {!desktop && <View style={styles.mobileHeader}><Wordmark /></View>}
      <View style={styles.shell}>
        {desktop && (
          <View style={styles.rail}>
            <Wordmark />
            {navigation}
          </View>
        )}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        >
          <View style={styles.feed}>
            <View style={styles.feedHeader}>
              <Text accessibilityRole="header" style={styles.heading}>Shopping feed</Text>
              <View style={styles.filters}>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === 'feed' }}
                  onPress={() => setFilter('feed')} style={[styles.filter, filter === 'feed' && styles.filterSelected]}>
                  <Text style={[styles.filterText, filter === 'feed' && styles.filterTextSelected]}>All polls</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ selected: filter === 'mine' }}
                  onPress={() => setFilter('mine')} style={[styles.filter, filter === 'mine' && styles.filterSelected]}>
                  <Text style={[styles.filterText, filter === 'mine' && styles.filterTextSelected]}>Your polls</Text>
                </Pressable>
              </View>
            </View>

            {local && (
              <View style={styles.mode} testID="mode-banner">
                <Text style={styles.modeText}><Text style={styles.modeTitle}>Local demo mode</Text> · New polls stay in this browser or app.</Text>
              </View>
            )}
            {error && <Banner kind="error">{error}</Banner>}
            {loading ? <Text style={type.small}>Loading polls…</Text> : polls.length === 0 && (
              <View style={styles.empty}>
                <Text style={type.h2}>{filter === 'mine' ? 'No polls yet' : 'No polls to show'}</Text>
                <Text style={type.small}>Add a photo and price to ask for advice.</Text>
                <Button label="Create a poll" onPress={newPoll} />
              </View>
            )}
            {polls.map((poll) => <PollCard key={poll.id} poll={poll} extras={extras[poll.id]} onStar={async (starred) => {
              const reaction = await repo.setPollStar(poll.id, starred);
              setExtras((current) => ({ ...current, [poll.id]: reaction }));
            }} />)}
          </View>
        </ScrollView>
      </View>
      {!desktop && navigation}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  shell: { flex: 1, width: '100%', maxWidth: 912, flexDirection: 'row', alignSelf: 'center' },
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  logo: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.tag },
  logoMark: { color: colors.ink, fontSize: 23, lineHeight: 27, fontWeight: '900' },
  brand: { color: colors.ink, fontSize: 25, fontWeight: '900', letterSpacing: -1.25 },
  mobileHeader: { paddingHorizontal: 17, minHeight: 60, justifyContent: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
  rail: { width: 208, paddingHorizontal: 20, paddingTop: 29, borderRightWidth: 1, borderColor: colors.border, gap: 41 },
  scroll: { flex: 1 },
  scrollContent: { alignItems: 'center', paddingHorizontal: 13, paddingTop: 17, paddingBottom: 28 },
  feed: { width: '100%', maxWidth: 552, gap: 13 },
  feedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, minHeight: 40 },
  heading: { color: colors.ink, fontSize: 23, fontWeight: '800', letterSpacing: -0.7 },
  filters: { flexDirection: 'row', backgroundColor: '#EEEBEF', borderRadius: 12, padding: 3, gap: 2 },
  filter: { minHeight: 35, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9 },
  filterSelected: { backgroundColor: colors.surface },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  filterTextSelected: { color: colors.accent, fontWeight: '700' },
  mode: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: colors.accentSoft },
  modeText: { color: colors.infoInk, fontSize: 12, lineHeight: 17 },
  modeTitle: { fontWeight: '700' },
  card: { borderRadius: 17, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  postBody: { paddingHorizontal: 15, paddingTop: 13, paddingBottom: 4, gap: 6 },
  itemTitle: { color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.28 },
  caption: { color: colors.muted, fontSize: 14, lineHeight: 20 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  choice: { flexGrow: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  choiceText: { fontSize: 13, fontWeight: '700' },
  postFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  postActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  voteLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start' },
  voteLinkText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  updateStatus: { color: colors.buy, fontSize: 13, fontWeight: '700' },
  empty: { backgroundColor: colors.surface, padding: 20, gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 17 },
  pressed: { opacity: 0.76 },
});
