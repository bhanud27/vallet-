import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SocialIcon, SocialIconName } from './SocialIcon';
import { colors } from './theme';

export function AppTabs({ active, desktop = false, onFeed }: { active: 'feed' | 'reels' | 'profile'; desktop?: boolean; onFeed?: () => void }) {
  const insets = useSafeAreaInsets();
  const items: { icon: SocialIconName; label: string; action: () => void; testID?: string }[] = [
    { icon: 'feed', label: 'Feed', action: onFeed ?? (() => router.navigate('/')) },
    { icon: 'reels', label: 'Reels', action: () => router.navigate('/reels') },
    { icon: 'plus', label: 'New poll', action: () => router.push('/new'), testID: 'new-poll' },
    { icon: 'person', label: 'Profile', action: () => router.navigate('/profile') },
  ];

  return (
    <View style={desktop ? styles.rail : [styles.bar, { paddingBottom: Math.max(insets.bottom, 7) }]}>
      {items.map(({ icon, label, action, testID }) => {
        const selected = label.toLowerCase() === active;
        const create = icon === 'plus';
        return (
          <Pressable key={icon} testID={testID} accessibilityRole="button" accessibilityLabel={label}
            accessibilityState={{ selected }} aria-pressed={selected} onPress={action}
            style={({ pressed }) => [styles.item, desktop ? styles.railItem : styles.barItem, desktop && selected && styles.railSelected, pressed && styles.pressed]}>
            <View style={create && styles.createIcon}>
              <SocialIcon name={icon} color={create ? colors.surface : selected ? colors.accent : colors.muted} />
            </View>
            <Text style={[styles.text, desktop && styles.railText, selected && styles.selectedText]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: 1, borderColor: colors.border, paddingTop: 4, paddingHorizontal: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  rail: { gap: 9 },
  item: { alignItems: 'center', borderRadius: 13 },
  railItem: { flexDirection: 'row', paddingHorizontal: 13, minHeight: 51, gap: 11 },
  railSelected: { backgroundColor: colors.accentSoft },
  barItem: { flex: 1, justifyContent: 'center', minHeight: 51, gap: 3 },
  text: { fontSize: 11, fontWeight: '700', color: colors.muted },
  railText: { fontSize: 15 },
  selectedText: { color: colors.accent },
  createIcon: { borderRadius: 9, width: 30, height: 30, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.76 },
});
