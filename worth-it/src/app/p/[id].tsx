import { Link, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { repo } from '../../lib/repo';
import { CHOICES, CHOICE_LABEL, PollExtras, PollView } from '../../lib/types';
import { DEMO_NOTE } from '../../lib/demoData';
import { useApp } from '../../ui/AppContext';
import { Banner, Button, Centered, Screen } from '../../ui/kit';
import { PostIdentity, PostPhoto } from '../../ui/PostPresentation';
import { Results } from '../../ui/Results';
import { StarButton } from '../../ui/StarButton';
import { SharePanel } from '../../ui/SharePanel';
import { UpdateSection } from '../../ui/UpdateSection';
import { VoteForm } from '../../ui/VoteForm';
import { colors, type } from '../../ui/theme';

export default function PollScreen() {
  const { id, choice } = useLocalSearchParams<{ id: string; choice?: string }>();
  const { session } = useApp();
  const [view, setView] = useState<PollView | null>(null);
  const [extras, setExtras] = useState<PollExtras>();
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [justVoted, setJustVoted] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const [v, reactions] = await Promise.all([
        repo.getPollView(String(id)),
        repo.getPollExtras([String(id)]).then((all) => all[String(id)]).catch(() => undefined),
      ]);
      if (!v) { setStatus('missing'); return; }
      setExtras(reactions);
      setView(v); setStatus('ready'); setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this poll.');
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    } finally { setRefreshing(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { if (session.userId) void load(); }, [load, session.userId]));

  if (status === 'loading') return <Centered><ActivityIndicator size="large" /><Text style={type.small}>Loading poll…</Text></Centered>;
  if (status === 'missing') return (
    <Centered>
      <Text style={type.h2}>Poll not found</Text>
      <Text style={type.small}>The link may be incomplete, or the poll was removed.</Text>
      <Link href="/" style={{ fontSize: 16, fontWeight: '800', textDecorationLine: 'underline' }}>Go to Worth It?</Link>
    </Centered>
  );
  if (status === 'error' || !view) return (
    <Centered>
      <Text style={type.h2}>Can’t load this poll</Text>
      <Banner kind="error">{error}</Banner>
      <Button label="Try again" onPress={() => { setStatus('loading'); load(); }} />
    </Centered>
  );

  const { poll, votes, update, isAuthor, myChoice } = view;
  const hasImageLink = poll.media?.length ? poll.media.some((item) => item.sourceUrl) : !!poll.imageUrl;
  const canVote = !isAuthor && !myChoice && (!poll.isDemo || repo.demoVotingEnabled);
  const initialChoice = CHOICES.find((option) => option === choice);

  return (
    <Screen onRefresh={() => load(true)} refreshing={refreshing}>
      <Stack.Screen options={{ title: 'Poll' }} />
      {poll.isDemo ? <Banner kind="demo" testID="demo-banner">DEMO: {DEMO_NOTE}{repo.demoVotingEnabled ? ' You can vote to see how it works; your vote stays on this device.' : ''}</Banner> : null}
      {error ? <Banner kind="error">{error} Pull down or press Refresh to retry.</Banner> : null}

      <View style={styles.post}>
        <PostIdentity poll={poll} mine={isAuthor} />
        <PostPhoto poll={poll} legacySource={extras?.productUrl ?? undefined} />
        <View style={styles.caption}>
          <Text style={type.title} testID="item-title">{poll.itemName}</Text>
          <Text style={type.body} testID="poll-question">{poll.question}</Text>
          <View style={styles.actions}>
            {extras?.productUrl && !hasImageLink ? <Pressable accessibilityRole="link" style={styles.storeLink} onPress={() => {
              if (extras.productUrl) void Linking.openURL(extras.productUrl).catch(() => setError('Could not open the product link.'));
            }}><Text style={styles.linkText}>View product</Text></Pressable> : <View />}
            <StarButton subject="poll" starred={extras?.starred ?? false} count={extras?.stars ?? 0}
              onToggle={async (starred) => setExtras(await repo.setPollStar(poll.id, starred))} />
          </View>
        </View>
      </View>

      {isAuthor ? <Banner kind="info">You created this poll. Voting is for your friends. Refresh to see new votes.</Banner> : null}
      {isAuthor ? <SharePanel pollId={poll.id} /> : null}

      {myChoice ? (
        <Banner kind="ok" testID="voted-banner">{justVoted ? 'Vote submitted. ' : ''}You voted: {CHOICE_LABEL[myChoice]}. Each account or browser gets one vote per poll.</Banner>
      ) : null}
      {canVote ? (
        <VoteForm key={`${poll.id}:${initialChoice ?? ''}`} pollId={poll.id} initialChoice={initialChoice}
          onVoted={() => { setJustVoted(true); load(); }} />
      ) : null}
      {!isAuthor && !myChoice && !canVote ? <Banner kind="info">Demo polls are read-only here. Create your own poll to try voting.</Banner> : null}

      <Results votes={votes} />
      <Button testID="refresh" variant="secondary" label={refreshing ? 'Refreshing…' : 'Refresh results'} loading={refreshing} onPress={() => load(true)} />

      <UpdateSection poll={poll} update={update} isAuthor={isAuthor} onChanged={() => load()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  post: { backgroundColor: colors.surface, borderRadius: 17, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  caption: { padding: 15, gap: 5 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  storeLink: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.accent, fontWeight: '700' },
});
