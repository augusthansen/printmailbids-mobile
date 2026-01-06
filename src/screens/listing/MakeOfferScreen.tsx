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
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ListingWithImages } from '../../types/database';
import { HomeStackParamList } from '../../navigation/types';
import { formatCurrency } from '../../utils/formatters';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';

type Props = NativeStackScreenProps<HomeStackParamList, 'MakeOffer'>;

export default function MakeOfferScreen({ route, navigation }: Props) {
  const { listingId, parentOfferId, suggestedAmount } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const isCounterOffer = !!parentOfferId;
  const [offerAmount, setOfferAmount] = useState(suggestedAmount ? suggestedAmount.toString() : '');
  const [message, setMessage] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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

  // Fetch parent offer details (for counter offers)
  const { data: parentOffer } = useQuery({
    queryKey: ['offer', parentOfferId],
    queryFn: async () => {
      if (!parentOfferId) return null;
      const { data, error } = await supabase
        .from('offers')
        .select(`
          id,
          amount,
          message,
          created_at,
          buyer:profiles!buyer_id(id, full_name, email),
          seller:profiles!seller_id(id, full_name, email)
        `)
        .eq('id', parentOfferId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!parentOfferId,
  });

  // Fetch user's offer count for this listing (to enforce 4 offer limit per party)
  const { data: userOfferCount } = useQuery({
    queryKey: ['userOfferCount', listingId, user?.id],
    queryFn: async () => {
      if (!user || !listing) return 0;

      // Get all offers in this listing's offer chain
      const { data: allOffers, error } = await supabase
        .from('offers')
        .select('id, buyer_id, seller_id, parent_offer_id')
        .eq('listing_id', listingId);

      if (error) {
        return 0;
      }

      // Count offers made by current user
      // For buyer: count offers where they are buyer_id AND (no parent OR parent was made by seller)
      // For seller: count offers where parent_offer_id exists (counter offers)
      const isSeller = user.id === listing.seller_id;

      let count = 0;
      for (const offer of allOffers || []) {
        if (isSeller) {
          // Seller's offers are counters (have parent_offer_id) where seller_id = user
          if (offer.parent_offer_id && offer.seller_id === user.id) {
            // Need to check if this was actually made by seller (odd position in chain)
            // For simplicity, count all counter offers in the chain where user is seller
            // and check alternation
            let depth = 0;
            let currentOffer = offer;
            while (currentOffer.parent_offer_id) {
              depth++;
              currentOffer = allOffers?.find(o => o.id === currentOffer.parent_offer_id) || currentOffer;
              if (!currentOffer.parent_offer_id) break;
            }
            // Odd depth = seller's counter (1st counter, 3rd counter, etc.)
            if (depth % 2 === 1) count++;
          }
        } else {
          // Buyer's offers: original offers (no parent) or even-depth counters
          if (!offer.parent_offer_id && offer.buyer_id === user.id) {
            // Original offer by buyer
            count++;
          } else if (offer.parent_offer_id && offer.buyer_id === user.id) {
            // Counter by buyer - check depth
            let depth = 0;
            let currentOffer = offer;
            while (currentOffer.parent_offer_id) {
              depth++;
              currentOffer = allOffers?.find(o => o.id === currentOffer.parent_offer_id) || currentOffer;
              if (!currentOffer.parent_offer_id) break;
            }
            // Even depth = buyer's counter (2nd counter, 4th counter, etc.)
            if (depth % 2 === 0) count++;
          }
        }
      }

      return count;
    },
    enabled: !!user && !!listing,
  });

  // Web app uses 3 offers per buyer per listing + 3 counter rounds
  const MAX_OFFERS_PER_BUYER = 3;
  const MAX_COUNTER_OFFERS = 3;
  const isSeller = user?.id === listing?.seller_id;

  // Buyers limited to 3 original offers, sellers limited to 3 counters
  const maxAllowed = isSeller ? MAX_COUNTER_OFFERS : MAX_OFFERS_PER_BUYER;
  const hasReachedOfferLimit = (userOfferCount || 0) >= maxAllowed;

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

      // Ensure buyer profile exists (foreign key requirement)
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id, email')
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

      // Calculate expiration (48 hours from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      // For all offers, buyer_id and seller_id stay the same as the listing relationship
      // buyer_id = the person buying (original offer maker or their side)
      // seller_id = the listing owner
      const offerBuyerId = isCounterOffer
        ? (parentOffer?.buyer as any)?.id  // Keep original buyer for the entire offer chain
        : user.id;
      const offerSellerId = listing.seller_id;

      // Determine who is making this counter offer (for notification purposes)
      const currentUserIsSeller = user.id === listing.seller_id;

      const { data, error } = await supabase
        .from('offers')
        .insert({
          listing_id: listingId,
          buyer_id: offerBuyerId,
          seller_id: offerSellerId,
          amount: amount,
          message: message.trim() || null,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
          ...(parentOfferId && { parent_offer_id: parentOfferId }),
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // If this is a counter offer, update the parent offer status to 'countered'
      if (isCounterOffer && parentOfferId) {
        const { error: updateError } = await supabase
          .from('offers')
          .update({ status: 'countered', responded_at: new Date().toISOString() })
          .eq('id', parentOfferId);

        if (updateError) {
          // Don't throw - the counter offer was still created
        }
      }

      // Create notification for the other party
      // For counter offers: notify whoever DIDN'T make the counter (the other party)
      // For new offers: notify the seller
      let notifyUserId: string;
      let notifBody: string;

      if (isCounterOffer) {
        // Counter offer: notify the OTHER party
        if (currentUserIsSeller) {
          // Seller is countering → notify the buyer
          notifyUserId = (parentOffer?.buyer as any)?.id;
          notifBody = `The seller countered with ${formatCurrency(amount)} on "${listing.title}"`;
        } else {
          // Buyer is countering → notify the seller
          notifyUserId = listing.seller_id;
          notifBody = `The buyer countered with ${formatCurrency(amount)} on "${listing.title}"`;
        }
      } else {
        // New offer: notify the seller
        notifyUserId = listing.seller_id;
        notifBody = `You received an offer of ${formatCurrency(amount)} on "${listing.title}"`;
      }

      const notifType = isCounterOffer ? 'offer_countered' : 'new_offer';
      const notifTitle = isCounterOffer
        ? `Counter offer: ${formatCurrency(amount)}`
        : `New offer: ${formatCurrency(amount)}`;

      await supabase.from('notifications').insert({
        user_id: notifyUserId,
        type: notifType,
        title: notifTitle,
        body: notifBody,
        listing_id: listingId,
        offer_id: data.id,
      });

      return data;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['my-offers'] });
      queryClient.invalidateQueries({ queryKey: ['myOffers'] });
      queryClient.invalidateQueries({ queryKey: ['sellerStats'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['recentActivity'] });
      queryClient.invalidateQueries({ queryKey: ['offer', parentOfferId] });

      const title = isCounterOffer ? 'Counter Offer Sent!' : 'Offer Sent!';
      const message = isCounterOffer
        ? `Your counter offer of ${formatCurrency(parseFloat(offerAmount))} has been sent to the buyer. They have 48 hours to respond.`
        : `Your offer of ${formatCurrency(parseFloat(offerAmount))} has been sent to the seller. They have 48 hours to respond.`;

      Alert.alert(title, message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
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

    // Show confirmation modal with terms
    setShowConfirmModal(true);
  };

  const handleConfirmOffer = () => {
    // Terms only required for buyers, not sellers making counter offers
    if (!isSeller && !termsAccepted) {
      errorFeedback();
      Alert.alert('Terms Required', 'You must agree that this is a binding offer before submitting.');
      return;
    }
    setShowConfirmModal(false);
    makeOfferMutation.mutate();
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

  // Show limit reached screen
  if (hasReachedOfferLimit) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm, backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity style={styles.closeIcon} onPress={() => navigation.goBack()}>
            <Feather name="x" size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
            {isCounterOffer ? 'Counter Offer' : 'Make an Offer'}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.limitReachedContainer}>
          <View style={[styles.limitReachedIcon, { backgroundColor: colors.errorLight }]}>
            <Feather name="alert-octagon" size={48} color={colors.error} />
          </View>
          <Text style={[styles.limitReachedTitle, { color: themeColors.textPrimary }]}>
            Offer Limit Reached
          </Text>
          <Text style={[styles.limitReachedText, { color: themeColors.textMuted }]}>
            You have reached the maximum of {maxAllowed} {isSeller ? 'counter-offers' : 'offers'} on this listing.
            {isSeller ? ' No additional counter-offers can be made.' : ' No additional offers can be made.'}
          </Text>
          <View style={[styles.limitReachedInfo, { backgroundColor: isDark ? themeColors.sand : colors.sand }]}>
            <Feather name="info" size={16} color={themeColors.textMuted} />
            <Text style={[styles.limitReachedInfoText, { color: themeColors.textMuted }]}>
              Wait for the other party to respond to your pending offer, or consider the current terms.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.limitReachedButton, { backgroundColor: themeColors.accent }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.limitReachedButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
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
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <TouchableOpacity style={styles.closeIcon} onPress={() => navigation.goBack()}>
          <Feather name="x" size={24} color={themeColors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>
          {isCounterOffer ? 'Counter Offer' : 'Make an Offer'}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Parent Offer (for counter offers) - show who made the offer being countered */}
        {isCounterOffer && parentOffer && (
          <View style={[styles.originalOfferSection, { backgroundColor: themeColors.accentFaint, borderColor: themeColors.accent }]}>
            <View style={styles.originalOfferHeader}>
              <Feather name="repeat" size={18} color={themeColors.accent} />
              <Text style={[styles.originalOfferTitle, { color: themeColors.accent }]}>
                {user?.id === listing.seller_id ? 'Buyer\'s Offer' : 'Seller\'s Counter'}
              </Text>
            </View>
            <View style={styles.originalOfferDetails}>
              <View style={styles.originalOfferRow}>
                <Text style={[styles.originalOfferLabel, { color: themeColors.textSecondary }]}>From</Text>
                <Text style={[styles.originalOfferValue, { color: themeColors.textPrimary }]}>
                  {user?.id === listing.seller_id
                    ? ((parentOffer.buyer as any)?.full_name || (parentOffer.buyer as any)?.email || 'Buyer')
                    : ((parentOffer.seller as any)?.full_name || (parentOffer.seller as any)?.email || 'Seller')
                  }
                </Text>
              </View>
              <View style={styles.originalOfferRow}>
                <Text style={[styles.originalOfferLabel, { color: themeColors.textSecondary }]}>Amount</Text>
                <Text style={[styles.originalOfferAmount, { color: themeColors.primary }]}>
                  {formatCurrency(parentOffer.amount)}
                </Text>
              </View>
              {parentOffer.message && (
                <View style={[styles.originalOfferMessageContainer, { backgroundColor: themeColors.surface }]}>
                  <Text style={[styles.originalOfferMessageLabel, { color: themeColors.textMuted }]}>Their message:</Text>
                  <Text style={[styles.originalOfferMessage, { color: themeColors.textSecondary }]}>
                    "{parentOffer.message}"
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Listing Summary */}
        <View style={[styles.listingSummary, { backgroundColor: themeColors.surface, marginTop: isCounterOffer && parentOffer ? spacing.lg : 0 }]}>
          <Text style={[styles.listingTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>{listing.title}</Text>

          <View style={styles.askingPriceRow}>
            <Text style={[styles.askingPriceLabel, { color: themeColors.textMuted }]}>Listed Price</Text>
            <Text style={[styles.askingPrice, { color: themeColors.primary }]}>{formatCurrency(listingPrice)}</Text>
          </View>

          {listing.auto_accept_price && (
            <View style={[styles.autoAcceptNotice, { backgroundColor: isDark ? 'rgba(34, 197, 94, 0.15)' : colors.successLight }]}>
              <Feather name="zap" size={14} color={colors.success} />
              <Text style={[styles.autoAcceptText, { color: colors.success }]}>
                Offers of {formatCurrency(listing.auto_accept_price)} or more are auto-accepted
              </Text>
            </View>
          )}
        </View>

        {/* Offer Input Section */}
        <View style={[styles.offerSection, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
            {isCounterOffer ? 'Your Counter Offer' : 'Your Offer'}
          </Text>

          <View style={[styles.inputContainer, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}>
            <Text style={[styles.currencySymbol, { color: themeColors.textPrimary }]}>$</Text>
            <TextInput
              style={[styles.offerInput, { color: themeColors.textPrimary }]}
              value={offerAmount}
              onChangeText={setOfferAmount}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={themeColors.textLight}
            />
          </View>

          {offerAmountNum > 0 && listingPrice > 0 && (
            <View style={styles.percentRow}>
              <Text style={[styles.percentText, { color: themeColors.textMuted }]}>
                {percentOfAsk}% of asking price
              </Text>
              {offerAmountNum < listingPrice * 0.7 && (
                <Text style={styles.lowOfferWarning}>Low offer</Text>
              )}
            </View>
          )}

          {/* Quick Amount Buttons - only show if there's a listing price */}
          {listingPrice > 0 && (
            <View style={styles.quickOfferButtons}>
              <TouchableOpacity
                style={[styles.quickOfferButton, { backgroundColor: isDark ? themeColors.sand : colors.accentFaint, borderColor: themeColors.accent + '40' }]}
                onPress={() => setOfferAmount(Math.floor(listingPrice * 0.8).toString())}
              >
                <Text style={[styles.quickOfferPercent, { color: themeColors.accent }]}>80%</Text>
                <Text style={[styles.quickOfferAmount, { color: themeColors.textPrimary }]}>
                  {formatCurrency(listingPrice * 0.8)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickOfferButton, { backgroundColor: isDark ? themeColors.sand : colors.accentFaint, borderColor: themeColors.accent + '40' }]}
                onPress={() => setOfferAmount(Math.floor(listingPrice * 0.9).toString())}
              >
                <Text style={[styles.quickOfferPercent, { color: themeColors.accent }]}>90%</Text>
                <Text style={[styles.quickOfferAmount, { color: themeColors.textPrimary }]}>
                  {formatCurrency(listingPrice * 0.9)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickOfferButton, { backgroundColor: isDark ? themeColors.sand : colors.accentFaint, borderColor: themeColors.accent + '40' }]}
                onPress={() => setOfferAmount(listingPrice.toString())}
              >
                <Text style={[styles.quickOfferPercent, { color: themeColors.accent }]}>100%</Text>
                <Text style={[styles.quickOfferAmount, { color: themeColors.textPrimary }]}>
                  {formatCurrency(listingPrice)}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Message Section */}
        <View style={[styles.messageSection, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>
            {isCounterOffer ? 'Message to Buyer (Optional)' : 'Message to Seller (Optional)'}
          </Text>
          <TextInput
            style={[styles.messageInput, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={message}
            onChangeText={setMessage}
            placeholder={isCounterOffer ? "Add a note to explain your counter offer..." : "Add a note to explain your offer..."}
            placeholderTextColor={themeColors.textLight}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <Text style={[styles.messageHint, { color: themeColors.textLight }]}>
            {isCounterOffer
              ? 'A brief message can help the buyer understand your counter offer'
              : 'A brief message can help the seller understand your offer'}
          </Text>
        </View>

        {/* Cost Breakdown */}
        <View style={[styles.costBreakdown, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>If Accepted</Text>

          <View style={[styles.costRow, { borderBottomColor: themeColors.borderLight }]}>
            <Text style={[styles.costLabel, { color: themeColors.textSecondary }]}>Your Offer</Text>
            <Text style={[styles.costValue, { color: themeColors.textPrimary }]}>
              {formatCurrency(offerAmountNum)}
            </Text>
          </View>

          <View style={[styles.costRow, { borderBottomColor: themeColors.borderLight }]}>
            <Text style={[styles.costLabel, { color: themeColors.textSecondary }]}>Buyer Premium (8%)</Text>
            <Text style={[styles.costValue, { color: themeColors.textPrimary }]}>
              {formatCurrency(buyerPremium)}
            </Text>
          </View>

          <View style={[styles.costRow, styles.totalRow, { borderTopColor: themeColors.border }]}>
            <Text style={[styles.totalLabel, { color: themeColors.textPrimary }]}>Total to Pay</Text>
            <Text style={[styles.totalValue, { color: themeColors.accent }]}>
              {formatCurrency(totalWithPremium)}
            </Text>
          </View>

          <Text style={[styles.taxNote, { color: themeColors.textLight }]}>
            * Shipping and applicable taxes will be added
          </Text>
        </View>

        {/* How Offers Work */}
        <View style={[styles.infoSection, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>How Offers Work</Text>
          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <View style={[styles.infoBullet, { backgroundColor: themeColors.accentFaint }]}>
                <Text style={[styles.infoBulletText, { color: themeColors.accent }]}>1</Text>
              </View>
              <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                Your offer is sent to the seller
              </Text>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoBullet, { backgroundColor: themeColors.accentFaint }]}>
                <Text style={[styles.infoBulletText, { color: themeColors.accent }]}>2</Text>
              </View>
              <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                The seller has 48 hours to accept, decline, or counter
              </Text>
            </View>
            <View style={styles.infoItem}>
              <View style={[styles.infoBullet, { backgroundColor: themeColors.accentFaint }]}>
                <Text style={[styles.infoBulletText, { color: themeColors.accent }]}>3</Text>
              </View>
              <Text style={[styles.infoText, { color: themeColors.textSecondary }]}>
                If accepted, you'll receive an invoice to complete the purchase
              </Text>
            </View>
          </View>
        </View>

      </ScrollView>

      {/* Make Offer Button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
        <TouchableOpacity
          style={[
            styles.makeOfferButton,
            { backgroundColor: themeColors.accent },
            makeOfferMutation.isPending && styles.buttonDisabled
          ]}
          onPress={handleMakeOffer}
          disabled={makeOfferMutation.isPending || offerAmountNum <= 0}
        >
          {makeOfferMutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Feather name="send" size={20} color={colors.white} />
              <Text style={styles.makeOfferButtonText}>
                {isCounterOffer ? 'Send Counter' : 'Send Offer'}{offerAmountNum > 0 ? ` - ${formatCurrency(offerAmountNum)}` : ''}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Confirmation Modal with Terms */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Feather name="alert-circle" size={24} color={colors.warning} />
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>
                {isCounterOffer ? 'Confirm Counter Offer' : 'Confirm Your Offer'}
              </Text>
            </View>

            {/* Offer Summary */}
            <View style={[styles.modalOfferSummary, { backgroundColor: themeColors.accentFaint }]}>
              <Text style={[styles.modalOfferLabel, { color: themeColors.textMuted }]}>
                {isCounterOffer ? 'Counter Offer Amount' : 'Your Offer'}
              </Text>
              <Text style={[styles.modalOfferAmount, { color: themeColors.accent }]}>
                {formatCurrency(parseFloat(offerAmount) || 0)}
              </Text>
              {listing?.title && (
                <Text style={[styles.modalListingTitle, { color: themeColors.textSecondary }]} numberOfLines={2}>
                  for "{listing.title}"
                </Text>
              )}
            </View>

            {/* Binding Terms Checkbox - only show for buyers, not sellers making counter offers */}
            {!isSeller ? (
              <TouchableOpacity
                style={[
                  styles.modalTermsCheckbox,
                  {
                    backgroundColor: termsAccepted
                      ? (isDark ? 'rgba(34, 197, 94, 0.15)' : colors.successLight)
                      : (isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7'),
                    borderColor: termsAccepted ? colors.success : '#F59E0B',
                  }
                ]}
                onPress={() => setTermsAccepted(!termsAccepted)}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.checkbox,
                  {
                    backgroundColor: termsAccepted ? colors.success : 'transparent',
                    borderColor: termsAccepted ? colors.success : (isDark ? themeColors.textMuted : '#9CA3AF'),
                  }
                ]}>
                  {termsAccepted && (
                    <Feather name="check" size={14} color={colors.white} />
                  )}
                </View>
                <Text style={[
                  styles.modalTermsText,
                  { color: termsAccepted ? colors.success : (isDark ? '#FBBF24' : '#92400E') }
                ]}>
                  <Text style={styles.modalTermsBold}>I understand this is a binding offer.</Text>
                  {' '}If accepted, I am obligated to complete the purchase at this price. Payment will be due within {listing?.payment_due_days || 7} days.
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.modalSellerNote, { backgroundColor: isDark ? themeColors.sand : colors.sand }]}>
                <Feather name="info" size={16} color={themeColors.textMuted} />
                <Text style={[styles.modalSellerNoteText, { color: themeColors.textSecondary }]}>
                  Your counter offer will be sent to the buyer for their consideration.
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalCancelButton, { borderColor: themeColors.border }]}
                onPress={() => {
                  setShowConfirmModal(false);
                  setTermsAccepted(false);
                }}
              >
                <Text style={[styles.modalCancelButtonText, { color: themeColors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalConfirmButton,
                  { backgroundColor: (isSeller || termsAccepted) ? colors.success : colors.textLight }
                ]}
                onPress={handleConfirmOffer}
                disabled={!isSeller && !termsAccepted}
              >
                <Feather name="check" size={18} color={colors.white} />
                <Text style={styles.modalConfirmButtonText}>
                  {isCounterOffer ? 'Send Counter' : 'Send Offer'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
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
    paddingBottom: spacing['5xl'],
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
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
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
  originalOfferSection: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    borderWidth: 2,
  },
  originalOfferHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  originalOfferTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  originalOfferDetails: {
    gap: spacing.sm,
  },
  originalOfferRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  originalOfferLabel: {
    fontSize: fontSize.sm,
  },
  originalOfferValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  originalOfferAmount: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  originalOfferMessageContainer: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
  },
  originalOfferMessageLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  originalOfferMessage: {
    fontSize: fontSize.sm,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  // Limit reached styles
  limitReachedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['3xl'],
  },
  limitReachedIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  limitReachedTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  limitReachedText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  limitReachedInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
  },
  limitReachedInfoText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  limitReachedButton: {
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  limitReachedButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  modalOfferSummary: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalOfferLabel: {
    fontSize: fontSize.sm,
    marginBottom: spacing.xs,
  },
  modalOfferAmount: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
  },
  modalListingTitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  modalTermsCheckbox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    marginBottom: spacing.xl,
  },
  modalTermsText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  modalTermsBold: {
    fontWeight: fontWeight.bold,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  modalConfirmButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  modalConfirmButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  modalSellerNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.xl,
  },
  modalSellerNoteText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
