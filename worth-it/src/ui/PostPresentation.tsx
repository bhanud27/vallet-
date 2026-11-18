import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { timeAgo } from '../lib/format';
import { Poll } from '../lib/types';
import { Badge, PollImage, PriceTag } from './kit';
import { SocialIcon } from './SocialIcon';
import { colors, type } from './theme';

export function PostIdentity({ poll, mine }: { poll: Poll; mine: boolean }) {
  return (
    <View style={styles.identity}>
      <View style={styles.avatar}>
        <SocialIcon name={poll.isDemo ? 'photo' : 'person'} color={colors.accent} />
      </View>
      <View style={styles.identityText}>
        <Text style={styles.author}>{poll.isDemo ? 'Worth It? demo' : mine ? 'Your poll' : 'Shared poll'}</Text>
        <Text style={type.small}>{timeAgo(poll.createdAt)}</Text>
      </View>
      {poll.isDemo ? <Badge label="DEMO" tone="info" /> : null}
    </View>
  );
}

export function PostPhoto({ poll }: { poll: Poll }) {
  return (
    <View style={styles.media}>
      <PollImage poll={poll} style={styles.image} />
      <View style={styles.price}><PriceTag price={poll.priceInr} size="small" /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, paddingVertical: 11 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentSoft },
  identityText: { flex: 1, gap: 1 },
  author: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  media: { width: '100%', aspectRatio: 4 / 3, backgroundColor: colors.accentSoft },
  image: { position: 'absolute', width: '100%', height: '100%' },
  price: { position: 'absolute', left: 12, bottom: 12 },
});
