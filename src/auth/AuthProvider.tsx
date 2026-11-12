import {createContext, useCallback, useContext, useEffect, type ReactNode} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {api, ApiError, SESSION_EXPIRED} from '../api/client';
import type {SessionUser} from '../api/contracts';

const sessionKey = ['session'] as const;
interface Auth {user: SessionUser | null; loading: boolean; error: Error | null; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; retry: () => void}
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({children}: {children: ReactNode}) {
  const client = useQueryClient();
  const session = useQuery({queryKey: sessionKey, queryFn: async ({signal}) => {
    try {return await api.me(signal);} catch (error) {if (error instanceof ApiError && error.status === 401) return null; throw error;}
  }, retry: false, staleTime: 60_000});
  const forget = useCallback(() => {void client.cancelQueries({queryKey: ['workspace']}); client.removeQueries({queryKey: ['workspace']}); client.setQueryData(sessionKey, null);}, [client]);
  useEffect(() => {window.addEventListener(SESSION_EXPIRED, forget); return () => window.removeEventListener(SESSION_EXPIRED, forget);}, [forget]);
  const login = useCallback(async (email: string, password: string) => {
    await client.cancelQueries();
    await api.login(email.trim(), password);
    const user = await api.me();
    client.removeQueries({queryKey: ['workspace']}); client.setQueryData(sessionKey, user);
  }, [client]);
  const logout = useCallback(async () => {
    try {await api.logout();} catch (error) {if (!(error instanceof ApiError && error.status === 401)) throw error;}
    await client.cancelQueries(); forget();
  }, [client, forget]);
  return <AuthContext.Provider value={{user: session.data ?? null, loading: session.isPending, error: session.error, login, logout, retry: () => {void session.refetch();}}}>{children}</AuthContext.Provider>;
}
export function useAuth() {const auth = useContext(AuthContext); if (!auth) throw new Error('AuthProvider is missing'); return auth;}
