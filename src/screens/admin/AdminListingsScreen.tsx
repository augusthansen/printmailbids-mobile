import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { lightTap, successFeedback, errorFeedback } from '../../utils/haptics';

interface Listing {
  id: string;
  title: string;
  status: 'draft' | 'pending' | 'active' | 'ended' | 'sold' | 'cancelled';
  listing_type: 'auction' | 'fixed_price' | 'both';
  starting_price: number | null;
  fixed_price: number | null;
  current_bid: number | null;
  created_at: string;
  end_time: string | null;
  seller: {
    id: string;
    full_name: string | null;
    company_name: string | null;
  };
  images: { url: string }[];
  bid_count: number;
}

type FilterType = 'all' | 'pending' | 'active' | 'ended' | 'cancelled';

export default function AdminListingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: listings, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['adminListings', filter],
    queryFn: async () => {
      let query = supabase
        .from('listings')
        .select(`
          *,
          seller:profiles!seller_id(id, full_name, company_name),
          images:listing_images(url)
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data as Listing[];
    },
    enabled: !!profile?.is_admin,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ listingId, status }: { listingId: string; status: string }) => {
      const { error } = await supabase
        .from('listings')
        .update({ status })
        .eq('id', listingId);
      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['adminListings'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to update listing');
    },
  });

  const handleStatusChange = (listing: Listing, newStatus: string) => {
    lightTap();
    Alert.alert(
      'Update Listing Status',
      `Change listing status to "${newStatus}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => updateStatusMutation.mutate({ listingId: listing.id, status: newStatus }) },
      ]
    );
  };

  const filteredListings = listings?.filter(listing => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      listing.title?.toLowerCase().includes(query) ||
      listing.seller?.full_name?.toLowerCase().includes(query) ||
      listing.seller?.company_name?.toLowerCase().includes(query)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return colors.success;
      case 'pending': return colors.warning;
      case 'ended': return colors.textMuted;
      case 'sold': return colors.accent;
      case 'cancelled': return colors.error;
      default: return colors.textLight;
    }
  };

  const FilterButton = ({ type, label }: { type: FilterType; label: string }) => (
    <TouchableOpacity
      style={[styles.filterButton, filter === type && styles.filterButtonActive]}
      onPress={() => {
        lightTap();
        setFilter(type);
      }}
    >
      <Text style={[styles.filterButtonText, filter === type && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderListing = ({ item }: { item: Listing }) => {
    const price = item.current_bid || item.fixed_price || item.starting_price || 0;
    const imageUrl = item.images?.[0]?.url;

    return (
      <TouchableOpacity
        style={styles.listingCard}
        onPress={() => navigation.navigate('HomeTab', { screen: 'ListingDetail', params: { listingId: item.id } })}
      >
        <Image
          source={imageUrl || require('../../../assets/placeholder.png')}
          style={styles.listingImage}
          contentFit="cover"
        />

        <View style={styles.listingContent}>
          <View style={styles.listingHeader}>
            <Text style={styles.listingTitle} numberOfLines={2}>{item.title}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>

          <Text style={styles.sellerName}>
            by {item.seller?.company_name || item.seller?.full_name || 'Unknown'}
          </Text>

          <View style={styles.listingMeta}>
            <Text style={styles.price}>{formatCurrency(price)}</Text>
            <Text style={styles.metaText}>
              {item.listing_type === 'auction' ? `${item.bid_count || 0} bids` : 'Fixed Price'}
            </Text>
          </View>

          <Text style={styles.dateText}>
            Created {formatRelativeTime(item.created_at)}
          </Text>

          {/* Quick Actions */}
          <View style={styles.actionRow}>
            {item.status === 'pending' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.approveButton]}
                onPress={() => handleStatusChange(item, 'active')}
              >
                <Feather name="check" size={14} color={colors.white} />
                <Text style={styles.actionButtonTextWhite}>Approve</Text>
              </TouchableOpacity>
            )}
            {item.status === 'active' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.endButton]}
                onPress={() => handleStatusChange(item, 'ended')}
              >
                <Feather name="x-circle" size={14} color={colors.white} />
                <Text style={styles.actionButtonTextWhite}>End</Text>
              </TouchableOpacity>
            )}
            {item.status !== 'cancelled' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton]}
                onPress={() => handleStatusChange(item, 'cancelled')}
              >
                <Feather name="trash-2" size={14} color={colors.error} />
                <Text style={styles.actionButtonTextDanger}>Cancel</Text>
              </TouchableOpacity>
            )}
            {item.status === 'cancelled' && (
              <TouchableOpacity
                style={[styles.actionButton, styles.restoreButton]}
                onPress={() => handleStatusChange(item, 'active')}
              >
                <Feather name="refresh-cw" size={14} color={colors.success} />
                <Text style={styles.actionButtonTextSuccess}>Restore</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!profile?.is_admin) {
    return (
      <View style={styles.unauthorizedContainer}>
        <Feather name="shield-off" size={48} color={colors.error} />
        <Text style={styles.unauthorizedText}>Access Denied</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Feather name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search listings..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        <FilterButton type="all" label="All" />
        <FilterButton type="pending" label="Pending" />
        <FilterButton type="active" label="Active" />
        <FilterButton type="ended" label="Ended" />
        <FilterButton type="cancelled" label="Cancelled" />
      </View>

      {/* Listings List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredListings}
          renderItem={renderListing}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="package" size={48} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No Listings Found</Text>
              <Text style={styles.emptyText}>
                {searchQuery ? 'Try a different search term' : 'No listings match the current filter'}
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
  unauthorizedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  unauthorizedText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  searchContainer: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInputContainer: {
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
    color: colors.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.sand,
  },
  filterButtonActive: {
    backgroundColor: colors.accent,
  },
  filterButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  filterButtonTextActive: {
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
  listingImage: {
    width: '100%',
    height: 150,
    backgroundColor: colors.sand,
  },
  listingContent: {
    padding: spacing.lg,
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  listingTitle: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.white,
    textTransform: 'capitalize',
  },
  sellerName: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  listingMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  price: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.accent,
  },
  metaText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.sm,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  approveButton: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  endButton: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  cancelButton: {
    backgroundColor: colors.white,
    borderColor: colors.error,
  },
  restoreButton: {
    backgroundColor: colors.white,
    borderColor: colors.success,
  },
  actionButtonTextWhite: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.white,
  },
  actionButtonTextDanger: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.error,
  },
  actionButtonTextSuccess: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.success,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
