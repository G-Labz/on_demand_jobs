import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { formatCents, formatLocalDateTime } from '@/lib/format';
import {
  checkInJob,
  completeChecklistItem,
  getWorkerJobWorkspace,
  setJobEnRoute,
  startJobWork,
  submitJobProof,
  uploadProofPhoto,
} from '@/services/workerJobService';
import type { JobChecklistItem, WorkerJobWorkspace } from '@/types/job-execution';
import type { CleaningJobTypeSlug, JobStatus } from '@/types/jobs';

const JOB_TYPE_LABELS: Record<CleaningJobTypeSlug, string> = {
  str_turnover: 'STR Turnover Cleaning',
  home_cleaning: 'Home Cleaning',
};

/** Ordered execution steps shown in the progress strip. */
const STEPS: { status: JobStatus; label: string }[] = [
  { status: 'accepted', label: 'Accepted' },
  { status: 'en_route', label: 'En Route' },
  { status: 'checked_in', label: 'Checked In' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'awaiting_approval', label: 'Submitted' },
  { status: 'completed', label: 'Completed' },
];

const STATE_MESSAGES: Partial<Record<JobStatus, string>> = {
  accepted: 'You accepted this job.',
  en_route: 'You’re on the way.',
  checked_in: 'You’re checked in.',
  in_progress: 'Complete the checklist and upload proof.',
  awaiting_approval: 'Proof submitted. Waiting for requester approval.',
  completed: 'Job completed.',
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

export default function WorkerJobWorkspaceScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [workspace, setWorkspace] = useState<WorkerJobWorkspace | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [completingItemId, setCompletingItemId] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !id) return;
    try {
      setWorkspace(await getWorkerJobWorkspace(id, user.id));
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

  async function runTransition(action: (jobId: string) => Promise<string>) {
    if (!workspace || acting) return;
    setActing(true);
    setError(null);
    try {
      await action(workspace.job.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That action failed. Try again.');
      await load();
    } finally {
      setActing(false);
    }
  }

  async function handleCompleteItem(item: JobChecklistItem) {
    if (!workspace || completingItemId) return;
    setCompletingItemId(item.id);
    setError(null);
    try {
      await completeChecklistItem(item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete this task.');
    } finally {
      setCompletingItemId(null);
    }
  }

  async function handleAddPhoto(item: JobChecklistItem) {
    if (!workspace || !user || uploadingItemId) return;
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploadingItemId(item.id);
    try {
      await uploadProofPhoto(workspace.job.id, item.id, user.id, {
        uri: result.assets[0].uri,
        mimeType: result.assets[0].mimeType,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the photo.');
    } finally {
      setUploadingItemId(null);
    }
  }

  if (!loaded) {
    return (
      <ScreenContainer scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.worker} />
        </View>
      </ScreenContainer>
    );
  }

  if (!workspace) {
    return (
      <ScreenContainer>
        <Text style={styles.title}>Job workspace</Text>
        <Text style={styles.bodyText}>
          {error ?? 'This job is not assigned to you or no longer exists.'}
        </Text>
        <View style={styles.section}>
          <AppButton
            label="Back to Dashboard"
            variant="secondary"
            accentColor={colors.worker}
            onPress={() => router.replace('/(worker)/dashboard')}
          />
        </View>
      </ScreenContainer>
    );
  }

  const { job, checklist, photos } = workspace;
  const loc = job.service_locations;
  const isHome = job.job_type_slug === 'home_cleaning';
  const status = job.status;
  const stepIndex = STEPS.findIndex((s) => s.status === status);
  const isWorking = status === 'in_progress';

  const allComplete = checklist.length > 0 && checklist.every((i) => i.completed_at !== null);
  const photoItemsMissing = checklist.filter(
    (i) => i.requires_photo && !photos.some((p) => p.checklist_item_id === i.id),
  );
  const canSubmit = isWorking && allComplete && photoItemsMissing.length === 0;

  const submitHint = !isWorking
    ? null
    : !allComplete
      ? 'Complete every checklist task to submit proof.'
      : photoItemsMissing.length > 0
        ? `Add a proof photo to ${photoItemsMissing.length} task${photoItemsMissing.length > 1 ? 's' : ''} marked “Photo”.`
        : 'Everything is ready — submit your proof.';

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>{job.title}</Text>
        <View style={styles.badgeRow}>
          <StatusBadge label={JOB_TYPE_LABELS[job.job_type_slug]} tone="neutral" />
          <StatusBadge
            label={STEPS[stepIndex]?.label ?? status}
            tone={status === 'completed' ? 'success' : status === 'awaiting_approval' ? 'warning' : 'info'}
          />
        </View>
      </View>

      {/* Status progress strip */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stepsScroll}>
        <View style={styles.steps}>
          {STEPS.map((step, i) => {
            const reached = stepIndex >= 0 && i <= stepIndex;
            return (
              <View key={step.status} style={styles.step}>
                <View
                  style={[
                    styles.stepDot,
                    { backgroundColor: reached ? colors.worker : colors.border },
                  ]}
                />
                <Text style={[styles.stepLabel, reached && styles.stepLabelActive]}>
                  {step.label}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.stateCard}>
        <Text style={styles.stateMessage}>{STATE_MESSAGES[status] ?? status}</Text>

        {status === 'accepted' ? (
          <AppButton
            label="Mark En Route"
            loading={acting}
            accentColor={colors.worker}
            onPress={() => void runTransition(setJobEnRoute)}
          />
        ) : null}
        {status === 'en_route' ? (
          <>
            <AppButton
              label="Check In"
              loading={acting}
              accentColor={colors.worker}
              onPress={() => void runTransition(checkInJob)}
            />
            <Text style={styles.honestyNote}>
              Check In confirms you’ve arrived — it does not track your location.
            </Text>
          </>
        ) : null}
        {status === 'checked_in' ? (
          <AppButton
            label="Start Work"
            loading={acting}
            accentColor={colors.worker}
            onPress={() => void runTransition(startJobWork)}
          />
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {/* Job summary */}
      <View style={styles.card}>
        <SummaryRow
          label={isHome ? 'Needed by' : 'Guest-ready by'}
          value={formatLocalDateTime(job.deadline_at)}
        />
        <SummaryRow label="Payout" value={formatCents(job.payout_cents)} />
        {job.estimated_hours != null ? (
          <SummaryRow label="Estimated hours" value={`${job.estimated_hours} h`} />
        ) : null}
        {isHome && job.cleaning_scope ? (
          <SummaryRow label="Cleaning scope" value={job.cleaning_scope} />
        ) : null}
      </View>

      {/* Assignment details (assigned worker only — revealed post-acceptance) */}
      {loc ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Assignment details</Text>
          <View style={styles.card}>
            <SummaryRow
              label="Address"
              value={[loc.address_line1, loc.address_line2].filter(Boolean).join(', ')}
            />
            <SummaryRow label="City / ZIP" value={`${loc.city}, ${loc.state} ${loc.zip_code}`} />
            {loc.access_notes ? <SummaryRow label="Access" value={loc.access_notes} /> : null}
            {loc.parking_notes ? <SummaryRow label="Parking" value={loc.parking_notes} /> : null}
            {loc.restock_notes ? <SummaryRow label="Restock" value={loc.restock_notes} /> : null}
            <SummaryRow
              label="Supplies provided"
              value={loc.supplies_provided ? 'Yes' : 'No — bring supplies'}
            />
          </View>
        </View>
      ) : null}

      {job.special_instructions ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Special Instructions</Text>
          <View style={styles.card}>
            <Text style={styles.bodyText}>{job.special_instructions}</Text>
          </View>
        </View>
      ) : null}

      {/* Checklist */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Checklist</Text>
        {checklist.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.bodyText}>
              The checklist becomes available once you start work.
            </Text>
          </View>
        ) : (
          groupChecklist(checklist).map((group) => (
            <View key={group.room} style={styles.checklistGroup}>
              <Text style={styles.checklistRoom}>{group.room}</Text>
              {group.tasks.map((item) => {
                const done = item.completed_at !== null;
                const itemPhotos = photos.filter((p) => p.checklist_item_id === item.id);
                return (
                  <View key={item.id} style={styles.checklistItemBlock}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: done, disabled: !isWorking || done }}
                      disabled={!isWorking || done || completingItemId !== null}
                      onPress={() => void handleCompleteItem(item)}
                      style={styles.checklistItemRow}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          done && { backgroundColor: colors.worker, borderColor: colors.worker },
                        ]}
                      >
                        {completingItemId === item.id ? (
                          <ActivityIndicator size="small" color={colors.worker} />
                        ) : done ? (
                          <Text style={styles.checkmark}>✓</Text>
                        ) : null}
                      </View>
                      <Text style={[styles.taskLabel, done && styles.taskLabelDone]}>
                        {item.task_label}
                      </Text>
                      {item.requires_photo ? (
                        <StatusBadge
                          label={itemPhotos.length > 0 ? `Photo ✓` : 'Photo'}
                          tone={itemPhotos.length > 0 ? 'success' : 'warning'}
                        />
                      ) : null}
                    </Pressable>

                    {item.requires_photo ? (
                      <View style={styles.photoBlock}>
                        {itemPhotos.length > 0 ? (
                          <View style={styles.thumbRow}>
                            {itemPhotos.map((photo) =>
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
                        ) : null}
                        {isWorking ? (
                          <AppButton
                            label={
                              uploadingItemId === item.id ? 'Uploading…' : 'Add Proof Photo'
                            }
                            variant="secondary"
                            fullWidth={false}
                            loading={uploadingItemId === item.id}
                            disabled={uploadingItemId !== null}
                            accentColor={colors.worker}
                            onPress={() => void handleAddPhoto(item)}
                          />
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))
        )}
      </View>

      {/* Submit proof */}
      {isWorking ? (
        <View style={styles.section}>
          {submitHint ? <Text style={styles.submitHint}>{submitHint}</Text> : null}
          <AppButton
            label="Submit Proof"
            loading={acting}
            disabled={!canSubmit}
            accentColor={colors.worker}
            onPress={() => void runTransition(submitJobProof)}
          />
        </View>
      ) : null}

      <AppButton
        label="Back to Dashboard"
        variant="secondary"
        onPress={() => router.replace('/(worker)/dashboard')}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.text },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepsScroll: { marginBottom: spacing.lg, flexGrow: 0 },
  steps: { flexDirection: 'row', gap: spacing.lg },
  step: { alignItems: 'center', gap: spacing.xs },
  stepDot: { width: 12, height: 12, borderRadius: radius.pill },
  stepLabel: { ...typography.caption, color: colors.textMuted },
  stepLabelActive: { color: colors.text },
  stateCard: {
    backgroundColor: colors.workerMuted,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  stateMessage: { ...typography.bodyStrong, color: colors.text, textAlign: 'center' },
  honestyNote: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
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
  checklistGroup: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  checklistRoom: { ...typography.label, color: colors.text },
  checklistItemBlock: { gap: spacing.sm },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: colors.textInverse, fontWeight: '700' },
  taskLabel: { ...typography.body, color: colors.text, flex: 1 },
  taskLabelDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
  photoBlock: { gap: spacing.sm, paddingLeft: 38 },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
  },
  submitHint: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  error: { ...typography.caption, color: colors.danger, marginBottom: spacing.md },
});
