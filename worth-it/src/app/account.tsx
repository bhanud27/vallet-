import React, { useState } from 'react';
import { Text } from 'react-native';
import { repo } from '../lib/repo';
import { supabase } from '../lib/supabase';
import { useApp } from '../ui/AppContext';
import { Banner, Button, Field, Screen } from '../ui/kit';
import { type } from '../ui/theme';

function LocalTools() {
  const { session, setSession } = useApp();
  const [note, setNote] = useState<string | null>(null);
  const t = repo.demoTools!;
  return (
    <>
      <Text style={type.title}>Demo tools</Text>
      <Banner kind="demo">
        Local demo mode keeps everything on this device. These tools let you test the “friend votes” step on one device by switching who you are. For real two-phone sharing, connect Supabase (see the README).
      </Banner>
      <Text style={type.body}>Acting as: <Text style={{ fontWeight: '800' }}>{session.userId.slice(0, 8)}…</Text></Text>
      <Button testID="act-as-guest" label="Act as a new guest" onPress={async () => { setSession(await t.actAsNewGuest()); setNote('You are now a new guest. Open a poll you created and vote.'); }} />
      <Button testID="back-to-me" variant="secondary" label="Back to my identity" onPress={async () => { setSession(await t.backToMyIdentity()); setNote('Back to the identity that created your polls.'); }} />
      <Button testID="reset-demo" variant="quiet" label="Reset all demo data" onPress={async () => { setSession(await t.resetAll()); setNote('Demo data reset.'); }} />
      {note ? <Banner kind="ok">{note}</Banner> : null}
    </>
  );
}

function ConnectedAccount() {
  const { session, refresh } = useApp();
  const [mode, setMode] = useState<'create' | 'signin'>('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  async function submit() {
    if (!supabase) return;
    setBusy(true); setMsg(null);
    try {
      if (mode === 'create') {
        const { error } = await supabase.auth.updateUser({ email: email.trim(), password });
        if (error) throw error;
        setMsg({ kind: 'ok', text: 'Account saved. If your project requires email confirmation, check your inbox to finish.' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setMsg({ kind: 'ok', text: 'Signed in.' });
      }
      await refresh();
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally { setBusy(false); }
  }

  return (
    <>
      <Text style={type.title}>Account</Text>
      {session.isGuest ? (
        <Banner kind="warn">You’re using a guest session tied to this browser. If you clear browser data you lose access to polls you created. Save an account to keep them.</Banner>
      ) : <Banner kind="ok">Signed in as {session.email}</Banner>}
      {session.isGuest ? (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'create' ? 'new-password' : 'current-password'} hint="At least 6 characters" />
          {msg ? <Banner kind={msg.kind}>{msg.text}</Banner> : null}
          <Button label={mode === 'create' ? 'Save my account' : 'Sign in'} loading={busy} onPress={submit} />
          <Button variant="quiet" label={mode === 'create' ? 'I already have an account' : 'Create an account instead'} onPress={() => setMode(mode === 'create' ? 'signin' : 'create')} />
          {mode === 'signin' ? <Text style={type.small}>Signing in switches to that account. Polls made as this guest stay with the guest session.</Text> : null}
        </>
      ) : (
        <Button variant="secondary" label="Sign out" onPress={async () => { await supabase?.auth.signOut(); await refresh(); }} />
      )}
    </>
  );
}

export default function Account() {
  return <Screen>{repo.mode === 'local' ? <LocalTools /> : <ConnectedAccount />}</Screen>;
}
