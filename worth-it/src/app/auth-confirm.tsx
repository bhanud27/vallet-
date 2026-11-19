import { useLinkingURL } from 'expo-linking';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text } from 'react-native';
import { confirmAccount } from '../lib/auth';
import { useAuth } from '../ui/AppContext';
import { Banner, Button, Centered } from '../ui/kit';
import { colors, type } from '../ui/theme';

export default function AuthConfirm() {
  const { setSession } = useAuth();
  const linked = useLinkingURL();
  const callback = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : linked;
  const handled = useRef<string | undefined>(undefined);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!callback || handled.current === callback) return;
    handled.current = callback;
    confirmAccount(callback).then((session) => {
      setSession(session);
      router.replace(session.needsPassword ? '/signup' : '/profile');
    }).catch((err) => setError(err instanceof Error ? err.message : 'Could not verify your email.'));
  }, [callback, setSession]);

  return (
    <Centered>
      {error ? <><Banner kind="error">{error}</Banner><Button label="Go to sign in" onPress={() => router.replace('/login')} /></> : (
        <><ActivityIndicator color={colors.accent} /><Text style={type.body}>Verifying your email…</Text></>
      )}
    </Centered>
  );
}
