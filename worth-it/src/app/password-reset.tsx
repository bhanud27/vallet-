import React, { useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { supabase } from "../lib/supabase";
import { accountSecurity, validateNewPassword } from "../lib/accountSecurity";
import { confirmationUrl, recoveryAllowed, clearRecovery } from "../lib/auth";
import { Screen, Field, Button, Banner } from "../ui/kit";
import { useTheme } from "../ui/theme";
export default function PasswordReset() {
  const { type } = useTheme();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const recovery = recoveryAllowed();
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
                validateNewPassword(password, confirm);
                const { error: failure } = await supabase!.auth.updateUser({
                  password,
                });
                if (failure) throw failure;
                clearRecovery();
                setPassword("");
                setConfirm("");
                router.replace("/profile");
              } catch {
                setError(
                  "Could not update your password. Request a fresh reset link if it expired.",
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
                await accountSecurity(supabase!.auth, confirmationUrl()).reset(
                  email,
                );
                setNote(
                  "If this address has an account, a reset link has been sent. Open it on this device.",
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
