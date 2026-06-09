import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, radius, spacing, typography } from '@/constants/theme';

export default function Welcome() {
  const router = useRouter();

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View style={styles.pulse}>
            <View style={styles.pulseDot} />
            <Text style={styles.kicker}>LIVE TURNOVER DISPATCH · NE OHIO</Text>
          </View>

          <Text style={styles.headline}>Turnovers handled in real time.</Text>

          <Text style={styles.subtext}>
            Hosts post STR turnover gigs. Cleaners go online, accept nearby jobs, complete
            proof-based checklists, and get paid.
          </Text>
        </View>

        <View style={styles.actions}>
          <AppButton label="Sign Up" onPress={() => router.push('/signup')} />
          <AppButton
            label="Log In"
            variant="secondary"
            onPress={() => router.push('/login')}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: spacing.xl,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  pulse: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  kicker: {
    ...typography.caption,
    color: colors.primaryDark,
    letterSpacing: 0.5,
  },
  headline: {
    ...typography.display,
    color: colors.text,
  },
  subtext: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.md,
  },
});
