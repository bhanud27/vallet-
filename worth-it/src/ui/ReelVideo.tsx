import { ContentTap } from "./ContentTap";
import { useReelSource } from "./useReelSource";
import {
  autoplayEnabled,
  isLowData,
  subscribePreferences,
} from "../lib/preferences";
import { useEvent } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import type { VideoPlayer, VideoSource } from "expo-video";
import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Reel } from "../lib/socialRepo";

interface ReelSound {
  muted: boolean;
  onChange: (muted: boolean) => void;
}

function setPlayerMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

export type VideoTap = {
  kind: "poll" | "reel";
  id: string;
  onOpen?: () => void;
  starDisabled?: boolean;
};
type ReelVideoProps = {
  tap?: VideoTap;
  source: VideoSource;
  active?: boolean;
  paused?: boolean;
  autoPlay?: boolean;
  contentFit?: "cover" | "contain";
  sound?: ReelSound;
  controlTop?: number;
};
export function ReelVideo(props: ReelVideoProps) {
  const lowData = useSyncExternalStore(
    subscribePreferences,
    isLowData,
    () => false,
  );
  const [requested, setRequested] = useState(false);
  const autoplay = useSyncExternalStore(
    subscribePreferences,
    autoplayEnabled,
    () => true,
  );
  if (props.active === false && (lowData || !autoplay))
    return <View style={styles.center} />;
  if ((lowData || !autoplay) && props.autoPlay !== false && !requested) {
    if (props.tap)
      return (
        <ContentTap
          {...props.tap}
          accessibilityRole="button"
          accessibilityLabel={
            props.tap.onOpen ? "Open check" : "Play video with data saver"
          }
          disabled={props.paused}
          onOpen={props.tap.onOpen ?? (() => setRequested(true))}
          style={styles.center}
        >
          <Text style={styles.notice}>Tap to play</Text>
        </ContentTap>
      );
    return (
      <Pressable
        style={styles.center}
        accessibilityRole="button"
        accessibilityLabel="Play video with data saver"
        disabled={props.paused}
        onPress={() => setRequested(true)}
      >
        <Text style={styles.notice}>Tap to play</Text>
      </Pressable>
    );
  }
  return <PlayerVideo {...props} />;
}
function PlayerVideo({
  source,
  autoPlay = true,
  active = true,
  paused = false,
  contentFit = "cover",
  controlTop = 12,
  sound,
  tap,
}: {
  tap?: VideoTap;
  source: VideoSource;
  active?: boolean;
  paused?: boolean;
  autoPlay?: boolean;
  contentFit?: "cover" | "contain";
  sound?: ReelSound;
  controlTop?: number;
}) {
  const [appActive, setAppActive] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setAppActive(state === "active"),
    );
    return () => sub.remove();
  }, []);
  const [localMuted, setLocalMuted] = useState(true);
  const [webAutoplayMuted, setWebAutoplayMuted] = useState(false);
  const [playError, setPlayError] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const view = useRef<VideoView>(null);
  const playbackAttempt = useRef(0);
  const muted = (sound?.muted ?? localMuted) || webAutoplayMuted;
  const playbackAllowed = useRef(false);
  useEffect(() => {
    playbackAllowed.current = active && !paused && appActive;
    return () => {
      playbackAllowed.current = false;
    };
  }, [active, paused, appActive]);
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = true;
    instance.bufferOptions = {
      preferredForwardBufferDuration: 4,
      minBufferForPlayback: 0.5,
      maxBufferBytes: 8 * 1024 * 1024,
      prioritizeTimeOverSizeThreshold: false,
    };
    instance.muted = sound?.muted ?? true;
  });
  const { isPlaying } = useEvent(player, "playingChange", {
    isPlaying: player.playing,
  });
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });

  useEffect(() => {
    if (
      !autoPlay ||
      !appActive ||
      paused ||
      !active ||
      userPaused ||
      status === "error"
    ) {
      player.pause();
      return;
    }
    let live = true;
    const attempt = ++playbackAttempt.current;
    const element =
      Platform.OS === "web"
        ? (view.current?.nativeRef?.current as HTMLVideoElement | undefined)
        : undefined;
    if (!element) {
      player.play();
      return;
    }
    void element.play().catch((reason) => {
      if (!live || attempt !== playbackAttempt.current) return;
      if (reason?.name !== "NotAllowedError") {
        if (reason?.name !== "AbortError") setPlayError(true);
        return;
      }
      if (element.muted) return;
      setPlayerMuted(player, true);
      setWebAutoplayMuted(true);
      return element.play().catch(() => {
        /* Leave the manual play control available. */
      });
    });
    return () => {
      live = false;
    };
  }, [autoPlay, player, appActive, paused, active, userPaused, status]);
  if (!active && userPaused) setUserPaused(false);

  function play() {
    if (paused || !appActive || !active) return;
    setUserPaused(false);
    const element =
      Platform.OS === "web"
        ? (view.current?.nativeRef?.current as HTMLVideoElement | undefined)
        : undefined;
    const attempt = ++playbackAttempt.current;
    setPlayError(false);
    if (element)
      void element.play().catch((reason) => {
        if (
          attempt === playbackAttempt.current &&
          reason?.name !== "AbortError" &&
          reason?.name !== "NotAllowedError"
        )
          setPlayError(true);
      });
    else player.play();
  }

  function toggleSound() {
    const next = !muted;
    playbackAttempt.current++;
    setPlayerMuted(player, next);
    setWebAutoplayMuted(false);
    if (sound) sound.onChange(next);
    else setLocalMuted(next);
    if (!next && (isPlaying || webAutoplayMuted)) play();
  }

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={active ? "auto" : "none"}
    >
      <VideoView
        ref={view}
        player={player}
        style={styles.video}
        nativeControls={false}
        contentFit={contentFit}
        surfaceType="textureView"
        playsInline
      />
      {status === "error" ? (
        <View style={styles.center}>
          <Text style={styles.notice}>This video could not be played.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry video"
            disabled={retrying || !active}
            style={{ padding: 14, minHeight: 44 }}
            onPress={async () => {
              setRetrying(true);
              setPlayError(false);
              try {
                await player.replaceAsync(source);
                if (playbackAllowed.current) player.play();
              } catch {
                setPlayError(true);
              } finally {
                setRetrying(false);
              }
            }}
          >
            <Text style={styles.notice}>
              {retrying ? "Retrying..." : "Retry video"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          {tap ? (
            <ContentTap
              starDisabled={tap.starDisabled}
              kind={tap.kind}
              id={tap.id}
              accessibilityRole="button"
              accessibilityLabel={
                tap.onOpen
                  ? "Open content"
                  : isPlaying
                    ? "Pause video"
                    : "Play video"
              }
              disabled={paused || !appActive || !active}
              onOpen={
                tap.onOpen ??
                (() => {
                  if (isPlaying) {
                    playbackAttempt.current++;
                    setUserPaused(true);
                    player.pause();
                  } else play();
                })
              }
              style={styles.center}
            >
              {playError ? (
                <Text style={styles.notice}>Couldn’t play. Tap to retry.</Text>
              ) : status === "loading" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                !isPlaying && <Text style={styles.playMark}>▶</Text>
              )}
            </ContentTap>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? "Pause video" : "Play video"}
              disabled={paused || !appActive || !active}
              onPress={() => {
                if (isPlaying) {
                  playbackAttempt.current++;
                  setUserPaused(true);
                  player.pause();
                } else play();
              }}
              style={styles.center}
            >
              {playError ? (
                <Text style={styles.notice}>Couldn’t play. Tap to retry.</Text>
              ) : status === "loading" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                !isPlaying && <Text style={styles.playMark}>▶</Text>
              )}
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={muted ? "Unmute video" : "Mute video"}
            disabled={!active}
            onPress={toggleSound}
            style={[styles.sound, { top: controlTop }]}
          >
            <Text style={styles.notice}>{muted ? "Muted" : "Sound on"}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

export function StoredReelVideo({
  reel,
  active = true,
  sound,
  paused = false,
  contentFit = "cover",
  controlTop = 12,
  tap,
}: {
  tap?: VideoTap;
  reel: Reel;
  sound?: ReelSound;
  controlTop?: number;
  active?: boolean;
  paused?: boolean;
  contentFit?: "cover" | "contain";
}) {
  const { source, failed } = useReelSource(reel);
  if (source)
    return (
      <ReelVideo
        source={source}
        active={active}
        tap={tap}
        sound={sound}
        paused={paused}
        contentFit={contentFit}
        controlTop={controlTop}
      />
    );
  return (
    <View style={styles.center}>
      {failed ? (
        <Text style={styles.notice}>This video is unavailable.</Text>
      ) : (
        <ActivityIndicator color="#fff" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  video: { ...StyleSheet.absoluteFill, width: "100%", height: "100%" },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  playMark: {
    color: "#fff",
    backgroundColor: "#151515BD",
    borderRadius: 30,
    textAlign: "center",
    fontSize: 24,
    width: 58,
    height: 58,
    lineHeight: 58,
  },
  sound: {
    position: "absolute",
    right: 12,
    top: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: "#151515CF",
  },
  notice: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
