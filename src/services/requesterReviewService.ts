/**
 * Requester review service — proof review + completion approval.
 *
 * Reads use the requester's owner-scoped RLS (jobs) and the participant SELECT
 * policies on checklist/photos. Approval is the requester's only mutation and
 * goes through the approve_job_completion RPC (status + ownership validated
 * server-side).
 */
import { supabase } from '@/lib/supabase';
import { getProofPhotoSignedUrl } from '@/lib/storage';
import { toFriendlyError, toFriendlyRpcError } from '@/services/errors';
import { getJobById } from '@/services/jobService';
import type {
  JobChecklistItem,
  JobProofPhoto,
  ProofPhotoWithUrl,
  RequesterJobReview,
} from '@/types/job-execution';

/** Job + checklist completion + proof photos (with signed display URLs). */
export async function getRequesterJobReview(
  jobId: string,
  requesterUserId: string,
): Promise<RequesterJobReview | null> {
  const job = await getJobById(jobId, requesterUserId);
  if (!job) return null;

  const [checklistRes, photosRes] = await Promise.all([
    supabase
      .from('job_checklist_items')
      .select('*')
      .eq('job_id', jobId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('job_proof_photos')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true }),
  ]);

  if (checklistRes.error) {
    throw toFriendlyError('Could not load the checklist', checklistRes.error);
  }
  if (photosRes.error) {
    throw toFriendlyError('Could not load the proof photos', photosRes.error);
  }

  const checklist = (checklistRes.data ?? []) as JobChecklistItem[];
  const photoRows = (photosRes.data ?? []) as JobProofPhoto[];
  const photos: ProofPhotoWithUrl[] = await Promise.all(
    photoRows.map(async (photo) => ({
      ...photo,
      signed_url: await getProofPhotoSignedUrl(photo.storage_path),
    })),
  );

  return { job, checklist, photos };
}

/** awaiting_approval → completed. Returns the approval timestamp. */
export async function approveJobCompletion(jobId: string): Promise<string> {
  const { data, error } = await supabase.rpc('approve_job_completion', {
    p_job_id: jobId,
  });
  if (error) throw toFriendlyRpcError('Could not approve completion', error);
  return data as string;
}
