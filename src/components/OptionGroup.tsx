import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';

export interface OptionItem<T extends string> {
  value: T;
  label: string;
}

export interface OptionGroupProps<T extends string> {
  label?: string;
  options: readonly OptionItem<T>[];
  value: T | null;
  onChange: (value: T) => void;
  accentColor?: string;
  style?: StyleProp<ViewStyle>;
}

/** Single-select chip group used for role/location/job-type pickers. */
export function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  accentColor = colors.primary,
  style,
}: OptionGroupProps<T>) {
  return (
    <View style={[styles.container, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.options}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <Pressable
              key={opt.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(opt.value)}
              style={[
                styles.option,
                active && { borderColor: accentColor, backgroundColor: `${accentColor}1A` },
              ]}
            >
              <Text style={[styles.optionText, active && { color: accentColor }]}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  option: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  optionText: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
