import React, { ReactNode, useState } from 'react';
import {
  ActivityIndicator, Image, ImageStyle, Pressable, RefreshControl, ScrollView, StyleProp, StyleSheet, Text,
  TextInput, TextInputProps, View, ViewStyle,
} from 'react-native';
import { Poll } from '../lib/types';
import { formatInr } from '../lib/format';
import { DEMO_IMAGES } from './demoImages';
import { colors, type } from './theme';

export function Screen({ children, onRefresh, refreshing }: { children: ReactNode; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={s.screenContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      <View style={s.column}>{children}</View>
    </ScrollView>
  );
}

type BtnProps = {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'quiet';
  loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; testID?: string;
};
export function Button({ label, onPress, variant = 'primary', loading, disabled, style, testID }: BtnProps) {
  const off = disabled || loading;
  const bg = variant === 'primary' ? colors.accent : variant === 'secondary' ? colors.surface : 'transparent';
  const fg = variant === 'primary' ? '#fff' : colors.ink;
  return (
    <Pressable
      testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'secondary' && { borderWidth: 1, borderColor: colors.border }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : null}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Banner({ kind, children, testID }: { kind: 'info' | 'warn' | 'error' | 'ok' | 'demo'; children: ReactNode; testID?: string }) {
  const map = {
    info: [colors.infoBg, colors.infoInk], warn: [colors.warnBg, colors.warnInk], error: [colors.dangerBg, colors.danger],
    ok: [colors.okBg, colors.okInk], demo: [colors.warnBg, colors.warnInk],
  } as const;
  const [bg, fg] = map[kind];
  return (
    <View testID={testID} accessibilityRole={kind === 'error' ? 'alert' : undefined} style={[s.banner, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function Field({ label, hint, error, ...input }: { label: string; hint?: string; error?: string } & TextInputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        {...input} accessibilityLabel={label} placeholderTextColor="#8A93A3"
        onFocus={(e) => { setFocus(true); input.onFocus?.(e); }} onBlur={(e) => { setFocus(false); input.onBlur?.(e); }}
        style={[s.input, focus && { borderColor: colors.ink }, !!error && { borderColor: colors.danger }, input.multiline && { minHeight: 84, textAlignVertical: 'top' }]}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
}

export function Badge({ label, tone = 'demo' }: { label: string; tone?: 'demo' | 'ok' | 'muted' | 'info' }) {
  const map = { demo: [colors.ink, '#fff'], ok: [colors.okBg, colors.okInk], muted: ['#E4E8EE', colors.muted], info: [colors.infoBg, colors.infoInk] } as const;
  const [bg, fg] = map[tone];
  return <View style={[s.badge, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{label}</Text></View>;
}

/** Price tag with a punched hole. */
export function PriceTag({ price, label = 'Asking', size = 'large' }: { price: number; label?: string; size?: 'large' | 'small' }) {
  const big = size === 'large';
  return (
    <View style={[s.tag, big ? { paddingVertical: 8, paddingLeft: 30, paddingRight: 16 } : { paddingVertical: 4, paddingLeft: 22, paddingRight: 10 }]}
      accessible accessibilityLabel={`${label} price ${formatInr(price)}`}>
      <View style={[s.hole, big ? { left: 11, top: '50%', marginTop: -5 } : { left: 8, top: '50%', marginTop: -4, width: 8, height: 8 }]} />
      <Text style={{ fontSize: big ? 11 : 10, color: colors.ink, fontWeight: '700' }}>{label}</Text>
      <Text style={{ fontSize: big ? 28 : 17, fontWeight: '900', color: colors.ink, fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}>{formatInr(price)}</Text>
    </View>
  );
}

export function PollImage({ poll, style }: { poll: Pick<Poll, 'demoImage' | 'imageUrl' | 'itemName'>; style: StyleProp<ImageStyle> }) {
  const [failed, setFailed] = useState(false);
  const src = poll.demoImage ? DEMO_IMAGES[poll.demoImage] : poll.imageUrl ? { uri: poll.imageUrl } : null;
  if (!src || failed) {
    return <View style={[style as StyleProp<ViewStyle>, s.imgFallback]}><Text style={type.small}>Photo unavailable</Text></View>;
  }
  return <Image source={src} style={style} resizeMode="cover" accessibilityLabel={`Photo of ${poll.itemName}`} onError={() => setFailed(true)} />;
}

export function Centered({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>{children}</View>;
}

const s = StyleSheet.create({
  screenContent: { padding: 16, paddingBottom: 48, alignItems: 'center' },
  column: { width: '100%', maxWidth: 560, gap: 16 },
  btn: { minHeight: 48, borderRadius: 13, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  btnText: { fontSize: 15, fontWeight: '700' },
  banner: { borderRadius: 12, padding: 12 },
  label: { fontSize: 15, fontWeight: '700', color: colors.ink },
  input: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 17, color: colors.ink, minHeight: 50 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tag: { backgroundColor: colors.tag, borderRadius: 10, alignSelf: 'flex-start', justifyContent: 'center' },
  hole: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.bg },
  imgFallback: { backgroundColor: '#DDE2E9', alignItems: 'center', justifyContent: 'center' },
});
