import React, { useState } from "react";
import { router } from "expo-router";
import { Text } from "react-native";
import { supabase } from "../lib/supabase";
import { accountAction, logout } from "../lib/accountLifecycle";
import { useApp } from "../ui/AppContext";
import { Screen, Banner, Button, Field } from "../ui/kit";
import { useTheme } from "../ui/theme";
export default function AccountLock() {
  const { security, securityError, securityLoading, refreshSecurity, session } =
      useApp(),
    { type } = useTheme();
  const [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Screen>
      {error || securityError ? (
        <Banner kind="error">{error || securityError}</Banner>
      ) : null}
      {securityLoading ? (
        <Text style={type.body}>Checking account security...</Text>
      ) : security.mfaRequired ? (
        <>
          <Text style={type.title}>Verify your authenticator</Text>
          <Field
            label="Authenticator code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            editable={!busy}
          />
          <Button
            label="Verify and continue"
            loading={busy}
            disabled={code.length !== 6}
            onPress={async () => {
              setBusy(true);
              try {
                const factors = await supabase!.auth.mfa.listFactors();
                const factor = factors.data?.totp.find(
                  (f) => f.status === "verified",
                );
                if (!factor) throw new Error();
                const result = await supabase!.auth.mfa.challengeAndVerify({
                  factorId: factor.id,
                  code,
                });
                if (result.error) throw result.error;
                setCode("");
                await refreshSecurity();
                router.replace("/profile");
              } catch {
                setError("Invalid or expired authenticator code. Try again.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : security.deletion_pending ? (
        <>
          <Text style={type.title}>Deletion requested</Text>
          <Text style={type.body}>
            Your account is hidden while the server deletion worker removes your
            account and associated data. Signing out does not cancel the
            request.
          </Text>
        </>
      ) : security.deactivated ? (
        <>
          <Text style={type.title}>Account deactivated</Text>
          <Text style={type.body}>
            Your profile and content are hidden. Reactivate to return with your
            existing posts and relationships.
          </Text>
          {!session.isGuest ? (
            <Field
              label="Current password"
              secureTextEntry
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              editable={!busy}
            />
          ) : (
            <Text style={type.small}>
              This guest session identifies your account. Keep access to this
              device session to reactivate.
            </Text>
          )}
          {!session.isGuest?<Field label="Authenticator code (if enabled)" value={code} onChangeText={setCode} inputMode="numeric" maxLength={6} editable={!busy}/>:null}
          <Button
            label="Reactivate account"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              try {
                await accountAction("reactivate", password, code);
                setPassword("");
                await refreshSecurity();
                router.replace("/profile");
              } catch {
                setError(
                  "Could not reactivate. Verify your password and connection.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : null}
      <Button
        label="Retry account check"
        variant="secondary"
        disabled={busy}
        onPress={() => {
          void refreshSecurity();
        }}
      />
      <Button
        label="Sign out"
        variant="quiet"
        disabled={busy}
        onPress={async () => {
          try {
            await logout();
            router.replace("/login");
          } catch {
            setError("Could not sign out. Please retry.");
          }
        }}
      />
    </Screen>
  );
}
