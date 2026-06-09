import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { OptionGroup } from '@/components/OptionGroup';
import { ScreenContainer } from '@/components/ScreenContainer';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { isUniqueViolation } from '@/services/errors';
import { createRequesterProfile, updateUserProfile } from '@/services/profileService';
import type { RequesterType } from '@/types/profiles';

// Homeowner is a first-class requester subtype — listed first.
const REQUESTER_TYPES: { value: RequesterType; label: string }[] = [
  { value: 'homeowner', label: 'Homeowner' },
  { value: 'str_host', label: 'STR Host' },
  { value: 'co_host', label: 'Co-host' },
  { value: 'property_manager', label: 'Property Manager' },
  { value: 'small_business', label: 'Small Business' },
];

export default function RequesterProfileSetup() {
  const router = useRouter();
  const { user, refresh } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [requesterType, setRequesterType] = useState<RequesterType | null>(null);
  const [serviceAreaZip, setServiceAreaZip] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);

    const name = displayName.trim();
    const phone = phoneNumber.trim();
    const zip = serviceAreaZip.trim();

    if (!name || !phone || !zip) {
      setError('Please fill in every field.');
      return;
    }
    if (!requesterType) {
      setError('Select what kind of requester you are.');
      return;
    }
    if (!user) {
      setError('Your session expired. Please log in again.');
      return;
    }

    setLoading(true);
    try {
      try {
        await createRequesterProfile(user.id, {
          display_name: name,
          phone_number: phone,
          requester_type: requesterType,
          service_area_zip: zip,
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
      router.replace('/(requester)/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your requester profile.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Set up your requester profile</Text>
        <Text style={styles.subtitle}>This is what workers see when you post a job.</Text>
      </View>

      <View style={styles.form}>
        <AppInput
          label="Display name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="e.g. Akron Stays Co."
        />
        <AppInput
          label="Phone number"
          value={phoneNumber}
          onChangeText={setPhoneNumber}
          placeholder="(330) 555-0123"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
        />

        <OptionGroup
          label="I am a…"
          options={REQUESTER_TYPES}
          value={requesterType}
          onChange={setRequesterType}
          accentColor={colors.requester}
        />

        <AppInput
          label="Service Area ZIP"
          value={serviceAreaZip}
          onChangeText={setServiceAreaZip}
          placeholder="44303"
          keyboardType="number-pad"
          maxLength={5}
          error={error}
        />

        <AppButton
          label="Finish setup"
          loading={loading}
          onPress={handleSubmit}
          accentColor={colors.requester}
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
});
