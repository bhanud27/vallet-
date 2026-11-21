import React, { useCallback, useRef, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { HumanCheck } from "../ui/HumanCheck";
import { supabase } from "../lib/supabase";
import { appSession } from "../lib/auth";
import { useAuth } from "../ui/AppContext";
import { Banner, Screen } from "../ui/kit";
import { useTheme } from "../ui/theme";
export default function VerifyHuman() {
  const { type } = useTheme();

  const [error, setError] = useState(""),
    [reset, setReset] = useState(0),
    [pending, setPending] = useState(false);
  const busy = useRef(false),
    { setSession } = useAuth(),
    { poll } = useLocalSearchParams<{ poll?: string }>();
  const verify = useCallback(
    async (captchaToken: string) => {
      if (!captchaToken || busy.current || !supabase) return;
      busy.current = true;
      setPending(true);
      setError("");
      try {
        const { data, error } = await supabase.auth.signInAnonymously({
          options: { captchaToken },
        });
        if (error) throw error;
        if (data.user) {
          setSession(appSession(data.user));
          router.replace(
            poll && /^[a-f0-9-]{36}$/i.test(poll) ? "/p/" + poll : "/",
          );
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not verify. Try again.",
        );
        setReset((n) => n + 1);
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [setSession, poll],
  );
  return (
    <Screen>
      <Text style={type.title}>Verify you are human</Text>
      <HumanCheck onToken={verify} resetKey={reset} />
      {pending ? <Text style={type.body}>Starting your session...</Text> : null}
      {error ? <Banner kind="error">{error}</Banner> : null}
    </Screen>
  );
}
