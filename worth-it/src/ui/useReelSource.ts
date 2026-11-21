import { useEffect, useState } from 'react';
import { openDeviceVideo, type VideoHandle } from '../lib/socialVideo';
import type { Reel } from '../lib/socialRepo';
const demos: Record<string, number> = {
  stride: require('../../assets/demo/stride-reel.mp4'),
  trail: require('../../assets/demo/trail-reel.mp4'),
  'oversized-tee': require('../../assets/demo/oversized-tee-reel.mp4'),
  'cargo-pants': require('../../assets/demo/cargo-pants-reel.mp4'),
  'everyday-hoodie': require('../../assets/demo/everyday-hoodie-reel.mp4'),
  'city-backpack': require('../../assets/demo/city-backpack-reel.mp4'),
  'wireless-earbuds': require('../../assets/demo/wireless-earbuds-reel.mp4'),
  'over-ear-headphones': require('../../assets/demo/over-ear-headphones-reel.mp4'),
  'fitness-watch': require('../../assets/demo/fitness-watch-reel.mp4'),
  'desk-lamp': require('../../assets/demo/desk-lamp-reel.mp4'),

};
export type PosterMedia = Pick<Reel, 'media' | 'poster'>;
export function useReelSource(reel: PosterMedia, enabled = true) {
  const { kind, value } = reel.media;
  const [local, setLocal] = useState<{ key: string; uri?: string; failed?: boolean }>();
  useEffect(() => {
    if (!enabled || kind !== 'device') return;
    let live = true;
    let handle: VideoHandle | undefined;
    void openDeviceVideo(value)
      .then((next) => {
        if (!live) {
          next.release?.();
          return;
        }
        handle = next;
        setLocal({ key: value, uri: next.uri });
      })
      .catch(() => {
        if (live) setLocal({ key: value, failed: true });
      });
    return () => {
      live = false;
      handle?.release?.();
    };
  }, [enabled, kind, value]);
  const source = !enabled
    ? undefined
    : kind === 'demo'
      ? demos[value]
      : kind === 'remote'
        ? value || undefined
        : local?.key === value
          ? local.uri
          : undefined;
  return {
    source,
    failed:
      kind === 'remote'
        ? !value
        : kind === 'demo'
          ? !demos[value]
          : local?.key === value && !!local.failed,
  };
}
