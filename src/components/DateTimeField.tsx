import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppInput } from '@/components/AppInput';
import { colors, radius, spacing, typography } from '@/constants/theme';

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Local date (YYYY-MM-DD) + time (HH:MM) parts for a Date, in device-local time. */
function partsFromDate(d: Date): { date: string; time: string } {
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Parse a local date + time into a stored ISO string. Returns null if either
 * field is empty/invalid. Input is treated as device-local time; the returned
 * ISO is the corresponding instant (so display re-derives the same local time).
 */
export function parseLocalDateTime(dateStr: string, timeStr: string): string | null {
  const dateMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateStr.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!dateMatch || !timeMatch) return null;

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  // Reject rolled-over / out-of-range values (e.g. Feb 31, 25:00).
  const valid =
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day &&
    dt.getHours() === hour &&
    dt.getMinutes() === minute;
  return valid ? dt.toISOString() : null;
}

interface Preset {
  label: string;
  build: () => Date;
}

const PRESETS: Preset[] = [
  {
    label: 'Tonight',
    build: () => {
      const d = new Date();
      d.setHours(20, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'Tomorrow AM',
    build: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  { label: '+24h', build: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  { label: '+48h', build: () => new Date(Date.now() + 48 * 60 * 60 * 1000) },
];

export interface DateTimeFieldProps {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  helper?: string;
  /** Higher-level validation error from the parent (required/past/order). */
  error?: string | null;
  showPresets?: boolean;
  accentColor?: string;
}

/**
 * Quick presets + manual date/time entry. Works on web, iOS, and Android with
 * no extra dependency. Emits an ISO string (or null) and shows the value back in
 * local time — no silent timezone shifting.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  helper,
  error,
  showPresets = false,
  accentColor = colors.primary,
}: DateTimeFieldProps) {
  const initial = value ? partsFromDate(new Date(value)) : { date: '', time: '' };
  const [dateStr, setDateStr] = useState(initial.date);
  const [timeStr, setTimeStr] = useState(initial.time);
  const [malformed, setMalformed] = useState(false);

  function commit(nextDate: string, nextTime: string) {
    if (!nextDate.trim() && !nextTime.trim()) {
      setMalformed(false);
      onChange(null);
      return;
    }
    const iso = parseLocalDateTime(nextDate, nextTime);
    setMalformed(iso === null);
    onChange(iso);
  }

  function applyPreset(preset: Preset) {
    const parts = partsFromDate(preset.build());
    setDateStr(parts.date);
    setTimeStr(parts.time);
    commit(parts.date, parts.time);
  }

  const formatError = malformed
    ? 'Enter date as YYYY-MM-DD and time as HH:MM (24-hour).'
    : null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}

      {showPresets ? (
        <View style={styles.presets}>
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.label}
              accessibilityRole="button"
              onPress={() => applyPreset(preset)}
              style={[styles.preset, { borderColor: accentColor }]}
            >
              <Text style={[styles.presetText, { color: accentColor }]}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        <AppInput
          label="Date"
          value={dateStr}
          onChangeText={(text) => {
            setDateStr(text);
            commit(text, timeStr);
          }}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          containerStyle={styles.rowItem}
        />
        <AppInput
          label="Time"
          value={timeStr}
          onChangeText={(text) => {
            setTimeStr(text);
            commit(dateStr, text);
          }}
          placeholder="HH:MM"
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          containerStyle={styles.rowItem}
        />
      </View>

      {error || formatError ? (
        <Text style={styles.error}>{error ?? formatError}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  label: {
    ...typography.label,
    color: colors.text,
  },
  helper: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  presets: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  preset: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
  },
  presetText: {
    ...typography.caption,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowItem: {
    flex: 1,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
