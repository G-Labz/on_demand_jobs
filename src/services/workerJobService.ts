/**
 * Worker job service — the worker-side view of the job marketplace.
 *
 * Pre-acceptance reads go through security-definer RPCs that return only safe
 * fields (no street address, no access/parking/restock notes, no special
 * instructions, no requester identity). Post-acceptance reads use the
 * assigned-worker RLS policies, which reveal the full job + location only to
 * the worker the job is assigned to.
 *
 * TEMPORARY Sprint 3 matching (implemented in the feed/detail RPCs): jobs match
 * when the service location ZIP shares its first 3 digits with the worker's
 * home_base_zip (Northeast Ohio prefixes 440–445). This is not distance
 * matching; Sprint 4+ replaces it.
 */
import { supabase } from '@/lib/supabase';
import { toFriendlyError, toFriendlyRpcError } from '@/services/errors';
import type { AcceptedWorkerJob, AvailableWorkerJob } from '@/types/worker-jobs';

/** Posted, unassigned, in-area Cleaning jobs (safe preview fields only). */
export async function getAvailableJobsForWorker(): Promise<AvailableWorkerJob[]> {
  const { data, error } = await supabase.rpc('get_available_jobs_for_worker');

  if (error) throw toFriendlyRpcError('Could not load available jobs', error);
  return (data ?? []) as AvailableWorkerJob[];
}

/**
 * Safe pre-acceptance detail for one posted job. Returns null when the job is
 * taken, expired, or outside the worker's match area.
 */
export async function getWorkerJobDetail(
  jobId: string,
): Promise<AvailableWorkerJob | null> {
  const { data, error } = await supabase.rpc('get_worker_job_detail', {
    p_job_id: jobId,
  });

  if (error) throw toFriendlyRpcError('Could not load this job', error);
  const rows = (data ?? []) as AvailableWorkerJob[];
  return rows[0] ?? null;
}

/**
 * Atomically accept a posted job. Server-side the RPC re-validates worker role,
 * online state, verification, tier, and that the job is still unclaimed — only
 * one worker can win. Returns the acceptance timestamp.
 */
export async function acceptJob(jobId: string): Promise<string> {
  const { data, error } = await supabase.rpc('accept_job', { p_job_id: jobId });

  if (error) throw toFriendlyRpcError('Could not accept this job', error);
  return data as string;
}

/** Jobs assigned to this worker (full rows + location via assigned-worker RLS). */
export async function getWorkerAcceptedJobs(
  workerUserId: string,
): Promise<AcceptedWorkerJob[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, service_locations(*)')
    .eq('assigned_worker_user_id', workerUserId)
    .order('deadline_at', { ascending: true });

  if (error) throw toFriendlyError('Could not load your accepted jobs', error);
  return (data ?? []) as AcceptedWorkerJob[];
}

/** One assigned job with full location details (assigned worker only, via RLS). */
export async function getWorkerAcceptedJobById(
  jobId: string,
  workerUserId: string,
): Promise<AcceptedWorkerJob | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*, service_locations(*)')
    .eq('id', jobId)
    .eq('assigned_worker_user_id', workerUserId)
    .maybeSingle();

  if (error) throw toFriendlyError('Could not load this job', error);
  return data as AcceptedWorkerJob | null;
}
