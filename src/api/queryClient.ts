import {QueryClient} from '@tanstack/react-query';
import {ApiError} from './client';
export const queryClient = new QueryClient({defaultOptions: {
  queries: {staleTime: 15_000, retry: (count, error) => count < 1 && (!(error instanceof ApiError) || error.status >= 500), refetchOnWindowFocus: true},
  mutations: {retry: false},
}});
