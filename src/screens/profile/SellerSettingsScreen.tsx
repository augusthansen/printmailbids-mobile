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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { spacing, borderRadius, fontSize, fontWeight, shadows, colors as baseColors } from '../../constants/theme';
import { mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

export default function SellerSettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [isSaving, setIsSaving] = useState(false);
  const [sellerTerms, setSellerTerms] = useState('');
  const [defaultShippingInfo, setDefaultShippingInfo] = useState('');

  useEffect(() => {
    if (profile) {
      setSellerTerms(profile.seller_terms || '');
      setDefaultShippingInfo(profile.default_shipping_info || '');
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;

    mediumTap();
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          seller_terms: sellerTerms.trim() || null,
          default_shipping_info: defaultShippingInfo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) throw error;

      await refreshProfile();
      successFeedback();
      Alert.alert('Success', 'Seller settings saved successfully.');
    } catch (error) {
      console.error('Error saving seller settings:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to save seller settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    sellerTerms !== (profile?.seller_terms || '') ||
    defaultShippingInfo !== (profile?.default_shipping_info || '');

  // Check if user is a seller
  if (!profile?.is_seller) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <View style={[styles.emptyIcon, { backgroundColor: colors.accentFaint }]}>
          <Feather name="briefcase" size={32} color={colors.accent} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
          Become a Seller
        </Text>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          Seller settings are available once you've been approved as a seller on PrintMailBids.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}
          onPress={() => {
            Alert.alert(
              'Become a Seller',
              'To become a seller, please visit the PrintMailBids website and complete the seller application process.',
              [{ text: 'OK' }]
            );
          }}
        >
          <Text style={styles.primaryButtonText}>Learn More</Text>
        </TouchableOpacity>
      </View>
    );
  }

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
        {/* Info Banner */}
        <View style={[styles.infoBanner, { backgroundColor: colors.accentFaint }]}>
          <Feather name="info" size={18} color={colors.accent} />
          <Text style={[styles.infoBannerText, { color: colors.accent }]}>
            These defaults will be applied to all new listings. You can override them on individual listings.
          </Text>
        </View>

        {/* Default Seller Terms */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Default Seller Terms</Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Feather name="file-text" size={16} color={colors.textMuted} />
                <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Terms & Conditions</Text>
              </View>
              <Text style={[styles.inputHint, { color: colors.textMuted }]}>
                Set your standard terms that buyers must accept before bidding on your listings. This can include payment terms, return policies, and any other conditions.
              </Text>
              <TextInput
                style={[styles.textArea, {
                  backgroundColor: isDark ? colors.background : colors.sand,
                  color: colors.textPrimary,
                  borderColor: colors.border
                }]}
                value={sellerTerms}
                onChangeText={setSellerTerms}
                placeholder="Example:&#10;• Payment due within 7 days&#10;• All sales final&#10;• Buyer responsible for pickup/shipping arrangements&#10;• Equipment sold as-is, where-is"
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>

        {/* Default Shipping Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Default Shipping Information</Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Feather name="truck" size={16} color={colors.textMuted} />
                <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Shipping & Pickup Details</Text>
              </View>
              <Text style={[styles.inputHint, { color: colors.textMuted }]}>
                Provide default information about equipment pickup, shipping options, and any logistics details buyers should know.
              </Text>
              <TextInput
                style={[styles.textArea, {
                  backgroundColor: isDark ? colors.background : colors.sand,
                  color: colors.textPrimary,
                  borderColor: colors.border
                }]}
                value={defaultShippingInfo}
                onChangeText={setDefaultShippingInfo}
                placeholder="Example:&#10;• Located in Chicago, IL&#10;• Pickup hours: Mon-Fri 8am-5pm&#10;• Loading dock available&#10;• Forklift on-site up to 5,000 lbs&#10;• Can arrange freight shipping"
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>

        {/* Wire Instructions Link */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Payment Settings</Text>
          <TouchableOpacity
            style={[styles.linkCard, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}
            onPress={() => {
              mediumTap();
              navigation.navigate('WireInstructions');
            }}
          >
            <View style={[styles.linkIcon, { backgroundColor: colors.accentFaint }]}>
              <Feather name="credit-card" size={18} color={colors.accent} />
            </View>
            <View style={styles.linkContent}>
              <Text style={[styles.linkTitle, { color: colors.textPrimary }]}>Wire Transfer Instructions</Text>
              <Text style={[styles.linkDescription, { color: colors.textMuted }]}>
                Set up your bank details for receiving wire transfer payments
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.textLight} />
          </TouchableOpacity>
        </View>

        {/* Seller Stats */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Seller Status</Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {profile.seller_rating?.toFixed(1) || '—'}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Rating</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.borderLight }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                  {profile.seller_review_count || 0}
                </Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Reviews</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: colors.borderLight }]} />
              <View style={styles.statItem}>
                <View style={[styles.verifiedBadge, { backgroundColor: baseColors.successLight }]}>
                  <Feather name="check-circle" size={14} color={baseColors.success} />
                  <Text style={[styles.verifiedText, { color: baseColors.success }]}>Verified</Text>
                </View>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>Status</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Save Button */}
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
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  infoBannerText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  inputGroup: {
    padding: spacing.lg,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  inputLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  inputHint: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  textArea: {
    fontSize: fontSize.base,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    minHeight: 160,
    lineHeight: 22,
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    gap: spacing.md,
    ...shadows.sm,
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkContent: {
    flex: 1,
  },
  linkTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: 2,
  },
  linkDescription: {
    fontSize: fontSize.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: fontSize.xs,
  },
  statDivider: {
    width: 1,
    height: 40,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  verifiedText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
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
});
