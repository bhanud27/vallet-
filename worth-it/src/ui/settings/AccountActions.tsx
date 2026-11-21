import React, { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { useApp } from "../AppContext";
import { useTheme } from "../theme";
import { supabase } from "../../lib/supabase";
import { accountAction, logout } from "../../lib/accountLifecycle";
import { Banner, Button } from "../kit";
import { SettingsField as Field } from "./SettingsField";
export function AccountActions({
  action,
}: {
  action: "logout" | "deactivate" | "delete";
}) {
  const { session, refreshSecurity, security } = useApp(),
    { type } = useTheme();
  const [confirm, setConfirm] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!supabase)
    return (
      <>
        <Banner kind="info">
          This is a local demo without a server account. Account logout,
          deactivation and deletion require a connected account.
        </Banner>
        <Button
          label="Demo tools"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: "/settings/[section]",
              params: { section: "demo" },
            })
          }
        />
      </>
    );
  const word =
    action === "delete"
      ? "DELETE"
      : action === "deactivate"
        ? "DEACTIVATE"
        : "";
  return (
    <>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <Text style={type.body}>
        {action === "logout"
          ? "Sign out of this device through your account provider. Your published content stays in your account."
          : action === "deactivate"
            ? "Temporarily hide your profile and content. Your posts and follower relationships are kept. Sign in again and choose Reactivate to return."
            : "Permanently request deletion of your account, profile, posts, Checks, votes, comments, relationships and uploaded media through the server deletion worker. Your profile is hidden while deletion is pending. This action cannot be undone after processing."}
      </Text>
      {action === "delete" ? (
        <Banner kind="warn">
          Device drafts and copies saved by other people need separate removal.
          Service backups follow the operator’s retention policy. The approved
          retention policy is awaiting publication.
        </Banner>
      ) : null}
      {action !== "logout" ? (
        <>
          {!security.available ? (
            <Banner kind="info">
              Account actions are awaiting the database update.
            </Banner>
          ) : null}
          {session.isGuest ? (
            <Banner kind="warn">
              This guest session is your account identity. Signing out may
              prevent you from recovering this guest account. Create a
              registered account first if you want reliable access.
            </Banner>
          ) : (
            <>
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
            </>
          )}
          <Field
            label={"Type " + word + " to confirm"}
            value={confirm}
            onChangeText={setConfirm}
            autoCapitalize="characters"
            editable={!busy}
          />
        </>
      ) : null}
      <Button
        label={
          action === "logout"
            ? "Confirm log out"
            : action === "delete"
              ? "Request permanent deletion"
              : "Confirm deactivation"
        }
        loading={busy}
        disabled={
          action !== "logout" && (confirm !== word || !security.available)
        }
        onPress={async () => {
          setBusy(true);
          setError("");
          try {
            if (action === "logout") {
              await logout();
              router.replace("/login");
            } else {
              await accountAction(action, password, otp);
              setPassword("");
              setOtp("");
              await refreshSecurity();
              router.replace("/account-lock");
            }
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Could not complete account action.",
            );
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
