import { CreationBody } from "../../ui/CreationBody";
import { CreationVoting } from "../../ui/CreationVoting";
import { ProductDetailsSummary } from "../../ui/ProductDetailsSummary";
import { safetyRpc } from "../../lib/safety";
import { SavePoll } from "../../ui/SavePoll";
import { ReportButton } from "../../ui/ReportButton";
import {
  router,
  Link,
  Stack,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { repo } from "../../lib/repo";
import { CHOICES, CHOICE_LABEL, PollExtras, PollView } from "../../lib/types";
import { DEMO_NOTE } from "../../lib/demoData";
import { useAuth } from "../../ui/AppContext";
import { Banner, Button, Centered, Screen } from "../../ui/kit";
import { PostIdentity, PostPhoto } from "../../ui/PostPresentation";
import { PollContext } from "../../ui/PollContext";
import { ProductHistory } from "../../ui/ProductHistory";
import { Results } from "../../ui/Results";
import { ContentStarButton } from "../../ui/ContentStarButton";
import { SharePanel } from "../../ui/SharePanel";
import { CommentThread } from "../../ui/CommentThread";
import { UpdateSection } from "../../ui/UpdateSection";
import { VoteForm } from "../../ui/VoteForm";
import { themedStyles, useTheme } from "../../ui/theme";

export default function PollScreen() {
  const { type } = useTheme();
  const styles = useStyles();

  const { id, choice, comments, option } = useLocalSearchParams<{
    id: string;
    choice?: string;
    option?: string;
    comments?: string;
  }>();
  const { session } = useAuth();
  const viewerId = session?.userId;
  const [view, setView] = useState<PollView | null>(null);
  const [extras, setExtras] = useState<PollExtras>();
  const [status, setStatus] = useState<
    "loading" | "ready" | "missing" | "error"
  >("loading");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [justVoted, setJustVoted] = useState(false);
  const generation = useRef(0);
  const requestBusy = useRef(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [reasonsDone, setReasonsDone] = useState(false);

  const load = useCallback(
    async (manual = false, background = false) => {
      if (background && requestBusy.current) return;
      requestBusy.current = true;
      const request = ++generation.current;
      if (manual) setRefreshing(true);
      try {
        const [v, reactions] = await Promise.all([
          repo.getPollView(String(id)),
          repo
            .getPollExtras([String(id)])
            .then((all) => all[String(id)])
            .catch(() => undefined),
        ]);
        if (request !== generation.current) return;
        if (!v) {
          setStatus("missing");
          return;
        }
        setExtras(reactions);
        setView((current) =>
          background && current?.poll.id === v.poll.id
            ? {
                ...v,
                votes: [
                  ...v.votes,
                  ...current.votes.filter(
                    (old) => !v.votes.some((next) => next.id === old.id),
                  ),
                ],
              }
            : v,
        );
        if (!background) setReasonsDone(!v.summary || v.votes.length < 20);
        setStatus("ready");
        setError("");
      } catch (e) {
        if (request !== generation.current) return;
        setError(e instanceof Error ? e.message : "Could not load this poll.");
        setStatus((s) => (s === "ready" ? "ready" : "error"));
      } finally {
        if (request === generation.current) {
          requestBusy.current = false;
          setRefreshing(false);
        }
      }
    },
    [id],
  );
  useFocusEffect(
    useCallback(() => {
      if (!viewerId && repo.mode === "local") return;
      setStatus("loading");
      setJustVoted(false);
      void load();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") void load(false, true);
      }, 15000);
      return () => {
        clearInterval(timer);
        generation.current++;
        requestBusy.current = false;
      };
    }, [load, viewerId]),
  );

  if (status === "loading")
    return (
      <Centered>
        <ActivityIndicator size="large" />
        <Text style={type.small}>Loading poll…</Text>
      </Centered>
    );
  if (status === "missing")
    return (
      <Centered>
        <Text style={type.h2}>Poll not found</Text>
        <Text style={type.small}>
          The poll may be private, removed, or linked incorrectly.
        </Text>
        {!session && (
          <Link
            href={{ pathname: "/login", params: { poll: id } }}
            style={styles.linkText}
          >
            Sign in to check access
          </Link>
        )}
        <Link
          href={session ? "/" : "/discover"}
          style={{
            fontSize: 16,
            fontWeight: "800",
            textDecorationLine: "underline",
          }}
        >
          Go to Worth It?
        </Link>
      </Centered>
    );
  if (status === "error" || !view)
    return (
      <Centered>
        <Text style={type.h2}>Can’t load this poll</Text>
        <Banner kind="error">{error}</Banner>
        <Button
          label="Try again"
          onPress={() => {
            setStatus("loading");
            load();
          }}
        />
      </Centered>
    );

  const { poll, votes, update, isAuthor, myChoice } = view;
  const historyUrl = extras?.productUrl ?? update?.storeUrl;
  const hasImageLink = poll.media?.length
    ? poll.media.some((item) => item.sourceUrl)
    : !!poll.imageUrl;
  const canVote =
    !!session &&
    poll.contentKind !== "post" &&
    !isAuthor &&
    !myChoice &&
    (!poll.isDemo || repo.demoVotingEnabled);
  const initialChoice = CHOICES.find((option) => option === choice);

  return (
    <Screen onRefresh={() => load(true)} refreshing={refreshing}>
      <Stack.Screen
        options={{ title: poll.contentKind === "post" ? "Post" : "Poll" }}
      />
      {poll.isDemo ? (
        <Banner kind="demo" testID="demo-banner">
          DEMO: {DEMO_NOTE}
          {repo.demoVotingEnabled
            ? " You can vote to see how it works; your vote stays on this device."
            : ""}
        </Banner>
      ) : null}
      {error ? (
        <Banner kind="error">
          {error} Pull down or press Refresh to retry.
        </Banner>
      ) : null}

      {poll.mediaState && poll.mediaState !== "ready" && (
        <Banner kind="info">
          {poll.mediaState === "pending"
            ? "Photos and videos are processing."
            : "Media processing failed. The post details are kept."}
        </Banner>
      )}
      {isAuthor && poll.mediaState && poll.mediaState !== "ready" && (
        <Button
          label="Retry media processing"
          variant="secondary"
          onPress={async () => {
            try {
              await safetyRpc("worthit_retry_media", { p_poll: poll.id });
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not retry.");
            }
          }}
        />
      )}
      <View style={styles.post}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <PostIdentity poll={poll} mine={isAuthor} />
          </View>
          {isAuthor && !poll.isDemo && (
            <Button
              label={
                poll.contentKind === "post" ? "Manage post" : "Manage poll"
              }
              variant="quiet"
              onPress={() =>
                router.push({
                  pathname: "/manage-post",
                  params: {
                    kind: "poll",
                    id: poll.id,
                    archived: poll.archivedAt ? "1" : "0",
                  },
                })
              }
            />
          )}
        </View>
        {poll.archivedAt && (
          <Banner kind="info">Archived. Only you can see this post.</Banner>
        )}
        {poll.editedAt && <Text style={type.small}>Edited</Text>}
        {poll.creationSpec ? (
          poll.contentKind === "post" ? (
            <CreationBody poll={poll} />
          ) : (
            <CreationVoting
              view={view}
              initial={option}
              onVoted={() => {
                setJustVoted(true);
                void load();
              }}
            />
          )
        ) : (
          <PostPhoto
            poll={poll}
            legacySource={extras?.productUrl ?? undefined}
          />
        )}
        <View style={styles.caption}>
          {!poll.creationSpec && poll.contentKind !== "post" && (
            <Text style={type.title} testID="item-title">
              {poll.itemName}
            </Text>
          )}
          {!poll.creationSpec && (
            <Text style={type.body} testID="poll-question">
              {poll.question}
            </Text>
          )}
          {!poll.creationSpec && poll.contentKind !== "post" && (
            <>
              <PollContext poll={poll} />
              <ProductDetailsSummary value={poll.productDetails} />
            </>
          )}
          <View style={styles.actions}>
            {extras?.productUrl && !hasImageLink ? (
              <Pressable
                accessibilityRole="link"
                style={styles.storeLink}
                onPress={() => {
                  if (extras.productUrl)
                    void Linking.openURL(extras.productUrl).catch(() =>
                      setError("Could not open the product link."),
                    );
                }}
              >
                <Text style={styles.linkText}>View product</Text>
              </Pressable>
            ) : (
              <View />
            )}
            {session && (
              <ContentStarButton
                kind="poll"
                post={poll.contentKind === "post"}
                id={poll.id}
                initial={
                  extras
                    ? { starred: extras.starred, count: extras.stars }
                    : undefined
                }
                disabled={poll.isDemo && !repo.demoVotingEnabled}
              />
            )}
          </View>
        </View>
      </View>

      {session && (
        <CommentThread
          key={poll.id + ":" + comments}
          kind="poll"
          id={poll.id}
          label={poll.itemName}
          initialOpen={comments === "1"}
        />
      )}
      {isAuthor && poll.contentKind !== "post" ? (
        <Banner kind="info">
          You created this poll. Voting is for your friends. Refresh to see new
          votes.
        </Banner>
      ) : null}
      {isAuthor ? (
        <SharePanel pollId={poll.id} post={poll.contentKind === "post"} />
      ) : null}

      {!poll.creationSpec && poll.contentKind !== "post" && myChoice ? (
        <Banner kind="ok" testID="voted-banner">
          {justVoted ? "Vote submitted. " : ""}You voted:{" "}
          {CHOICE_LABEL[myChoice]}. Each account or browser gets one vote per
          poll.
        </Banner>
      ) : null}
      {canVote && !poll.creationSpec ? (
        <VoteForm
          key={`${poll.id}:${initialChoice ?? ""}`}
          pollId={poll.id}
          initialChoice={initialChoice}
          onVoted={() => {
            setJustVoted(true);
            load();
          }}
        />
      ) : null}
      {!poll.creationSpec &&
      poll.contentKind !== "post" &&
      session &&
      !isAuthor &&
      !myChoice &&
      !canVote ? (
        <Banner kind="info">
          Demo polls are read-only here. Create your own poll to try voting.
        </Banner>
      ) : null}

      {session && !poll.isDemo && (
        <SavePoll viewer={session.userId} id={poll.id} name={poll.itemName} />
      )}
      {!poll.creationSpec && poll.contentKind !== "post" && (
        <UpdateSection
          key={"update:" + poll.id}
          poll={poll}
          update={update}
          isAuthor={isAuthor}
          onChanged={() => load()}
        />
      )}
      {session && !poll.isDemo && !isAuthor && (
        <ReportButton kind="poll" id={poll.id} />
      )}
      {!poll.creationSpec && poll.contentKind !== "post" && (
        <Results
          key={"results:" + poll.id}
          votes={votes}
          summary={view.summary}
          onHelpful={
            isAuthor && !poll.isDemo
              ? async (voteId, helpful) => {
                  await repo.markHelpfulReason(poll.id, voteId, helpful);
                  setView((current) =>
                    current?.poll.id === poll.id
                      ? {
                          ...current,
                          votes: current.votes.map((vote) =>
                            vote.id === voteId ? { ...vote, helpful } : vote,
                          ),
                        }
                      : current,
                  );
                }
              : undefined
          }
        />
      )}
      {repo.getVoteReasons && votes.length > 0 && !reasonsDone && (
        <Button
          label="Load more reasons"
          variant="secondary"
          loading={moreBusy}
          onPress={async () => {
            if (moreBusy) return;
            setMoreBusy(true);
            const request = generation.current;
            const last = votes[votes.length - 1];
            try {
              const more = await repo.getVoteReasons!(
                poll.id,
                last.createdAt,
                last.id,
              );
              if (request !== generation.current) return;
              setReasonsDone(more.length < 20);
              setView((current) =>
                current?.poll.id === poll.id
                  ? {
                      ...current,
                      votes: [
                        ...current.votes,
                        ...more.filter(
                          (v) => !current.votes.some((old) => old.id === v.id),
                        ),
                      ],
                    }
                  : current,
              );
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not load reasons.",
              );
            } finally {
              setMoreBusy(false);
            }
          }}
        />
      )}
      {!session && (
        <Link
          href={{ pathname: "/login", params: { poll: poll.id } }}
          style={styles.linkText}
        >
          {poll.contentKind === "post"
            ? "Sign in to Star or comment"
            : "Sign in to vote or comment"}
        </Link>
      )}
      <Button
        testID="refresh"
        variant="secondary"
        label={
          refreshing
            ? "Refreshing…"
            : poll.contentKind === "post"
              ? "Refresh post"
              : "Refresh results"
        }
        loading={refreshing}
        onPress={() => load(true)}
      />

      {poll.contentKind !== "post" && historyUrl && (
        <ProductHistory
          key={poll.id + ":" + historyUrl}
          productUrl={historyUrl}
          current={poll.id}
        />
      )}
    </Screen>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    post: {
      backgroundColor: colors.surface,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    caption: { padding: 15, gap: 5 },
    actions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    storeLink: { minHeight: 44, justifyContent: "center" },
    linkText: { color: colors.accentInk, fontWeight: "700" },
  }),
);
