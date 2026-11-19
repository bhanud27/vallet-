import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export function StarButton({ starred, count, subject, onToggle, dark = false, disabled = false }: {
  starred: boolean;
  count: number;
  subject: 'poll' | 'reel';
  onToggle: (starred: boolean) => Promise<void>;
  dark?: boolean;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const label = `${starred ? 'Unstar' : 'Star'} ${subject}`;

  async function toggle() {
    setError(false);
    setPending(true);
    try { await onToggle(!starred); }
    catch { setError(true); }
    finally { setPending(false); }
  }

  return (
    <View style={styles.group}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={`${count} ${count === 1 ? 'star' : 'stars'}`}
        accessibilityState={{ selected: starred, busy: pending, disabled: disabled || pending }} aria-pressed={starred}
        disabled={disabled || pending} onPress={toggle}
        style={({ pressed }) => [styles.button, dark ? styles.dark : styles.light, !dark && starred && styles.selected, (pressed || pending) && styles.fade]}>
        <Text style={[styles.symbol, dark && styles.white, dark && starred && styles.lime]}>{starred ? '★' : '☆'}</Text>
        <Text style={[styles.count, dark && styles.white]}>{count}</Text>
      </Pressable>
      {error && <Text accessibilityRole="alert" style={[styles.error, dark && styles.darkError]}>Couldn’t save star</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { alignSelf: 'flex-end', alignItems: 'center', gap: 3 },
  button: { minWidth: 48, minHeight: 44, paddingHorizontal: 9, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 5 },
  light: { flexDirection: 'row', backgroundColor: colors.surface },
  dark: { minHeight: 60, backgroundColor: '#19172AE6', gap: 0 },
  selected: { backgroundColor: colors.accentSoft },
  symbol: { color: colors.accent, fontSize: 23, lineHeight: 26 },
  count: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  white: { color: '#fff' },
  lime: { color: colors.tag },
  fade: { opacity: 0.65 },
  error: { color: colors.danger, fontSize: 11 },
  darkError: { color: '#fff', backgroundColor: colors.ink, padding: 4, borderRadius: 4 },
});
