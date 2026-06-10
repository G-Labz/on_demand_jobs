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

/**
 * Stable error codes raised by the Sprint 3 RPC functions (see migration 003),
 * mapped to user-facing messages.
 */
const RPC_ERROR_MESSAGES: Record<string, string> = {
  AUTH_REQUIRED: 'Your session expired. Please log in again.',
  NOT_A_WORKER: 'Only worker accounts can do that.',
  WORKER_PROFILE_MISSING: 'Complete your worker profile first.',
  WORKER_OFFLINE: 'Go online before accepting jobs.',
  VERIFICATION_REQUIRED: 'Accepting jobs unlocks after verification.',
  TIER_TOO_LOW: 'This job requires a higher Worker Tier.',
  JOB_NOT_FOUND: 'This job was not found.',
  INVALID_CATEGORY: 'This job is not a cleaning job.',
  INVALID_JOB_TYPE: 'This job type is not available.',
  JOB_ALREADY_TAKEN: 'Another worker already accepted this job.',
  PROTECTED_FIELD: 'That field cannot be changed from the app.',
};

/**
 * Map an RPC failure to a friendly ServiceError. Postgres exceptions raised in
 * our functions arrive with the raised code as the message text.
 */
export function toFriendlyRpcError(context: string, error: PostgrestError): ServiceError {
  const known = Object.keys(RPC_ERROR_MESSAGES).find((code) =>
    error.message?.includes(code),
  );
  if (known) {
    return new ServiceError(RPC_ERROR_MESSAGES[known], known);
  }
  return toFriendlyError(context, error);
}
