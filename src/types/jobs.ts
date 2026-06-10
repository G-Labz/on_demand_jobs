/**
 * Job + cleaning types — mirror `service_categories`, `job_types`, `jobs`, and
 * `cleaning_checklist_templates`
 * (see supabase/migrations/002_sprint_2_requester_worker_cleaning_jobs.sql).
 */
import type { WorkerTier } from '@/types/profiles';

/** Sprint 2 cleaning job types. */
export type CleaningJobTypeSlug = 'str_turnover' | 'home_cleaning';

/**
 * Full job lifecycle. Sprint 2 only creates `draft`/`posted`; the later statuses
 * are defined now so the schema and type don't churn in Sprint 3+.
 */
export type JobStatus =
  | 'draft'
  | 'posted'
  | 'accepted'
  | 'en_route'
  | 'checked_in'
  | 'in_progress'
  | 'proof_submitted'
  | 'awaiting_approval'
  | 'completed'
  | 'payment_released'
  | 'disputed'
  | 'cancelled'
  | 'no_show';

/** Row in `service_categories`. */
export interface ServiceCategory {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  created_at: string;
}

/** Row in `job_types`. */
export interface JobType {
  id: string;
  category_slug: string;
  slug: string;
  display_name: string;
  required_worker_tier: WorkerTier;
  is_active: boolean;
  created_at: string;
}

/** Row in `jobs`. */
export interface Job {
  id: string;
  requester_user_id: string;
  service_location_id: string;
  category_slug: string;
  job_type_slug: CleaningJobTypeSlug;
  title: string;
  status: JobStatus;
  requested_start_at: string | null;
  deadline_at: string;
  payout_cents: number;
  platform_fee_cents: number;
  worker_net_payout_cents: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  estimated_hours: number | null;
  laundry_required: boolean;
  restocking_required: boolean;
  trash_removal_required: boolean;
  /** Home Cleaning rooms/areas/scope; null for STR Turnover. */
  cleaning_scope: string | null;
  special_instructions: string | null;
  /** Set by accept_job when a worker claims the job (Sprint 3). */
  assigned_worker_user_id: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Fields used to create a cleaning job (title/bed/bath are derived in the service). */
export interface JobInput {
  service_location_id: string;
  job_type_slug: CleaningJobTypeSlug;
  requested_start_at?: string | null;
  deadline_at: string;
  payout_cents: number;
  estimated_hours?: number | null;
  laundry_required?: boolean;
  restocking_required?: boolean;
  trash_removal_required?: boolean;
  cleaning_scope?: string | null;
  special_instructions?: string | null;
}

/** In-progress draft held by the Post Cleaning Job screen before persisting. */
export interface CleaningJobDraft {
  service_location_id: string | null;
  job_type_slug: CleaningJobTypeSlug | null;
  requested_start_at: string | null;
  deadline_at: string | null;
  payout_dollars: string;
  estimated_hours: string;
  laundry_required: boolean;
  restocking_required: boolean;
  trash_removal_required: boolean;
  cleaning_scope: string;
  special_instructions: string;
}

/** Row in `cleaning_checklist_templates`. */
export interface CleaningChecklistTemplate {
  id: string;
  job_type_slug: CleaningJobTypeSlug;
  room_name: string;
  task_label: string;
  requires_photo: boolean;
  sort_order: number;
  created_at: string;
}
