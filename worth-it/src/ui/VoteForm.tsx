import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { repo } from '../lib/repo';
import { CHOICES, Choice, CHOICE_LABEL } from '../lib/types';
import { LIMITS } from '../lib/validation';
import { Banner, Button, Field } from './kit';
import { choiceBackground, choiceColor, colors, type } from './theme';

export function VoteForm({ pollId, onVoted, initialChoice }: { pollId: string; onVoted: () => void; initialChoice?: Choice }) {
  const [choice, setChoice] = useState<Choice | null>(initialChoice ?? null);
  const [reason, setReason] = useState('');
  const [owns, setOwns] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!choice) return setError('Pick Buy, Wait for a sale, or Skip first.');
    setBusy(true); setError(null);
    try { await repo.castVote(pollId, { choice, reason, ownsItem: owns }); onVoted(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not submit your vote.'); }
    finally { setBusy(false); }
  }

  return (
    <View style={styles.card}>
      <Text style={type.h2}>Your vote</Text>
      <View style={styles.choices} accessibilityRole="radiogroup">{CHOICES.map((c) => {
        const on = choice === c;
        return (
          <Pressable
            key={c} testID={`vote-${c}`} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on}
            onPress={() => { setChoice(c); setError(null); }}
            style={({ pressed }) => [styles.choice, {
              backgroundColor: on ? choiceColor[c] : choiceBackground[c], opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text style={{ fontSize: 14, fontWeight: '800', color: on ? '#fff' : choiceColor[c] }}>{CHOICE_LABEL[c]}</Text>
          </Pressable>
        );
      })}</View>
      <Field testID="reason-input" label="Why? (optional)" value={reason} onChangeText={setReason} maxLength={LIMITS.reason} multiline hint={`${reason.length}/${LIMITS.reason}. Visible to everyone with the link.`} />
      <Pressable testID="owns-toggle" accessibilityRole="checkbox" accessibilityState={{ checked: owns }} onPress={() => setOwns(!owns)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
        <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: colors.ink, backgroundColor: owns ? colors.ink : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
          {owns ? <Text style={{ color: '#fff', fontWeight: '900' }}>✓</Text> : null}
        </View>
        <Text style={type.body}>I own this item</Text>
      </Pressable>
      {error ? <Banner kind="error" testID="vote-error">{error}</Banner> : null}
      <Button testID="submit-vote" label={busy ? 'Submitting…' : 'Submit vote'} loading={busy} onPress={submit} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12, padding: 15, backgroundColor: colors.surface, borderRadius: 17, borderWidth: 1, borderColor: colors.border },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  choice: { flexGrow: 1, minHeight: 45, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 11, paddingVertical: 5 },
});
