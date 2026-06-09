import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { AppInput } from '@/components/AppInput';
import { OptionGroup } from '@/components/OptionGroup';
import { ScreenContainer } from '@/components/ScreenContainer';
import { ToggleRow } from '@/components/ToggleRow';
import { colors, spacing, typography } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { dollarsToCents } from '@/lib/format';
import { createServiceLocation } from '@/services/locationService';
import type { LocationType } from '@/types/locations';

const LOCATION_TYPES: { value: LocationType; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'str_property', label: 'STR Property' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'condo', label: 'Condo' },
  { value: 'townhouse', label: 'Townhouse' },
  { value: 'small_business', label: 'Small Business' },
  { value: 'other', label: 'Other' },
];

function parseIntOrNull(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function parseFloatOrNull(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

export default function NewLocation() {
  const router = useRouter();
  const { user } = useAuth();

  const [nickname, setNickname] = useState('');
  const [locationType, setLocationType] = useState<LocationType | null>(null);
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('OH');
  const [zipCode, setZipCode] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [sleeps, setSleeps] = useState('');
  const [laundryOnSite, setLaundryOnSite] = useState(true);
  const [typicalLaundryLoads, setTypicalLaundryLoads] = useState('1');
  const [suppliesProvided, setSuppliesProvided] = useState(true);
  const [parkingNotes, setParkingNotes] = useState('');
  const [accessNotes, setAccessNotes] = useState('');
  const [restockNotes, setRestockNotes] = useState('');
  const [payoutDollars, setPayoutDollars] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    setError(null);

    const name = nickname.trim();
    const line1 = addressLine1.trim();
    const cityVal = city.trim();
    const stateVal = state.trim();
    const zip = zipCode.trim();

    if (!name || !line1 || !cityVal || !stateVal || !zip) {
      setError('Fill in nickname, address, city, state, and ZIP.');
      return;
    }
    if (!locationType) {
      setError('Choose a location type.');
      return;
    }
    if (!user) {
      setError('Your session expired. Please log in again.');
      return;
    }

    let payoutCents: number | null = null;
    if (payoutDollars.trim()) {
      payoutCents = dollarsToCents(payoutDollars);
      if (payoutCents === null) {
        setError('Enter a valid default payout amount.');
        return;
      }
    }

    setLoading(true);
    try {
      const created = await createServiceLocation(user.id, {
        nickname: name,
        location_type: locationType,
        address_line1: line1,
        address_line2: addressLine2.trim() || null,
        city: cityVal,
        state: stateVal,
        zip_code: zip,
        bedrooms: parseIntOrNull(bedrooms),
        bathrooms: parseFloatOrNull(bathrooms),
        sleeps: parseIntOrNull(sleeps),
        laundry_on_site: laundryOnSite,
        typical_laundry_loads: parseIntOrNull(typicalLaundryLoads),
        supplies_provided: suppliesProvided,
        parking_notes: parkingNotes.trim() || null,
        access_notes: accessNotes.trim() || null,
        restock_notes: restockNotes.trim() || null,
        default_cleaning_payout_cents: payoutCents,
      });
      router.replace({ pathname: '/(requester)/locations/[id]', params: { id: created.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this location.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Add a location</Text>
        <Text style={styles.subtitle}>Where do you need cleaning done?</Text>
      </View>

      <View style={styles.form}>
        <AppInput
          label="Nickname"
          value={nickname}
          onChangeText={setNickname}
          placeholder="e.g. Highland Square 2BR"
        />

        <OptionGroup
          label="Location type"
          options={LOCATION_TYPES}
          value={locationType}
          onChange={setLocationType}
          accentColor={colors.requester}
        />

        <AppInput
          label="Address line 1"
          value={addressLine1}
          onChangeText={setAddressLine1}
          placeholder="123 Main St"
        />
        <AppInput
          label="Address line 2 (optional)"
          value={addressLine2}
          onChangeText={setAddressLine2}
          placeholder="Unit 4"
        />
        <View style={styles.row}>
          <AppInput
            label="City"
            value={city}
            onChangeText={setCity}
            placeholder="Akron"
            containerStyle={styles.flex2}
          />
          <AppInput
            label="State"
            value={state}
            onChangeText={setState}
            placeholder="OH"
            autoCapitalize="characters"
            maxLength={2}
            containerStyle={styles.flex1}
          />
        </View>
        <AppInput
          label="ZIP code"
          value={zipCode}
          onChangeText={setZipCode}
          placeholder="44303"
          keyboardType="number-pad"
          maxLength={5}
        />

        <Text style={styles.sectionLabel}>Property details</Text>
        <View style={styles.row}>
          <AppInput
            label="Bedrooms"
            value={bedrooms}
            onChangeText={setBedrooms}
            placeholder="2"
            keyboardType="number-pad"
            maxLength={2}
            containerStyle={styles.flex1}
          />
          <AppInput
            label="Bathrooms"
            value={bathrooms}
            onChangeText={setBathrooms}
            placeholder="1.5"
            keyboardType="decimal-pad"
            maxLength={4}
            containerStyle={styles.flex1}
          />
          <AppInput
            label="Sleeps"
            value={sleeps}
            onChangeText={setSleeps}
            placeholder="4"
            keyboardType="number-pad"
            maxLength={2}
            containerStyle={styles.flex1}
          />
        </View>

        <ToggleRow
          label="Laundry on site"
          value={laundryOnSite}
          onValueChange={setLaundryOnSite}
          accentColor={colors.requester}
        />
        {laundryOnSite ? (
          <AppInput
            label="Typical laundry loads"
            value={typicalLaundryLoads}
            onChangeText={setTypicalLaundryLoads}
            placeholder="1"
            keyboardType="number-pad"
            maxLength={2}
          />
        ) : null}
        <ToggleRow
          label="Supplies provided"
          helper="You stock cleaning supplies at this location."
          value={suppliesProvided}
          onValueChange={setSuppliesProvided}
          accentColor={colors.requester}
        />

        <AppInput
          label="Parking notes (optional)"
          value={parkingNotes}
          onChangeText={setParkingNotes}
          placeholder="Driveway, or street parking on Elm"
          multiline
        />
        <AppInput
          label="Access notes (optional)"
          value={accessNotes}
          onChangeText={setAccessNotes}
          placeholder="Lockbox code 1234, side door"
          multiline
        />
        <AppInput
          label="Restock notes (optional)"
          value={restockNotes}
          onChangeText={setRestockNotes}
          placeholder="Supplies in hall closet"
          multiline
        />
        <AppInput
          label="Default cleaning payout (optional)"
          value={payoutDollars}
          onChangeText={setPayoutDollars}
          placeholder="120"
          keyboardType="decimal-pad"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <AppButton
          label="Save Location"
          loading={loading}
          onPress={handleSave}
          accentColor={colors.requester}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  form: { gap: spacing.lg },
  sectionLabel: { ...typography.label, color: colors.text, marginTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  error: { ...typography.caption, color: colors.danger },
});
