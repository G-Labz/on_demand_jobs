import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost';

export interface AppButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  /** Override the fill/text accent (used for Requester vs Worker role colors). */
  accentColor?: string;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accentColor,
  fullWidth = true,
  style,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const accent = accentColor ?? colors.primary;

  const isPrimary = variant === 'primary';
  const fillColor = isPrimary ? (isDisabled ? colors.disabled : accent) : 'transparent';
  const textColor = isPrimary
    ? isDisabled
      ? colors.disabledText
      : colors.textInverse
    : isDisabled
      ? colors.disabledText
      : accent;
  const borderColor =
    variant === 'secondary' ? (isDisabled ? colors.border : accent) : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        {
          backgroundColor: fillColor,
          borderColor,
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          opacity: pressed && !isDisabled ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  label: {
    ...typography.bodyStrong,
  },
});
