import { BrandLogo } from "./BrandLogo";
import { HumanCheck } from "./HumanCheck";
import { Link, router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  checkGuestVerification,
  finishGuestUpgrade,
  signIn,
  signUp,
  startGuestUpgrade,
} from "../lib/auth";
import { supabase } from "../lib/supabase";
import {
  isUsername,
  normalizeUsername,
  USERNAME_HINT,
  USERNAME_MAX,
} from "../lib/username";
import { useAuth } from "./AppContext";
import { Banner, Button, Field, Screen } from "./kit";
import { themedStyles, useTheme } from "./theme";

function PasswordField({
  label,
  value,
  onChangeText,
  editable,
  newPassword,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  editable: boolean;
  newPassword: boolean;
}) {
  const styles = useStyles();

  const [visible, setVisible] = useState(false);
  const action = visible ? "Hide" : "Show";
  return (
    <Field
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={newPassword ? "new-password" : "current-password"}
      editable={editable}
      labelAction={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action} ${label.toLowerCase()}`}
          onPress={() => setVisible(!visible)}
          hitSlop={8}
          style={styles.passwordToggle}
        >
          <Text style={styles.passwordAction}>{action}</Text>
        </Pressable>
      }
    />
  );
}

function PasswordStrength({
  password,
  username,
}: {
  password: string;
  username: string;
}) {
  const { type, colors } = useTheme();
  const styles = useStyles();

  if (!password)
    return (
      <Text style={type.small}>
        Use at least 6 characters. Aim for 12 or more.
      </Text>
    );
  const lowercase = password.toLowerCase();
  const common =
    /^(?:password|qwerty|letmein|admin|123456|abc123)[\d!@#$._ -]*$/i.test(
      password,
    );
  const predictable =
    common ||
    new Set(lowercase).size < 5 ||
    (username.length >= 3 && lowercase.includes(username));
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(
    (pattern) => pattern.test(password),
  ).length;
  const score =
    predictable || password.length < 8
      ? 1
      : password.length >= 16 || (password.length >= 12 && classes >= 3)
        ? 3
        : 2;
  const [label, color] =
    score === 3
      ? ["Strong", colors.buy]
      : score === 2
        ? ["Fair", colors.warnInk]
        : ["Weak", colors.danger];
  return (
    <View style={styles.strength}>
      <View style={styles.strengthTrack} aria-hidden>
        {[1, 2, 3].map((level) => (
          <View
            key={level}
            style={[
              styles.strengthSegment,
              level <= score && { backgroundColor: color },
            ]}
          />
        ))}
      </View>
      <Text accessibilityLiveRegion="polite" style={[type.small, { color }]}>
        Password strength · {label}
      </Text>
    </View>
  );
}

export function AccountAuth({ mode }: { mode: "login" | "signup" }) {
  const { type } = useTheme();
  const styles = useStyles();

  const { session, refresh, setSession } = useAuth();
  const { poll: requestedPoll } = useLocalSearchParams<{ poll?: string }>();
  const poll =
    typeof requestedPoll === "string" &&
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(requestedPoll)
      ? requestedPoll
      : "";
  const destination = poll
    ? { pathname: "/p/[id]" as const, params: { id: poll } }
    : ("/profile" as const);
  const signInPage = {
    pathname: "/login" as const,
    params: poll ? { poll } : {},
  };
  const signupPage = {
    pathname: "/signup" as const,
    params: poll ? { poll } : {},
  };
  const [captchaReset, setCaptchaReset] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [usernameInput, setUsernameInput] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingEmail, setPendingEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup";
  const finishing = signup && !!session?.needsPassword;
  const linking = signup && !!session?.isGuest && !finishing;
  const username = normalizeUsername(usernameInput);
  const title = finishing
    ? "Choose a password"
    : signup
      ? "Create your account"
      : "Welcome back";

  async function submit() {
    if (!supabase || busy) return;
    setError("");
    const address = email.trim();
    if (!finishing && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
      return setError("Enter a valid email address.");
    if (signup && !finishing && !isUsername(username))
      return setError(`Enter a valid username. ${USERNAME_HINT}`);
    if (!linking && (!password || (signup && password.length < 6)))
      return setError(
        signup
          ? "Choose a password with at least 6 characters."
          : "Enter your password.",
      );
    if (signup && !linking && password !== confirmPassword)
      return setError("The passwords do not match.");

    if (
      !finishing &&
      !linking &&
      process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY &&
      !captchaToken
    )
      return setError("Complete the human verification first.");
    setBusy(true);
    try {
      if (linking) {
        const next = await startGuestUpgrade(username, address);
        setSession(next);
        if (!next.needsPassword) setPendingEmail(true);
        return;
      }
      const next = finishing
        ? await finishGuestUpgrade(password)
        : signup
          ? await signUp(username, address, password, captchaToken)
          : await signIn(address, password, captchaToken);
      if (!next) {
        setPassword("");
        setConfirmPassword("");
        setPendingEmail(true);
        return;
      }
      setSession(next);
      router.replace(next.needsPassword ? signupPage : destination);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not complete this request. Try again.",
      );
    } finally {
      setCaptchaToken(undefined);
      setCaptchaReset((n) => n + 1);
      setBusy(false);
    }
  }

  async function checkEmail() {
    setBusy(true);
    setError("");
    try {
      const next = await checkGuestVerification();
      if (!next?.needsPassword)
        throw new Error(
          "Your email isn’t verified yet. Open the link in your inbox and try again.",
        );
      setSession(next);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not check email verification.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function guest() {
    if (!session && process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY) {
      router.push({ pathname: "/verify-human", params: poll ? { poll } : {} });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = session ?? (await refresh());
      if (next) router.replace(poll ? destination : "/");
      else
        setError(
          "Guest access is unavailable. Sign in or create an account to continue.",
        );
    } finally {
      setBusy(false);
    }
  }

  if (session && !session.isGuest && !session.needsPassword)
    return (
      <Screen>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={type.title}>
            You’re signed in
          </Text>
          <Text style={type.body}>{session.email}</Text>
          <Button
            label={poll ? "Return to poll" : "Open profile"}
            onPress={() => router.replace(destination)}
          />
        </View>
      </Screen>
    );

  return (
    <Screen>
      <View style={styles.card}>
        <View style={styles.brand}>
          <BrandLogo />
          <Text style={styles.brandName}>Worth It?</Text>
        </View>
        <Text accessibilityRole="header" style={type.title}>
          {title}
        </Text>
        {!supabase && (
          <Banner kind="info">
            Accounts use Supabase. The local demo is available without an
            account.
          </Banner>
        )}
        {linking && !pendingEmail && (
          <Text style={type.small}>
            Verify your email first to keep the polls and checks from this guest
            session.
          </Text>
        )}
        {pendingEmail && !finishing ? (
          <>
            <Banner kind="ok">
              Check your inbox for the verification link.{" "}
              {linking
                ? "After verifying, return here to choose a password."
                : "Once verified, you can sign in."}
            </Banner>
            {linking ? (
              <Button
                label="I verified my email"
                loading={busy}
                onPress={checkEmail}
              />
            ) : (
              <Button
                label="Go to sign in"
                onPress={() => router.replace(signInPage)}
              />
            )}
          </>
        ) : (
          <>
            {signup && !finishing && (
              <Field
                label="Username"
                value={usernameInput}
                onChangeText={setUsernameInput}
                hint={USERNAME_HINT}
                maxLength={USERNAME_MAX}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                editable={!busy}
              />
            )}
            {!finishing && (
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                editable={!busy}
              />
            )}
            {!linking && (
              <PasswordField
                label="Password"
                value={password}
                onChangeText={setPassword}
                editable={!busy}
                newPassword={signup}
              />
            )}
            {signup && !linking && (
              <PasswordStrength password={password} username={username} />
            )}
            {signup && !linking && (
              <PasswordField
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!busy}
                newPassword
              />
            )}
            {!finishing && !linking && (
              <HumanCheck onToken={setCaptchaToken} resetKey={captchaReset} />
            )}
            <Button
              label={
                finishing
                  ? "Save password"
                  : linking
                    ? "Send verification email"
                    : signup
                      ? "Create account"
                      : "Sign in"
              }
              loading={busy}
              disabled={!supabase}
              onPress={submit}
            />
          </>
        )}
        {!signup && (
          <Button
            label="Forgot password?"
            variant="quiet"
            onPress={() => router.push("/password-reset")}
          />
        )}
        {error ? <Banner kind="error">{error}</Banner> : null}
        {!finishing && !pendingEmail && (
          <Link href={signup ? signInPage : signupPage} style={styles.link}>
            {signup
              ? "Already have an account? Sign in"
              : "New to Worth It? Create an account"}
          </Link>
        )}
        {!finishing && (
          <Button
            label="Continue as guest"
            variant="quiet"
            disabled={busy}
            onPress={guest}
          />
        )}
        {!finishing && !pendingEmail && !poll && (
          <Link href="/discover" style={styles.link}>
            Browse public questions
          </Link>
        )}
      </View>
    </Screen>
  );
}

const useStyles = themedStyles(({ colors }) =>
  StyleSheet.create({
    card: {
      gap: 15,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      padding: 19,
    },
    brand: { flexDirection: "row", alignItems: "center", gap: 10 },
    brandName: { color: colors.ink, fontSize: 17, fontWeight: "800" },
    link: {
      color: colors.accentInk,
      textAlign: "center",
      fontWeight: "700",
      lineHeight: 24,
      paddingVertical: 5,
    },
    passwordToggle: { paddingVertical: 4, paddingHorizontal: 3 },
    passwordAction: {
      color: colors.accentInk,
      fontWeight: "700",
      fontSize: 14,
    },
    strength: { gap: 5 },
    strengthTrack: { flexDirection: "row", gap: 5 },
    strengthSegment: {
      backgroundColor: colors.border,
      borderRadius: 3,
      flex: 1,
      height: 4,
    },
  }),
);
