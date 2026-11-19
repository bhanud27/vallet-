import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { SocialIcon } from './SocialIcon';
import { colors } from './theme';

export function ProfileAvatar({ name, uri, size = 40 }: { name: string; uri: string | null; size?: number }) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((word) => Array.from(word)[0]).join('').toUpperCase();
  const shape = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[styles.avatar, shape]}>
      {uri ? <Image source={{ uri }} style={shape} accessibilityLabel="Profile photo" /> : initials ? (
        <Text style={[styles.initials, { fontSize: Math.max(11, size * 0.34) }]}>{initials}</Text>
      ) : <SocialIcon name="person" color={colors.accent} />}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { color: colors.accent, fontWeight: '800' },
});
