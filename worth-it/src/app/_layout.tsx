import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { Banner, Button, Centered } from '../ui/kit';
import { AppProvider } from '../ui/AppContext';
import { colors, type } from '../ui/theme';

export default function RootLayout() {
  return (
    <AppProvider
      fallback={<Centered><ActivityIndicator size="large" color={colors.ink} /><Text style={type.small}>Starting Worth It?</Text></Centered>}
      errorView={(message, retry) => (
        <Centered>
          <Text style={type.h2}>Can’t start the app</Text>
          <Banner kind="error">{message}</Banner>
          <Button label="Try again" onPress={retry} />
        </Centered>
      )}
    >
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerTintColor: colors.ink,
          headerTitleStyle: { fontWeight: '800' }, contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Worth It?', headerShown: false }} />
        <Stack.Screen name="new" options={{ title: 'New poll' }} />
        <Stack.Screen name="p/[id]" options={{ title: 'Poll' }} />
        <Stack.Screen name="account" options={{ title: 'Account' }} />
      </Stack>
    </AppProvider>
  );
}
