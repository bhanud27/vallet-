import { router } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';
import { repo } from '../lib/repo';
import { resetLocalSocial } from '../lib/socialRepo';
import { supabase } from '../lib/supabase';
import { useApp } from '../ui/AppContext';
import { Banner, Button, Screen } from '../ui/kit';
import { type } from '../ui/theme';

function LocalTools() {
  const { session, setSession } = useApp();
  const [note, setNote] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState(false);
  const t = repo.demoTools!;

  async function reset() {
    setResetting(true);
    setResetError(false);
    setNote(null);
    try {
      await resetLocalSocial();
      setSession(await t.resetAll());
      setNote('Demo data reset.');
    } catch {
      setResetError(true);
    } finally {
      setResetting(false);
    }
  }
  return (
    <>
      <Text style={type.title}>Demo tools</Text>
      <Banner kind="demo">
        Local demo mode keeps everything on this device. These tools let you test the “friend votes” step on one device by switching who you are. For real two-phone sharing, connect Supabase (see the README).
      </Banner>
      <Text style={type.body}>Acting as: <Text style={{ fontWeight: '800' }}>{session.userId.slice(0, 8)}…</Text></Text>
      <Button testID="act-as-guest" label="Act as a new guest" disabled={resetting} onPress={async () => { setSession(await t.actAsNewGuest()); setNote('You are now a new guest. Open a poll you created and vote.'); }} />
      <Button testID="back-to-me" variant="secondary" label="Back to my identity" disabled={resetting} onPress={async () => { setSession(await t.backToMyIdentity()); setNote('Back to the identity that created your polls.'); }} />
      <Button testID="reset-demo" variant="quiet" label="Reset all demo data" loading={resetting} onPress={reset} />
      {resetError ? <Banner kind="error">Could not reset all demo data. Try again.</Banner> : null}
      {note ? <Banner kind="ok">{note}</Banner> : null}
    </>
  );
}

function ConnectedAccount() {
  const { session, setSession } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signOut() {
    if (!supabase) return;
    setBusy(true);
    setError('');
    try {
      const { error: failure } = await supabase.auth.signOut({ scope: 'local' });
      if (failure) throw failure;
      setSession(null);
      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign out. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Text style={type.title}>Account</Text>
      {session.needsPassword ? (
        <Button label="Finish setting up your account" onPress={() => router.push('/signup')} />
      ) : session.isGuest ? (
        <>
          <Text style={type.body}>Create an account to keep your polls, reels, and profile across devices.</Text>
          <Button label="Create account" onPress={() => router.push('/signup')} />
          <Button label="Sign in" variant="secondary" onPress={() => router.push('/login')} />
        </>
      ) : (
        <>
          <Text style={type.body}>Signed in as {session.email}</Text>
          <Button label="Sign out" variant="secondary" loading={busy} onPress={signOut} />
        </>
      )}
      {error ? <Banner kind="error">{error}</Banner> : null}
    </>
  );
}

export default function Account() {
  return <Screen>{repo.mode === 'local' ? <LocalTools /> : <ConnectedAccount />}</Screen>;
}
