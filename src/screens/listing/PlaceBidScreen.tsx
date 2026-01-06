import React, { useState, useEffect } from 'react';
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
import { useTheme } from '../../contexts/ThemeContext';
import { ListingWithDetails } from '../../types/database';
import { HomeStackParamList } from '../../navigation/types';
import { formatCurrency, formatTimeRemaining } from '../../utils/formatters';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';

type Props = NativeStackScreenProps<HomeStackParamList, 'PlaceBid'>;

// Bid increment logic based on current price
function getBidIncrement(currentPrice: number): number {
  if (currentPrice < 100) return 5;
  if (currentPrice < 500) return 10;
  if (currentPrice < 1000) return 25;
  if (currentPrice < 5000) return 50;
  if (currentPrice < 10000) return 100;
  if (currentPrice < 50000) return 250;
  if (currentPrice < 100000) return 500;
  return 1000;
}

function getMinimumBid(currentBid: number | null, startingPrice: number | null): number {
  const base = currentBid || startingPrice || 0;
  return base + getBidIncrement(base);
}

export default function PlaceBidScreen({ route, navigation }: Props) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [bidAmount, setBidAmount] = useState('');
  const [maxBidAmount, setMaxBidAmount] = useState('');
  const [useProxyBidding, setUseProxyBidding] = useState(false);

  // Fetch listing details
  const { data: listing, isLoading } = useQuery({
    queryKey: ['listing', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          images:listing_images(*)
        `)
        .eq('id', listingId)
        .single();

      if (error) throw error;

      // Get user's current bid if any
      if (user) {
        const { data: bidData } = await supabase
          .from('bids')
          .select('*')
          .eq('listing_id', listingId)
          .eq('bidder_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        (data as ListingWithDetails).my_bid = bidData || null;
      }

      return data as ListingWithDetails;
    },
  });

  // Calculate minimum bid
  const minimumBid = listing ? getMinimumBid(listing.current_bid, listing.starting_price) : 0;
  const bidIncrement = listing ? getBidIncrement(listing.current_bid || listing.starting_price || 0) : 0;

  // Set default bid amount to minimum when listing loads
  useEffect(() => {
    if (listing && !bidAmount) {
      setBidAmount(minimumBid.toString());
    }
  }, [listing, minimumBid]);

  // Place bid mutation
  const placeBidMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const amount = parseFloat(bidAmount);
      const maxBid = useProxyBidding && maxBidAmount ? parseFloat(maxBidAmount) : amount;

      if (isNaN(amount) || amount < minimumBid) {
        throw new Error(`Minimum bid is ${formatCurrency(minimumBid)}`);
      }

      if (useProxyBidding && maxBid < amount) {
        throw new Error('Maximum bid must be greater than or equal to your bid');
      }

      // Ensure bidder profile exists (foreign key requirement)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        // Create profile if it doesn't exist using upsert
        // Only include core columns that exist in the database
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || null,
          }, { onConflict: 'id' });

        if (profileError) {
          throw new Error('Your profile could not be created. Please contact support or try logging out and back in.');
        }
      }

      // Place the bid via Supabase function or direct insert
      const { data, error } = await supabase
        .from('bids')
        .insert({
          listing_id: listingId,
          bidder_id: user.id,
          amount: amount,
          max_bid: maxBid,
          status: 'active',
          is_auto_bid: useProxyBidding,
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification for the seller
      if (listing) {
        await supabase.from('notifications').insert({
          user_id: listing.seller_id,
          type: 'new_bid',
          title: `New bid: ${formatCurrency(amount)}`,
          body: `Someone placed a bid of ${formatCurrency(amount)} on "${listing.title}"`,
          listing_id: listingId,
          bid_id: data.id,
        });
      }

      // Update the listing's current bid (this would normally be handled by a database trigger)
      // For now, we'll just invalidate and refetch
      return data;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-bids'] });

      Alert.alert(
        'Bid Placed!',
        useProxyBidding
          ? `Your bid of ${formatCurrency(parseFloat(bidAmount))} has been placed with proxy bidding up to ${formatCurrency(parseFloat(maxBidAmount))}.`
          : `Your bid of ${formatCurrency(parseFloat(bidAmount))} has been placed.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    },
    onError: (error: Error) => {
      errorFeedback();
      Alert.alert('Error', error.message || 'Failed to place bid');
    },
  });

  const handlePlaceBid = () => {
    mediumTap();

    const amount = parseFloat(bidAmount);
    if (isNaN(amount) || amount < minimumBid) {
      errorFeedback();
      Alert.alert('Invalid Bid', `Minimum bid is ${formatCurrency(minimumBid)}`);
      return;
    }

    if (useProxyBidding) {
      const maxBid = parseFloat(maxBidAmount);
      if (isNaN(maxBid) || maxBid < amount) {
        errorFeedback();
        Alert.alert('Invalid Max Bid', 'Maximum bid must be greater than or equal to your bid');
        return;
      }
    }

    placeBidMutation.mutate();
  };

  const handleQuickBid = (increment: number) => {
    const newAmount = minimumBid + increment * bidIncrement;
    setBidAmount(newAmount.toString());
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  if (!listing) {
    return (
      <View style={[styles.errorContainer, { paddingTop: insets.top, backgroundColor: themeColors.background }]}>
        <Feather name="alert-circle" size={48} color={themeColors.textMuted} />
        <Text style={[styles.errorText, { color: themeColors.textMuted }]}>Listing not found</Text>
        <TouchableOpacity style={[styles.closeButton, { backgroundColor: themeColors.accent }]} onPress={() => navigation.goBack()}>
          <Text style={styles.closeButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentPrice = listing.current_bid || listing.starting_price || 0;
  const hasReserve = listing.reserve_price && (!listing.current_bid || listing.current_bid < listing.reserve_price);
  const bidAmountNum = parseFloat(bidAmount) || 0;
  const buyerPremium = bidAmountNum * 0.08;
  const totalWithPremium = bidAmountNum + buyerPremium;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity style={styles.closeIcon} onPress={() => navigation.goBack()}>
          <Feather name="x" size={24} color={themeColors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Place Bid</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Listing Summary */}
        <View style={[styles.listingSummary, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.listingTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>{listing.title}</Text>

          <View style={styles.priceInfo}>
            <View>
              <Text style={[styles.priceLabel, { color: themeColors.textMuted }]}>
                {listing.current_bid ? 'Current Bid' : 'Starting Price'}
              </Text>
              <Text style={styles.currentPrice}>{formatCurrency(currentPrice)}</Text>
            </View>

            {listing.end_time && (
              <View style={styles.timeInfo}>
                <Feather name="clock" size={14} color={colors.warning} />
                <Text style={styles.timeText}>{formatTimeRemaining(listing.end_time)}</Text>
              </View>
            )}
          </View>

          {/* Reserve Status */}
          {hasReserve && (
            <View style={styles.reserveNotice}>
              <Feather name="lock" size={14} color={colors.warning} />
              <Text style={styles.reserveText}>Reserve price not yet met</Text>
            </View>
          )}

          {/* Your Current Bid Status */}
          {listing.my_bid && (
            <View style={[
              styles.yourBidStatus,
              listing.my_bid.status === 'winning' ? styles.winningStatus : styles.outbidStatus
            ]}>
              <Feather
                name={listing.my_bid.status === 'winning' ? 'check-circle' : 'alert-circle'}
                size={16}
                color={listing.my_bid.status === 'winning' ? colors.success : colors.error}
              />
              <Text style={[
                styles.yourBidStatusText,
                { color: listing.my_bid.status === 'winning' ? colors.success : colors.error }
              ]}>
                {listing.my_bid.status === 'winning'
                  ? `You're winning at ${formatCurrency(listing.my_bid.amount)}`
                  : `You've been outbid (${formatCurrency(listing.my_bid.amount)})`
                }
              </Text>
            </View>
          )}
        </View>

        {/* Bid Input Section */}
        <View style={[styles.bidSection, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Your Bid</Text>

          <View style={styles.minimumBidInfo}>
            <Text style={[styles.minimumBidLabel, { color: themeColors.textMuted }]}>Minimum bid:</Text>
            <Text style={[styles.minimumBidValue, { color: themeColors.accent }]}>
              {formatCurrency(minimumBid)}
            </Text>
            <Text style={styles.incrementInfo}>(${bidIncrement} increments)</Text>
          </View>

          <View style={[styles.inputContainer, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}>
            <Text style={[styles.currencySymbol, { color: themeColors.textPrimary }]}>$</Text>
            <TextInput
              style={[styles.bidInput, { color: themeColors.textPrimary }]}
              value={bidAmount}
              onChangeText={setBidAmount}
              keyboardType="numeric"
              placeholder={minimumBid.toString()}
              placeholderTextColor={colors.textLight}
            />
          </View>

          {/* Quick Bid Buttons */}
          <View style={styles.quickBidButtons}>
            <TouchableOpacity
              style={styles.quickBidButton}
              onPress={() => setBidAmount(minimumBid.toString())}
            >
              <Text style={[styles.quickBidText, { color: themeColors.accent }]}>Min</Text>
              <Text style={[styles.quickBidAmount, { color: themeColors.textPrimary }]}>
                {formatCurrency(minimumBid)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBidButton}
              onPress={() => handleQuickBid(1)}
            >
              <Text style={[styles.quickBidText, { color: themeColors.accent }]}>+1</Text>
              <Text style={[styles.quickBidAmount, { color: themeColors.textPrimary }]}>
                {formatCurrency(minimumBid + bidIncrement)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickBidButton}
              onPress={() => handleQuickBid(5)}
            >
              <Text style={[styles.quickBidText, { color: themeColors.accent }]}>+5</Text>
              <Text style={[styles.quickBidAmount, { color: themeColors.textPrimary }]}>
                {formatCurrency(minimumBid + 5 * bidIncrement)}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Proxy Bidding Section */}
        <View style={[styles.proxySection, { backgroundColor: themeColors.surface }]}>
          <TouchableOpacity
            style={styles.proxyToggle}
            onPress={() => setUseProxyBidding(!useProxyBidding)}
          >
            <View style={[styles.checkbox, { borderColor: themeColors.border }, useProxyBidding && { backgroundColor: themeColors.accent, borderColor: themeColors.accent }]}>
              {useProxyBidding && <Feather name="check" size={14} color={colors.white} />}
            </View>
            <View style={styles.proxyInfo}>
              <Text style={[styles.proxyTitle, { color: themeColors.textPrimary }]}>Enable Proxy Bidding</Text>
              <Text style={[styles.proxyDescription, { color: themeColors.textMuted }]}>
                Set a maximum amount and we'll automatically bid for you up to that amount
              </Text>
            </View>
          </TouchableOpacity>

          {useProxyBidding && (
            <View style={[styles.maxBidContainer, { borderTopColor: themeColors.border }]}>
              <Text style={[styles.maxBidLabel, { color: themeColors.textPrimary }]}>Maximum Bid</Text>
              <View style={[styles.inputContainer, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}>
                <Text style={[styles.currencySymbol, { color: themeColors.textPrimary }]}>$</Text>
                <TextInput
                  style={[styles.bidInput, { color: themeColors.textPrimary }]}
                  value={maxBidAmount}
                  onChangeText={setMaxBidAmount}
                  keyboardType="numeric"
                  placeholder="Enter max amount"
                  placeholderTextColor={colors.textLight}
                />
              </View>
              <Text style={[styles.proxyHint, { color: themeColors.textMuted }]}>
                Your bid will start at {formatCurrency(bidAmountNum)} and automatically increase as needed up to your maximum.
              </Text>
            </View>
          )}
        </View>

        {/* Cost Breakdown */}
        <View style={[styles.costBreakdown, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Cost Breakdown</Text>

          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Your Bid</Text>
            <Text style={[styles.costValue, { color: themeColors.textPrimary }]}>
              {formatCurrency(bidAmountNum)}
            </Text>
          </View>

          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Buyer Premium (8%)</Text>
            <Text style={[styles.costValue, { color: themeColors.textPrimary }]}>
              {formatCurrency(buyerPremium)}
            </Text>
          </View>

          <View style={[styles.costRow, styles.totalRow, { borderTopColor: themeColors.border }]}>
            <Text style={[styles.totalLabel, { color: themeColors.textPrimary }]}>Total if You Win</Text>
            <Text style={[styles.totalValue, { color: themeColors.accent }]}>
              {formatCurrency(totalWithPremium)}
            </Text>
          </View>

          <Text style={styles.taxNote}>
            * Shipping and applicable taxes will be added after purchase
          </Text>
        </View>

        {/* Terms Notice */}
        <View style={styles.termsNotice}>
          <Feather name="info" size={16} color={themeColors.textMuted} />
          <Text style={[styles.termsText, { color: themeColors.textMuted }]}>
            By placing a bid, you agree to purchase this item if you're the winning bidder. All sales are final.
          </Text>
        </View>
      </ScrollView>

      {/* Place Bid Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
        <TouchableOpacity
          style={[styles.placeBidButton, { backgroundColor: themeColors.accent }, placeBidMutation.isPending && styles.buttonDisabled]}
          onPress={handlePlaceBid}
          disabled={placeBidMutation.isPending}
        >
          {placeBidMutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Feather name="trending-up" size={20} color={colors.white} />
              <Text style={styles.placeBidButtonText}>
                Place Bid - {formatCurrency(bidAmountNum)}
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
  priceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  priceLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  currentPrice: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  timeText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.warning,
  },
  reserveNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.warningLight,
    borderRadius: borderRadius.md,
  },
  reserveText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: fontWeight.medium,
  },
  yourBidStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  winningStatus: {
    backgroundColor: colors.successLight,
  },
  outbidStatus: {
    backgroundColor: colors.errorLight,
  },
  yourBidStatusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  bidSection: {
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
  minimumBidInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  minimumBidLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  minimumBidValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  incrementInfo: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sand,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    height: 56,
    borderWidth: 2,
    borderColor: colors.border,
  },
  currencySymbol: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  bidInput: {
    flex: 1,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  quickBidButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  quickBidButton: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.accentFaint,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accentMuted,
  },
  quickBidText: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: fontWeight.medium,
  },
  quickBidAmount: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  proxySection: {
    marginTop: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  proxyToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  proxyInfo: {
    flex: 1,
  },
  proxyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  proxyDescription: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  maxBidContainer: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  maxBidLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  proxyHint: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.md,
    lineHeight: 20,
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
  placeBidButton: {
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
  placeBidButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});
