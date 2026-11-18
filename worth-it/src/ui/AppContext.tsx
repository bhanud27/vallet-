import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { repo } from '../lib/repo';
import { Session } from '../lib/types';

interface Ctx { session: Session; refresh: () => Promise<void>; setSession: (s: Session) => void }
const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

export function AppProvider({ children, fallback, errorView }: {
  children: ReactNode; fallback: ReactNode; errorView: (message: string, retry: () => void) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try { setSession(await repo.init()); } catch (e) { setError(e instanceof Error ? e.message : 'Could not start.'); }
  }, []);
  useEffect(() => { start(); }, [start]);

  if (error) return <>{errorView(error, start)}</>;
  if (!session) return <>{fallback}</>;
  return <AppCtx.Provider value={{ session, refresh: start, setSession }}>{children}</AppCtx.Provider>;
}
