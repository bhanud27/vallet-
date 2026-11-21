import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { socialRepo } from "../../lib/socialRepo";
import { supabase } from "../../lib/supabase";
import { confirmationUrl } from "../../lib/auth";
import { accountSecurity } from "../../lib/accountSecurity";
import { normalizeUsername, USERNAME_HINT } from "../../lib/username";
import { useApp } from "../AppContext";
import { useTheme } from "../theme";
import { Button, Banner } from "../kit";
import { SettingsField as Field } from "./SettingsField";
export function PersonalSettings() {
  const { session, refresh } = useApp(),
    { type } = useTheme();
  const [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [bio, setBio] = useState(""),
    [email, setEmail] = useState(session.email ?? ""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  useEffect(() => {
    let active = true;
    void socialRepo
      .getProfile(session.userId)
      .then((profile) => {
        if (active) {
          setName(profile.displayName || profile.username || "");
          setUsername(profile.username ?? "");
          setBio(profile.bio);
          setReady(true);
        }
      })
      .catch(() => {
        if (active)
          setError("Could not load your profile. Reopen this page to retry.");
      });
    return () => {
      active = false;
    };
  }, [session.userId]);
  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      {note ? <Banner kind="ok">{note}</Banner> : null}
      <Field
        label="Display name"
        value={name}
        onChangeText={setName}
        maxLength={40}
        editable={ready && !busy}
      />
      <Field
        label="Username"
        value={username}
        onChangeText={setUsername}
        maxLength={40}
        autoCapitalize="none"
        hint={USERNAME_HINT}
        editable={ready && !busy}
      />
      <Field
        label="Profile bio"
        value={bio}
        onChangeText={setBio}
        maxLength={150}
        multiline
        editable={ready && !busy}
      />
      <Button
        label="Save personal information"
        loading={busy}
        disabled={!ready}
        onPress={async () => {
          setBusy(true);
          setError("");
          setNote("");
          try {
            await socialRepo.saveProfile(session.userId, {
              displayName: name,
              username: normalizeUsername(username),
              bio,
            });
            setNote("Personal information saved. Your profile is updated.");
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Could not save personal information.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {supabase && !session.isGuest ? (
        <>
          <Text style={type.h2}>Email address</Text>
          <Text style={type.small}>
            Current email: {session.email}. Your provider will verify an email
            change before it is complete.
          </Text>
          <Field
            label="New email address"
            value={email}
            onChangeText={setEmail}
            inputMode="email"
            autoCapitalize="none"
            editable={!busy}
          />
          <Field
            label="Current password"
            value={password}
            onChangeText={setPassword}
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
            label="Request verified email change"
            variant="secondary"
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setError("");
              setNote("");
              try {
                await accountSecurity(
                  supabase!.auth,
                  confirmationUrl(),
                ).changeEmail(email, password, otp);
                setPassword("");
                setOtp("");
                await refresh();
                setNote(
                  "Check your email for verification. The current address remains in use until the change is confirmed.",
                );
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Could not change the email.",
                );
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      ) : (
        <Text style={type.small}>
          Email changes require a registered connected account.
        </Text>
      )}
      <Text style={type.small}>
        Phone number and date of birth are not collected by this app.
      </Text>
    </>
  );
}
