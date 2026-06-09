/**
 * Job service — the single place that talks to Supabase for cleaning jobs,
 * job types, and checklist templates.
 */
import { supabase } from '@/lib/supabase';
import { ServiceError, toFriendlyError } from '@/services/errors';
import { getLocationById } from '@/services/locationService';
import type {
  CleaningChecklistTemplate,
  CleaningJobTypeSlug,
  Job,
  JobInput,
  JobStatus,
  JobType,
} from '@/types/jobs';

/** Statuses considered "active" (posted through awaiting approval). */
const ACTIVE_STATUSES: JobStatus[] = [
  'posted',
  'accepted',
  'en_route',
  'checked_in',
  'in_progress',
  'proof_submitted',
  'awaiting_approval',
];

const JOB_TYPE_TITLES: Record<CleaningJobTypeSlug, string> = {
  str_turnover: 'STR Turnover',
  home_cleaning: 'Home Cleaning',
};

export async function getRequesterJobs(requesterUserId: string): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('requester_user_id', requesterUserId)
    .order('created_at', { ascending: false });

  if (error) throw toFriendlyError('Could not load your jobs', error);
  return (data ?? []) as Job[];
}

export async function getActiveRequesterJobs(requesterUserId: string): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('requester_user_id', requesterUserId)
    .in('status', ACTIVE_STATUSES)
    .order('deadline_at', { ascending: true });

  if (error) throw toFriendlyError('Could not load your active jobs', error);
  return (data ?? []) as Job[];
}

export async function getJobById(
  jobId: string,
  requesterUserId: string,
): Promise<Job | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('requester_user_id', requesterUserId)
    .maybeSingle();

  if (error) throw toFriendlyError('Could not load this job', error);
  return data as Job | null;
}

/**
 * Creates a cleaning job as a draft. Derives the title and copies bedrooms/
 * bathrooms from the (owner-verified) location. Payment is not authorized here.
 */
export async function createCleaningJob(
  requesterUserId: string,
  input: JobInput,
): Promise<Job> {
  const location = await getLocationById(input.service_location_id, requesterUserId);
  if (!location) {
    throw new ServiceError('That location was not found for your account.');
  }

  const title = `${JOB_TYPE_TITLES[input.job_type_slug]} — ${location.nickname}`;

  const { data, error } = await supabase
    .from('jobs')
    .insert({
      requester_user_id: requesterUserId,
      service_location_id: input.service_location_id,
      category_slug: 'cleaning',
      job_type_slug: input.job_type_slug,
      title,
      status: 'draft',
      requested_start_at: input.requested_start_at ?? null,
      deadline_at: input.deadline_at,
      payout_cents: input.payout_cents,
      platform_fee_cents: 0,
      worker_net_payout_cents: input.payout_cents,
      bedrooms: location.bedrooms,
      bathrooms: location.bathrooms,
      estimated_hours: input.estimated_hours ?? null,
      laundry_required: input.laundry_required ?? false,
      restocking_required: input.restocking_required ?? false,
      trash_removal_required: input.trash_removal_required ?? false,
      cleaning_scope: input.cleaning_scope ?? null,
      special_instructions: input.special_instructions ?? null,
    })
    .select()
    .single();

  if (error) throw toFriendlyError('Could not save this job', error);
  return data as Job;
}

/** Moves a draft job to `posted` (Sprint 2 has no payment authorization). */
export async function postCleaningJob(
  jobId: string,
  requesterUserId: string,
): Promise<Job> {
  const { data, error } = await supabase
    .from('jobs')
    .update({ status: 'posted' })
    .eq('id', jobId)
    .eq('requester_user_id', requesterUserId)
    .select()
    .single();

  if (error) throw toFriendlyError('Could not post this job', error);
  return data as Job;
}

export async function getCleaningJobTypes(): Promise<JobType[]> {
  const { data, error } = await supabase
    .from('job_types')
    .select('*')
    .eq('category_slug', 'cleaning')
    .eq('is_active', true)
    .order('display_name', { ascending: true });

  if (error) throw toFriendlyError('Could not load job types', error);
  return (data ?? []) as JobType[];
}

export async function getCleaningChecklistTemplate(
  jobTypeSlug: CleaningJobTypeSlug,
): Promise<CleaningChecklistTemplate[]> {
  const { data, error } = await supabase
    .from('cleaning_checklist_templates')
    .select('*')
    .eq('job_type_slug', jobTypeSlug)
    .order('sort_order', { ascending: true });

  if (error) throw toFriendlyError('Could not load the checklist', error);
  return (data ?? []) as CleaningChecklistTemplate[];
}
