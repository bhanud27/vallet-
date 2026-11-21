import React, { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { supabase } from "../../lib/supabase";
import { verifySensitiveAction } from "../../lib/accountLifecycle";
import { useApp } from "../AppContext";
import { useTheme } from "../theme";
import { Banner, Button } from "../kit";
import { SettingsField as Field } from "./SettingsField";
export function MfaSettings() {
  const { security, session, refreshSecurity } = useApp(),
    { type } = useTheme();
  const [factors, setFactors] = useState<
      { id: string; friendly_name?: string }[]
    >([]),
    [pending, setPending] = useState<{ id: string; secret: string } | null>(
      null,
    ),
    [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const load = useCallback(async () => {
    if (!supabase) return;
    const r = await supabase.auth.mfa.listFactors();
    if (r.error) throw r.error;
    setFactors(r.data.totp.filter((f) => f.status === "verified"));
  }, []);
  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch(() => setError("Could not load authenticators."));
  }, [load]);
  if (!supabase || session.isGuest) return null;
  return (
    <>
      <Text style={type.h2}>Two-factor authentication</Text>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {note ? <Banner kind="ok">{note}</Banner> : null}
      {!security.mfa_enforced ? (
        <Banner kind="info">
          Authenticator enrollment requires the database security update.
          Password and reset tools remain available.
        </Banner>
      ) : (
        <>
          <Text style={type.body}>
            {factors.length
              ? "An authenticator protects your account. Keep access to your authenticator before signing out."
              : "Add Worth It to an authenticator app using its manual setup option. Never share the setup secret or codes."}
          </Text>
          <Field
            label="Verify current password for authenticator changes"
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
            editable={!busy}
          />
          <Field
            label="Authenticator verification code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChangeText={setCode}
            editable={!busy}
          />
          {pending ? (
            <>
              <Banner kind="warn">
                This setup secret is only shown during enrollment. Store it
                safely in your authenticator, then enter its current code.
              </Banner>
              <Text selectable style={type.body}>
                {pending.secret}
              </Text>
              <Button
                label="Verify new authenticator"
                loading={busy}
                disabled={code.length !== 6}
                onPress={async () => {
                  setBusy(true);
                  try {
                    const r = await supabase!.auth.mfa.challengeAndVerify({
                      factorId: pending.id,
                      code,
                    });
                    if (r.error) throw r.error;
                    setPending(null);
                    setCode("");
                    setPassword("");
                    setNote("Authenticator enabled.");
                    await load();
                    await refreshSecurity();
                  } catch {
                    setError("Could not verify the authenticator code.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
              <Button
                label="Cancel authenticator setup"
                variant="quiet"
                disabled={busy}
                onPress={async () => {
                  try {
                    const r = await supabase!.auth.mfa.unenroll({
                      factorId: pending.id,
                    });
                    if (r.error) throw r.error;
                    setPending(null);
                  } catch {
                    setError("Could not cancel setup. Try again.");
                  }
                }}
              />
            </>
          ) : factors.length === 0 ? (
            <Button
              label="Set up authenticator"
              loading={busy}
              onPress={async () => {
                setBusy(true);
                setError("");
                try {
                  await verifySensitiveAction(password, code);
                  const r = await supabase!.auth.mfa.enroll({
                    factorType: "totp",
                    friendlyName: "Worth It authenticator",
                  });
                  if (r.error) throw r.error;
                  setPending({ id: r.data.id, secret: r.data.totp.secret });
                  setCode("");
                } catch {
                  setError(
                    "Could not start authenticator setup. Verify your password and provider settings.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : (
            factors.map((f) => (
              <Button
                key={f.id}
                label="Remove authenticator"
                variant="secondary"
                loading={busy}
                onPress={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await verifySensitiveAction(password, code);
                    const r = await supabase!.auth.mfa.unenroll({
                      factorId: f.id,
                    });
                    if (r.error) throw r.error;
                    setPassword("");
                    setCode("");
                    setNote("Authenticator removed.");
                    await load();
                    await refreshSecurity();
                  } catch {
                    setError(
                      "Could not remove authenticator. Verify your password and current code.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ))
          )}
        </>
      )}
    </>
  );
}
