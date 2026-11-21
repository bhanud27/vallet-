import { MfaSettings } from "./MfaSettings";
import React, { useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { supabase } from "../../lib/supabase";
import { accountSecurity } from "../../lib/accountSecurity";
import { confirmationUrl } from "../../lib/auth";
import { useApp } from "../AppContext";
import { useTheme } from "../theme";
import { Button, Banner } from "../kit";
import { SettingsField as Field } from "./SettingsField";
export function SecuritySettings() {
  const { session } = useApp(),
    { type } = useTheme();
  const [password, setPassword] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [otp, setOtp] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  if (!supabase || session.isGuest)
    return (
      <>
        <Banner kind="info">
          Password settings require a registered connected account.
        </Banner>
        {supabase ? (
          <Button
            label="Create account"
            onPress={() => router.push("/signup")}
          />
        ) : null}
      </>
    );
  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {note ? <Banner kind="ok">{note}</Banner> : null}
      <Text style={type.body}>
        Your password is managed by Supabase. Verify your current password
        before changing it.
      </Text>
      <Field
        label="Current password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        editable={!busy}
      />
      <Field
        label="New password"
        value={next}
        onChangeText={setNext}
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
      <Field
        label="Authenticator code (if enabled)"
        value={otp}
        onChangeText={setOtp}
        inputMode="numeric"
        maxLength={6}
        editable={!busy}
      />
      <Button
        label="Change password"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          setNote("");
          try {
            await accountSecurity(
              supabase!.auth,
              confirmationUrl(),
            ).changePassword(password, next, confirm, otp);
            setPassword("");
            setNext("");
            setConfirm("");
            setOtp("");
            setNote("Password updated.");
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not update password.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button
        label="Forgot password / reset by email"
        variant="secondary"
        onPress={() => router.push("/password-reset")}
      />
      <MfaSettings />
      <Text style={type.h2}>Sessions</Text>
      <Text style={type.small}>
        The provider does not expose a full device list to this client. You can
        sign out other sessions through the provider-supported account flow.
      </Text>
      <Button
        label="Sign out other sessions"
        variant="secondary"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            await accountSecurity(
              supabase!.auth,
              confirmationUrl(),
            ).reauthenticate(password, otp);
            const { error: failure } = await supabase!.auth.signOut({
              scope: "others",
            });
            if (failure) throw failure;
            setPassword("");
            setOtp("");
            setNote(
              "Other sessions were signed out. Already issued access tokens can remain valid until they expire.",
            );
          } catch {
            setError(
              "Could not sign out other sessions. Verify your current password and try again.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
