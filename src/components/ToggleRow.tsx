import { StyleSheet, Switch, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';

export interface ToggleRowProps {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  helper?: string;
  accentColor?: string;
}

/** Labeled boolean switch row (laundry/supplies/restock/trash flags). */
export function ToggleRow({
  label,
  value,
  onValueChange,
  helper,
  accentColor = colors.primary,
}: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        {helper ? <Text style={styles.helper}>{helper}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: accentColor, false: colors.border }}
        thumbColor={colors.background}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 56,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  helper: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
