/**
 * Profile service — the single place that talks to Supabase for profile data.
 * Screens call these functions; they never run Supabase queries directly.
 */
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/services/errors';
import type {
  ProfileCompletionState,
  RequesterProfile,
  RequesterProfileInput,
  UserProfile,
  UserRole,
  WorkerProfile,
  WorkerProfileInput,
} from '@/types/profiles';

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw toFriendlyError('Could not load your profile', error);
  return data as UserProfile | null;
}

export async function createUserProfile(
  userId: string,
  role: UserRole,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .insert({ id: userId, role })
    .select()
    .single();

  if (error) throw toFriendlyError('Could not save your role', error);
  return data as UserProfile;
}

export async function updateUserProfile(
  userId: string,
  changes: Partial<
    Pick<UserProfile, 'display_name' | 'phone_number' | 'profile_completed' | 'role'>
  >,
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('user_profiles')
    .update(changes)
    .eq('id', userId)
    .select()
    .single();

  if (error) throw toFriendlyError('Could not update your profile', error);
  return data as UserProfile;
}

export async function createRequesterProfile(
  userId: string,
  input: RequesterProfileInput,
): Promise<RequesterProfile> {
  const { data, error } = await supabase
    .from('requester_profiles')
    .insert({
      user_id: userId,
      requester_type: input.requester_type,
      service_area_zip: input.service_area_zip,
    })
    .select()
    .single();

  if (error) throw toFriendlyError('Could not save your requester profile', error);
  return data as RequesterProfile;
}

export async function createWorkerProfile(
  userId: string,
  input: WorkerProfileInput,
): Promise<WorkerProfile> {
  const { data, error } = await supabase
    .from('worker_profiles')
    .insert({
      user_id: userId,
      home_base_zip: input.home_base_zip,
      service_radius_miles: input.service_radius_miles,
      experience_years: input.experience_years,
      // worker_tier, verification_status, is_online use DB defaults (L1 / pending / false).
    })
    .select()
    .single();

  if (error) throw toFriendlyError('Could not save your worker profile', error);
  return data as WorkerProfile;
}

/**
 * Reads the user's profile plus the matching role profile and returns the
 * snapshot the route guard uses to decide where to send them.
 */
export async function getProfileCompletionState(
  userId: string,
): Promise<ProfileCompletionState> {
  const profile = await getUserProfile(userId);

  if (!profile) {
    return { userId, role: null, profileCompleted: false, hasRoleProfile: false };
  }

  let hasRoleProfile = false;

  if (profile.role === 'requester') {
    const { data, error } = await supabase
      .from('requester_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw toFriendlyError('Could not load your requester profile', error);
    hasRoleProfile = data != null;
  } else if (profile.role === 'worker') {
    const { data, error } = await supabase
      .from('worker_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw toFriendlyError('Could not load your worker profile', error);
    hasRoleProfile = data != null;
  }

  return {
    userId,
    role: profile.role,
    profileCompleted: profile.profile_completed,
    hasRoleProfile,
  };
}
