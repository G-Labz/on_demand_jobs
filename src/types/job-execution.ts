/**
 * Job execution types — checklist instances, proof photos, status events
 * (see supabase/migrations/004_sprint_4_job_execution_proof_approval.sql).
 */
import type { Job, JobStatus } from '@/types/jobs';
import type { AcceptedWorkerJob } from '@/types/worker-jobs';

/** Row in `job_checklist_items` — a per-job copy of a checklist template task. */
export interface JobChecklistItem {
  id: string;
  job_id: string;
  template_id: string | null;
  room_name: string;
  task_label: string;
  requires_photo: boolean;
  sort_order: number;
  completed_at: string | null;
  completed_by_worker_user_id: string | null;
  created_at: string;
}

/** Row in `job_proof_photos` — metadata for a privately stored proof photo. */
export interface JobProofPhoto {
  id: string;
  job_id: string;
  checklist_item_id: string | null;
  uploaded_by_worker_user_id: string;
  storage_bucket: string;
  storage_path: string;
  created_at: string;
}

/** Row in `job_status_events` — audit trail of status transitions. */
export interface JobStatusEvent {
  id: string;
  job_id: string;
  actor_user_id: string | null;
  from_status: JobStatus | null;
  to_status: JobStatus;
  event_label: string;
  created_at: string;
}

/** A proof photo plus a short-lived signed URL for display (null if signing failed). */
export interface ProofPhotoWithUrl extends JobProofPhoto {
  signed_url: string | null;
}

/** Everything the worker job workspace needs in one fetch. */
export interface WorkerJobWorkspace {
  job: AcceptedWorkerJob;
  checklist: JobChecklistItem[];
  photos: ProofPhotoWithUrl[];
}

/** Everything the requester review screen needs in one fetch. */
export interface RequesterJobReview {
  job: Job;
  checklist: JobChecklistItem[];
  photos: ProofPhotoWithUrl[];
}

/** Result of a successful proof photo upload. */
export interface ProofUploadResult {
  photoId: string;
  storagePath: string;
}
