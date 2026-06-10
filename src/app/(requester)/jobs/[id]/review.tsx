import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { formatCents, formatLocalDateTime } from '@/lib/format';
import {
  approveJobCompletion,
  getRequesterJobReview,
} from '@/services/requesterReviewService';
import type { JobChecklistItem, RequesterJobReview } from '@/types/job-execution';
import type { CleaningJobTypeSlug } from '@/types/jobs';

const JOB_TYPE_LABELS: Record<CleaningJobTypeSlug, string> = {
  str_turnover: 'STR Turnover Cleaning',
  home_cleaning: 'Home Cleaning',
};

function groupChecklist(
  items: JobChecklistItem[],
): { room: string; tasks: JobChecklistItem[] }[] {
  const groups: { room: string; tasks: JobChecklistItem[] }[] = [];
  for (const item of items) {
    let group = groups.find((g) => g.room === item.room_name);
    if (!group) {
      group = { room: item.room_name, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(item);
  }
  return groups;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function RequesterJobReviewScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [review, setReview] = useState<RequesterJobReview | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !id) return;
    try {
      setReview(await getRequesterJobReview(id, user.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this job.');
    } finally {
      setLoaded(true);
    }
  }, [user, id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleApprove() {
    if (!review || approving) return;
    setApproving(true);
    setError(null);
    try {
      await approveJobCompletion(review.job.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve completion.');
      await load();
    } finally {
      setApproving(false);
    }
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

  if (!review) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Review Proof</Text>
        <Text style={styles.bodyText}>{error ?? 'This job was not found.'}</Text>
        <View style={styles.section}>
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

  const { job, checklist, photos } = review;
  const isHome = job.job_type_slug === 'home_cleaning';
  const awaiting = job.status === 'awaiting_approval';
  const completed = job.status === 'completed';
  const completedCount = checklist.filter((i) => i.completed_at !== null).length;

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{job.title}</Text>
        <View style={styles.badgeRow}>
          <StatusBadge label={JOB_TYPE_LABELS[job.job_type_slug]} tone="neutral" />
          {completed ? (
            <StatusBadge label="Completed" tone="success" />
          ) : awaiting ? (
            <StatusBadge label="Awaiting Approval" tone="warning" />
          ) : (
            <StatusBadge label={job.status.replaceAll('_', ' ')} tone="info" />
          )}
        </View>
      </View>

      <View style={styles.card}>
        <SummaryRow
          label={isHome ? 'Needed by' : 'Guest-ready by'}
          value={formatLocalDateTime(job.deadline_at)}
        />
        <SummaryRow label="Payout" value={formatCents(job.payout_cents)} />
        {job.proof_submitted_at ? (
          <SummaryRow label="Proof submitted" value={formatLocalDateTime(job.proof_submitted_at)} />
        ) : null}
        {job.approved_at ? (
          <SummaryRow label="Approved" value={formatLocalDateTime(job.approved_at)} />
        ) : null}
      </View>

      {!awaiting && !completed ? (
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>
            Proof hasn’t been submitted yet. You can review and approve once the worker
            submits proof.
          </Text>
        </View>
      ) : null}

      {checklist.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Checklist · {completedCount}/{checklist.length} completed
          </Text>
          {groupChecklist(checklist).map((group) => (
            <View key={group.room} style={styles.checklistGroup}>
              <Text style={styles.checklistRoom}>{group.room}</Text>
              {group.tasks.map((item) => (
                <View key={item.id} style={styles.checklistItem}>
                  <Text
                    style={[
                      styles.taskMark,
                      { color: item.completed_at ? colors.success : colors.textMuted },
                    ]}
                  >
                    {item.completed_at ? '✓' : '○'}
                  </Text>
                  <Text style={styles.taskLabel}>{item.task_label}</Text>
                  {item.requires_photo ? <StatusBadge label="Photo" tone="neutral" /> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {photos.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Proof Photos · {photos.length}</Text>
          <View style={styles.thumbRow}>
            {photos.map((photo) =>
              photo.signed_url ? (
                <Image
                  key={photo.id}
                  source={{ uri: photo.signed_url }}
                  style={styles.thumb}
                  contentFit="cover"
                />
              ) : null,
            )}
          </View>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {awaiting ? (
        <View style={styles.section}>
          <AppButton
            label="Approve Completion"
            loading={approving}
            accentColor={colors.requester}
            onPress={handleApprove}
          />
          <Text style={styles.approveHint}>
            Approving marks this job Completed. Payment release arrives in a later sprint.
          </Text>
        </View>
      ) : null}

      {completed ? (
        <View style={styles.completedBanner}>
          <Text style={styles.completedText}>Job completed.</Text>
        </View>
      ) : null}

      <AppButton
        label="Back to Dashboard"
        variant="secondary"
        onPress={() => router.replace('/(requester)/dashboard')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.text },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  summaryLabel: { ...typography.caption, color: colors.textSecondary, flexShrink: 0 },
  summaryValue: { ...typography.body, color: colors.text, flex: 1, textAlign: 'right' },
  section: { gap: spacing.sm, marginBottom: spacing.xl },
  sectionTitle: { ...typography.heading, color: colors.text },
  bodyText: { ...typography.body, color: colors.textSecondary },
  infoBanner: {
    backgroundColor: colors.infoMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  infoText: { ...typography.caption, color: colors.primaryDark },
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
    gap: spacing.md,
  },
  taskMark: { ...typography.bodyStrong, width: 20, textAlign: 'center' },
  taskLabel: { ...typography.body, color: colors.textSecondary, flex: 1 },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  approveHint: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  completedBanner: {
    backgroundColor: colors.successMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  completedText: { ...typography.bodyStrong, color: colors.success, textAlign: 'center' },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.md },
});
