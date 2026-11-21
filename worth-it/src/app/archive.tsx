import React, { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { repo } from "../lib/repo";
import { socialRepo, type Reel } from "../lib/socialRepo";
import type { PollSummary } from "../lib/types";
import { useApp } from "../ui/AppContext";
import {
  ProfileMediaCollection,
  type ProfileTab,
} from "../ui/ProfileMediaCollection";
import { Banner, Button } from "../ui/kit";
import { useTheme } from "../ui/theme";
export default function Archive() {
  const { session } = useApp();
  return <ArchiveWorkspace key={session.userId} userId={session.userId} />;
}
function ArchiveWorkspace({ userId }: { userId: string }) {
  const { type, colors } = useTheme(),
    [polls, setPolls] = useState<PollSummary[]>([]),
    [reels, setReels] = useState<Reel[]>([]);
  const [tab, setTab] = useState<ProfileTab>("polls"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  const [more, setMore] = useState({ polls: false, reels: false }),
    [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0),
    moreBusy = useRef(false);
  useFocusEffect(
    useCallback(() => {
      void revision;
      const request = ++generation.current;
      setLoading(true);
      moreBusy.current = false;
      setLoadingMore(false);
      void Promise.all([
        repo.listMyPolls(true),
        socialRepo.listArchivedReels(userId),
      ])
        .then(([p, r]) => {
          if (request === generation.current) {
            setPolls(p);
            setReels(r);
            setMore({ polls: p.length === 60, reels: r.length === 60 });
            setError("");
          }
        })
        .catch((e) => {
          if (request === generation.current) setError(e.message);
        })
        .finally(() => {
          if (request === generation.current) setLoading(false);
        });
      return () => {
        generation.current++;
      };
    }, [userId, revision]),
  );
  async function loadMore() {
    if (moreBusy.current || loading || !more[tab]) return;
    const items = tab === "polls" ? polls : reels,
      last = items[items.length - 1];
    if (!last?.archivedAt) return;
    const before = { time: last.archivedAt, id: last.id },
      request = generation.current,
      selected = tab;
    moreBusy.current = true;
    setLoadingMore(true);
    setError("");
    try {
      if (selected === "polls") {
        const next = await repo.listMyPolls(true, before);
        if (request === generation.current) {
          setPolls((old) => [
            ...old,
            ...next.filter((p) => !old.some((v) => v.id === p.id)),
          ]);
          setMore((old) => ({ ...old, polls: next.length === 60 }));
        }
      } else {
        const next = await socialRepo.listArchivedReels(userId, before);
        if (request === generation.current) {
          setReels((old) => [
            ...old,
            ...next.filter((p) => !old.some((v) => v.id === p.id)),
          ]);
          setMore((old) => ({ ...old, reels: next.length === 60 }));
        }
      }
    } catch (e) {
      if (request === generation.current)
        setError(
          e instanceof Error ? e.message : "Could not load older posts.",
        );
    } finally {
      if (request === generation.current) {
        moreBusy.current = false;
        setLoadingMore(false);
      }
    }
  }
  const manage = (kind: "poll" | "reel", id: string) =>
    router.push({
      pathname: "/manage-post",
      params: { kind, id, archived: "1" },
    });
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ProfileMediaCollection
        polls={polls}
        reels={reels}
        tab={tab}
        onTabChange={setTab}
        mine
        onManage={manage}
        onOpenItem={(item) =>
          manage(item.kind, item.kind === "poll" ? item.poll.id : item.reel.id)
        }
        onRefresh={() => setRevision((v) => v + 1)}
        refreshing={loading}
        header={
          <>
            <Text style={type.title}>Archive</Text>
            <Text style={type.body}>
              Only you can see archived posts. Open a post to edit, restore or
              delete it.
            </Text>
            {loading ? <ActivityIndicator color={colors.accentInk} /> : null}
            {error ? (
              <>
                <Banner kind="error">{error}</Banner>
                <Button
                  label="Try again"
                  variant="secondary"
                  onPress={() => setRevision((v) => v + 1)}
                />
              </>
            ) : null}
          </>
        }
        footer={
          more[tab] ? (
            <Button
              label="Load older posts"
              variant="secondary"
              disabled={loading}
              loading={loadingMore}
              onPress={() => void loadMore()}
            />
          ) : undefined
        }
        empty={
          <Text style={type.body}>
            {loading ? "Loading archive..." : "No archived " + tab + " yet."}
          </Text>
        }
      />
    </View>
  );
}
