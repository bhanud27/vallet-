import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { repo } from '../lib/repo';
import { appSession } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Session } from '../lib/types';

interface Ctx {
  session: Session | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<Session | null>;
  setSession: (s: Session | null) => void;
}
const AppCtx = createContext<Ctx | null>(null);

export function useAuth(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}

export function useApp() {
  const context = useAuth();
  if (!context.session) throw new Error('This screen requires an app session.');
  return { ...context, session: context.session };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    try {
      const next = await repo.init();
      setSession(next);
      setError(null);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const listener = supabase?.auth.onAuthStateChange((event, current) => {
      if (event === 'INITIAL_SESSION') return;
      setSession(current ? appSession(current.user) : null);
      if (current) setError(null);
    });
    void Promise.resolve().then(start);
    return () => listener?.data.subscription.unsubscribe();
  }, [start]);

  return <AppCtx.Provider value={{ session, loading, error, refresh: start, setSession }}>{children}</AppCtx.Provider>;
}
