import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Banner, Button, Centered } from '../ui/kit';
import { supabase } from '../lib/supabase';
import { AppProvider, useAuth } from '../ui/AppContext';
import { colors, type } from '../ui/theme';

export default function RootLayout() {
  return <AppProvider><Navigation /></AppProvider>;
}

function Navigation() {
  const { session, loading, error, refresh } = useAuth();
  if (loading) return <Centered><ActivityIndicator size="large" color={colors.ink} /><Text style={type.small}>Starting Worth It?</Text></Centered>;
  if (!supabase && error) return (
    <Centered>
      <Text style={type.h2}>Can’t start the app</Text>
      <Banner kind="error">{error}</Banner>
      <Button label="Try again" onPress={() => { void refresh(); }} />
    </Centered>
  );
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="index" options={{ title: 'Worth It?', headerShown: false }} />
          <Stack.Screen name="new" options={{ title: 'New poll' }} />
          <Stack.Screen name="p/[id]" options={{ title: 'Poll' }} />
          <Stack.Screen name="account" options={{ title: 'Account' }} />
          <Stack.Screen name="profile" options={{ title: 'Profile' }} />
          <Stack.Screen name="reels" options={{ title: 'Reels', headerShown: false }} />
          <Stack.Screen name="new-reel" options={{ title: 'New reel' }} />
        </Stack.Protected>
        <Stack.Screen name="login" options={{ title: 'Sign in' }} />
        <Stack.Screen name="signup" options={{ title: 'Create account' }} />
        <Stack.Screen name="auth-confirm" options={{ title: 'Verify email' }} />
      </Stack>
    </>
  );
}
