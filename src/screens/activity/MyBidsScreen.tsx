import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { ActivityStackParamList } from '../../navigation/types';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Bid, Listing, ListingImage } from '../../types/database';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatTimeRemaining, formatRelativeTime } from '../../utils/formatters';
import { lightTap } from '../../utils/haptics';

type FilterType = 'all' | 'active' | 'winning' | 'outbid' | 'won' | 'lost';

interface BidWithListing extends Bid {
  listing: Listing & {
    images: ListingImage[];
  };
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'winning', label: 'Winning' },
  { key: 'outbid', label: 'Outbid' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

export default function MyBidsScreen() {
  const navigation = useNavigation<NavigationProp<ActivityStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: bids, isLoading, refetch } = useQuery<BidWithListing[]>({
    queryKey: ['myBids', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('bids')
        .select(`
          *,
          listing:listings(
            *,
            images:listing_images(*)
          )
        `)
        .eq('bidder_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as BidWithListing[];
    },
    enabled: !!user,
  });

  const filteredBids = bids?.filter(bid => {
    if (filter === 'all') return true;
    return bid.status === filter;
  }) || [];

  const getStatusStyle = (status: Bid['status']) => {
    switch (status) {
      case 'winning':
        return { bg: colors.successLight, text: colors.success, label: 'Winning' };
      case 'outbid':
        return { bg: colors.warningLight, text: colors.warning, label: 'Outbid' };
      case 'won':
        return { bg: colors.successLight, text: colors.success, label: 'Won' };
      case 'lost':
        return { bg: colors.errorLight, text: colors.error, label: 'Lost' };
      case 'active':
        return { bg: colors.accentFaint, text: colors.accent, label: 'Active' };
      default:
        return { bg: colors.sand, text: colors.textMuted, label: status };
    }
  };

  const handleBidPress = useCallback((bid: BidWithListing) => {
    lightTap();
    navigation.navigate('ListingDetail', { listingId: bid.listing_id });
  }, [navigation]);

  const renderBidItem = useCallback(({ item }: { item: BidWithListing }) => {
    const status = getStatusStyle(item.status);
    const primaryImage = item.listing.images?.find(img => img.is_primary) || item.listing.images?.[0];
    const isAuctionEnded = item.listing.status === 'ended' || item.listing.status === 'sold';

    return (
      <TouchableOpacity
        style={[styles.bidCard, { backgroundColor: themeColors.surface }]}
        onPress={() => handleBidPress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.bidCardContent}>
          {/* Image */}
          {primaryImage?.url ? (
            <Image source={primaryImage.url} style={styles.listingImage} contentFit="cover" />
          ) : (
            <View style={[styles.imagePlaceholder, { backgroundColor: themeColors.sand }]}>
              <Feather name="package" size={24} color={themeColors.textLight} />
            </View>
          )}

          {/* Details */}
          <View style={styles.bidDetails}>
            <Text style={[styles.listingTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>
              {item.listing.title}
            </Text>

            <View style={styles.bidRow}>
              <Text style={[styles.bidLabel, { color: themeColors.textMuted }]}>Your Bid:</Text>
              <Text style={[styles.bidAmount, { color: themeColors.textPrimary }]}>{formatCurrency(item.amount)}</Text>
            </View>

            {item.max_bid > item.amount && (
              <View style={styles.bidRow}>
                <Text style={[styles.bidLabel, { color: themeColors.textMuted }]}>Max Bid:</Text>
                <Text style={[styles.maxBidAmount, { color: themeColors.textMuted }]}>{formatCurrency(item.max_bid)}</Text>
              </View>
            )}

            <View style={styles.bidRow}>
              <Text style={[styles.bidLabel, { color: themeColors.textMuted }]}>Current:</Text>
              <Text style={[styles.currentBid, { color: themeColors.accent }]}>
                {formatCurrency(item.listing.current_bid || item.listing.starting_price || 0)}
              </Text>
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
              </View>

              {!isAuctionEnded && item.listing.end_time && (
                <View style={styles.timeContainer}>
                  <Feather name="clock" size={12} color={themeColors.textMuted} />
                  <Text style={[styles.timeText, { color: themeColors.textMuted }]}>
                    {formatTimeRemaining(item.listing.end_time)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Action indicator */}
        {item.status === 'outbid' && !isAuctionEnded && (
          <View style={[styles.actionBanner, { backgroundColor: themeColors.warningLight }]}>
            <Feather name="alert-circle" size={14} color={themeColors.warning} />
            <Text style={[styles.actionText, { color: themeColors.warning }]}>You've been outbid! Place a higher bid.</Text>
          </View>
        )}

        {item.status === 'won' && (
          <TouchableOpacity
            style={[styles.payNowButton, { backgroundColor: themeColors.success }]}
            onPress={() => {
              lightTap();
              navigation.navigate('MyInvoices');
            }}
          >
            <Text style={styles.payNowText}>Pay Now</Text>
            <Feather name="arrow-right" size={16} color="#ffffff" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [handleBidPress, navigation, themeColors]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Feather name="trending-up" size={48} color={themeColors.textLight} />
      <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No bids yet</Text>
      <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
        {filter === 'all'
          ? "You haven't placed any bids yet. Browse listings to find equipment."
          : `No ${filter} bids found.`}
      </Text>
      {filter === 'all' && (
        <TouchableOpacity
          style={[styles.browseButton, { backgroundColor: themeColors.accent }]}
          onPress={() => navigation.getParent()?.navigate('HomeTab')}
        >
          <Text style={styles.browseButtonText}>Browse Listings</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
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

      {/* Bids List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredBids}
          renderItem={renderBidItem}
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
  bidCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  bidCardContent: {
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
  bidDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  listingTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  bidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  bidLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    width: 70,
  },
  bidAmount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  maxBidAmount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  currentBid: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
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
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.warningLight,
    borderTopWidth: 1,
    borderTopColor: colors.warning,
  },
  actionText: {
    fontSize: fontSize.sm,
    color: colors.warning,
    fontWeight: fontWeight.medium,
  },
  payNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: colors.success,
  },
  payNowText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.white,
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
