/**
 * Profile domain types — mirror the Supabase schema
 * (see supabase/migrations/001_sprint_1_foundation.sql + 002_…cleaning_jobs.sql).
 */

// Top-level roles. A Requester posts paid jobs; a Worker accepts and completes them.
// Single role per account for now, but kept as a discrete union for future multi-role.
export type UserRole = 'requester' | 'worker';

// Requester subtypes. `homeowner` is a first-class subtype (not just STR hosts);
// the STR-specific subtypes survive here only as requester subtypes.
export type RequesterType =
  | 'homeowner'
  | 'str_host'
  | 'co_host'
  | 'property_manager'
  | 'small_business';

export type WorkerTier = 'L1' | 'L2' | 'L3';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';

/** Row in `user_profiles`. */
export interface UserProfile {
  id: string; // === auth.users.id
  role: UserRole;
  display_name: string | null;
  phone_number: string | null;
  profile_completed: boolean;
  created_at: string;
  updated_at: string;
}

/** Row in `requester_profiles`. */
export interface RequesterProfile {
  id: string;
  user_id: string;
  requester_type: RequesterType | null;
  service_area_zip: string | null;
  created_at: string;
  updated_at: string;
}

/** Row in `worker_profiles`. */
export interface WorkerProfile {
  id: string;
  user_id: string;
  home_base_zip: string | null;
  service_radius_miles: number;
  experience_years: number;
  worker_tier: WorkerTier;
  verification_status: VerificationStatus;
  is_online: boolean;
  created_at: string;
  updated_at: string;
}

/** Collected by the Requester profile setup screen. */
export interface RequesterProfileInput {
  display_name: string;
  phone_number: string;
  requester_type: RequesterType;
  service_area_zip: string;
}

/** Collected by the Worker profile setup screen. */
export interface WorkerProfileInput {
  display_name: string;
  phone_number: string;
  home_base_zip: string;
  service_radius_miles: number;
  experience_years: number;
}

/**
 * Snapshot used by the route guard to decide where to send the user.
 * `role === null` means no `user_profiles` row exists yet.
 */
export interface ProfileCompletionState {
  userId: string;
  role: UserRole | null;
  profileCompleted: boolean;
  hasRoleProfile: boolean;
}
