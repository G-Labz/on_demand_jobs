import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { formatCents, formatLocalDateTime } from '@/lib/format';
import { getCleaningChecklistTemplate, getJobById, postCleaningJob } from '@/services/jobService';
import type { CleaningChecklistTemplate, CleaningJobTypeSlug, Job } from '@/types/jobs';

const JOB_TYPE_LABELS: Record<CleaningJobTypeSlug, string> = {
  str_turnover: 'STR Turnover Cleaning',
  home_cleaning: 'Home Cleaning',
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function groupByRoom(rows: CleaningChecklistTemplate[]): { room: string; tasks: CleaningChecklistTemplate[] }[] {
  const groups: { room: string; tasks: CleaningChecklistTemplate[] }[] = [];
  for (const row of rows) {
    let group = groups.find((g) => g.room === row.room_name);
    if (!group) {
      group = { room: row.room_name, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(row);
  }
  return groups;
}

export default function ReviewJob() {
  const router = useRouter();
  const { user } = useAuth();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();

  const [job, setJob] = useState<Job | null>(null);
  const [checklist, setChecklist] = useState<CleaningChecklistTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!user || !jobId) return;
    try {
      const row = await getJobById(jobId, user.id);
      setJob(row);
      if (row) {
        setChecklist(await getCleaningChecklistTemplate(row.job_type_slug));
        setError(null);
      } else {
        setError('This job was not found.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this job.');
    } finally {
      setLoaded(true);
    }
  }, [user, jobId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handlePost() {
    if (!user || !job) return;
    setPosting(true);
    setError(null);
    try {
      await postCleaningJob(job.id, user.id);
      router.replace('/(requester)/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post this job.');
    } finally {
      setPosting(false);
    }
  }

  function handleSaveDraft() {
    // The job already exists as a draft; just return to the dashboard.
    Alert.alert('Draft saved', 'This job is saved as a draft.', [
      { text: 'OK', onPress: () => router.replace('/(requester)/dashboard') },
    ]);
  }

  if (!loaded) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.requester} />
        </View>
      </ScreenContainer>
    );
  }

  if (!job) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Review job</Text>
        <Text style={styles.error}>{error ?? 'This job was not found.'}</Text>
        <View style={styles.actions}>
          <AppButton
            label="Back to Dashboard"
            variant="secondary"
            accentColor={colors.requester}
            onPress={() => router.replace('/(requester)/dashboard')}
          />
        </View>
      </ScreenContainer>
    );
  }

  const isHome = job.job_type_slug === 'home_cleaning';
  const deadlineLabel = isHome ? 'Needed by' : 'Guest-ready by';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{job.title}</Text>
        <StatusBadge
          label={JOB_TYPE_LABELS[job.job_type_slug]}
          tone={isHome ? 'success' : 'info'}
        />
      </View>

      <View style={styles.card}>
        <SummaryRow label={deadlineLabel} value={formatLocalDateTime(job.deadline_at)} />
        {job.requested_start_at ? (
          <SummaryRow label="Requested start" value={formatLocalDateTime(job.requested_start_at)} />
        ) : null}
        <SummaryRow label="Payout" value={formatCents(job.payout_cents)} />
        {job.estimated_hours != null ? (
          <SummaryRow label="Estimated hours" value={`${job.estimated_hours} h`} />
        ) : null}
        <SummaryRow
          label="Bedrooms / Bathrooms"
          value={`${job.bedrooms ?? '—'} bd · ${job.bathrooms ?? '—'} ba`}
        />
        {isHome && job.cleaning_scope ? (
          <SummaryRow label="Cleaning scope" value={job.cleaning_scope} />
        ) : null}
        <SummaryRow label="Laundry" value={job.laundry_required ? 'Required' : 'Not required'} />
        {!isHome ? (
          <SummaryRow
            label="Restocking"
            value={job.restocking_required ? 'Required' : 'Not required'}
          />
        ) : null}
        <SummaryRow
          label="Trash removal"
          value={job.trash_removal_required ? 'Required' : 'Not required'}
        />
        {job.special_instructions ? (
          <SummaryRow label="Instructions" value={job.special_instructions} />
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Checklist preview</Text>
        <Text style={styles.sectionSubtitle}>
          The proof checklist the worker will complete. Photo capture unlocks in a later sprint.
        </Text>
        {groupByRoom(checklist).map((group) => (
          <View key={group.room} style={styles.checklistGroup}>
            <Text style={styles.checklistRoom}>{group.room}</Text>
            {group.tasks.map((task) => (
              <View key={task.id} style={styles.checklistItem}>
                <Text style={styles.checklistTask}>• {task.task_label}</Text>
                {task.requires_photo ? <StatusBadge label="Photo" tone="neutral" /> : null}
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.paymentNote}>
        <Text style={styles.paymentNoteText}>
          Payments unlock in a later sprint. This job will be posted for Sprint 3 worker feed
          testing.
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <AppButton
          label="Post Job"
          loading={posting}
          onPress={handlePost}
          accentColor={colors.requester}
        />
        <AppButton label="Save Draft" variant="secondary" onPress={handleSaveDraft} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  summaryLabel: { ...typography.caption, color: colors.textSecondary, flexShrink: 0 },
  summaryValue: { ...typography.body, color: colors.text, flex: 1, textAlign: 'right' },
  section: { gap: spacing.sm, marginBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  sectionSubtitle: { ...typography.caption, color: colors.textSecondary },
  checklistGroup: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  checklistRoom: { ...typography.label, color: colors.text },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  checklistTask: { ...typography.body, color: colors.textSecondary, flex: 1 },
  paymentNote: {
    backgroundColor: colors.warningMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  paymentNoteText: { ...typography.caption, color: colors.warning },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.md },
  actions: { gap: spacing.md },
});
