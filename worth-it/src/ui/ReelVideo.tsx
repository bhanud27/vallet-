import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { VideoSource } from 'expo-video';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Reel } from '../lib/socialRepo';
import { openDeviceVideo } from '../lib/socialVideo';
import type { VideoHandle } from '../lib/socialVideo';

const demoSources: Record<string, number> = {
  stride: require('../../assets/demo/stride-reel.mp4'),
  trail: require('../../assets/demo/trail-reel.mp4'),
};

export function ReelVideo({ source, autoPlay = true, contentFit = 'cover' }: { source: VideoSource; autoPlay?: boolean; contentFit?: 'cover' | 'contain' }) {
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    if (autoPlay) player.play();
  }, [autoPlay, player]);

  function toggleSound() {
    // eslint-disable-next-line react-hooks/immutability -- Expo exposes muted as a writable player property.
    player.muted = !muted;
    setMuted(!muted);
  }

  return (
    <View style={StyleSheet.absoluteFill}>
      <VideoView player={player} style={styles.video} nativeControls={false} contentFit={contentFit} surfaceType="textureView" playsInline />
      {status === 'error' ? (
        <View style={styles.center}><Text style={styles.notice}>This video could not be played.</Text></View>
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
            onPress={() => isPlaying ? player.pause() : player.play()} style={styles.center}>
            {status === 'loading' ? <ActivityIndicator color="#fff" /> : !isPlaying && <Text style={styles.playMark}>▶</Text>}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute video' : 'Mute video'}
            onPress={toggleSound} style={styles.sound}>
            <Text style={styles.notice}>{muted ? 'Muted' : 'Sound on'}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function StoredReelVideo({ reel }: { reel: Reel }) {
  const [source, setSource] = useState<string>();
  const [error, setError] = useState(false);
  const { kind, value } = reel.media;

  useEffect(() => {
    if (kind !== 'device') return;
    let active = true;
    let handle: VideoHandle | undefined;
    openDeviceVideo(value).then((video) => {
      if (!active) { video.release?.(); return; }
      handle = video;
      setSource(video.uri);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; handle?.release?.(); };
  }, [kind, value]);

  const video = kind === 'demo' ? demoSources[value] : kind === 'remote' ? value : source;
  if (video) return <ReelVideo source={video} />;
  return <View style={styles.center}>{error ? <Text style={styles.notice}>Could not open this video.</Text> : <ActivityIndicator color="#fff" />}</View>;
}

const styles = StyleSheet.create({
  video: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playMark: { color: '#fff', backgroundColor: '#19172ABD', borderRadius: 30, textAlign: 'center', fontSize: 24, width: 58, height: 58, lineHeight: 58 },
  sound: { position: 'absolute', right: 12, top: 12, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 22, backgroundColor: '#19172ACF' },
  notice: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
