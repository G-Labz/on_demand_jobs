import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, radius, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { isUniqueViolation } from '@/services/errors';
import { createWorkerProfile, updateUserProfile } from '@/services/profileService';

export default function WorkerProfileSetup() {
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [homeBaseZip, setHomeBaseZip] = useState('');
  const [serviceRadius, setServiceRadius] = useState('10');
  const [experienceYears, setExperienceYears] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);

    const name = displayName.trim();
    const phone = phoneNumber.trim();
    const zip = homeBaseZip.trim();
    const radiusMiles = Number.parseInt(serviceRadius, 10);
    const years = Number.parseInt(experienceYears, 10);

    if (!name || !phone || !zip) {
      setError('Please fill in every field.');
      return;
    }
    if (Number.isNaN(radiusMiles) || radiusMiles <= 0) {
      setError('Enter a service radius of at least 1 mile.');
      return;
    }
    if (Number.isNaN(years) || years < 0) {
      setError('Years of experience must be 0 or more.');
      return;
    }
    if (!user) {
      setError('Your session expired. Please log in again.');
      return;
    }

    setLoading(true);
    try {
      try {
        await createWorkerProfile(user.id, {
          display_name: name,
          phone_number: phone,
          home_base_zip: zip,
          service_radius_miles: radiusMiles,
          experience_years: years,
        });
      } catch (err) {
        // Already created on a previous attempt — continue to finalize.
        if (!isUniqueViolation(err)) throw err;
      }

      await updateUserProfile(user.id, {
        display_name: name,
        phone_number: phone,
        profile_completed: true,
      });

      await refresh();
      router.replace('/(worker)/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your worker profile.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Set up your worker profile</Text>
        <Text style={styles.subtitle}>
          Tell us where you work so we can match you to nearby jobs.
        </Text>
      </View>

      <View style={styles.form}>
        <AppInput
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="e.g. Maria C."
        />
        <AppInput
          label="Phone number"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="(330) 555-0123"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />
        <AppInput
          label="Home Base ZIP"
          value={homeBaseZip}
          onChangeText={setHomeBaseZip}
          placeholder="44313"
          keyboardType="number-pad"
          maxLength={5}
        />
        <View style={styles.row}>
          <AppInput
            label="Service Radius (mi)"
            value={serviceRadius}
            onChangeText={setServiceRadius}
            placeholder="10"
            keyboardType="number-pad"
            maxLength={3}
            containerStyle={styles.rowItem}
          />
          <AppInput
            label="Experience (yrs)"
            value={experienceYears}
            onChangeText={setExperienceYears}
            placeholder="0"
            keyboardType="number-pad"
            maxLength={2}
            containerStyle={styles.rowItem}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.note}>
          <Text style={styles.noteText}>
            New workers start at Worker Tier L1 with Verification Pending. You can go online
            once verification clears.
          </Text>
        </View>

        <AppButton
          label="Finish setup"
          loading={loading}
          onPress={handleSubmit}
          accentColor={colors.worker}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  form: {
    gap: spacing.lg,
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
  note: {
    backgroundColor: colors.workerMuted,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  noteText: {
    ...typography.caption,
    color: colors.success,
  },
});
