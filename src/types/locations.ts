/**
 * Service location types — mirror `service_locations`
 * (see supabase/migrations/002_sprint_2_requester_worker_cleaning_jobs.sql).
 *
 * A service location is a saved place a Requester needs work done: an STR
 * property, a regular home, an apartment, a small business, etc.
 */

export type LocationType =
  | 'home'
  | 'str_property'
  | 'apartment'
  | 'condo'
  | 'townhouse'
  | 'small_business'
  | 'other';

/** Row in `service_locations`. */
export interface ServiceLocation {
  id: string;
  requester_user_id: string;
  nickname: string;
  location_type: LocationType;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip_code: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sleeps: number | null;
  laundry_on_site: boolean;
  typical_laundry_loads: number | null;
  supplies_provided: boolean;
  parking_notes: string | null;
  access_notes: string | null;
  restock_notes: string | null;
  /** Default cleaning payout in cents (dollars are converted at the screen boundary). */
  default_cleaning_payout_cents: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Fields a Requester provides when creating/updating a service location. */
export interface ServiceLocationInput {
  nickname: string;
  location_type: LocationType;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state: string;
  zip_code: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sleeps?: number | null;
  laundry_on_site?: boolean;
  typical_laundry_loads?: number | null;
  supplies_provided?: boolean;
  parking_notes?: string | null;
  access_notes?: string | null;
  restock_notes?: string | null;
  default_cleaning_payout_cents?: number | null;
}
