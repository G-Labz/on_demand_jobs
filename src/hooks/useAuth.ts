import { useContext } from 'react';

import { AuthContext } from '@/context/AuthProvider';
import type { AuthContextValue } from '@/context/AuthProvider';

/** Access the centralized auth + profile state. Must be used under <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return ctx;
}
