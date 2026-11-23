import { useTheme } from "../ui/theme";
import { floatingDockHeight } from "../lib/floatingNavigation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
  useIsFocused,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { listMixedReels, socialRepo, type Reel } from "../lib/socialRepo";
import { samplesEnabled, subscribePreferences } from "../lib/preferences";
import { StatusBar } from "expo-status-bar";
import { useApp } from "../ui/AppContext";
import { FloatingSurface } from "../ui/FloatingSurface";
import { AppTabs } from "../ui/AppTabs";
import { Banner, Button } from "../ui/kit";
import { SocialIcon } from "../ui/SocialIcon";
import { ReelPage } from "../ui/ReelPage";
import { ReelSheet, type ReelPanel } from "../ui/ReelSheet";

const MUTE_KEY = "worthit:reel-muted:v1";
const REEL_VISIBILITY = {
  viewAreaCoveragePercentThreshold: 50,
  minimumViewTime: 0,
};
export default function ReelsScreen() {
  const { session } = useApp();
  return <ReelsWorkspace key={session.userId} />;
}

function ReelsWorkspace() {
  const { colors, glossy } = useTheme();
  const {
      session: { userId },
    } = useApp(),
    insets = useSafeAreaInsets(),
    { width } = useWindowDimensions(),
    focused = useIsFocused();
  const {
    reel: requested,
    mine,
    author,
    comments,
  } = useLocalSearchParams<{
    reel?: string;
    mine?: string;
    author?: string;
    comments?: string;
  }>();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [panel, setPanel] = useState<ReelPanel | null>(null);
  const pager = useRef<FlatList<Reel>>(null);
  const activeIndex = useRef(0);
  const resizeIndex = useRef(0);
  const openedComments = useRef("");
  const lastScope = useRef("");
  const visibleRef = useRef<string | null>(requested ?? null);
  const [reels, setReels] = useState<Reel[] | null>(null),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const [muted, setMuted] = useState(true),
    [visible, setVisible] = useState<string | null>(requested ?? null);
  const seed = useRef<number | null>(null),
    generation = useRef(0),
    owner = useRef(userId);
  useEffect(() => {
    owner.current = userId;
  }, [userId]);
  const samples = useSyncExternalStore(
    subscribePreferences,
    samplesEnabled,
    () => true,
  );
  const scopedAuthor = mine === "1" ? userId : author;
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(MUTE_KEY)
      .then((value) => {
        if (active) setMuted(value === null ? true : value === "true");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const mute = useCallback((value: boolean) => {
    setMuted(value);
    void AsyncStorage.setItem(MUTE_KEY, String(value)).catch(() => {});
  }, []);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      seed.current ??= Math.floor(Math.random() * 0x100000000);
      let next = scopedAuthor
        ? await socialRepo.listReels(userId, scopedAuthor)
        : await listMixedReels(userId, seed.current);
      if (
        !scopedAuthor &&
        requested &&
        !next.some((item) => item.id === requested)
      ) {
        const match = (await socialRepo.listReels(userId)).find(
          (item) => item.id === requested,
        );
        if (match) next = [match, ...next];
      }
      if (request !== generation.current) return;
      if (requested && !next.some((item) => item.id === requested)) {
        setError("This check is unavailable. It may be private or removed.");
        setReels([]);
      } else {
        const scope = (scopedAuthor ?? "") + ":" + (requested ?? "");
        if (
          lastScope.current !== scope ||
          !next.some((item) => item.id === visibleRef.current)
        ) {
          lastScope.current = scope;
          activeIndex.current = 0;
          const first = next.find((item) => item.id === requested) ?? next[0];
          visibleRef.current = first?.id ?? null;
          setVisible(first?.id ?? null);
          pager.current?.scrollToOffset({ offset: 0, animated: false });
        }
        setReels(next);
        setError("");
        if (
          comments === "1" &&
          requested &&
          openedComments.current !== requested
        ) {
          const reel = next.find((item) => item.id === requested);
          if (reel) {
            openedComments.current = requested;
            setPanel({ kind: "comments", reel });
          }
        }
      }
    } catch (reason) {
      if (request === generation.current)
        setError(
          reason instanceof Error ? reason.message : "Could not load checks.",
        );
    } finally {
      if (request === generation.current) setRefreshing(false);
    }
  }, [userId, scopedAuthor, requested, comments]);
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
        setPanel(null);
      };
    }, [load]),
  );
  const ordered = useMemo(() => {
    const current = (reels ?? []).filter(
      (reel) => samples || reel.media.kind !== "demo",
    );
    if (!requested) return current;
    const target = current.find((item) => item.id === requested);
    return target
      ? [target, ...current.filter((item) => item.id !== requested)]
      : current;
  }, [reels, requested, samples]);
  useEffect(() => {
    if (viewport.height > 0)
      pager.current?.scrollToOffset({
        offset: resizeIndex.current * viewport.height,
        animated: false,
      });
  }, [viewport.height]);
  const visibleChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: { item: Reel; index?: number | null }[];
    }) => {
      const first = viewableItems[0];
      if (!first) return;
      if (first?.index != null) activeIndex.current = first.index;
      visibleRef.current = first?.item.id ?? null;
      setVisible(first?.item.id ?? null);
    },
    [],
  );
  const move = useCallback(
    (delta: number) => {
      if (panel || !ordered.length) return;
      const index = Math.max(
        0,
        Math.min(ordered.length - 1, activeIndex.current + delta),
      );
      pager.current?.scrollToIndex({ index, animated: true });
    },
    [ordered.length, panel],
  );
  useEffect(() => {
    if (Platform.OS !== "web" || !focused || panel) return;
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")
      )
        return;
      if (["ArrowDown", "PageDown", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        move(["ArrowDown", "PageDown"].includes(event.key) ? 1 : -1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [focused, panel, move]);
  const position = Math.max(
    0,
    ordered.findIndex((item) => item.id === visible),
  );
  return (
    <View
      style={[
        styles.page,
        glossy && { backgroundColor: colors.bg },
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {focused && <StatusBar style="light" />}
      <View
        style={[
          styles.stage,
          glossy && { backgroundColor: colors.bg },
          !!panel &&
            width >= 900 && {
              alignSelf: "flex-start",
              width: Math.min(560, width - 400 - insets.left - insets.right),
              marginLeft: Math.max(
                0,
                (width - insets.left - insets.right - 400 - 560) / 2,
              ),
            },
        ]}
        testID="reels-viewport"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (
            width > 0 &&
            height > 0 &&
            (viewport.width !== width || viewport.height !== height)
          ) {
            resizeIndex.current = activeIndex.current;
            setViewport({ width, height });
          }
        }}
        accessibilityActions={[
          { name: "increment", label: "Next check" },
          { name: "decrement", label: "Previous check" },
        ]}
        onAccessibilityAction={(event) =>
          move(event.nativeEvent.actionName === "increment" ? 1 : -1)
        }
      >
        {viewport.height > 0 && (
          <FlatList
            ref={pager}
            testID="reels-list"
            style={styles.list}
            data={ordered}
            extraData={{ visible, focused, panel: !!panel, muted, viewport }}
            keyExtractor={(item) => item.id}
            pagingEnabled
            snapToInterval={viewport.height}
            snapToAlignment="start"
            disableIntervalMomentum
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            bounces={false}
            scrollEnabled={!panel}
            getItemLayout={(_, index) => ({
              length: viewport.height,
              offset: viewport.height * index,
              index,
            })}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
            updateCellsBatchingPeriod={32}
            removeClippedSubviews={false}
            windowSize={3}
            viewabilityConfig={REEL_VISIBILITY}
            onViewableItemsChanged={visibleChanged}
            onMomentumScrollEnd={(event) => {
              const index = Math.max(
                0,
                Math.min(
                  ordered.length - 1,
                  Math.round(
                    event.nativeEvent.contentOffset.y / viewport.height,
                  ),
                ),
              );
              const item = ordered[index];
              if (item) {
                activeIndex.current = index;
                visibleRef.current = item.id;
                setVisible(item.id);
              }
            }}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            renderItem={({ item, index }) => (
              <ReelPage
                reel={item}
                height={viewport.height}
                bottomOverlayHeight={floatingDockHeight(insets.bottom)}
                active={focused && visible === item.id}
                nearby={focused && !panel && index === position + 1}
                paused={!!panel}
                sound={{ muted, onChange: mute }}
                onComments={() => setPanel({ kind: "comments", reel: item })}
                onDetails={() => setPanel({ kind: "details", reel: item })}
              />
            )}
          />
        )}
        <FloatingSurface
          radius={28}
          testID="checks-floating-header"
          containerStyle={{ position: "absolute", top: 8, left: 12, right: 12 }}
          style={styles.header}
        >
          <Text
            style={[styles.title, { color: colors.ink }]}
            accessibilityRole="header"
          >
            Checks
          </Text>
          {ordered.length > 0 && (
            <Text
              testID="reel-position"
              style={[styles.counter, { color: colors.muted }]}
            >
              {position + 1} / {ordered.length}
            </Text>
          )}
          <Pressable
            style={styles.headerButton}
            accessibilityRole="button"
            accessibilityLabel="New check"
            onPress={() => router.push("/new-reel")}
          >
            <SocialIcon name="plus" color={colors.ink} />
          </Pressable>
        </FloatingSurface>
        {width >= 700 && ordered.length > 0 && (
          <View style={styles.navigation}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous check"
              disabled={position === 0 || !!panel}
              onPress={() => move(-1)}
              style={[
                styles.navigationButton,
                position === 0 && styles.disabled,
              ]}
            >
              <Text style={styles.arrow}>{"\u2191"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next check"
              disabled={position === ordered.length - 1 || !!panel}
              onPress={() => move(1)}
              style={[
                styles.navigationButton,
                position === ordered.length - 1 && styles.disabled,
              ]}
            >
              <Text style={styles.arrow}>{"\u2193"}</Text>
            </Pressable>
          </View>
        )}
        {error ? (
          <View style={styles.state}>
            <Banner kind="error">{error}</Banner>
            <Button
              label="Try again"
              onPress={() => {
                void load();
              }}
            />
          </View>
        ) : (
          !ordered.length && (
            <View style={styles.state}>
              {reels === null ? (
                <ActivityIndicator
                  accessibilityLabel="Loading checks"
                  color="#fff"
                />
              ) : (
                <Text style={styles.empty}>No checks yet.</Text>
              )}
            </View>
          )
        )}
      </View>
      <AppTabs active="reels" />
      <ReelSheet
        key={panel?.reel.id ?? "closed"}
        panel={panel}
        onClose={() => setPanel(null)}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#000000" },
  stage: {
    flex: 1,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  list: { flex: 1, width: "100%" },
  header: {
    height: 54,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  title: { color: "#fff", fontSize: 18, fontWeight: "800", flex: 1 },
  counter: { color: "#fff", fontSize: 12, marginRight: 6 },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  navigation: { position: "absolute", right: 16, top: "27%", gap: 12 },
  navigationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#151515E6",
    alignItems: "center",
    justifyContent: "center",
  },
  arrow: { color: "#fff", fontSize: 26 },
  disabled: { opacity: 0.35 },
  state: {
    position: "absolute",
    top: "35%",
    alignSelf: "center",
    maxWidth: "90%",
    gap: 12,
  },
  empty: { color: "#fff", fontSize: 16 },
});
