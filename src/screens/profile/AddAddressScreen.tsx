import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap } from '../../utils/haptics';

export default function AddAddressScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [isSaving, setIsSaving] = useState(false);
  const [label, setLabel] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('United States');
  const [isDefault, setIsDefault] = useState(false);

  // Equipment handling capabilities
  const [hasLoadingDock, setHasLoadingDock] = useState(false);
  const [hasForklift, setHasForklift] = useState(false);
  const [forkliftCapacity, setForkliftCapacity] = useState('');
  const [hasOverheadCrane, setHasOverheadCrane] = useState(false);
  const [craneCapacity, setCraneCapacity] = useState('');
  const [groundLevelAccess, setGroundLevelAccess] = useState(false);

  const isValid = addressLine1.trim() && city.trim() && state.trim() && zip.trim();

  const handleSave = async () => {
    if (!user || !isValid) return;

    mediumTap();
    setIsSaving(true);

    try {
      // If setting as default, first unset all other defaults
      if (isDefault) {
        await supabase
          .from('user_addresses')
          .update({ is_default: false })
          .eq('user_id', user.id);
      }

      const { error } = await supabase.from('user_addresses').insert({
        user_id: user.id,
        label: label.trim() || null,
        address_line1: addressLine1.trim(),
        address_line2: addressLine2.trim() || null,
        city: city.trim(),
        state: state.trim().toUpperCase(),
        zip: zip.trim(),
        country: country.trim(),
        is_default: isDefault,
        has_loading_dock: hasLoadingDock,
        has_forklift: hasForklift,
        forklift_capacity_lbs: hasForklift && forkliftCapacity ? parseInt(forkliftCapacity) : null,
        has_overhead_crane: hasOverheadCrane,
        crane_capacity_lbs: hasOverheadCrane && craneCapacity ? parseInt(craneCapacity) : null,
        ground_level_access: groundLevelAccess,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ['addresses'] });
      navigation.goBack();
    } catch (error) {
      console.error('Error saving address:', error);
      Alert.alert('Error', 'Failed to save address. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderToggle = (
    label: string,
    value: boolean,
    onValueChange: (val: boolean) => void,
    icon: keyof typeof Feather.glyphMap
  ) => (
    <View style={[styles.toggleRow, { borderBottomColor: colors.borderLight }]}>
      <View style={styles.toggleLeft}>
        <Feather name={icon} size={18} color={colors.textMuted} />
        <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor="#ffffff"
      />
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Basic Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Address Details</Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Label (Optional)</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                value={label}
                onChangeText={setLabel}
                placeholder="e.g., Home, Office, Warehouse"
                placeholderTextColor={colors.textLight}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Address Line 1 *</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                value={addressLine1}
                onChangeText={setAddressLine1}
                placeholder="Street address"
                placeholderTextColor={colors.textLight}
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Address Line 2</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                value={addressLine2}
                onChangeText={setAddressLine2}
                placeholder="Suite, unit, building, floor, etc."
                placeholderTextColor={colors.textLight}
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>City *</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                value={city}
                onChangeText={setCity}
                placeholder="City"
                placeholderTextColor={colors.textLight}
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

            <View style={styles.rowInputs}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>State *</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={state}
                  onChangeText={setState}
                  placeholder="CA"
                  placeholderTextColor={colors.textLight}
                  autoCapitalize="characters"
                  maxLength={2}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 2, marginLeft: spacing.lg }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>ZIP Code *</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={zip}
                  onChangeText={setZip}
                  placeholder="90210"
                  placeholderTextColor={colors.textLight}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Country</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary }]}
                value={country}
                onChangeText={setCountry}
                placeholder="United States"
                placeholderTextColor={colors.textLight}
              />
            </View>
          </View>
        </View>

        {/* Default Toggle */}
        <View style={styles.section}>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            {renderToggle('Set as Default Address', isDefault, setIsDefault, 'star')}
          </View>
        </View>

        {/* Equipment Handling */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Equipment Handling</Text>
          <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
            Help sellers know what equipment handling options are available at this location.
          </Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            {renderToggle('Loading Dock', hasLoadingDock, setHasLoadingDock, 'package')}
            {renderToggle('Ground Level Access', groundLevelAccess, setGroundLevelAccess, 'log-in')}

            <View style={[styles.toggleRow, { borderBottomColor: colors.borderLight }]}>
              <View style={styles.toggleLeft}>
                <Feather name="truck" size={18} color={colors.textMuted} />
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Forklift Available</Text>
              </View>
              <Switch
                value={hasForklift}
                onValueChange={setHasForklift}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#ffffff"
              />
            </View>
            {hasForklift && (
              <View style={[styles.nestedInput, { borderBottomColor: colors.borderLight }]}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Forklift Capacity (lbs)</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={forkliftCapacity}
                  onChangeText={setForkliftCapacity}
                  placeholder="e.g., 5000"
                  placeholderTextColor={colors.textLight}
                  keyboardType="number-pad"
                />
              </View>
            )}

            <View style={[styles.toggleRow, { borderBottomWidth: hasOverheadCrane ? 1 : 0, borderBottomColor: colors.borderLight }]}>
              <View style={styles.toggleLeft}>
                <Feather name="anchor" size={18} color={colors.textMuted} />
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>Overhead Crane</Text>
              </View>
              <Switch
                value={hasOverheadCrane}
                onValueChange={setHasOverheadCrane}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#ffffff"
              />
            </View>
            {hasOverheadCrane && (
              <View style={styles.nestedInput}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Crane Capacity (lbs)</Text>
                <TextInput
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={craneCapacity}
                  onChangeText={setCraneCapacity}
                  placeholder="e.g., 10000"
                  placeholderTextColor={colors.textLight}
                  keyboardType="number-pad"
                />
              </View>
            )}
          </View>
        </View>

        {/* Save Button */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: isValid ? colors.accent : colors.textLight },
            ]}
            onPress={handleSave}
            disabled={!isValid || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Address</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionHint: {
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    lineHeight: 16,
  },
  card: {
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  inputGroup: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowInputs: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  input: {
    fontSize: fontSize.base,
    paddingVertical: spacing.sm,
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  toggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleLabel: {
    fontSize: fontSize.base,
  },
  nestedInput: {
    paddingHorizontal: spacing.lg,
    paddingLeft: spacing.lg + 18 + spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  saveButton: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
