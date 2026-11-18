import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Platform, Share, Text, View } from 'react-native';
import { repo } from '../lib/repo';
import { pollLink } from '../lib/share';
import { Banner, Button } from './kit';
import { colors, type } from './theme';

export function SharePanel({ pollId }: { pollId: string }) {
  const { url, reachable } = pollLink(pollId);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function copy() {
    setErr(null);
    try { await Clipboard.setStringAsync(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setErr('Couldn’t copy automatically. Press and hold the link above to copy it.'); }
  }
  async function share() {
    setErr(null);
    try { await Share.share({ message: `Is this worth it? ${url}`, url }); }
    catch { await copy(); }
  }
  const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && !!(navigator as Navigator).share);

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.border }}>
      <Text style={type.h2}>Share this poll</Text>
      <Text selectable testID="share-url" style={{ fontSize: 14, color: colors.ink, backgroundColor: '#F2F4F7', padding: 10, borderRadius: 8 }}>{url}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button testID="copy-link" style={{ flex: 1 }} label={copied ? 'Link copied' : 'Copy link'} onPress={copy} />
        {canShare ? <Button style={{ flex: 1 }} variant="secondary" label="Share…" onPress={share} /> : null}
      </View>
      {err ? <Banner kind="error">{err}</Banner> : null}
      <Banner kind="warn">Anyone with this link can view the photo, price and all votes. The link isn’t listed anywhere, but it isn’t password-protected.</Banner>
      {!reachable ? (
        <Banner kind="info" testID="unreachable-note">
          {repo.mode === 'local'
            ? 'Local demo mode: this link only works in this browser on this device. To let a friend open it on their phone, connect Supabase and host the web build (see the README).'
            : 'This link points to a local address that other phones can’t reach. Host the web build or set EXPO_PUBLIC_WEB_URL (see the README).'}
        </Banner>
      ) : null}
    </View>
  );
}
