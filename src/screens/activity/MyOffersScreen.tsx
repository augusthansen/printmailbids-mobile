import React, { useState, useCallback } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Offer, Listing, ListingImage, Profile } from '../../types/database';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { lightTap, successFeedback, warningFeedback } from '../../utils/haptics';

type ViewMode = 'sent' | 'received';
type FilterType = 'all' | 'pending' | 'accepted' | 'declined' | 'countered' | 'expired';

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
];

export default function MyOffersScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('sent');
  const [filter, setFilter] = useState<FilterType>('all');

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
      return (data || []) as OfferWithDetails[];
    },
    enabled: !!user,
  });

  // Accept offer mutation
  const acceptMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await supabase
        .from('offers')
        .update({
          status: 'accepted',
          responded_at: new Date().toISOString(),
        })
        .eq('id', offerId);

      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['myOffers'] });
    },
  });

  // Decline offer mutation
  const declineMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await supabase
        .from('offers')
        .update({
          status: 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', offerId);

      if (error) throw error;
    },
    onSuccess: () => {
      warningFeedback();
      queryClient.invalidateQueries({ queryKey: ['myOffers'] });
    },
  });

  // Withdraw offer mutation
  const withdrawMutation = useMutation({
    mutationFn: async (offerId: string) => {
      const { error } = await supabase
        .from('offers')
        .update({ status: 'withdrawn' })
        .eq('id', offerId);

      if (error) throw error;
    },
    onSuccess: () => {
      warningFeedback();
      queryClient.invalidateQueries({ queryKey: ['myOffers'] });
    },
  });

  const filteredOffers = offers?.filter(offer => {
    if (filter === 'all') return true;
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
          onPress: () => acceptMutation.mutate(offer.id),
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
          onPress: () => declineMutation.mutate(offer.id),
        },
      ]
    );
  };

  const handleWithdrawOffer = (offer: OfferWithDetails) => {
    Alert.alert(
      'Withdraw Offer',
      'Are you sure you want to withdraw this offer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: () => withdrawMutation.mutate(offer.id),
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

    return (
      <TouchableOpacity
        style={styles.offerCard}
        onPress={() => handleOfferPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.offerCardContent}>
          {/* Image */}
          {primaryImage?.url ? (
            <Image source={primaryImage.url} style={styles.listingImage} contentFit="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Feather name="package" size={24} color={colors.textLight} />
            </View>
          )}

          {/* Details */}
          <View style={styles.offerDetails}>
            <Text style={styles.listingTitle} numberOfLines={2}>
              {item.listing.title}
            </Text>

            <View style={styles.offerRow}>
              <Text style={styles.offerLabel}>
                {viewMode === 'sent' ? 'Your Offer:' : 'Offer:'}
              </Text>
              <Text style={styles.offerAmount}>{formatCurrency(item.amount)}</Text>
            </View>

            {item.listing.fixed_price && (
              <View style={styles.offerRow}>
                <Text style={styles.offerLabel}>Asking:</Text>
                <Text style={styles.askingPrice}>
                  {formatCurrency(item.listing.fixed_price)}
                </Text>
              </View>
            )}

            {otherParty && (
              <View style={styles.partyRow}>
                <Feather name="user" size={12} color={colors.textMuted} />
                <Text style={styles.partyName}>
                  {viewMode === 'sent' ? 'Seller: ' : 'Buyer: '}
                  {otherParty.company_name || otherParty.full_name}
                </Text>
              </View>
            )}

            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
              </View>
              <Text style={styles.timeText}>
                {formatRelativeTime(item.created_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* Message if present */}
        {item.message && (
          <View style={styles.messageContainer}>
            <Feather name="message-circle" size={14} color={colors.textMuted} />
            <Text style={styles.messageText} numberOfLines={2}>
              {item.message}
            </Text>
          </View>
        )}

        {/* Actions for received pending offers */}
        {viewMode === 'received' && isPending && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => handleDeclineOffer(item)}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.counterButton}
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
              <Text style={styles.counterButtonText}>Counter</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => handleAcceptOffer(item)}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Withdraw for sent pending offers */}
        {viewMode === 'sent' && isPending && (
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
  }, [viewMode, handleOfferPress, handleAcceptOffer, handleDeclineOffer, handleWithdrawOffer, navigation]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Feather name="message-square" size={48} color={colors.textLight} />
      <Text style={styles.emptyTitle}>
        No {viewMode === 'sent' ? 'offers sent' : 'offers received'}
      </Text>
      <Text style={styles.emptyText}>
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

  return (
    <View style={styles.container}>
      {/* View Mode Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            viewMode === 'sent' && styles.toggleButtonActive,
          ]}
          onPress={() => {
            lightTap();
            setViewMode('sent');
          }}
        >
          <Feather
            name="send"
            size={16}
            color={viewMode === 'sent' ? colors.accent : colors.textMuted}
          />
          <Text style={[
            styles.toggleText,
            viewMode === 'sent' && styles.toggleTextActive,
          ]}>
            Offers Sent
          </Text>
        </TouchableOpacity>

        {profile?.is_seller && (
          <TouchableOpacity
            style={[
              styles.toggleButton,
              viewMode === 'received' && styles.toggleButtonActive,
            ]}
            onPress={() => {
              lightTap();
              setViewMode('received');
            }}
          >
            <Feather
              name="inbox"
              size={16}
              color={viewMode === 'received' ? colors.accent : colors.textMuted}
            />
            <Text style={[
              styles.toggleText,
              viewMode === 'received' && styles.toggleTextActive,
            ]}>
              Offers Received
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Bar */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          data={FILTERS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
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
          <ActivityIndicator size="large" color={colors.accent} />
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
              tintColor={colors.accent}
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
