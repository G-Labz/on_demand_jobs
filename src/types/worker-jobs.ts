/**
 * Worker-side job types — mirror the Sprint 3 RPC return shapes and the
 * assigned-worker RLS reads
 * (see supabase/migrations/003_sprint_3_worker_feed_acceptance.sql).
 */
import type { CleaningJobTypeSlug, Job, JobStatus } from '@/types/jobs';
import type { LocationType, ServiceLocation } from '@/types/locations';
import type { WorkerTier } from '@/types/profiles';

/**
 * Safe pre-acceptance job preview returned by `get_available_jobs_for_worker` /
 * `get_worker_job_detail`. Deliberately contains NO street address, access/
 * parking/restock notes, special instructions, or requester identity.
 */
export interface AvailableWorkerJob {
  id: string;
  job_type_slug: CleaningJobTypeSlug;
  title: string;
  status: JobStatus;
  payout_cents: number;
  deadline_at: string;
  requested_start_at: string | null;
  estimated_hours: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  laundry_required: boolean;
  restocking_required: boolean;
  trash_removal_required: boolean;
  cleaning_scope: string | null;
  city: string;
  state: string;
  zip_code: string;
  location_type: LocationType;
  required_worker_tier: WorkerTier;
  /** Computed server-side: verified AND tier >= required tier. */
  is_eligible: boolean;
  created_at: string;
}

/**
 * An accepted job read directly (via assigned-worker RLS) with its embedded
 * service location — full address and notes, visible only to the assigned worker.
 */
export interface AcceptedWorkerJob extends Job {
  service_locations: ServiceLocation | null;
}
