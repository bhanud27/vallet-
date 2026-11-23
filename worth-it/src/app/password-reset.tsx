import React, { useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { supabase } from "../lib/supabase";
import { accountSecurity } from "../lib/accountSecurity";
import {
  passwordRecoveryUrl,
  recoveryAllowed,
  saveRecoveredPassword,
} from "../lib/auth";
import { useAuth } from "../ui/AppContext";
import { Screen, Field, Button, Banner } from "../ui/kit";
import { useTheme } from "../ui/theme";
export default function PasswordReset() {
  const { type } = useTheme();
  const { session } = useAuth();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const recovery = recoveryAllowed(session?.userId);
  return (
    <Screen>
      <Text style={type.title}>
        {recovery ? "Choose a new password" : "Reset your password"}
      </Text>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {note ? <Banner kind="ok">{note}</Banner> : null}
      {!supabase ? (
        <Banner kind="info">
          Password reset requires a connected account.
        </Banner>
      ) : recovery ? (
        <>
          <Field
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
          />
          <Field
            label="Confirm new password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            editable={!busy}
          />
          <Button
            label="Save new password"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError("");
              try {
                await saveRecoveredPassword(password, confirm);
                setPassword("");
                setConfirm("");
                router.replace("/profile");
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not update your password.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : (
        <>
          <Field
            label="Account email"
            value={email}
            onChangeText={setEmail}
            inputMode="email"
            autoCapitalize="none"
            editable={!busy}
          />
          <Button
            label="Send reset link"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError("");
              try {
                await accountSecurity(
                  supabase!.auth,
                  passwordRecoveryUrl(),
                ).reset(email);
                setNote(
                  "If this address has an account, open the newest reset link on the device and app or browser where you requested it.",
                );
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not send reset link.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      )}
      <Button
        label="Back to sign in"
        variant="quiet"
        onPress={() => router.replace("/login")}
      />
    </Screen>
  );
}
