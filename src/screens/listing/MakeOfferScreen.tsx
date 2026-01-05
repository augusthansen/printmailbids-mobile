import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ListingWithImages } from '../../types/database';
import { HomeStackParamList } from '../../navigation/types';
import { formatCurrency } from '../../utils/formatters';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';

type Props = NativeStackScreenProps<HomeStackParamList, 'MakeOffer'>;

export default function MakeOfferScreen({ route, navigation }: Props) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [offerAmount, setOfferAmount] = useState('');
  const [message, setMessage] = useState('');

  // Fetch listing details
  const { data: listing, isLoading } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          images:listing_images(*),
          seller:profiles!seller_id(id, full_name, company_name)
        `)
        .eq('id', listingId)
        .single();

      if (error) throw error;
      return data as ListingWithImages;
    },
  });

  // Make offer mutation
  const makeOfferMutation = useMutation({
    mutationFn: async () => {
      if (!user || !listing) throw new Error('Not authenticated');

      const amount = parseFloat(offerAmount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Please enter a valid offer amount');
      }

      // Check against auto-decline price if set
      if (listing.auto_decline_price && amount < listing.auto_decline_price) {
        throw new Error(`Offer must be at least ${formatCurrency(listing.auto_decline_price)}`);
      }

      // Calculate expiration (48 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      const { data, error } = await supabase
        .from('offers')
        .insert({
          listing_id: listingId,
          buyer_id: user.id,
          seller_id: listing.seller_id,
          amount: amount,
          message: message.trim() || null,
          status: 'pending',
          counter_count: 0,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['my-offers'] });

      Alert.alert(
        'Offer Sent!',
        `Your offer of ${formatCurrency(parseFloat(offerAmount))} has been sent to the seller. They have 48 hours to respond.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    },
    onError: (error: Error) => {
      errorFeedback();
      Alert.alert('Error', error.message || 'Failed to send offer');
    },
  });

  const handleMakeOffer = () => {
    mediumTap();

    const amount = parseFloat(offerAmount);
    if (isNaN(amount) || amount <= 0) {
      errorFeedback();
      Alert.alert('Invalid Offer', 'Please enter a valid offer amount');
      return;
    }

    // Confirm before sending
    Alert.alert(
      'Confirm Offer',
      `Send an offer of ${formatCurrency(amount)} to the seller?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send Offer', onPress: () => makeOfferMutation.mutate() },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top }]}>
        <Feather name="alert-circle" size={48} color={colors.textMuted} />
        <Text style={styles.errorText}>Listing not found</Text>
        <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const listingPrice = listing.fixed_price || 0;
  const offerAmountNum = parseFloat(offerAmount) || 0;
  const buyerPremium = offerAmountNum * 0.08;
  const totalWithPremium = offerAmountNum + buyerPremium;
  const percentOfAsk = listingPrice > 0 ? ((offerAmountNum / listingPrice) * 100).toFixed(0) : 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity style={styles.closeIcon} onPress={() => navigation.goBack()}>
          <Feather name="x" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Make an Offer</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Listing Summary */}
        <View style={styles.listingSummary}>
          <Text style={styles.listingTitle} numberOfLines={2}>{listing.title}</Text>

          <View style={styles.askingPriceRow}>
            <Text style={styles.askingPriceLabel}>Listed Price</Text>
            <Text style={styles.askingPrice}>{formatCurrency(listingPrice)}</Text>
          </View>

          {listing.auto_accept_price && (
            <View style={styles.autoAcceptNotice}>
              <Feather name="zap" size={14} color={colors.success} />
              <Text style={styles.autoAcceptText}>
                Offers of {formatCurrency(listing.auto_accept_price)} or more are auto-accepted
              </Text>
            </View>
          )}
        </View>

        {/* Offer Input Section */}
        <View style={styles.offerSection}>
          <Text style={styles.sectionTitle}>Your Offer</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.currencySymbol}>$</Text>
            <TextInput
              style={styles.offerInput}
              value={offerAmount}
              onChangeText={setOfferAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.textLight}
            />
          </View>

          {offerAmountNum > 0 && listingPrice > 0 && (
            <View style={styles.percentRow}>
              <Text style={styles.percentText}>
                {percentOfAsk}% of asking price
              </Text>
              {offerAmountNum < listingPrice * 0.7 && (
                <Text style={styles.lowOfferWarning}>Low offer</Text>
              )}
            </View>
          )}

          {/* Quick Amount Buttons */}
          <View style={styles.quickOfferButtons}>
            <TouchableOpacity
              style={styles.quickOfferButton}
              onPress={() => setOfferAmount(Math.floor(listingPrice * 0.8).toString())}
            >
              <Text style={styles.quickOfferPercent}>80%</Text>
              <Text style={styles.quickOfferAmount}>{formatCurrency(listingPrice * 0.8)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickOfferButton}
              onPress={() => setOfferAmount(Math.floor(listingPrice * 0.9).toString())}
            >
              <Text style={styles.quickOfferPercent}>90%</Text>
              <Text style={styles.quickOfferAmount}>{formatCurrency(listingPrice * 0.9)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickOfferButton}
              onPress={() => setOfferAmount(listingPrice.toString())}
            >
              <Text style={styles.quickOfferPercent}>100%</Text>
              <Text style={styles.quickOfferAmount}>{formatCurrency(listingPrice)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Message Section */}
        <View style={styles.messageSection}>
          <Text style={styles.sectionTitle}>Message to Seller (Optional)</Text>
          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder="Add a note to explain your offer..."
            placeholderTextColor={colors.textLight}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={styles.messageHint}>
            A brief message can help the seller understand your offer
          </Text>
        </View>

        {/* Cost Breakdown */}
        <View style={styles.costBreakdown}>
          <Text style={styles.sectionTitle}>If Accepted</Text>

          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Your Offer</Text>
            <Text style={styles.costValue}>{formatCurrency(offerAmountNum)}</Text>
          </View>

          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Buyer Premium (8%)</Text>
            <Text style={styles.costValue}>{formatCurrency(buyerPremium)}</Text>
          </View>

          <View style={[styles.costRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total to Pay</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalWithPremium)}</Text>
          </View>

          <Text style={styles.taxNote}>
            * Shipping and applicable taxes will be added
          </Text>
        </View>

        {/* How Offers Work */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>How Offers Work</Text>
          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <View style={styles.infoBullet}>
                <Text style={styles.infoBulletText}>1</Text>
              </View>
              <Text style={styles.infoText}>
                Your offer is sent to the seller
              </Text>
            </View>
            <View style={styles.infoItem}>
              <View style={styles.infoBullet}>
                <Text style={styles.infoBulletText}>2</Text>
              </View>
              <Text style={styles.infoText}>
                The seller has 48 hours to accept, decline, or counter
              </Text>
            </View>
            <View style={styles.infoItem}>
              <View style={styles.infoBullet}>
                <Text style={styles.infoBulletText}>3</Text>
              </View>
              <Text style={styles.infoText}>
                If accepted, you'll receive an invoice to complete the purchase
              </Text>
            </View>
          </View>
        </View>

        {/* Terms Notice */}
        <View style={styles.termsNotice}>
          <Feather name="info" size={16} color={colors.textMuted} />
          <Text style={styles.termsText}>
            By making an offer, you agree to purchase this item if the seller accepts. All sales are final.
          </Text>
        </View>
      </ScrollView>

      {/* Make Offer Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <TouchableOpacity
          style={[styles.makeOfferButton, makeOfferMutation.isPending && styles.buttonDisabled]}
          onPress={handleMakeOffer}
          disabled={makeOfferMutation.isPending || offerAmountNum <= 0}
        >
          {makeOfferMutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Feather name="send" size={20} color={colors.white} />
              <Text style={styles.makeOfferButtonText}>
                Send Offer{offerAmountNum > 0 ? ` - ${formatCurrency(offerAmountNum)}` : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: spacing.lg,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
  },
  closeButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
  },
  closeButtonText: {
    color: colors.white,
    fontWeight: fontWeight.semibold,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  listingSummary: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  listingTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: 24,
    marginBottom: spacing.md,
  },
  askingPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  askingPriceLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  askingPrice: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  autoAcceptNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.successLight,
    borderRadius: borderRadius.md,
  },
  autoAcceptText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: fontWeight.medium,
  },
  offerSection: {
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sand,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    height: 64,
    borderWidth: 2,
    borderColor: colors.border,
  },
  currencySymbol: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  offerInput: {
    flex: 1,
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  percentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  percentText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  lowOfferWarning: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: fontWeight.medium,
  },
  quickOfferButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  quickOfferButton: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.accentFaint,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  quickOfferPercent: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: fontWeight.medium,
  },
  quickOfferAmount: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  messageSection: {
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  messageInput: {
    backgroundColor: colors.sand,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageHint: {
    fontSize: fontSize.sm,
    color: colors.textLight,
    marginTop: spacing.sm,
  },
  costBreakdown: {
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  costLabel: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  costValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  totalRow: {
    borderBottomWidth: 0,
    marginTop: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.accent,
  },
  taxNote: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.md,
  },
  infoSection: {
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  infoList: {
    gap: spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  infoBullet: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentFaint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBulletText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  termsNotice: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.sand,
    borderRadius: borderRadius.lg,
  },
  termsText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  footer: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  makeOfferButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  makeOfferButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});
