import { useCallback, useEffect, useRef, useState } from "react";
import { accountState, emptyAccountState } from "../lib/accountLifecycle";
import { supabase } from "../lib/supabase";
import type { Session } from "../lib/types";
export function useAccountGuard(session: Session | null) {
  const [result, setResult] = useState({
      id: "",
      state: emptyAccountState,
      error: "",
    }),
    sequence = useRef(0);
  const refreshSecurity = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const state = session ? await accountState() : emptyAccountState;
      if (request === sequence.current)
        setResult({ id: session?.userId ?? "", state, error: "" });
    } catch {
      if (request === sequence.current)
        setResult({
          id: session?.userId ?? "",
          state: emptyAccountState,
          error: "Could not verify your account. Please retry.",
        });
    }
  }, [session]);
  useEffect(() => {
    const currentSequence = sequence;
    void Promise.resolve().then(refreshSecurity);
    return () => {
      currentSequence.current++;
    };
  }, [refreshSecurity]);
  return {
    security: result.state,
    securityError: result.error,
    securityLoading: !!supabase && !!session && result.id !== session.userId,
    refreshSecurity,
  };
}
