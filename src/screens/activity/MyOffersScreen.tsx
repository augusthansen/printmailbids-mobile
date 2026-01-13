import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Offer, Listing, ListingImage, Profile } from '../../types/database';
import { DashboardStackParamList } from '../../navigation/types';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { lightTap, successFeedback, warningFeedback } from '../../utils/haptics';
import { API_URL } from '../../constants/config';

type ViewMode = 'sent' | 'received';
type FilterType = 'all' | 'pending' | 'accepted' | 'declined' | 'countered' | 'expired' | 'withdrawn';

interface OfferWithDetails extends Offer {
  listing: Listing & {
    images: ListingImage[];
  };
  buyer?: Profile;
  seller?: Profile;
  counter_offer?: Offer;
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
  { key: 'countered', label: 'Countered' },
  { key: 'withdrawn', label: 'Withdrawn' },
];

// Helper function to determine who made an offer/counter-offer
// Uses counter_count to determine the maker:
// - counter_count = 0: Original offer, always made by buyer
// - counter_count = 1: First counter, made by seller
// - counter_count = 2: Second counter, made by buyer
// - counter_count = 3: Third counter, made by seller
// Pattern: even = buyer, odd = seller
function getOfferMaker(offer: OfferWithDetails): 'buyer' | 'seller' {
  const counterCount = offer.counter_count || 0;

  // Even counter_count (0, 2, 4...) = buyer made this offer
  // Odd counter_count (1, 3, 5...) = seller made this offer
  return counterCount % 2 === 0 ? 'buyer' : 'seller';
}

export default function MyOffersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<DashboardStackParamList, 'MyOffers'>>();
  const insets = useSafeAreaInsets();
  const { user, profile, session } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();

  // Get initial view mode and filter from route params
  const initialViewMode = route.params?.viewMode || 'sent';
  const initialFilter = (route.params?.filter as FilterType) || 'all';
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [filter, setFilter] = useState<FilterType>(initialFilter);

  // Update view mode and filter if route params change
  useEffect(() => {
    if (route.params?.viewMode) {
      setViewMode(route.params.viewMode);
    }
    if (route.params?.filter) {
      setFilter(route.params.filter as FilterType);
    }
  }, [route.params?.viewMode, route.params?.filter]);

  // Fetch offers based on view mode
  const { data: offers, isLoading, refetch } = useQuery<OfferWithDetails[]>({
    queryKey: ['myOffers', user?.id, viewMode],
    queryFn: async () => {
      if (!user) return [];

      const query = supabase
        .from('offers')
        .select(`
          *,
          listing:listings(
            *,
            images:listing_images(*)
          ),
          buyer:profiles!buyer_id(*),
          seller:profiles!seller_id(*)
        `)
        .order('created_at', { ascending: false });

      if (viewMode === 'sent') {
        query.eq('buyer_id', user.id);
      } else {
        query.eq('seller_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Debug: log all fetched offers
      console.log(`[MyOffers Query] Fetched ${data?.length || 0} offers for viewMode=${viewMode}:`,
        data?.map(o => ({
          id: o.id.substring(0, 8),
          status: o.status,
          counter_count: o.counter_count,
          amount: o.amount,
          listing: o.listing?.title?.substring(0, 20),
        }))
      );

      return (data || []) as OfferWithDetails[];
    },
    enabled: !!user,
  });

  // Accept offer mutation - uses API for proper commission handling
  const acceptMutation = useMutation({
    mutationFn: async (offer: OfferWithDetails) => {
      if (!session) throw new Error('Not authenticated');

      console.log('[Accept Offer] Starting accept for offer:', offer.id);
      console.log('[Accept Offer] API URL:', `${API_URL}/offers/respond`);

      const response = await fetch(`${API_URL}/offers/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          offerId: offer.id,
          action: 'accept',
        }),
      });

      console.log('[Accept Offer] Response status:', response.status);

      const result = await response.json();
      console.log('[Accept Offer] Response body:', JSON.stringify(result));

      if (!response.ok) {
        console.error('[Accept Offer] Error:', result.error || result.message || 'Unknown error');
        throw new Error(result.error || result.message || 'Failed to accept offer');
      }

      return { invoiceId: result.invoiceId, isBuyer: user?.id === offer.buyer_id };
    },
    onSuccess: (data) => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['myOffers'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['listing'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['sellerStats'] });
      queryClient.invalidateQueries({ queryKey: ['buyerStats'] });

      // If buyer accepted (counter offer scenario), navigate to invoice for payment
      // If seller accepted, just show confirmation
      if (data?.isBuyer && data?.invoiceId) {
        Alert.alert(
          'Offer Accepted!',
          'Your offer has been accepted. Proceed to payment now?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Pay Now',
              onPress: () => navigation.navigate('InvoiceDetail', { invoiceId: data.invoiceId }),
            },
          ]
        );
      } else {
        Alert.alert('Offer Accepted', 'An invoice has been created and the buyer has been notified.');
      }
    },
    onError: (error: Error) => {
      console.error('[Accept Offer] Mutation error:', error.message);
      Alert.alert('Error', error.message || 'Failed to accept offer. Please try again.');
    },
  });

  // Decline offer mutation - uses API
  const declineMutation = useMutation({
    mutationFn: async (offer: OfferWithDetails) => {
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${API_URL}/offers/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          offerId: offer.id,
          action: 'decline',
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to decline offer');
      }

      return result;
    },
    onSuccess: () => {
      warningFeedback();
      queryClient.invalidateQueries({ queryKey: ['myOffers'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => {
      Alert.alert('Error', 'Failed to decline offer. Please try again.');
    },
  });

  // Withdraw offer mutation - uses API
  const withdrawMutation = useMutation({
    mutationFn: async (offer: OfferWithDetails) => {
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${API_URL}/offers/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          offerId: offer.id,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to withdraw offer');
      }

      return result;
    },
    onSuccess: () => {
      warningFeedback();
      queryClient.invalidateQueries({ queryKey: ['myOffers'] });
      queryClient.invalidateQueries({ queryKey: ['sellerStats'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => {
      Alert.alert('Error', 'Failed to withdraw offer. Please try again.');
    },
  });

  const filteredOffers = offers?.filter(offer => {
    const listingStatus = offer.listing?.status;

    // If the listing is sold, hide ALL offers for that listing
    // The transaction is complete - no offers are "open"
    if (listingStatus === 'sold') {
      return false;
    }

    // Only show active/actionable offers:
    // - pending: awaiting response
    // - countered: awaiting response to counter
    // - accepted: needs payment (buyer should see this until they pay)
    // Hide: declined, expired, withdrawn (these are terminal states with no action needed)
    const activeStatuses = ['pending', 'countered', 'accepted'];

    // For "all" filter, only show active offers
    if (filter === 'all') {
      return activeStatuses.includes(offer.status);
    }

    // For specific filter, match that status
    return offer.status === filter;
  }) || [];

  const getStatusStyle = (status: Offer['status']) => {
    switch (status) {
      case 'pending':
        return { bg: colors.warningLight, text: colors.warning, label: 'Pending' };
      case 'accepted':
        return { bg: colors.successLight, text: colors.success, label: 'Accepted' };
      case 'declined':
        return { bg: colors.errorLight, text: colors.error, label: 'Declined' };
      case 'countered':
        return { bg: colors.accentFaint, text: colors.accent, label: 'Countered' };
      case 'expired':
        return { bg: colors.sand, text: colors.textMuted, label: 'Expired' };
      case 'withdrawn':
        return { bg: colors.sand, text: colors.textMuted, label: 'Withdrawn' };
      default:
        return { bg: colors.sand, text: colors.textMuted, label: status };
    }
  };

  const handleAcceptOffer = (offer: OfferWithDetails) => {
    Alert.alert(
      'Accept Offer',
      `Accept offer of ${formatCurrency(offer.amount)} for "${offer.listing.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () => acceptMutation.mutate(offer),
        },
      ]
    );
  };

  const handleDeclineOffer = (offer: OfferWithDetails) => {
    Alert.alert(
      'Decline Offer',
      `Decline offer of ${formatCurrency(offer.amount)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: () => declineMutation.mutate(offer),
        },
      ]
    );
  };

  const handleWithdrawOffer = (offer: OfferWithDetails) => {
    const isCounterOffer = !!offer.parent_offer_id;
    Alert.alert(
      isCounterOffer ? 'Withdraw Counter Offer' : 'Withdraw Offer',
      isCounterOffer
        ? 'Are you sure you want to withdraw this counter offer? The original offer will be restored to pending.'
        : 'Are you sure you want to withdraw this offer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => withdrawMutation.mutate(offer),
        },
      ]
    );
  };

  const handleOfferPress = useCallback((offer: OfferWithDetails) => {
    lightTap();
    navigation.navigate('ListingDetail' as never, { listingId: offer.listing_id } as never);
  }, [navigation]);

  const renderOfferItem = useCallback(({ item }: { item: OfferWithDetails }) => {
    const status = getStatusStyle(item.status);
    const primaryImage = item.listing.images?.find(img => img.is_primary) || item.listing.images?.[0];
    const otherParty = viewMode === 'sent' ? item.seller : item.buyer;
    const isPending = item.status === 'pending';

    // Determine who made this offer/counter-offer
    const offerMaker = getOfferMaker(item);

    // Show action buttons only if:
    // 1. The offer is pending
    // 2. The current user DID NOT make this offer (they are the recipient)
    // In "received" view (seller): show actions if buyer made the offer
    // In "sent" view (buyer): show actions if seller made the counter (buyer can respond)
    const canTakeAction = isPending && (
      (viewMode === 'received' && offerMaker === 'buyer') ||  // Seller viewing buyer's offer
      (viewMode === 'sent' && offerMaker === 'seller')        // Buyer viewing seller's counter
    );

    // Debug logging - verbose for troubleshooting
    console.log('[Offer Debug]', JSON.stringify({
      offerId: item.id,
      listingTitle: item.listing?.title?.substring(0, 30),
      status: item.status,
      viewMode,
      offerMaker,
      counter_count: item.counter_count,
      parent_offer_id: item.parent_offer_id,
      isPending,
      canTakeAction,
      buyer_id: item.buyer_id,
      seller_id: item.seller_id,
      current_user: user?.id,
      isSeller: user?.id === item.seller_id,
      isBuyer: user?.id === item.buyer_id,
      amount: item.amount,
    }, null, 2));

    return (
      <TouchableOpacity
        style={[styles.offerCard, { backgroundColor: themeColors.surface }]}
        onPress={() => handleOfferPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.offerCardContent}>
          {/* Image */}
          {primaryImage?.url ? (
            <Image source={primaryImage.url} style={styles.listingImage} contentFit="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Feather name="package" size={24} color={themeColors.textMuted} />
            </View>
          )}

          {/* Details */}
          <View style={styles.offerDetails}>
            <Text style={[styles.listingTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>
              {item.listing.title}
            </Text>

            <View style={styles.offerRow}>
              <Text style={[styles.offerLabel, { color: themeColors.textMuted }]}>
                {viewMode === 'sent' ? 'Your Offer:' : 'Offer:'}
              </Text>
              <Text style={styles.offerAmount}>{formatCurrency(item.amount)}</Text>
            </View>

            {item.listing.fixed_price && (
              <View style={styles.offerRow}>
                <Text style={[styles.offerLabel, { color: themeColors.textMuted }]}>Asking:</Text>
                <Text style={[styles.askingPrice, { color: themeColors.textSecondary }]}>
                  {formatCurrency(item.listing.fixed_price)}
                </Text>
              </View>
            )}

            {otherParty && (
              <View style={styles.partyRow}>
                <Feather name="user" size={12} color={themeColors.textMuted} />
                <Text style={[styles.partyName, { color: themeColors.textMuted }]}>
                  {viewMode === 'sent' ? 'Seller: ' : 'Buyer: '}
                  {otherParty.company_name || otherParty.full_name}
                </Text>
              </View>
            )}

            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
              </View>
              {item.parent_offer_id && (
                <View style={[styles.counterBadge, { backgroundColor: themeColors.accentFaint }]}>
                  <Feather name="repeat" size={10} color={themeColors.accent} />
                  <Text style={[styles.counterBadgeText, { color: themeColors.accent }]}>Counter</Text>
                </View>
              )}
              <Text style={[styles.timeText, { color: themeColors.textMuted }]}>
                {formatRelativeTime(item.created_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* Message if present */}
        {item.message && (
          <View style={styles.messageContainer}>
            <Feather name="message-circle" size={14} color={themeColors.textMuted} />
            <Text style={[styles.messageText, { color: themeColors.textMuted }]} numberOfLines={2}>
              {item.message}
            </Text>
          </View>
        )}

        {/* Actions for offers the user can respond to */}
        {canTakeAction && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => handleDeclineOffer(item)}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.counterButton, { backgroundColor: themeColors.accentFaint, borderWidth: 1, borderColor: themeColors.accent }]}
              onPress={() => {
                lightTap();
                // Navigate to counter offer flow
                navigation.navigate('MakeOffer' as never, {
                  listingId: item.listing_id,
                  parentOfferId: item.id,
                  suggestedAmount: item.amount,
                } as never);
              }}
            >
              <Text style={[styles.counterButtonText, { color: themeColors.accent }]}>Counter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => handleAcceptOffer(item)}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Withdraw for offers the current user made (pending only) */}
        {isPending && !canTakeAction && (
          <TouchableOpacity
            style={styles.withdrawButton}
            onPress={() => handleWithdrawOffer(item)}
          >
            <Text style={styles.withdrawButtonText}>Withdraw Offer</Text>
          </TouchableOpacity>
        )}

        {/* Accepted offer action */}
        {item.status === 'accepted' && viewMode === 'sent' && (
          <TouchableOpacity
            style={styles.payNowBanner}
            onPress={() => {
              lightTap();
              navigation.navigate('MyInvoices' as never);
            }}
          >
            <Feather name="check-circle" size={16} color={colors.success} />
            <Text style={styles.payNowText}>Offer accepted! Proceed to payment</Text>
            <Feather name="arrow-right" size={16} color={colors.success} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [viewMode, handleOfferPress, handleAcceptOffer, handleDeclineOffer, handleWithdrawOffer, navigation, user?.id, themeColors, isDark]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Feather name="message-square" size={48} color={themeColors.textMuted} />
      <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>
        No {viewMode === 'sent' ? 'offers sent' : 'offers received'}
      </Text>
      <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
        {viewMode === 'sent'
          ? 'Make offers on listings to negotiate with sellers.'
          : "When buyers make offers on your listings, they'll appear here."}
      </Text>
      {viewMode === 'sent' && (
        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => navigation.navigate('HomeTab' as never)}
        >
          <Text style={styles.browseButtonText}>Browse Listings</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Debug: log profile seller status
  console.log('[MyOffers] Profile is_seller:', profile?.is_seller, 'Current viewMode:', viewMode);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* View Mode Toggle - Only show if seller (has both sent and received) */}
      {profile?.is_seller && (
        <View style={[styles.toggleContainer, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              { backgroundColor: viewMode === 'sent' ? themeColors.accentFaint : 'transparent' },
            ]}
            onPress={() => {
              lightTap();
              setViewMode('sent');
            }}
          >
            <Feather
              name="send"
              size={16}
              color={viewMode === 'sent' ? themeColors.accent : themeColors.textMuted}
            />
            <Text style={[
              styles.toggleText,
              { color: viewMode === 'sent' ? themeColors.accent : themeColors.textMuted },
            ]}>
              Offers Sent
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.toggleButton,
              { backgroundColor: viewMode === 'received' ? themeColors.accentFaint : 'transparent' },
            ]}
            onPress={() => {
              lightTap();
              setViewMode('received');
            }}
          >
            <Feather
              name="inbox"
              size={16}
              color={viewMode === 'received' ? themeColors.accent : themeColors.textMuted}
            />
            <Text style={[
              styles.toggleText,
              { color: viewMode === 'received' ? themeColors.accent : themeColors.textMuted },
            ]}>
              Offers Received
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Filter Bar */}
      <View style={[styles.filterContainer, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <FlatList
          horizontal
          data={FILTERS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                { backgroundColor: filter === item.key ? colors.accent : themeColors.surface },
                filter === item.key && styles.filterChipActive,
              ]}
              onPress={() => {
                lightTap();
                setFilter(item.key);
              }}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: filter === item.key ? colors.white : themeColors.textMuted },
                  filter === item.key && styles.filterTextActive,
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.key}
        />
      </View>

      {/* Offers List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredOffers}
          renderItem={renderOfferItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + spacing['3xl'] },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={refetch}
              tintColor={themeColors.accent}
            />
          }
          ListEmptyComponent={renderEmptyState}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.sand,
  },
  toggleButtonActive: {
    backgroundColor: colors.accentFaint,
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  toggleTextActive: {
    color: colors.accent,
  },
  filterContainer: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.sand,
    marginRight: spacing.sm,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
  },
  filterText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
  },
  filterTextActive: {
    color: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  offerCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  offerCardContent: {
    flexDirection: 'row',
    padding: spacing.md,
  },
  listingImage: {
    width: 90,
    height: 90,
    borderRadius: borderRadius.lg,
  },
  imagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  offerDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  listingTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  offerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  offerLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    width: 75,
  },
  offerAmount: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.accent,
  },
  askingPrice: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  partyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  partyName: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  counterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  counterBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  timeText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  messageText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  declineButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.errorLight,
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.error,
  },
  counterButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.sand,
    alignItems: 'center',
  },
  counterButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  acceptButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.success,
    alignItems: 'center',
  },
  acceptButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  withdrawButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  withdrawButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.error,
  },
  payNowBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.successLight,
    borderTopWidth: 1,
    borderTopColor: colors.success,
  },
  payNowText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.success,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing['3xl'],
    paddingTop: spacing['5xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
  },
  browseButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  browseButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
});
