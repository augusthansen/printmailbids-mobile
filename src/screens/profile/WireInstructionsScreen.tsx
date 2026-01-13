import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { API_URL } from '../../constants/config';
import { mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';

export default function WireInstructionsScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [isSaving, setIsSaving] = useState(false);
  const [bankName, setBankName] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [bankAddress, setBankAddress] = useState('');
  const [swiftCode, setSwiftCode] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  useEffect(() => {
    if (profile) {
      setBankName(profile.wire_bank_name || '');
      setRoutingNumber(profile.wire_routing_number || '');
      setAccountNumber(profile.wire_account_number || '');
      setAccountName(profile.wire_account_name || '');
      setBankAddress(profile.wire_bank_address || '');
      setSwiftCode(profile.wire_swift_code || '');
      setAdditionalInstructions(profile.wire_additional_instructions || '');
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;

    // Validate required fields if any wire info is being entered
    const hasAnyInfo = bankName || routingNumber || accountNumber || accountName;
    if (hasAnyInfo) {
      if (!bankName.trim()) {
        Alert.alert('Required Field', 'Please enter your bank name.');
        return;
      }
      if (!routingNumber.trim()) {
        Alert.alert('Required Field', 'Please enter your routing number (ABA).');
        return;
      }
      if (!accountNumber.trim()) {
        Alert.alert('Required Field', 'Please enter your account number.');
        return;
      }
      if (!accountName.trim()) {
        Alert.alert('Required Field', 'Please enter the account holder name.');
        return;
      }
    }

    mediumTap();
    setIsSaving(true);

    try {
      // Check if seller previously had no wire info (to know if we should notify buyers)
      const hadNoWireInfo = !profile.wire_bank_name;

      const { error } = await supabase
        .from('profiles')
        .update({
          wire_bank_name: bankName.trim() || null,
          wire_routing_number: routingNumber.trim() || null,
          wire_account_number: accountNumber.trim() || null,
          wire_account_name: accountName.trim() || null,
          wire_bank_address: bankAddress.trim() || null,
          wire_swift_code: swiftCode.trim() || null,
          wire_additional_instructions: additionalInstructions.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) throw error;

      // If seller just added wire info (didn't have it before), notify buyers who requested it
      if (hadNoWireInfo && bankName.trim()) {
        await notifyBuyersWireInstructionsAvailable();
      }

      await refreshProfile();
      successFeedback();
      Alert.alert('Success', 'Wire transfer instructions saved successfully.');
      navigation.goBack();
    } catch (error) {
      console.error('Error saving wire instructions:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to save wire instructions. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Notify buyers who requested wire instructions that they are now available (via API for push notifications)
  const notifyBuyersWireInstructionsAvailable = async () => {
    if (!profile) return;

    try {
      // Get auth session for API call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        console.error('[Wire Instructions] Not authenticated');
        return;
      }

      // Call API endpoint to notify buyers (sends in-app + push notifications)
      const response = await fetch(`${API_URL}/wire/notify-available`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[Wire Instructions] API error:', result.error);
        return;
      }

      console.log(`[Wire Instructions] Notified ${result.notified} buyers, ${result.pushSent} push notifications sent`);
    } catch (error) {
      console.error('Error notifying buyers about wire instructions:', error);
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Clear Wire Instructions',
      'Are you sure you want to clear all wire transfer instructions? Buyers will not be able to pay via wire transfer.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            mediumTap();
            setIsSaving(true);
            try {
              const { error } = await supabase
                .from('profiles')
                .update({
                  wire_bank_name: null,
                  wire_routing_number: null,
                  wire_account_number: null,
                  wire_account_name: null,
                  wire_bank_address: null,
                  wire_swift_code: null,
                  wire_additional_instructions: null,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', profile!.id);

              if (error) throw error;

              setBankName('');
              setRoutingNumber('');
              setAccountNumber('');
              setAccountName('');
              setBankAddress('');
              setSwiftCode('');
              setAdditionalInstructions('');

              await refreshProfile();
              successFeedback();
            } catch (error) {
              errorFeedback();
              Alert.alert('Error', 'Failed to clear wire instructions.');
            } finally {
              setIsSaving(false);
            }
          },
        },
      ]
    );
  };

  const hasChanges =
    bankName !== (profile?.wire_bank_name || '') ||
    routingNumber !== (profile?.wire_routing_number || '') ||
    accountNumber !== (profile?.wire_account_number || '') ||
    accountName !== (profile?.wire_account_name || '') ||
    bankAddress !== (profile?.wire_bank_address || '') ||
    swiftCode !== (profile?.wire_swift_code || '') ||
    additionalInstructions !== (profile?.wire_additional_instructions || '');

  const hasExistingInfo = profile?.wire_bank_name || profile?.wire_routing_number || profile?.wire_account_number;

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
        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: colors.accentFaint }]}>
          <Feather name="info" size={20} color={colors.accent} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: colors.accent }]}>
              Wire Transfer Instructions
            </Text>
            <Text style={[styles.infoText, { color: colors.accent }]}>
              These instructions will be displayed to buyers who choose to pay via wire transfer.
              Wire payments are irrevocable once sent, making them ideal for high-value B2B transactions.
            </Text>
          </View>
        </View>

        {/* Bank Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Bank Information</Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Bank Name *</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, backgroundColor: isDark ? colors.stone : colors.background }]}
                value={bankName}
                onChangeText={setBankName}
                placeholder="e.g., Chase Bank, Bank of America"
                placeholderTextColor={colors.textLight}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Routing Number (ABA) *</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, backgroundColor: isDark ? colors.stone : colors.background }]}
                value={routingNumber}
                onChangeText={setRoutingNumber}
                placeholder="9-digit routing number"
                placeholderTextColor={colors.textLight}
                keyboardType="number-pad"
                maxLength={9}
              />
              <Text style={[styles.inputHelp, { color: colors.textLight }]}>
                The 9-digit ABA routing number for domestic wires
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Account Number *</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, backgroundColor: isDark ? colors.stone : colors.background }]}
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="Your bank account number"
                placeholderTextColor={colors.textLight}
                keyboardType="number-pad"
                secureTextEntry
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Account Holder Name *</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, backgroundColor: isDark ? colors.stone : colors.background }]}
                value={accountName}
                onChangeText={setAccountName}
                placeholder="Name on the account"
                placeholderTextColor={colors.textLight}
                autoCapitalize="words"
              />
              <Text style={[styles.inputHelp, { color: colors.textLight }]}>
                Exactly as it appears on your bank account
              </Text>
            </View>
          </View>
        </View>

        {/* Additional Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Additional Information</Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Bank Address</Text>
              <TextInput
                style={[styles.textArea, { color: colors.textPrimary, backgroundColor: isDark ? colors.stone : colors.background }]}
                value={bankAddress}
                onChangeText={setBankAddress}
                placeholder="Full bank branch address (optional)"
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>SWIFT/BIC Code</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, backgroundColor: isDark ? colors.stone : colors.background }]}
                value={swiftCode}
                onChangeText={setSwiftCode}
                placeholder="For international wires (optional)"
                placeholderTextColor={colors.textLight}
                autoCapitalize="characters"
                maxLength={11}
              />
              <Text style={[styles.inputHelp, { color: colors.textLight }]}>
                Required for international wire transfers
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Additional Instructions</Text>
              <TextInput
                style={[styles.textArea, { color: colors.textPrimary, backgroundColor: isDark ? colors.stone : colors.background }]}
                value={additionalInstructions}
                onChangeText={setAdditionalInstructions}
                placeholder="Any special instructions for buyers (optional)"
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>

        {/* Security Notice */}
        <View style={styles.section}>
          <View style={[styles.securityCard, { backgroundColor: colors.warningLight }]}>
            <Feather name="shield" size={20} color={colors.warning} />
            <View style={styles.securityContent}>
              <Text style={[styles.securityTitle, { color: colors.warning }]}>
                Security Notice
              </Text>
              <Text style={[styles.securityText, { color: colors.warning }]}>
                Your banking information is encrypted and only shown to buyers who select wire transfer as their payment method.
                Always verify large wire transfers through your bank before shipping equipment.
              </Text>
            </View>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: hasChanges ? colors.accent : colors.textLight },
            ]}
            onPress={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Feather name="check" size={20} color="#ffffff" />
                <Text style={styles.saveButtonText}>Save Wire Instructions</Text>
              </>
            )}
          </TouchableOpacity>

          {hasExistingInfo && (
            <TouchableOpacity
              style={[styles.clearButton, { borderColor: colors.error }]}
              onPress={handleClear}
              disabled={isSaving}
            >
              <Feather name="trash-2" size={18} color={colors.error} />
              <Text style={[styles.clearButtonText, { color: colors.error }]}>
                Clear All Instructions
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  infoText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
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
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  input: {
    fontSize: fontSize.base,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
  },
  textArea: {
    fontSize: fontSize.base,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputHelp: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  securityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
  },
  securityContent: {
    flex: 1,
  },
  securityTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  securityText: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  clearButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
