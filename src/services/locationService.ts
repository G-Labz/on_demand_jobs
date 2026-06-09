/**
 * Location service — the single place that talks to Supabase for a Requester's
 * saved service locations.
 */
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/services/errors';
import type { ServiceLocation, ServiceLocationInput } from '@/types/locations';

export async function getRequesterLocations(
  requesterUserId: string,
): Promise<ServiceLocation[]> {
  const { data, error } = await supabase
    .from('service_locations')
    .select('*')
    .eq('requester_user_id', requesterUserId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) throw toFriendlyError('Could not load your locations', error);
  return (data ?? []) as ServiceLocation[];
}

export async function getLocationById(
  locationId: string,
  requesterUserId: string,
): Promise<ServiceLocation | null> {
  const { data, error } = await supabase
    .from('service_locations')
    .select('*')
    .eq('id', locationId)
    .eq('requester_user_id', requesterUserId)
    .maybeSingle();

  if (error) throw toFriendlyError('Could not load this location', error);
  return data as ServiceLocation | null;
}

export async function createServiceLocation(
  requesterUserId: string,
  input: ServiceLocationInput,
): Promise<ServiceLocation> {
  const { data, error } = await supabase
    .from('service_locations')
    .insert({ requester_user_id: requesterUserId, ...input })
    .select()
    .single();

  if (error) throw toFriendlyError('Could not save this location', error);
  return data as ServiceLocation;
}

export async function updateServiceLocation(
  locationId: string,
  requesterUserId: string,
  changes: Partial<ServiceLocationInput>,
): Promise<ServiceLocation> {
  const { data, error } = await supabase
    .from('service_locations')
    .update(changes)
    .eq('id', locationId)
    .eq('requester_user_id', requesterUserId)
    .select()
    .single();

  if (error) throw toFriendlyError('Could not update this location', error);
  return data as ServiceLocation;
}

export async function deactivateServiceLocation(
  locationId: string,
  requesterUserId: string,
): Promise<void> {
  const { error } = await supabase
    .from('service_locations')
    .update({ is_active: false })
    .eq('id', locationId)
    .eq('requester_user_id', requesterUserId);

  if (error) throw toFriendlyError('Could not remove this location', error);
}
