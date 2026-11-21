import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { isThreadKind } from '../lib/comments';
import { Banner, Screen } from '../ui/kit';
// Keep old shared links working, but show their thread beneath the actual content.
export default function CommentsScreen() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  if (!isThreadKind(kind) || typeof id !== 'string' || !id)
    return (
      <Screen>
        <Banner kind="info">This comment thread is unavailable.</Banner>
      </Screen>
    );
  return kind === 'poll' ? (
    <Redirect href={{ pathname: '/p/[id]', params: { id, comments: '1' } }} />
  ) : (
    <Redirect href={{ pathname: '/reels', params: { reel: id, comments: '1' } }} />
  );
}
