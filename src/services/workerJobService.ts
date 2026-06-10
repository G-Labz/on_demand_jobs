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
import { getProofPhotoSignedUrl, uploadProofPhotoFile } from '@/lib/storage';
import { ServiceError, toFriendlyError, toFriendlyRpcError } from '@/services/errors';
import type {
  JobChecklistItem,
  JobProofPhoto,
  ProofPhotoWithUrl,
  ProofUploadResult,
  WorkerJobWorkspace,
} from '@/types/job-execution';
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

// -----------------------------------------------------------------------------
// Sprint 4 — execution workspace, checklist, proof, transitions
// -----------------------------------------------------------------------------

/** Statuses during which the checklist can still be generated. */
const CHECKLIST_STATUSES = ['accepted', 'en_route', 'checked_in', 'in_progress'];

async function getJobChecklist(jobId: string): Promise<JobChecklistItem[]> {
  const { data, error } = await supabase
    .from('job_checklist_items')
    .select('*')
    .eq('job_id', jobId)
    .order('sort_order', { ascending: true });

  if (error) throw toFriendlyError('Could not load the checklist', error);
  return (data ?? []) as JobChecklistItem[];
}

async function getJobProofPhotos(jobId: string): Promise<ProofPhotoWithUrl[]> {
  const { data, error } = await supabase
    .from('job_proof_photos')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });

  if (error) throw toFriendlyError('Could not load the proof photos', error);
  const photos = (data ?? []) as JobProofPhoto[];
  return Promise.all(
    photos.map(async (photo) => ({
      ...photo,
      signed_url: await getProofPhotoSignedUrl(photo.storage_path),
    })),
  );
}

/**
 * Everything the assigned worker's job workspace needs: the job + location,
 * the per-job checklist (generated idempotently if missing), and proof photos
 * with signed display URLs.
 */
export async function getWorkerJobWorkspace(
  jobId: string,
  workerUserId: string,
): Promise<WorkerJobWorkspace | null> {
  const job = await getWorkerAcceptedJobById(jobId, workerUserId);
  if (!job) return null;

  if (CHECKLIST_STATUSES.includes(job.status)) {
    const { error } = await supabase.rpc('ensure_job_checklist', { p_job_id: jobId });
    if (error) throw toFriendlyRpcError('Could not prepare the checklist', error);
  }

  const [checklist, photos] = await Promise.all([
    getJobChecklist(jobId),
    getJobProofPhotos(jobId),
  ]);

  return { job, checklist, photos };
}

/** accepted → en_route. Returns the transition timestamp. */
export async function setJobEnRoute(jobId: string): Promise<string> {
  const { data, error } = await supabase.rpc('set_job_en_route', { p_job_id: jobId });
  if (error) throw toFriendlyRpcError('Could not mark en route', error);
  return data as string;
}

/** en_route → checked_in. A worker action button — no GPS verification. */
export async function checkInJob(jobId: string): Promise<string> {
  const { data, error } = await supabase.rpc('check_in_job', { p_job_id: jobId });
  if (error) throw toFriendlyRpcError('Could not check in', error);
  return data as string;
}

/** checked_in → in_progress (also ensures the checklist exists server-side). */
export async function startJobWork(jobId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_job_work', { p_job_id: jobId });
  if (error) throw toFriendlyRpcError('Could not start work', error);
  return data as string;
}

/** Mark one checklist task complete (one-way; assigned worker, in_progress only). */
export async function completeChecklistItem(itemId: string): Promise<string> {
  const { data, error } = await supabase.rpc('complete_checklist_item', {
    p_item_id: itemId,
  });
  if (error) throw toFriendlyRpcError('Could not complete this task', error);
  return data as string;
}

/**
 * Upload one proof photo for a checklist item and record its metadata row.
 * Path: {job_id}/{checklist_item_id}/{worker_user_id}/{unique}.jpg — the storage
 * policies key on the job-id prefix; the RPC re-validates assignment/status/linkage.
 */
export async function uploadProofPhoto(
  jobId: string,
  checklistItemId: string,
  workerUserId: string,
  asset: { uri: string; mimeType?: string | null },
): Promise<ProofUploadResult> {
  const contentType = asset.mimeType ?? 'image/jpeg';
  const extension = contentType === 'image/png' ? 'png' : 'jpg';
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const storagePath = `${jobId}/${checklistItemId}/${workerUserId}/${unique}.${extension}`;

  const response = await fetch(asset.uri);
  if (!response.ok) {
    throw new ServiceError('Could not read the selected photo.');
  }
  const blob = await response.blob();

  await uploadProofPhotoFile(storagePath, blob, contentType);

  const { data, error } = await supabase.rpc('add_job_proof_photo', {
    p_job_id: jobId,
    p_checklist_item_id: checklistItemId,
    p_storage_path: storagePath,
  });
  if (error) throw toFriendlyRpcError('Could not save the proof photo', error);

  return { photoId: data as string, storagePath };
}

/**
 * in_progress → awaiting_approval. Server-side re-validates that every checklist
 * task is complete and every requires-photo task has at least one proof photo.
 */
export async function submitJobProof(jobId: string): Promise<string> {
  const { data, error } = await supabase.rpc('submit_job_proof', { p_job_id: jobId });
  if (error) throw toFriendlyRpcError('Could not submit proof', error);
  return data as string;
}
