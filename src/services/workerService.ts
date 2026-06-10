/**
 * Worker service — worker profile reads and online/offline state.
 *
 * Note: there is intentionally NO direct table update here. Workers have no
 * UPDATE policy on `worker_profiles`; the online toggle goes through the
 * `set_worker_online_status` RPC, which updates only `is_online`. Verification
 * status and worker tier can only be changed by admin/manual SQL.
 */
import { supabase } from '@/lib/supabase';
import { toFriendlyError, toFriendlyRpcError } from '@/services/errors';
import type { WorkerProfile } from '@/types/profiles';

export async function getWorkerProfile(userId: string): Promise<WorkerProfile | null> {
  const { data, error } = await supabase
    .from('worker_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw toFriendlyError('Could not load your worker profile', error);
  return data as WorkerProfile | null;
}

/** Toggle availability. Returns the new online state. */
export async function setWorkerOnlineStatus(isOnline: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_worker_online_status', {
    p_is_online: isOnline,
  });

  if (error) throw toFriendlyRpcError('Could not update your availability', error);
  return data as boolean;
}
