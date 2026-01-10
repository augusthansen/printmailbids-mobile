import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { WatchlistStackParamList } from '../navigation/types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { ListingWithImages } from '../types/database';
import { formatCurrency, formatTimeRemaining } from '../utils/formatters';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../constants/theme';
import { Feather } from '@expo/vector-icons';

export default function WatchlistScreen() {
  const navigation = useNavigation<NavigationProp<WatchlistStackParamList>>();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();

  const { data: watchlist, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['watchlist', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('watchlist')
        .select(`
          listing_id,
          created_at,
          listing:listings(
            *,
            images:listing_images(*)
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data
        .map(item => item.listing as unknown as ListingWithImages)
        .filter((listing): listing is ListingWithImages => listing !== null);
    },
    enabled: !!user,
  });

  const renderItem = ({ item }: { item: ListingWithImages }) => {
    const primaryImage = item.images?.find(img => img.is_primary) || item.images?.[0];
    const isAuction = item.listing_type === 'auction' || item.listing_type === 'auction_with_offers';
    const price = isAuction ? item.current_price || item.starting_price : item.fixed_price;

    return (
      <TouchableOpacity
        style={[styles.itemCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
        onPress={() => navigation.navigate('ListingDetail', { listingId: item.id })}
      >
        <Image
          source={primaryImage?.url || primaryImage?.thumbnail_url || require('../../assets/placeholder.png')}
          style={[styles.itemImage, { backgroundColor: themeColors.stone }]}
          contentFit="cover"
        />
        <View style={styles.itemInfo}>
          <Text style={[styles.itemTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>{item.title}</Text>
          <Text style={[styles.itemPrice, { color: themeColors.accent }]}>{price ? formatCurrency(price) : 'No bids'}</Text>
          {isAuction && item.end_time && (
            <Text style={[styles.timeRemaining, { color: themeColors.warning }]}>{formatTimeRemaining(item.end_time)}</Text>
          )}
          <View style={[
            styles.statusBadge,
            item.status === 'active'
              ? [styles.activeBadge, { backgroundColor: themeColors.successLight }]
              : [styles.endedBadge, { backgroundColor: themeColors.errorLight }]
          ]}>
            <Text style={[styles.statusText, { color: item.status === 'active' ? themeColors.success : themeColors.error }]}>
              {item.status === 'active' ? 'Active' : 'Ended'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <FlatList
        data={watchlist}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={themeColors.accent} />
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="eye-off" size={48} color={themeColors.textLight} />
            <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No Watched Items</Text>
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
              Items you watch will appear here so you can track their progress
            </Text>
          </View>
        }
      />
    </View>
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
  },
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  itemImage: {
    width: 100,
    height: 100,
    backgroundColor: colors.sand,
  },
  itemInfo: {
    flex: 1,
    padding: spacing.md,
  },
  itemTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  itemPrice: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  timeRemaining: {
    fontSize: fontSize.xs,
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  activeBadge: {
    backgroundColor: colors.successLight,
  },
  endedBadge: {
    backgroundColor: colors.errorLight,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['5xl'],
    paddingHorizontal: spacing['3xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
