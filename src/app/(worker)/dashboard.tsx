import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/ScreenContainer';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { formatCents, formatLocalDateTime } from '@/lib/format';
import { getUserProfile } from '@/services/profileService';
import { getWorkerProfile, setWorkerOnlineStatus } from '@/services/workerService';
import { getAvailableJobsForWorker, getWorkerAcceptedJobs } from '@/services/workerJobService';
import type { CleaningJobTypeSlug, JobStatus } from '@/types/jobs';
import type { WorkerProfile } from '@/types/profiles';
import type { AcceptedWorkerJob, AvailableWorkerJob } from '@/types/worker-jobs';

const JOB_TYPE_LABELS: Record<CleaningJobTypeSlug, string> = {
  str_turnover: 'STR Turnover Cleaning',
  home_cleaning: 'Home Cleaning',
};

/** Assigned jobs the worker is actively responsible for. */
const ACTIVE_STATUSES: JobStatus[] = [
  'accepted',
  'en_route',
  'checked_in',
  'in_progress',
  'awaiting_approval',
];

const ACTIVE_STATUS_INFO: Partial<
  Record<JobStatus, { label: string; nextAction: string }>
> = {
  accepted: { label: 'Accepted', nextAction: 'Next: Mark En Route' },
  en_route: { label: 'En Route', nextAction: 'Next: Check In' },
  checked_in: { label: 'Checked In', nextAction: 'Next: Start Work' },
  in_progress: { label: 'In Progress', nextAction: 'Next: Checklist & proof' },
  awaiting_approval: { label: 'Awaiting Approval', nextAction: 'Waiting on requester' },
};

export default function WorkerDashboard() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [worker, setWorker] = useState<WorkerProfile | null>(null);
  const [availableJobs, setAvailableJobs] = useState<AvailableWorkerJob[] | null>(null);
  const [acceptedJobs, setAcceptedJobs] = useState<AcceptedWorkerJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [profile, workerProfile, accepted] = await Promise.all([
        getUserProfile(user.id),
        getWorkerProfile(user.id),
        getWorkerAcceptedJobs(user.id),
      ]);
      setDisplayName(profile?.display_name ?? null);
      setWorker(workerProfile);
      setAcceptedJobs(accepted.filter((j) => ACTIVE_STATUSES.includes(j.status)));

      if (workerProfile?.is_online) {
        setAvailableJobs(await getAvailableJobsForWorker());
      } else {
        setAvailableJobs(null);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your dashboard.');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleToggleOnline() {
    if (!worker || toggling) return;
    setToggling(true);
    setError(null);
    try {
      const nowOnline = await setWorkerOnlineStatus(!worker.is_online);
      setWorker({ ...worker, is_online: nowOnline });
      if (nowOnline) {
        setAvailableJobs(await getAvailableJobsForWorker());
      } else {
        setAvailableJobs(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your availability.');
    } finally {
      setToggling(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      Alert.alert('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSigningOut(false);
    }
  }

  const isOnline = worker?.is_online ?? false;
  const isVerified = worker?.verification_status === 'verified';

  return (
    <ScreenContainer>
      <View style={styles.topBar}>
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>
            {displayName ? `Hi, ${displayName}` : 'Welcome back'}
          </Text>
          <Text style={styles.role}>Worker Dashboard</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={handleSignOut}
          disabled={signingOut}
          hitSlop={8}
        >
          <Text style={styles.signOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={() => void load()} hitSlop={8}>
            <Text style={styles.retry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* The core worker mechanic: availability. Online ≠ GPS tracking. */}
      <View style={styles.onlineCard}>
        <View style={styles.onlineStatusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isOnline ? colors.worker : colors.textMuted },
            ]}
          />
          <Text style={styles.onlineStatusText}>
            {isOnline ? 'You’re online' : 'You’re offline'}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: toggling || !worker, busy: toggling }}
          disabled={toggling || !worker}
          onPress={handleToggleOnline}
          style={[
            styles.goOnlineButton,
            { backgroundColor: isOnline ? colors.worker : colors.surfaceAlt },
          ]}
        >
          {toggling ? (
            <ActivityIndicator color={isOnline ? colors.textInverse : colors.worker} />
          ) : (
            <Text
              style={[
                styles.goOnlineLabel,
                { color: isOnline ? colors.textInverse : colors.text },
              ]}
            >
              {isOnline ? 'Go Offline' : 'Go Online'}
            </Text>
          )}
        </Pressable>

        <View style={styles.badgeRow}>
          <StatusBadge
            label={isVerified ? 'Verified' : 'Verification Pending'}
            tone={isVerified ? 'success' : 'warning'}
          />
          <StatusBadge label={`Worker Tier ${worker?.worker_tier ?? 'L1'}`} tone="neutral" />
        </View>
        {!isVerified ? (
          <Text style={styles.onlineHint}>Accepting jobs unlocks after verification.</Text>
        ) : null}
      </View>

      {acceptedJobs.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Job{acceptedJobs.length > 1 ? 's' : ''}</Text>
          {acceptedJobs.map((job) => {
            const info = ACTIVE_STATUS_INFO[job.status] ?? {
              label: job.status.replaceAll('_', ' '),
              nextAction: 'Open the job workspace',
            };
            return (
              <Pressable
                key={job.id}
                accessibilityRole="button"
                style={[styles.jobCard, styles.acceptedCard]}
                onPress={() =>
                  router.push({ pathname: '/(worker)/jobs/[id]/work', params: { id: job.id } })
                }
              >
                <View style={styles.jobCardHeader}>
                  <Text style={styles.jobTitle}>{job.title}</Text>
                  <StatusBadge
                    label={info.label}
                    tone={job.status === 'awaiting_approval' ? 'warning' : 'success'}
                  />
                </View>
                <Text style={styles.jobMeta}>
                  {JOB_TYPE_LABELS[job.job_type_slug]} ·{' '}
                  {job.job_type_slug === 'home_cleaning' ? 'Needed by' : 'Guest-ready by'}{' '}
                  {formatLocalDateTime(job.deadline_at)}
                </Text>
                <View style={styles.jobCardFooter}>
                  <Text style={styles.jobPayout}>{formatCents(job.payout_cents)}</Text>
                  <Text style={styles.nextAction}>{info.nextAction} ›</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Available Jobs</Text>

        {!isOnline ? (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderText}>
              Go online to see available cleaning jobs.
            </Text>
          </View>
        ) : availableJobs === null ? (
          <View style={styles.placeholderCard}>
            <ActivityIndicator color={colors.worker} />
          </View>
        ) : availableJobs.length === 0 ? (
          <View style={styles.placeholderCard}>
            <Text style={styles.placeholderText}>
              No matching cleaning jobs available right now.
            </Text>
          </View>
        ) : (
          availableJobs.map((job) => (
            <Pressable
              key={job.id}
              accessibilityRole="button"
              style={styles.jobCard}
              onPress={() =>
                router.push({ pathname: '/(worker)/jobs/[id]', params: { id: job.id } })
              }
            >
              <View style={styles.jobCardHeader}>
                <Text style={styles.jobTitle}>{job.title}</Text>
                {!job.is_eligible ? (
                  <StatusBadge label={`Requires ${job.required_worker_tier}`} tone="warning" />
                ) : null}
              </View>
              <Text style={styles.jobMeta}>
                {JOB_TYPE_LABELS[job.job_type_slug]} · {job.city}, {job.state} {job.zip_code}
              </Text>
              <Text style={styles.jobMeta}>
                {job.job_type_slug === 'home_cleaning' ? 'Needed by' : 'Guest-ready by'}{' '}
                {formatLocalDateTime(job.deadline_at)}
                {job.estimated_hours != null ? ` · ~${job.estimated_hours} h` : ''}
              </Text>
              <Text style={styles.jobPayout}>{formatCents(job.payout_cents)}</Text>
            </Pressable>
          ))
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  greetingBlock: { gap: spacing.xs },
  greeting: { ...typography.title, color: colors.text },
  role: { ...typography.caption, color: colors.textSecondary },
  signOut: { ...typography.label, color: colors.worker },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  errorText: { ...typography.caption, color: colors.danger, flex: 1 },
  retry: { ...typography.label, color: colors.danger },
  onlineCard: {
    backgroundColor: colors.text,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  onlineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  onlineStatusText: { ...typography.label, color: colors.textInverse },
  goOnlineButton: {
    width: 168,
    height: 168,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goOnlineLabel: { ...typography.heading },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  onlineHint: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  section: { gap: spacing.md, marginBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  placeholderCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  placeholderText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  jobCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  acceptedCard: {
    borderColor: colors.worker,
    backgroundColor: colors.workerMuted,
  },
  jobCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  jobTitle: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  jobMeta: { ...typography.caption, color: colors.textSecondary },
  jobPayout: { ...typography.heading, color: colors.text },
  jobCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  nextAction: { ...typography.label, color: colors.worker },
});
