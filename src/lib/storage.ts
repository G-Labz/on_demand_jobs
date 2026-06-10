/**
 * Supabase Storage helpers for proof photos.
 *
 * The `job-proof-photos` bucket is PRIVATE: uploads are restricted by storage
 * RLS to the assigned worker while the job is in progress, and reads to the
 * assigned worker + owning requester. Display always goes through short-lived
 * signed URLs created by an authenticated participant — never public URLs.
 */
import { supabase } from '@/lib/supabase';
import { ServiceError } from '@/services/errors';

export const PROOF_PHOTO_BUCKET = 'job-proof-photos';

/** Signed URL lifetime (seconds). */
const SIGNED_URL_TTL = 60 * 60;

export async function uploadProofPhotoFile(
  path: string,
  body: Blob | ArrayBuffer,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage
    .from(PROOF_PHOTO_BUCKET)
    .upload(path, body, { contentType, upsert: false });

  if (error) {
    throw new ServiceError(`Could not upload the photo: ${error.message}`);
  }
}

/** Returns a short-lived signed URL, or null when signing fails (e.g. no access). */
export async function getProofPhotoSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PROOF_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
