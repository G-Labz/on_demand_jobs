import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/constants/theme';

export interface RoleCardProps {
  /** Short glyph/emoji shown in the badge (e.g. "🏠", "🧹"). */
  icon: string;
  title: string;
  description: string;
  selected?: boolean;
  onPress?: () => void;
  /** Accent color for the selected/active state. */
  accentColor?: string;
}

export function RoleCard({
  icon,
  title,
  description,
  selected = false,
  onPress,
  accentColor = colors.primary,
}: RoleCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && { borderColor: accentColor, backgroundColor: colors.surface },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconBadge, { backgroundColor: accentColor + '1A' }]}>
        <Text style={styles.icon}>{icon}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View
        style={[
          styles.radio,
          { borderColor: selected ? accentColor : colors.border },
        ]}
      >
        {selected ? <View style={[styles.radioDot, { backgroundColor: accentColor }]} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  pressed: {
    opacity: 0.9,
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 26,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    ...typography.heading,
    color: colors.text,
  },
  description: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
  },
});
