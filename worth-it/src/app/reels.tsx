import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { socialRepo } from '../lib/socialRepo';
import type { Reel } from '../lib/socialRepo';
import { useApp } from '../ui/AppContext';
import { AppTabs } from '../ui/AppTabs';
import { Banner, Button } from '../ui/kit';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { StoredReelVideo } from '../ui/ReelVideo';
import { StarButton } from '../ui/StarButton';
import { colors, type } from '../ui/theme';

function ReelSlide({ reel, height, active, onStar }: { reel: Reel; height: number; active: boolean; onStar: (reel: Reel, starred: boolean) => Promise<void> }) {

  return (
    <View style={[styles.slide, { height }]} aria-hidden={!active} importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}>
      {active && <StoredReelVideo reel={reel} />}
      <View style={styles.overlay}>
        <View style={styles.description}>
          <View style={styles.byline}>
            <ProfileAvatar name={reel.author.username || reel.author.displayName} uri={reel.author.avatar} size={30} />
            <Text style={styles.author} numberOfLines={1}>{reel.author.username || reel.author.displayName || 'Worth It? member'}</Text>
            {reel.media.kind === 'demo' && <Text style={styles.demo}>Demo</Text>}
          </View>
          {reel.caption ? <Text style={styles.caption} numberOfLines={4}>{reel.caption}</Text> : null}
        </View>
        <StarButton subject="reel" dark disabled={!active} starred={reel.liked} count={reel.likes}
          onToggle={(starred) => onStar(reel, starred)} />
      </View>
    </View>
  );
}

const viewability = { itemVisiblePercentThreshold: 65 };

function ReelPager({ reels, initialIndex, focused, onStar }: { reels: Reel[]; initialIndex: number; focused: boolean; onStar: (reel: Reel, starred: boolean) => Promise<void> }) {
  const [height, setHeight] = useState(0);
  const [index, setIndex] = useState(initialIndex);
  const list = useRef<FlatList<Reel>>(null);
  const syncVisible = useCallback(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const visible = viewableItems[0]?.index;
    if (visible !== null && visible !== undefined) setIndex(visible);
  }, []);

  const goTo = (next: number) => list.current?.scrollToIndex({ index: next, animated: true });

  return (
    <View style={styles.stage} onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)}>
      {height > 0 && (
        <>
          <FlatList
            ref={list} data={reels} keyExtractor={(reel) => reel.id}
            initialScrollIndex={initialIndex} initialNumToRender={2} windowSize={3}
            getItemLayout={(_data, itemIndex) => ({ index: itemIndex, length: height, offset: itemIndex * height })}
            showsVerticalScrollIndicator={false} snapToInterval={height} decelerationRate="fast" pagingEnabled
            viewabilityConfig={viewability} onViewableItemsChanged={syncVisible}
            renderItem={({ item, index: itemIndex }) => (
              <ReelSlide reel={item} height={height} active={focused && itemIndex === index} onStar={onStar} />
            )}
          />
          <View style={styles.pager}>
            <Text style={styles.counter}>{index + 1} / {reels.length}</Text>
            {index > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Previous reel" onPress={() => goTo(index - 1)} style={styles.step}><Text style={styles.overlayText}>↑</Text></Pressable>}
            {index + 1 < reels.length && <Pressable accessibilityRole="button" accessibilityLabel="Next reel" onPress={() => goTo(index + 1)} style={styles.step}><Text style={styles.overlayText}>↓</Text></Pressable>}
          </View>
        </>
      )}
    </View>
  );
}

export default function ReelsScreen() {
  const { session: { userId } } = useApp();
  const insets = useSafeAreaInsets();
  const { reel: requested, mine } = useLocalSearchParams<{ reel?: string; mine?: string }>();
  const [reels, setReels] = useState<Reel[] | null>(null);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);
  const myReels = mine === '1';

  const load = useCallback(async (canApply: () => boolean = () => true) => {
    try {
      const next = await socialRepo.listReels(userId, myReels ? userId : undefined);
      if (canApply()) { setReels(next); setError(''); }
    } catch (err) {
      if (canApply()) setError(err instanceof Error ? err.message : 'Could not load reels.');
    }
  }, [userId, myReels]);

  useFocusEffect(useCallback(() => {
    let active = true;
    setFocused(true);
    void load(() => active);
    return () => { active = false; setFocused(false); };
  }, [load]));

  const star = async (reel: Reel, starred: boolean) => {
    await socialRepo.setLiked(userId, reel, starred);
    setReels((current) => current?.map((item) => item.id === reel.id
      ? { ...item, liked: starred, likes: Math.max(0, item.likes + Number(starred) - Number(item.liked)) } : item) ?? null);
  };

  const targetIndex = Math.max(0, reels?.findIndex((reel) => reel.id === requested) ?? 0);
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={type.title} accessibilityRole="header">{myReels ? 'Your reels' : 'Reels'}</Text>
        <Button label="New reel" onPress={() => router.push('/new-reel')} />
      </View>
      {error ? (
        <View style={styles.state}><Banner kind="error">{error}</Banner><Button label="Try again" onPress={() => { setError(''); void load(); }} /></View>
      ) : !reels ? <View style={styles.state}><ActivityIndicator accessibilityLabel="Loading reels" color={colors.accent} /></View>
        : reels.length ? <ReelPager key={`${requested ?? 'feed'}:${targetIndex}`} reels={reels} initialIndex={targetIndex} focused={focused} onStar={star} />
        : <View style={styles.state}><Text style={type.body}>No reels yet.</Text></View>}
      <AppTabs active="reels" />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { width: '100%', maxWidth: 475, alignSelf: 'center', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  stage: { flex: 1, width: '100%', maxWidth: 475, alignSelf: 'center', backgroundColor: colors.ink, overflow: 'hidden' },
  slide: { width: '100%', backgroundColor: colors.ink, overflow: 'hidden' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 13, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  description: { flex: 1, backgroundColor: '#19172AE6', borderRadius: 14, padding: 11, gap: 7 },
  byline: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  author: { color: '#fff', fontSize: 13, fontWeight: '800', flexShrink: 1 },
  demo: { color: colors.tag, fontSize: 11, fontWeight: '700', marginLeft: 2 },
  caption: { color: '#fff', fontSize: 14, lineHeight: 19 },
  overlayText: { color: '#fff', fontWeight: '700' },
  pager: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#19172ACF' },
  counter: { color: '#fff', fontWeight: '700', fontSize: 12, borderRadius: 22, backgroundColor: '#19172ACF', overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 8 },
  state: { flex: 1, width: '100%', maxWidth: 475, padding: 16, alignSelf: 'center', justifyContent: 'center', gap: 10 },
});
