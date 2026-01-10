import React, { useState, useEffect, useRef } from 'react';
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
  Modal,
  Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ListingWithDetails, Profile } from '../../types/database';
import { HomeStackParamList } from '../../navigation/types';
import { formatCurrency, formatTimeRemaining } from '../../utils/formatters';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';
import { API_URL, getBidIncrement, getMinNextBid } from '../../constants/config';

type Props = NativeStackScreenProps<HomeStackParamList, 'PlaceBid'>;

function getMinimumBid(currentBid: number | null, startingPrice: number | null): number {
  const base = currentBid || startingPrice || 0;
  return getMinNextBid(base);
}

export default function PlaceBidScreen({ route, navigation }: Props) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [maxBidAmount, setMaxBidAmount] = useState('');

  // Phone verification state
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'phone' | 'code' | 'success'>('phone');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState(['', '', '', '', '', '']);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [canResend, setCanResend] = useState(false);
  const codeInputRefs = useRef<(TextInput | null)[]>([]);

  // Seller terms state
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [sellerProfile, setSellerProfile] = useState<Profile | null>(null);

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
  const minimumBid = listing ? getMinimumBid(listing.current_price, listing.starting_price) : 0;
  const bidIncrement = listing ? getBidIncrement(listing.current_price || listing.starting_price || 0) : 0;

  // Check if user already has a bid
  const userCurrentMaxBid = listing?.my_bid?.max_bid || 0;
  const userHasExistingBid = userCurrentMaxBid > 0;
  const userIsWinning = listing?.my_bid?.status === 'winning';

  // The actual minimum the user must bid:
  // - If winning: must be higher than their current max bid
  // - If outbid or no bid: must be at least the minimum bid (current price + increment)
  // - Always ensure it's at least minimumBid to handle stale bid status data
  const requiredMinimum = userIsWinning
    ? Math.max(userCurrentMaxBid + getBidIncrement(userCurrentMaxBid), minimumBid)
    : minimumBid;

  // DEBUG: Log values to verify calculation
  console.log('BID DEBUG:', {
    currentPrice: listing?.current_price,
    minimumBid,
    userCurrentMaxBid,
    userIsWinning,
    userHasExistingBid,
    requiredMinimum,
    myBidStatus: listing?.my_bid?.status,
  });

  // Check if reserve is met
  const reserveMet = !listing?.reserve_price ||
    (listing.current_price && listing.current_price >= listing.reserve_price);

  // Don't pre-fill bid amount - let placeholder show the suggested amount
  // User can tap quick select buttons or type their own amount

  // Fetch seller profile for terms
  useEffect(() => {
    async function fetchSellerProfile() {
      if (!listing?.seller_id) return;

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', listing.seller_id)
        .single();

      if (data) {
        setSellerProfile(data as Profile);
      }
    }

    fetchSellerProfile();
  }, [listing?.seller_id]);

  // Real-time subscription for bid updates
  useEffect(() => {
    if (!listingId) return;

    const subscription = supabase
      .channel(`listing-bids-${listingId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bids',
          filter: `listing_id=eq.${listingId}`,
        },
        () => {
          // Refetch listing data when bids change
          queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'listings',
          filter: `id=eq.${listingId}`,
        },
        () => {
          // Refetch when listing updates (e.g., soft-close extension)
          queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [listingId, queryClient]);

  // Check if auction is in soft-close window (last 2 minutes)
  const isInSoftCloseWindow = listing?.end_time
    ? new Date(listing.end_time).getTime() - Date.now() < 2 * 60 * 1000 && new Date(listing.end_time).getTime() > Date.now()
    : false;

  // Initialize phone from profile
  useEffect(() => {
    if (profile?.phone && !profile.phone_verified) {
      const cleaned = profile.phone.replace(/\D/g, '').replace(/^1/, '');
      if (cleaned.length === 10) {
        setPhone(formatPhoneInput(cleaned));
      }
    }
  }, [profile]);

  // Get effective seller terms (listing-specific or seller default)
  const effectiveSellerTerms = listing?.seller_terms || sellerProfile?.seller_terms;

  // Format phone number as user types
  const formatPhoneInput = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    let formatted = '';

    if (cleaned.length > 0) {
      formatted = '(' + cleaned.substring(0, 3);
    }
    if (cleaned.length >= 3) {
      formatted += ') ' + cleaned.substring(3, 6);
    }
    if (cleaned.length >= 6) {
      formatted += '-' + cleaned.substring(6, 10);
    }

    return formatted;
  };

  const handlePhoneChange = (text: string) => {
    const formatted = formatPhoneInput(text);
    setPhone(formatted);
    setPhoneError('');
  };

  const sendVerificationCode = async () => {
    if (!user) return;

    const cleanedPhone = phone.replace(/\D/g, '');
    if (cleanedPhone.length < 10) {
      setPhoneError('Please enter a valid 10-digit phone number');
      return;
    }

    mediumTap();
    setPhoneLoading(true);
    setPhoneError('');

    try {
      const response = await fetch(`${API_URL}/verification/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, userId: user.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPhoneError(data.error || 'Failed to send verification code');
        errorFeedback();
        return;
      }

      setCanResend(false);
      setPhoneStep('code');
      setVerificationCode(['', '', '', '', '', '']);
      successFeedback();

      // Allow resend after 30 seconds
      setTimeout(() => setCanResend(true), 30000);

      // Focus first code input
      setTimeout(() => {
        codeInputRefs.current[0]?.focus();
      }, 100);
    } catch (err) {
      setPhoneError('An error occurred. Please try again.');
      errorFeedback();
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleCodeInput = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').split('').slice(0, 6);
      const newCode = [...verificationCode];
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newCode[index + i] = digit;
        }
      });
      setVerificationCode(newCode);

      const nextIndex = Math.min(index + digits.length, 5);
      codeInputRefs.current[nextIndex]?.focus();

      if (newCode.every(d => d !== '')) {
        verifyPhoneCode(newCode.join(''));
      }
      return;
    }

    const newCode = [...verificationCode];
    newCode[index] = value.replace(/\D/g, '');
    setVerificationCode(newCode);
    setPhoneError('');

    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    if (value && index === 5 && newCode.every(d => d !== '')) {
      verifyPhoneCode(newCode.join(''));
    }
  };

  const handleCodeKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !verificationCode[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const verifyPhoneCode = async (codeString?: string) => {
    if (!user) return;

    const code = codeString || verificationCode.join('');

    if (code.length !== 6) {
      setPhoneError('Please enter all 6 digits');
      return;
    }

    mediumTap();
    setPhoneLoading(true);
    setPhoneError('');

    try {
      const response = await fetch(`${API_URL}/verification/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, userId: user.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPhoneError(data.error || 'Invalid verification code');
        errorFeedback();
        return;
      }

      successFeedback();
      setPhoneStep('success');
      await refreshProfile();

      // Close modal after brief delay and continue to terms or bid
      setTimeout(() => {
        setShowPhoneModal(false);
        setPhoneStep('phone');

        // Check if terms need to be accepted
        if (effectiveSellerTerms && !termsAccepted) {
          setShowTermsModal(true);
        } else {
          // Place the bid
          placeBidMutation.mutate();
        }
      }, 1500);
    } catch (err) {
      setPhoneError('An error occurred. Please try again.');
      errorFeedback();
    } finally {
      setPhoneLoading(false);
    }
  };

  // Bid response type from API
  type BidResponse = {
    success: boolean;
    message: string;
    bid?: {
      id: string;
      amount: number;
      maxBid: number;
    };
    currentPrice: number;
    bidCount: number;
    wasOutbid?: boolean;
    reserveMet?: boolean;
    auctionExtended?: boolean;
    newEndTime?: string;
  };

  // Place bid mutation - uses Supabase RPC for proper proxy bidding
  const placeBidMutation = useMutation({
    mutationFn: async (): Promise<BidResponse> => {
      if (!user) throw new Error('Not authenticated');

      const maxBid = parseFloat(maxBidAmount);

      if (isNaN(maxBid) || maxBid < minimumBid) {
        throw new Error(`Minimum bid is ${formatCurrency(minimumBid)}`);
      }

      // Ensure bidder profile exists (foreign key requirement)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        // Create profile if it doesn't exist using upsert
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

      // Get a fresh session for API authentication
      // First try to refresh the session to ensure we have a valid token
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

      let accessToken: string;
      if (refreshError || !refreshData.session) {
        // If refresh fails, try to get existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Your session has expired. Please sign out and sign in again.');
        }
        accessToken = session.access_token;
      } else {
        accessToken = refreshData.session.access_token;
      }

      // Call web API for proper proxy bidding logic
      // The API handles all the complex proxy bid calculations
      console.log('Placing bid with token length:', accessToken.length, 'prefix:', accessToken.substring(0, 20));
      const response = await fetch(`${API_URL}/bids/place`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          listingId,
          maxBid,
        }),
      });

      const data = await response.json();
      console.log('Bid API response:', response.status, JSON.stringify(data, null, 2));

      if (!response.ok) {
        // Include debug info in error message for troubleshooting
        const debugInfo = data.tokenError
          ? ` (Token error: ${data.tokenError}, hasAuth: ${data.hasAuthHeader}, tokenLen: ${data.tokenLength})`
          : '';
        throw new Error((data.error || data.message || 'Failed to place bid') + debugInfo);
      }

      // Auto-add to watchlist when bidding (silently ignore errors)
      try {
        await supabase
          .from('watchlist')
          .upsert({
            user_id: user.id,
            listing_id: listingId,
          }, { onConflict: 'user_id,listing_id' });
      } catch {
        // Silently ignore watchlist errors
      }

      return {
        success: true,
        message: data.message || 'Bid placed successfully',
        bid: data.bid,
        currentPrice: data.currentPrice,
        bidCount: data.bidCount,
        wasOutbid: data.wasOutbid,
        reserveMet: data.reserveMet,
        auctionExtended: data.auctionExtended,
        newEndTime: data.newEndTime,
      };
    },
    onSuccess: (data) => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['my-bids'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });

      const maxBid = parseFloat(maxBidAmount);

      // Build appropriate success message based on response
      let message = '';

      if (data.wasOutbid) {
        // User was immediately outbid by another proxy bidder
        message = `Your maximum bid of ${formatCurrency(maxBid)} was placed, but you've been outbid. The current price is ${formatCurrency(data.currentPrice)}.`;
      } else {
        message = `Your maximum bid of ${formatCurrency(maxBid)} has been placed! The system will automatically bid for you up to this amount.`;
      }

      // Add reserve status info
      if (data.reserveMet === true) {
        message += ' The reserve price has been met!';
      } else if (data.reserveMet === false) {
        message += ' Note: The reserve price has not yet been met.';
      }

      // Add soft-close extension info
      if (data.auctionExtended && data.newEndTime) {
        const newEnd = new Date(data.newEndTime);
        message += ` The auction has been extended to ${newEnd.toLocaleTimeString()}.`;
      }

      Alert.alert(
        data.wasOutbid ? 'Outbid' : 'Bid Placed!',
        message,
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

    const maxBid = parseFloat(maxBidAmount);
    if (isNaN(maxBid) || maxBid < minimumBid) {
      errorFeedback();
      Alert.alert('Invalid Bid', `Minimum bid is ${formatCurrency(minimumBid)}`);
      return;
    }

    // Check phone verification first
    if (!profile?.phone_verified) {
      setShowPhoneModal(true);
      return;
    }

    // Check seller terms acceptance (only for first bid on this listing)
    // If user already has a bid, they've already accepted the terms
    if (effectiveSellerTerms && !termsAccepted && !listing?.my_bid) {
      setShowTermsModal(true);
      return;
    }

    placeBidMutation.mutate();
  };

  const handleTermsAcceptAndBid = () => {
    if (!termsAccepted) {
      errorFeedback();
      return;
    }
    setShowTermsModal(false);
    placeBidMutation.mutate();
  };

  const handleQuickBid = (increment: number) => {
    // Only increase from existing max bid if user is winning; otherwise use minimum
    const baseAmount = (userHasExistingBid && userIsWinning) ? userCurrentMaxBid : minimumBid;
    const incrementAmount = getBidIncrement(baseAmount);
    const newAmount = baseAmount + increment * incrementAmount;
    setMaxBidAmount(newAmount.toString());
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

  const currentPrice = listing.current_price || listing.starting_price || 0;
  const hasReserve = listing.reserve_price && (!listing.current_price || listing.current_price < listing.reserve_price);
  const maxBidNum = parseFloat(maxBidAmount) || 0;
  const buyerPremium = maxBidNum * 0.08;
  const totalWithPremium = maxBidNum + buyerPremium;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity
          style={styles.closeIcon}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Close"
          accessibilityRole="button"
        >
          <Feather name="x" size={24} color={themeColors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]} accessibilityRole="header">Place Bid</Text>
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
                {listing.current_price ? 'Current Bid' : 'Starting Price'}
              </Text>
              <Text style={[styles.currentPrice, { color: themeColors.accent }]}>{formatCurrency(currentPrice)}</Text>
            </View>

            {listing.end_time && (
              <View style={[styles.timeInfo, { backgroundColor: colors.warningLight }]}>
                <Feather name="clock" size={14} color={colors.warning} />
                <Text style={[styles.timeText, { color: colors.warning }]}>{formatTimeRemaining(listing.end_time)}</Text>
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

          {/* Soft-Close Warning */}
          {isInSoftCloseWindow && (
            <View style={[styles.softCloseNotice, { backgroundColor: colors.errorLight }]}>
              <Feather name="alert-triangle" size={14} color={colors.error} />
              <Text style={[styles.softCloseText, { color: colors.error }]}>
                Soft-close active: Bids placed now will extend the auction by 2 minutes
              </Text>
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

        {/* Bid Section */}
        <View style={[styles.bidSection, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
            {hasReserve
              ? 'Your Bid'
              : (userHasExistingBid ? 'Increase Your Maximum Bid' : 'Your Maximum Bid')
            }
          </Text>

          {/* Show current max bid only if reserve is met and user has one */}
          {!hasReserve && userHasExistingBid && (
            <View style={[styles.currentMaxBidInfo, { backgroundColor: themeColors.accentFaint }]}>
              <Feather name="info" size={16} color={themeColors.accent} />
              <Text style={[styles.currentMaxBidText, { color: themeColors.accent }]}>
                Your current max bid: {formatCurrency(userCurrentMaxBid)}
              </Text>
            </View>
          )}

          <View style={styles.minimumBidInfo}>
            <Text style={[styles.minimumBidLabel, { color: themeColors.textMuted }]}>
              {!hasReserve && userIsWinning ? 'Must be higher than:' : 'Minimum:'}
            </Text>
            <Text style={[styles.minimumBidValue, { color: themeColors.accent }]}>
              {formatCurrency(!hasReserve && userIsWinning ? userCurrentMaxBid : minimumBid)}
            </Text>
          </View>

          <View style={[styles.inputContainer, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}>
            <Text style={[styles.currencySymbol, { color: themeColors.textPrimary }]}>$</Text>
            <TextInput
              style={[styles.bidInput, { color: themeColors.textPrimary }]}
              value={maxBidAmount ? parseInt(maxBidAmount.replace(/,/g, '') || '0').toLocaleString() : ''}
              onChangeText={(text) => {
                // Remove commas and non-numeric characters, store raw number
                const rawNumber = text.replace(/[^0-9]/g, '');
                setMaxBidAmount(rawNumber);
              }}
              keyboardType="numeric"
              placeholder={requiredMinimum.toLocaleString()}
              placeholderTextColor={themeColors.textLight}
            />
          </View>

          <Text style={[styles.proxyHint, { color: themeColors.textMuted, marginTop: spacing.md }]}>
            {hasReserve
              ? 'Your bid amount will be shown publicly. Proxy bidding activates once the reserve is met.'
              : (userIsWinning
                ? 'Enter a higher amount to increase your maximum bid. You\'ll only pay what\'s needed to stay ahead.'
                : 'The system will automatically bid for you up to this amount. You\'ll only pay what\'s needed to stay ahead.'
              )
            }
          </Text>

          {/* Quick Bid Buttons */}
          <Text style={[styles.quickBidLabel, { color: themeColors.textMuted }]}>
            {userHasExistingBid && userIsWinning ? 'Increase max bid by:' : 'Quick select:'}
          </Text>
          <View style={styles.quickBidButtons}>
            {userHasExistingBid && userIsWinning ? (
              <>
                {/* When user has existing bid, show increase options from their current max */}
                <TouchableOpacity
                  style={[styles.quickBidButton, { backgroundColor: themeColors.accentFaint, borderColor: themeColors.accent }]}
                  onPress={() => handleQuickBid(1)}
                >
                  <Text style={[styles.quickBidText, { color: themeColors.accent }]}>+{formatCurrency(getBidIncrement(userCurrentMaxBid))}</Text>
                  <Text style={[styles.quickBidAmount, { color: themeColors.textPrimary }]}>
                    {formatCurrency(userCurrentMaxBid + getBidIncrement(userCurrentMaxBid))}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBidButton, { backgroundColor: themeColors.accentFaint, borderColor: themeColors.accent }]}
                  onPress={() => handleQuickBid(5)}
                >
                  <Text style={[styles.quickBidText, { color: themeColors.accent }]}>+{formatCurrency(getBidIncrement(userCurrentMaxBid) * 5)}</Text>
                  <Text style={[styles.quickBidAmount, { color: themeColors.textPrimary }]}>
                    {formatCurrency(userCurrentMaxBid + getBidIncrement(userCurrentMaxBid) * 5)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBidButton, { backgroundColor: themeColors.accentFaint, borderColor: themeColors.accent }]}
                  onPress={() => handleQuickBid(10)}
                >
                  <Text style={[styles.quickBidText, { color: themeColors.accent }]}>+{formatCurrency(getBidIncrement(userCurrentMaxBid) * 10)}</Text>
                  <Text style={[styles.quickBidAmount, { color: themeColors.textPrimary }]}>
                    {formatCurrency(userCurrentMaxBid + getBidIncrement(userCurrentMaxBid) * 10)}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* When no existing bid, show minimum and increments from minimum */}
                <TouchableOpacity
                  style={[styles.quickBidButton, { backgroundColor: themeColors.accentFaint, borderColor: themeColors.accent }]}
                  onPress={() => setMaxBidAmount(minimumBid.toString())}
                >
                  <Text style={[styles.quickBidText, { color: themeColors.accent }]}>Minimum</Text>
                  <Text style={[styles.quickBidAmount, { color: themeColors.textPrimary }]}>
                    {formatCurrency(minimumBid)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBidButton, { backgroundColor: themeColors.accentFaint, borderColor: themeColors.accent }]}
                  onPress={() => handleQuickBid(1)}
                >
                  <Text style={[styles.quickBidText, { color: themeColors.accent }]}>+{formatCurrency(bidIncrement)}</Text>
                  <Text style={[styles.quickBidAmount, { color: themeColors.textPrimary }]}>
                    {formatCurrency(minimumBid + bidIncrement)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.quickBidButton, { backgroundColor: themeColors.accentFaint, borderColor: themeColors.accent }]}
                  onPress={() => handleQuickBid(5)}
                >
                  <Text style={[styles.quickBidText, { color: themeColors.accent }]}>+{formatCurrency(bidIncrement * 5)}</Text>
                  <Text style={[styles.quickBidAmount, { color: themeColors.textPrimary }]}>
                    {formatCurrency(minimumBid + 5 * bidIncrement)}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Cost Breakdown */}
        <View style={[styles.costBreakdown, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Maximum Cost</Text>

          <View style={[styles.costRow, { borderBottomColor: themeColors.borderLight }]}>
            <Text style={[styles.costLabel, { color: themeColors.textSecondary }]}>Your Max Bid</Text>
            <Text style={[styles.costValue, { color: themeColors.textPrimary }]}>
              {formatCurrency(maxBidNum)}
            </Text>
          </View>

          <View style={[styles.costRow, { borderBottomColor: themeColors.borderLight }]}>
            <Text style={[styles.costLabel, { color: themeColors.textSecondary }]}>Buyer Premium (8%)</Text>
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

          <Text style={[styles.taxNote, { color: themeColors.textMuted }]}>
            * Shipping and applicable taxes will be added after purchase
          </Text>
        </View>

        {/* Terms Notice */}
        <View style={[styles.termsNotice, { backgroundColor: themeColors.sand }]}>
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
                {hasReserve
                  ? `Place Bid: ${formatCurrency(maxBidNum)}`
                  : (userHasExistingBid
                    ? `Increase Max Bid to ${formatCurrency(maxBidNum)}`
                    : `Place Bid (Max: ${formatCurrency(maxBidNum)})`
                  )
                }
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Phone Verification Modal */}
      <Modal
        visible={showPhoneModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPhoneModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <TouchableOpacity
              onPress={() => setShowPhoneModal(false)}
              style={styles.modalCloseButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Feather name="x" size={24} color={themeColors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]} accessibilityRole="header">Verify Phone Number</Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentContainer}>
            {/* Icon Header */}
            <View style={styles.modalIconContainer}>
              <View style={[styles.modalIconBg, { backgroundColor: themeColors.accentFaint }]}>
                <Feather
                  name={phoneStep === 'success' ? 'check-circle' : 'smartphone'}
                  size={32}
                  color={phoneStep === 'success' ? colors.success : themeColors.accent}
                />
              </View>
              <Text style={[styles.modalSubtitle, { color: themeColors.textMuted }]}>
                {phoneStep === 'success'
                  ? 'Phone verified successfully!'
                  : 'Phone verification is required to place bids'}
              </Text>
            </View>

            {/* Error Display */}
            {phoneError ? (
              <View style={[styles.modalError, { backgroundColor: colors.errorLight }]}>
                <Feather name="alert-circle" size={18} color={colors.error} />
                <Text style={[styles.modalErrorText, { color: colors.error }]}>{phoneError}</Text>
              </View>
            ) : null}

            {/* Phone Input Step */}
            {phoneStep === 'phone' && (
              <>
                <View style={[styles.modalCard, { backgroundColor: themeColors.surface }]}>
                  <Text style={[styles.modalInputLabel, { color: themeColors.textMuted }]}>Phone Number</Text>
                  <TextInput
                    style={[styles.modalPhoneInput, { color: themeColors.textPrimary, borderColor: themeColors.border }]}
                    value={phone}
                    onChangeText={handlePhoneChange}
                    placeholder="(555) 123-4567"
                    placeholderTextColor={themeColors.textLight}
                    keyboardType="phone-pad"
                    maxLength={14}
                    editable={!phoneLoading}
                  />
                </View>

                {/* SMS Consent */}
                <View style={[styles.modalConsentCard, { backgroundColor: themeColors.accentFaint, borderColor: themeColors.accent }]}>
                  <Text style={[styles.modalConsentTitle, { color: themeColors.accent }]}>SMS Messaging Consent</Text>
                  <Text style={[styles.modalConsentText, { color: themeColors.textSecondary }]}>
                    By tapping "Send Code" I consent to receive SMS text messages from PrintMailBids.com including verification codes and transaction alerts. Message and data rates may apply. Reply STOP to opt out.
                  </Text>
                  <Text style={[styles.modalConsentLinks, { color: themeColors.textMuted }]}>
                    View our{' '}
                    <Text style={{ color: themeColors.accent }} onPress={() => Linking.openURL('https://printmailbids.com/sms-terms')}>
                      SMS Terms
                    </Text>
                    {' '}and{' '}
                    <Text style={{ color: themeColors.accent }} onPress={() => Linking.openURL('https://printmailbids.com/privacy')}>
                      Privacy Policy
                    </Text>
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    { backgroundColor: phone.replace(/\D/g, '').length >= 10 ? themeColors.accent : themeColors.textLight },
                  ]}
                  onPress={sendVerificationCode}
                  disabled={phoneLoading || phone.replace(/\D/g, '').length < 10}
                >
                  {phoneLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="send" size={18} color="#ffffff" />
                      <Text style={styles.modalButtonText}>Send Verification Code</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Code Entry Step */}
            {phoneStep === 'code' && (
              <>
                <View style={[styles.modalCard, { backgroundColor: themeColors.surface }]}>
                  <Text style={[styles.modalCodeInstructions, { color: themeColors.textSecondary }]}>
                    Enter the 6-digit code sent to your phone
                  </Text>
                  <View style={styles.modalCodeInputRow}>
                    {verificationCode.map((digit, index) => (
                      <TextInput
                        key={index}
                        ref={(el) => { codeInputRefs.current[index] = el; }}
                        style={[
                          styles.modalCodeInput,
                          {
                            color: themeColors.textPrimary,
                            borderColor: digit ? themeColors.accent : themeColors.border,
                            backgroundColor: isDark ? themeColors.background : '#ffffff',
                          },
                        ]}
                        value={digit}
                        onChangeText={(value) => handleCodeInput(index, value)}
                        onKeyPress={({ nativeEvent }) => handleCodeKeyPress(index, nativeEvent.key)}
                        keyboardType="number-pad"
                        maxLength={6}
                        editable={!phoneLoading}
                        selectTextOnFocus
                      />
                    ))}
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    { backgroundColor: verificationCode.every(d => d) ? themeColors.accent : themeColors.textLight },
                  ]}
                  onPress={() => verifyPhoneCode()}
                  disabled={phoneLoading || verificationCode.some(d => !d)}
                >
                  {phoneLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="check" size={18} color="#ffffff" />
                      <Text style={styles.modalButtonText}>Verify Code</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={styles.modalCodeActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setPhoneStep('phone');
                      setVerificationCode(['', '', '', '', '', '']);
                      setPhoneError('');
                    }}
                  >
                    <Text style={[styles.modalLinkText, { color: themeColors.textMuted }]}>Change number</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={sendVerificationCode}
                    disabled={!canResend || phoneLoading}
                  >
                    <Text style={[styles.modalLinkText, { color: canResend ? themeColors.accent : themeColors.textLight }]}>
                      {canResend ? 'Resend code' : 'Resend in 30s'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Success Step */}
            {phoneStep === 'success' && (
              <View style={[styles.modalSuccessCard, { backgroundColor: colors.successLight }]}>
                <Feather name="check-circle" size={48} color={colors.success} />
                <Text style={[styles.modalSuccessText, { color: colors.success }]}>
                  Phone verified! Continuing to place your bid...
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Seller Terms Modal */}
      <Modal
        visible={showTermsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTermsModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
            <TouchableOpacity
              onPress={() => setShowTermsModal(false)}
              style={styles.modalCloseButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Close"
              accessibilityRole="button"
            >
              <Feather name="x" size={24} color={themeColors.textPrimary} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]} accessibilityRole="header">Seller Terms & Conditions</Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalContentContainer}>
            {/* Icon Header */}
            <View style={styles.modalIconContainer}>
              <View style={[styles.modalIconBg, { backgroundColor: themeColors.accentFaint }]}>
                <Feather name="file-text" size={32} color={themeColors.accent} />
              </View>
              <Text style={[styles.modalSubtitle, { color: themeColors.textMuted }]}>
                Please review and accept the seller's terms before bidding
              </Text>
            </View>

            {/* Terms Content */}
            <View style={[styles.modalTermsCard, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
              <Text style={[styles.modalTermsText, { color: themeColors.textPrimary }]}>
                {effectiveSellerTerms}
              </Text>
            </View>

            {/* Checkbox */}
            <TouchableOpacity
              style={styles.modalCheckboxRow}
              onPress={() => setTermsAccepted(!termsAccepted)}
            >
              <View
                style={[
                  styles.modalCheckbox,
                  { borderColor: themeColors.border },
                  termsAccepted && { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
                ]}
              >
                {termsAccepted && <Feather name="check" size={14} color={colors.white} />}
              </View>
              <Text style={[styles.modalCheckboxText, { color: themeColors.textSecondary }]}>
                I have read and agree to the seller's terms and conditions for this listing
              </Text>
            </TouchableOpacity>

            {/* Accept Button */}
            <TouchableOpacity
              style={[
                styles.modalButton,
                { backgroundColor: termsAccepted ? themeColors.accent : themeColors.textLight },
              ]}
              onPress={handleTermsAcceptAndBid}
              disabled={!termsAccepted}
            >
              <Feather name="check" size={18} color="#ffffff" />
              <Text style={styles.modalButtonText}>Accept & Place Bid</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
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
    width: 44,
    height: 44,
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
  softCloseNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  softCloseText: {
    flex: 1,
    fontSize: fontSize.sm,
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
  currentMaxBidInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  currentMaxBidText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    flex: 1,
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
  quickBidLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  quickBidButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickBidButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
  },
  quickBidText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  quickBidAmount: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
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
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  modalContent: {
    flex: 1,
  },
  modalContentContainer: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  modalIconContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  modalIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalSubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  modalError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  modalErrorText: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  modalCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  modalInputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  modalPhoneInput: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    textAlign: 'center',
    letterSpacing: 1,
  },
  modalConsentCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  modalConsentTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  modalConsentText: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  modalConsentLinks: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  modalCodeInstructions: {
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  modalCodeInputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  modalCodeInput: {
    width: 44,
    height: 56,
    borderWidth: 2,
    borderRadius: borderRadius.lg,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  modalCodeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  modalLinkText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    padding: spacing.sm,
  },
  modalSuccessCard: {
    alignItems: 'center',
    padding: spacing['2xl'],
    borderRadius: borderRadius.xl,
    gap: spacing.md,
  },
  modalSuccessText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
  },
  modalTermsCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
    maxHeight: 300,
  },
  modalTermsText: {
    fontSize: fontSize.sm,
    lineHeight: 22,
  },
  modalCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  modalCheckbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.sm,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  modalCheckboxText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
