/**
 * Shared service-layer error handling. Used by profile/location/job services so
 * Supabase errors surface as clear, user-facing messages instead of raw codes.
 */
import type { PostgrestError } from '@supabase/supabase-js';

/** Error carrying a user-friendly message plus the original Postgres code. */
export class ServiceError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
  }
}

/** True when an error is a Postgres unique-violation (duplicate row). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof ServiceError && error.code === '23505';
}

export function toFriendlyError(context: string, error: PostgrestError): ServiceError {
  switch (error.code) {
    case '23505': // unique_violation
      return new ServiceError('That already exists for your account.', error.code);
    case '23503': // foreign_key_violation
      return new ServiceError('A required related record is missing.', error.code);
    case '42501': // insufficient_privilege (RLS)
      return new ServiceError(
        'You are not allowed to do that. Please sign in again.',
        error.code,
      );
    default:
      return new ServiceError(`${context}: ${error.message}`, error.code);
  }
}
