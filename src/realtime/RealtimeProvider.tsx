import {useEffect, type ReactNode} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useAuth} from '../auth/AuthProvider';
import {subscribe} from './connection';

export function RealtimeProvider({children}: {children: ReactNode}) {
  const {user} = useAuth();
  const client = useQueryClient();
  useEffect(() => {
    if (!user) return;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribe(user.id, () => {if (refresh) clearTimeout(refresh); refresh = setTimeout(() => {void client.invalidateQueries({queryKey: ['workspace', user.id]});}, 150);});
    return () => {unsubscribe(); if (refresh) clearTimeout(refresh);};
  }, [user?.id, client]);
  return children;
}
