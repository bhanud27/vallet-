import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { repo } from '../lib/repo';
import { REEL_CAPTION_MAX, socialRepo } from '../lib/socialRepo';
import { validateSelectedVideo } from '../lib/socialVideo';
import type { SelectedVideo } from '../lib/socialVideo';
import { useApp } from '../ui/AppContext';
import { Banner, Button, Field, Screen } from '../ui/kit';
import { ReelVideo } from '../ui/ReelVideo';
import { SocialIcon } from '../ui/SocialIcon';
import { colors, type } from '../ui/theme';

export default function NewReel() {
  const { session } = useApp();
  const [video, setVideo] = useState<SelectedVideo | null>(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function pickVideo() {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'] });
      if (result.canceled) return;
      const selected = result.assets[0];
      validateSelectedVideo(selected);
      setVideo(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open your videos.');
    }
  }

  async function publish() {
    if (!video) return setError('Choose an MP4 video first.');
    setSaving(true);
    setError('');
    try {
      const reel = await socialRepo.postReel(session.userId, caption, video);
      router.replace({ pathname: '/reels', params: { reel } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish your reel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={styles.card}>
        <Text style={type.h2}>Video</Text>
        {video ? <View style={styles.preview}><ReelVideo key={video.uri} source={video.uri} autoPlay={false} /></View> : (
          <View style={styles.placeholder}>
            <SocialIcon name="reels" color={colors.accent} />
            <Text style={type.small}>MP4 · Up to 20 MB</Text>
          </View>
        )}
        <Button label={video ? 'Replace video' : 'Choose video'} variant="secondary" onPress={pickVideo} disabled={saving} />
        <Field label="Caption (optional)" placeholder="What was worth the price?" value={caption}
          onChangeText={setCaption} maxLength={REEL_CAPTION_MAX} multiline editable={!saving} />
        <Text style={type.small}>{repo.mode === 'local' ? 'This reel stays on this device in local demo mode.' : 'Your reel, profile name, and photo will be visible in the Reels feed.'}</Text>
      </View>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <Button label={saving ? 'Publishing…' : 'Publish reel'} onPress={publish} loading={saving} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: 13, padding: 15, borderWidth: 1, borderColor: colors.border, borderRadius: 17, backgroundColor: colors.surface },
  placeholder: { minHeight: 142, gap: 8, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', maxWidth: 245, aspectRatio: 9 / 16, alignSelf: 'center', backgroundColor: colors.ink, overflow: 'hidden', borderRadius: 12 },
});
