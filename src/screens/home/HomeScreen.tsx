import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { ListingWithImages } from '../../types/database';
import { HomeStackParamList } from '../../navigation/types';
import { formatCurrency, formatTimeRemaining } from '../../utils/formatters';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const { colors: themeColors, isDark } = useTheme();

  const { data: listings, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['listings', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          images:listing_images(*)
        `)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as ListingWithImages[];
    },
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigation.navigate('Search', { query: searchQuery.trim() });
    }
  };

  const renderListing = useCallback(({ item }: { item: ListingWithImages }) => {
    const primaryImage = item.images?.find(img => img.is_primary) || item.images?.[0];
    const isAuction = item.listing_type === 'auction' || item.listing_type === 'auction_with_offers';
    const price = isAuction ? item.current_bid || item.starting_price : item.fixed_price;
    const hasReserve = item.reserve_price && (!item.current_bid || item.current_bid < item.reserve_price);

    return (
      <Pressable
        style={({ pressed }) => [
          styles.listingCard,
          { backgroundColor: isDark ? themeColors.sand : '#ffffff' },
          pressed && styles.listingCardPressed,
        ]}
        onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}
      >
        <View style={styles.imageContainer}>
          <Image
            source={primaryImage?.url || primaryImage?.thumbnail_url || require('../../../assets/placeholder.png')}
            style={styles.listingImage}
            contentFit="cover"
            transition={200}
          />
          {/* Type Badge */}
          <View style={[
            styles.typeBadge,
            isAuction ? styles.auctionBadge : styles.buyNowBadge
          ]}>
            <Feather
              name={isAuction ? 'clock' : 'tag'}
              size={10}
              color="#ffffff"
            />
            <Text style={styles.typeBadgeText}>
              {isAuction ? 'Auction' : 'Buy Now'}
            </Text>
          </View>
          {/* Watch Count */}
          {item.watch_count > 0 && (
            <View style={styles.watchBadge}>
              <Feather name="eye" size={10} color="#ffffff" />
              <Text style={styles.watchBadgeText}>{item.watch_count}</Text>
            </View>
          )}
        </View>

        <View style={styles.listingInfo}>
          <Text style={[styles.listingTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>
            {item.title}
          </Text>

          {item.make && item.model && (
            <Text style={[styles.listingMeta, { color: themeColors.textMuted }]} numberOfLines={1}>
              {item.make} {item.model} {item.year ? `(${item.year})` : ''}
            </Text>
          )}

          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: themeColors.accent }]}>
              {price ? formatCurrency(price) : 'No bids'}
            </Text>
            {hasReserve && (
              <View style={[styles.reserveBadge, { backgroundColor: themeColors.warningLight }]}>
                <Text style={[styles.reserveText, { color: themeColors.warning }]}>Reserve</Text>
              </View>
            )}
          </View>

          {isAuction && (
            <View style={styles.auctionInfo}>
              {item.bid_count > 0 && (
                <View style={styles.bidInfo}>
                  <Feather name="users" size={12} color={themeColors.textMuted} />
                  <Text style={[styles.bidCount, { color: themeColors.textMuted }]}>{item.bid_count} bids</Text>
                </View>
              )}
              {item.end_time && (
                <View style={styles.timeInfo}>
                  <Feather name="clock" size={12} color={themeColors.warning} />
                  <Text style={[styles.timeRemaining, { color: themeColors.warning }]}>
                    {formatTimeRemaining(item.end_time)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </Pressable>
    );
  }, [navigation, isDark, themeColors]);

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderBottomColor: themeColors.border }]}>
        <View style={[styles.searchInputWrapper, { backgroundColor: isDark ? themeColors.stone : themeColors.sand, borderColor: themeColors.border }]}>
          <Feather name="search" size={18} color={themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.textPrimary }]}
            placeholder="Search equipment..."
            placeholderTextColor={themeColors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={18} color={themeColors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={[styles.filterButton, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}>
          <Feather name="sliders" size={18} color={themeColors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
          <Text style={[styles.loadingText, { color: themeColors.textMuted }]}>Loading listings...</Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          renderItem={renderListing}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={themeColors.accent}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="package" size={48} color={themeColors.textLight} />
              <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No Listings Found</Text>
              <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
                Check back later for new equipment
              </Text>
            </View>
          }
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
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sand,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  loadingText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing['3xl'],
  },
  row: {
    justifyContent: 'space-between',
  },
  listingCard: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    ...shadows.md,
  },
  listingCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  imageContainer: {
    position: 'relative',
  },
  listingImage: {
    width: '100%',
    height: 130,
    backgroundColor: colors.sand,
  },
  typeBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
  },
  auctionBadge: {
    backgroundColor: colors.accent,
  },
  buyNowBadge: {
    backgroundColor: colors.success,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  watchBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  watchBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
    color: colors.white,
  },
  listingInfo: {
    padding: spacing.md,
  },
  listingTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  listingMeta: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  price: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.primary,
  },
  reserveBadge: {
    backgroundColor: colors.warningLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  reserveText: {
    fontSize: 9,
    fontWeight: fontWeight.medium,
    color: colors.warning,
  },
  auctionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  bidInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bidCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeRemaining: {
    fontSize: fontSize.xs,
    color: colors.warning,
    fontWeight: fontWeight.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['5xl'],
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
});
