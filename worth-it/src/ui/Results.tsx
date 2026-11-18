import React from 'react';
import { Text, View } from 'react-native';
import { timeAgo } from '../lib/format';
import { CHOICES, CHOICE_LABEL, VoteEntry } from '../lib/types';
import { Badge } from './kit';
import { choiceColor, colors, type } from './theme';

export function Results({ votes }: { votes: VoteEntry[] }) {
  const total = votes.length;
  const counts = Object.fromEntries(CHOICES.map((c) => [c, votes.filter((v) => v.choice === c).length])) as Record<string, number>;
  const reasons = votes.filter((v) => v.reason);

  return (
    <View style={{ gap: 12, backgroundColor: colors.surface, padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 17 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text style={type.h2}>Results</Text>
        <Text testID="total-votes" style={[type.body, { fontWeight: '800' }]}>{total} {total === 1 ? 'vote' : 'votes'}</Text>
      </View>

      {total === 0 ? (
        <Text style={type.body}>No votes yet. Share the link to get the first one.</Text>
      ) : (
        CHOICES.map((c) => {
          const pct = Math.round((counts[c] / total) * 100);
          return (
            <View key={c} style={{ gap: 4 }} accessible accessibilityLabel={`${CHOICE_LABEL[c]}: ${counts[c]} votes, ${pct} percent`}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[type.body, { fontWeight: '700' }]}>{CHOICE_LABEL[c]}</Text>
                <Text testID={`count-${c}`} style={type.body}>{counts[c]} · {pct}%</Text>
              </View>
              <View style={{ height: 8, borderRadius: 5, backgroundColor: '#EFEDF2', overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: choiceColor[c] }} />
              </View>
            </View>
          );
        })
      )}

      {total > 0 ? (
        <View style={{ gap: 10, marginTop: 4 }}>
          <Text style={type.h2}>Why they voted that way</Text>
          {reasons.length === 0 ? <Text style={type.small}>Nobody left a reason yet.</Text> : reasons.map((v) => (
            <View key={v.id} testID="reason" style={{ backgroundColor: colors.bg, borderRadius: 11, padding: 12, gap: 6 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={{ fontWeight: '800', color: choiceColor[v.choice] }}>{CHOICE_LABEL[v.choice]}</Text>
                {v.ownsItem ? <Badge tone="info" label="Owns this item" /> : null}
                <Text style={type.small}>{timeAgo(v.createdAt)}</Text>
              </View>
              <Text style={type.body}>{v.reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
