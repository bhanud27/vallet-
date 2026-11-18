import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from './theme';

export type SocialIconName = 'feed' | 'plus' | 'person' | 'message' | 'arrow' | 'photo';

export function SocialIcon({ name, color = colors.ink }: { name: SocialIconName; color?: string }) {
  const stroke = { borderColor: color };
  const fill = { backgroundColor: color };

  return (
    <View style={styles.icon} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {name === 'feed' && (
        <View style={[styles.feed, stroke]}>
          <View style={[styles.feedLine, fill]} />
          <View style={[styles.feedLine, fill]} />
        </View>
      )}
      {name === 'plus' && <><View style={[styles.horizontal, fill]} /><View style={[styles.vertical, fill]} /></>}
      {name === 'person' && <><View style={[styles.head, stroke]} /><View style={[styles.shoulders, stroke]} /></>}
      {name === 'message' && <><View style={[styles.bubble, stroke]} /><View style={[styles.tail, stroke]} /></>}
      {name === 'arrow' && <View style={[styles.arrow, stroke]} />}
      {name === 'photo' && (
        <View style={[styles.photo, stroke]}>
          <View style={[styles.sun, fill]} />
          <View style={[styles.mountain, stroke]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  feed: { width: 18, height: 18, borderWidth: 2, borderRadius: 5, padding: 3, gap: 3 },
  feedLine: { height: 2, width: '100%', borderRadius: 1 },
  horizontal: { position: 'absolute', width: 15, height: 2, borderRadius: 1 },
  vertical: { position: 'absolute', width: 2, height: 15, borderRadius: 1 },
  head: { position: 'absolute', top: 3, width: 8, height: 8, borderWidth: 2, borderRadius: 4 },
  shoulders: { position: 'absolute', bottom: 3, width: 16, height: 8, borderWidth: 2, borderTopLeftRadius: 7, borderTopRightRadius: 7, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  bubble: { position: 'absolute', top: 3, width: 17, height: 14, borderWidth: 2, borderRadius: 5 },
  tail: { position: 'absolute', left: 6, top: 14, width: 4, height: 6, borderLeftWidth: 2, transform: [{ rotate: '30deg' }] },
  arrow: { width: 8, height: 8, borderRightWidth: 2, borderTopWidth: 2, transform: [{ rotate: '45deg' }] },
  photo: { width: 19, height: 17, borderRadius: 4, borderWidth: 2, overflow: 'hidden' },
  sun: { position: 'absolute', width: 4, height: 4, borderRadius: 2, top: 2, left: 2 },
  mountain: { position: 'absolute', width: 10, height: 10, borderTopWidth: 2, borderLeftWidth: 2, top: 7, left: 5, transform: [{ rotate: '45deg' }] },
});
