import { Link, useIsFocused } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { openDevicePhoto, openDeviceVideo } from '../lib/socialVideo';
import type { VideoHandle } from '../lib/socialVideo';
import type { PollMedia } from '../lib/types';
import { parseProductUrl } from '../lib/validation';
import { ReelVideo } from './ReelVideo';
import { colors, type } from './theme';

function GalleryVideo({ uri }: { uri: string }) {
  const focused = useIsFocused();
  return focused ? <ReelVideo source={uri} autoPlay={false} contentFit="contain" /> : null;
}

export function GalleryMedia({ item, label }: { item: PollMedia; label: string }) {
  const [localUri, setLocalUri] = useState<string>();
  const [failed, setFailed] = useState(false);
  const { device, kind, value } = item;

  useEffect(() => {
    if (!device) return;
    let live = true;
    let handle: VideoHandle | undefined;
    const open = kind === 'video' ? openDeviceVideo : openDevicePhoto;
    open(value).then((next) => {
      if (!live) { next.release?.(); return; }
      handle = next;
      setLocalUri(next.uri);
    }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; handle?.release?.(); };
  }, [device, kind, value]);

  const uri = device ? localUri : value;
  if (failed || !uri) {
    return <View style={styles.center}><Text style={type.small}>{failed ? 'Media unavailable' : 'Loading media…'}</Text></View>;
  }
  return kind === 'video' ? <GalleryVideo uri={uri} /> : (
    <Image source={{ uri }} accessibilityLabel={label} style={styles.image} resizeMode="contain" onError={() => setFailed(true)} />
  );
}

export function ProductImageLink({ url }: { url?: string }) {
  const href = url ? parseProductUrl(url) : null;
  if (!href) return null;
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" accessibilityLabel="View product" style={styles.link}>
      View product ↗
    </Link>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  link: { position: 'absolute', right: 10, bottom: 10, minHeight: 44, paddingHorizontal: 12, lineHeight: 44,
    backgroundColor: colors.ink, borderRadius: 11, overflow: 'hidden', color: '#fff', fontSize: 13, fontWeight: '800', textDecorationLine: 'none' },
});
