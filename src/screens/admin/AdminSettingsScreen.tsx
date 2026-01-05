import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { lightTap, successFeedback, errorFeedback } from '../../utils/haptics';

interface PlatformSettings {
  buyer_premium_rate: number;
  seller_fee_rate: number;
  minimum_listing_price: number;
  maximum_listing_duration_days: number;
  auto_decline_offers_below_percent: number;
  require_email_verification: boolean;
  require_seller_verification: boolean;
  maintenance_mode: boolean;
  allow_new_registrations: boolean;
  allow_new_listings: boolean;
  featured_listing_price: number;
  stripe_enabled: boolean;
  paypal_enabled: boolean;
}

export default function AdminSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Local state for form
  const [settings, setSettings] = useState<PlatformSettings>({
    buyer_premium_rate: 8,
    seller_fee_rate: 5,
    minimum_listing_price: 50,
    maximum_listing_duration_days: 30,
    auto_decline_offers_below_percent: 50,
    require_email_verification: true,
    require_seller_verification: true,
    maintenance_mode: false,
    allow_new_registrations: true,
    allow_new_listings: true,
    featured_listing_price: 49,
    stripe_enabled: true,
    paypal_enabled: false,
  });

  const [hasChanges, setHasChanges] = useState(false);

  const { isLoading } = useQuery({
    queryKey: ['platformSettings'],
    queryFn: async () => {
      // In a real app, fetch from platform_settings table
      // For now, return default settings
      return settings;
    },
    enabled: !!profile?.is_admin,
  });

  const saveMutation = useMutation({
    mutationFn: async (newSettings: PlatformSettings) => {
      // In a real app, save to platform_settings table
      // const { error } = await supabase.from('platform_settings').upsert(newSettings);
      // if (error) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      return newSettings;
    },
    onSuccess: () => {
      successFeedback();
      setHasChanges(false);
      Alert.alert('Success', 'Settings saved successfully');
      queryClient.invalidateQueries({ queryKey: ['platformSettings'] });
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to save settings');
    },
  });

  const updateSetting = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    lightTap();
    Alert.alert(
      'Save Settings',
      'Are you sure you want to save these changes?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => saveMutation.mutate(settings) },
      ]
    );
  };

  const SettingToggle = ({
    label,
    description,
    value,
    onValueChange,
    dangerous,
  }: {
    label: string;
    description: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    dangerous?: boolean;
  }) => (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={[styles.settingLabel, dangerous && styles.dangerousLabel]}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: dangerous ? colors.error : colors.accent }}
        thumbColor={colors.white}
      />
    </View>
  );

  const SettingInput = ({
    label,
    description,
    value,
    onChangeText,
    suffix,
    keyboardType = 'numeric',
  }: {
    label: string;
    description: string;
    value: string;
    onChangeText: (text: string) => void;
    suffix?: string;
    keyboardType?: 'numeric' | 'default';
  }) => (
    <View style={styles.settingRow}>
      <View style={styles.settingInfo}>
        <Text style={styles.settingLabel}>{label}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.settingInput}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
        />
        {suffix && <Text style={styles.inputSuffix}>{suffix}</Text>}
      </View>
    </View>
  );

  if (!profile?.is_admin) {
    return (
      <View style={styles.unauthorizedContainer}>
        <Feather name="shield-off" size={48} color={colors.error} />
        <Text style={styles.unauthorizedText}>Access Denied</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] + 80 }}
      >
        {/* Fee Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fee Configuration</Text>
          <View style={styles.card}>
            <SettingInput
              label="Buyer Premium"
              description="Percentage charged to buyers on top of winning bid/offer"
              value={settings.buyer_premium_rate.toString()}
              onChangeText={(text) => updateSetting('buyer_premium_rate', parseFloat(text) || 0)}
              suffix="%"
            />
            <View style={styles.divider} />
            <SettingInput
              label="Seller Fee"
              description="Percentage deducted from seller payouts"
              value={settings.seller_fee_rate.toString()}
              onChangeText={(text) => updateSetting('seller_fee_rate', parseFloat(text) || 0)}
              suffix="%"
            />
            <View style={styles.divider} />
            <SettingInput
              label="Featured Listing Price"
              description="Cost for sellers to feature their listing"
              value={settings.featured_listing_price.toString()}
              onChangeText={(text) => updateSetting('featured_listing_price', parseFloat(text) || 0)}
              suffix="$"
            />
          </View>
        </View>

        {/* Listing Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Listing Rules</Text>
          <View style={styles.card}>
            <SettingInput
              label="Minimum Price"
              description="Minimum starting price or fixed price for listings"
              value={settings.minimum_listing_price.toString()}
              onChangeText={(text) => updateSetting('minimum_listing_price', parseFloat(text) || 0)}
              suffix="$"
            />
            <View style={styles.divider} />
            <SettingInput
              label="Max Duration"
              description="Maximum number of days a listing can run"
              value={settings.maximum_listing_duration_days.toString()}
              onChangeText={(text) => updateSetting('maximum_listing_duration_days', parseInt(text) || 0)}
              suffix="days"
            />
            <View style={styles.divider} />
            <SettingInput
              label="Auto-Decline Threshold"
              description="Automatically decline offers below this % of asking price"
              value={settings.auto_decline_offers_below_percent.toString()}
              onChangeText={(text) => updateSetting('auto_decline_offers_below_percent', parseFloat(text) || 0)}
              suffix="%"
            />
          </View>
        </View>

        {/* Verification Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification</Text>
          <View style={styles.card}>
            <SettingToggle
              label="Require Email Verification"
              description="Users must verify their email before bidding"
              value={settings.require_email_verification}
              onValueChange={(value) => updateSetting('require_email_verification', value)}
            />
            <View style={styles.divider} />
            <SettingToggle
              label="Require Seller Verification"
              description="Sellers must be manually verified before listing"
              value={settings.require_seller_verification}
              onValueChange={(value) => updateSetting('require_seller_verification', value)}
            />
          </View>
        </View>

        {/* Payment Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Methods</Text>
          <View style={styles.card}>
            <SettingToggle
              label="Stripe Payments"
              description="Enable credit/debit card payments via Stripe"
              value={settings.stripe_enabled}
              onValueChange={(value) => updateSetting('stripe_enabled', value)}
            />
            <View style={styles.divider} />
            <SettingToggle
              label="PayPal Payments"
              description="Enable PayPal as a payment option"
              value={settings.paypal_enabled}
              onValueChange={(value) => updateSetting('paypal_enabled', value)}
            />
          </View>
        </View>

        {/* Platform Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Platform Controls</Text>
          <View style={styles.card}>
            <SettingToggle
              label="Allow New Registrations"
              description="Allow new users to create accounts"
              value={settings.allow_new_registrations}
              onValueChange={(value) => updateSetting('allow_new_registrations', value)}
            />
            <View style={styles.divider} />
            <SettingToggle
              label="Allow New Listings"
              description="Allow sellers to create new listings"
              value={settings.allow_new_listings}
              onValueChange={(value) => updateSetting('allow_new_listings', value)}
            />
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
          <View style={[styles.card, styles.dangerCard]}>
            <SettingToggle
              label="Maintenance Mode"
              description="Put the platform in maintenance mode. Only admins can access."
              value={settings.maintenance_mode}
              onValueChange={(value) => {
                Alert.alert(
                  'Enable Maintenance Mode?',
                  'This will prevent all non-admin users from accessing the platform.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Enable', style: 'destructive', onPress: () => updateSetting('maintenance_mode', value) },
                  ]
                );
              }}
              dangerous
            />
          </View>
        </View>

        {/* Version Info */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>PrintMailBids Admin v1.0.0</Text>
          <Text style={styles.versionSubtext}>Mobile App Build 2026.01.01</Text>
        </View>
      </ScrollView>

      {/* Save Button */}
      {hasChanges && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <TouchableOpacity
            style={[styles.saveButton, saveMutation.isPending && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Feather name="save" size={20} color={colors.white} />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  unauthorizedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  unauthorizedText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  dangerTitle: {
    color: colors.error,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  dangerCard: {
    borderWidth: 1,
    borderColor: colors.error,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
  },
  settingInfo: {
    flex: 1,
    marginRight: spacing.lg,
  },
  settingLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  dangerousLabel: {
    color: colors.error,
  },
  settingDescription: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sand,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    minWidth: 80,
  },
  settingInput: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
    textAlign: 'center',
    minWidth: 40,
  },
  inputSuffix: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: spacing.lg,
  },
  versionContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  versionText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  versionSubtext: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});
