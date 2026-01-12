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
import { useTheme } from '../../contexts/ThemeContext';
import { Listing, ListingImage } from '../../types/database';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatTimeRemaining, formatRelativeTime } from '../../utils/formatters';
import { lightTap, successFeedback, warningFeedback } from '../../utils/haptics';

type FilterType = 'all' | 'active' | 'draft' | 'scheduled' | 'ended' | 'sold';

interface ListingWithImages extends Listing {
  images: ListingImage[];
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'draft', label: 'Drafts' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'ended', label: 'Ended' },
  { key: 'sold', label: 'Sold' },
];

export default function MyListingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: listings, isLoading, refetch } = useQuery<ListingWithImages[]>({
    queryKey: ['myListings', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          images:listing_images(*)
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as ListingWithImages[];
    },
    enabled: !!user,
  });

  // Cancel/end listing mutation
  const cancelMutation = useMutation({
    mutationFn: async (listingId: string) => {
      const { error } = await supabase
        .from('listings')
        .update({ status: 'cancelled' })
        .eq('id', listingId);

      if (error) throw error;
    },
    onSuccess: () => {
      warningFeedback();
      queryClient.invalidateQueries({ queryKey: ['myListings'] });
    },
  });

  const filteredListings = listings?.filter(listing => {
    if (filter === 'all') return true;
    return listing.status === filter;
  }) || [];

  const getStatusStyle = (status: Listing['status']) => {
    switch (status) {
      case 'active':
        return { bg: colors.successLight, text: colors.success, label: 'Active' };
      case 'draft':
        return { bg: colors.sand, text: colors.textMuted, label: 'Draft' };
      case 'scheduled':
        return { bg: colors.accentFaint, text: colors.accent, label: 'Scheduled' };
      case 'ended':
        return { bg: colors.warningLight, text: colors.warning, label: 'Ended' };
      case 'sold':
        return { bg: colors.successLight, text: colors.success, label: 'Sold' };
      case 'cancelled':
        return { bg: colors.errorLight, text: colors.error, label: 'Cancelled' };
      default:
        return { bg: colors.sand, text: colors.textMuted, label: status };
    }
  };

  const getListingTypeLabel = (type: Listing['listing_type']) => {
    switch (type) {
      case 'auction':
        return 'Auction';
      case 'make_offer':
        return 'Make An Offer';
      case 'auction_with_offers':
        return 'Auction & Offers';
      default:
        return type;
    }
  };

  const handleListingPress = useCallback((listing: ListingWithImages) => {
    lightTap();
    navigation.navigate('ListingDetail' as never, { listingId: listing.id } as never);
  }, [navigation]);

  const handleEditListing = useCallback((listing: ListingWithImages) => {
    lightTap();
    navigation.navigate('CreateListing' as never, { listingId: listing.id } as never);
  }, [navigation]);

  const handleCancelListing = (listing: ListingWithImages) => {
    Alert.alert(
      'Cancel Listing',
      `Are you sure you want to cancel "${listing.title}"?`,
      [
        { text: 'Keep Listing', style: 'cancel' },
        {
          text: 'Cancel Listing',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(listing.id),
        },
      ]
    );
  };

  const renderListingItem = useCallback(({ item }: { item: ListingWithImages }) => {
    const status = getStatusStyle(item.status);
    const primaryImage = item.images?.find(img => img.is_primary) || item.images?.[0];
    const isActive = item.status === 'active';
    const isDraft = item.status === 'draft';
    const isAuction = item.listing_type === 'auction' || item.listing_type === 'auction_with_offers';

    const displayPrice = isAuction
      ? item.current_price || item.starting_price
      : item.fixed_price;

    return (
      <TouchableOpacity
        style={[styles.listingCard, { backgroundColor: themeColors.surface }]}
        onPress={() => handleListingPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.listingCardContent}>
          {/* Image */}
          {primaryImage?.url ? (
            <Image source={primaryImage.url} style={styles.listingImage} contentFit="cover" />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: themeColors.sand }]}>
              <Feather name="camera" size={24} color={themeColors.textLight} />
            </View>
          )}

          {/* Details */}
          <View style={styles.listingDetails}>
            <Text style={[styles.listingTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>
              {item.title}
            </Text>

            <View style={styles.typeRow}>
              <Text style={[styles.typeLabel, { color: themeColors.textMuted }]}>{getListingTypeLabel(item.listing_type)}</Text>
            </View>

            <View style={styles.priceRow}>
              {isAuction ? (
                <>
                  <Text style={[styles.priceLabel, { color: themeColors.textMuted }]}>
                    {item.current_price ? 'Current Bid:' : 'Starting:'}
                  </Text>
                  <Text style={[styles.priceAmount, { color: themeColors.textPrimary }]}>
                    {formatCurrency(displayPrice || 0)}
                  </Text>
                  <Text style={[styles.bidCount, { color: themeColors.textMuted }]}>
                    ({item.bid_count} {item.bid_count === 1 ? 'bid' : 'bids'})
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.priceLabel, { color: themeColors.textMuted }]}>Price:</Text>
                  <Text style={[styles.priceAmount, { color: themeColors.textPrimary }]}>
                    {formatCurrency(displayPrice || 0)}
                  </Text>
                </>
              )}
            </View>

            <View style={styles.statsRow}>
              <View style={styles.stat}>
                <Feather name="eye" size={12} color={themeColors.textMuted} />
                <Text style={[styles.statText, { color: themeColors.textMuted }]}>{item.view_count}</Text>
              </View>
              <View style={styles.stat}>
                <Feather name="heart" size={12} color={themeColors.textMuted} />
                <Text style={[styles.statText, { color: themeColors.textMuted }]}>{item.watch_count}</Text>
              </View>
              {isAuction && (
                <View style={styles.stat}>
                  <Feather name="trending-up" size={12} color={themeColors.textMuted} />
                  <Text style={[styles.statText, { color: themeColors.textMuted }]}>{item.bid_count}</Text>
                </View>
              )}
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
              </View>

              {isActive && item.end_time && (
                <View style={styles.timeContainer}>
                  <Feather name="clock" size={12} color={themeColors.textMuted} />
                  <Text style={[styles.timeText, { color: themeColors.textMuted }]}>
                    {formatTimeRemaining(item.end_time)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={[styles.actionsRow, { borderTopColor: themeColors.border }]}>
          {isDraft && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleEditListing(item)}
            >
              <Feather name="edit-2" size={14} color={themeColors.accent} />
              <Text style={[styles.actionButtonText, { color: themeColors.accent }]}>Continue Editing</Text>
            </TouchableOpacity>
          )}

          {isActive && (
            <>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleEditListing(item)}
              >
                <Feather name="edit-2" size={14} color={themeColors.accent} />
                <Text style={[styles.actionButtonText, { color: themeColors.accent }]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.actionButtonDanger]}
                onPress={() => handleCancelListing(item)}
              >
                <Feather name="x-circle" size={14} color={colors.error} />
                <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>
                  Cancel
                </Text>
              </TouchableOpacity>
            </>
          )}

          {item.status === 'ended' && item.bid_count > 0 && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonSuccess]}
              onPress={() => {
                lightTap();
                // Navigate to create invoice
                navigation.navigate('MySales' as never);
              }}
            >
              <Feather name="file-text" size={14} color={colors.success} />
              <Text style={[styles.actionButtonText, { color: colors.success }]}>
                Create Invoice
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [handleListingPress, handleEditListing, handleCancelListing, navigation, themeColors]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Feather name="package" size={48} color={themeColors.textLight} />
      <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No listings yet</Text>
      <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
        {filter === 'all'
          ? "Create your first listing to start selling equipment."
          : `No ${filter} listings found.`}
      </Text>
      {filter === 'all' && (
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: themeColors.accent }]}
          onPress={() => {
            lightTap();
            navigation.navigate('CreateListing' as never);
          }}
        >
          <Feather name="plus" size={18} color="#ffffff" />
          <Text style={styles.createButtonText}>Create Listing</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Calculate summary stats
  const activeCount = listings?.filter(l => l.status === 'active').length || 0;
  const draftCount = listings?.filter(l => l.status === 'draft').length || 0;
  const totalViews = listings?.reduce((sum, l) => sum + (l.view_count || 0), 0) || 0;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Summary Stats */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.statCardValue, { color: themeColors.textPrimary }]}>{activeCount}</Text>
          <Text style={[styles.statCardLabel, { color: themeColors.textMuted }]}>Active</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.statCardValue, { color: themeColors.textPrimary }]}>{draftCount}</Text>
          <Text style={[styles.statCardLabel, { color: themeColors.textMuted }]}>Drafts</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
          <Text style={[styles.statCardValue, { color: themeColors.textPrimary }]}>{totalViews}</Text>
          <Text style={[styles.statCardLabel, { color: themeColors.textMuted }]}>Total Views</Text>
        </View>
      </View>

      {/* Filter Bar */}
      <View style={[styles.filterContainer, { backgroundColor: themeColors.background, borderBottomColor: themeColors.border }]}>
        <FlatList
          horizontal
          data={FILTERS}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                { backgroundColor: themeColors.surface, borderColor: themeColors.border },
                filter === item.key && { backgroundColor: themeColors.accent, borderColor: themeColors.accent },
              ]}
              onPress={() => {
                lightTap();
                setFilter(item.key);
              }}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: themeColors.textSecondary },
                  filter === item.key && { color: '#ffffff' },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item.key}
        />
      </View>

      {/* Listings List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredListings}
          renderItem={renderListingItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + spacing['3xl'] + 60 },
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

      {/* Floating Create Button */}
      <TouchableOpacity
        style={[styles.floatingButton, { bottom: insets.bottom + spacing.xl, backgroundColor: themeColors.accent }]}
        onPress={() => {
          lightTap();
          navigation.navigate('CreateListing' as never);
        }}
      >
        <Feather name="plus" size={24} color="#ffffff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  statCardValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  statCardLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  filterContainer: {
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginTop: spacing.lg,
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
  listingCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  listingCardContent: {
    flexDirection: 'row',
    padding: spacing.md,
  },
  listingImage: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.lg,
  },
  imagePlaceholder: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listingDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  listingTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  typeRow: {
    marginBottom: spacing.sm,
  },
  typeLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  priceLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  priceAmount: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  bidCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accentFaint,
  },
  actionButtonDanger: {
    backgroundColor: colors.errorLight,
  },
  actionButtonSuccess: {
    backgroundColor: colors.successLight,
  },
  actionButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  actionButtonTextDanger: {
    color: colors.error,
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  createButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  floatingButton: {
    position: 'absolute',
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
  },
});
