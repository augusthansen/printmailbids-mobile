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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { lightTap, successFeedback, errorFeedback } from '../../utils/haptics';

interface Offer {
  id: string;
  amount: number;
  status: 'pending' | 'accepted' | 'declined' | 'countered' | 'expired';
  message: string | null;
  counter_amount: number | null;
  counter_count: number;
  created_at: string;
  expires_at: string;
  buyer: {
    id: string;
    full_name: string | null;
    company_name: string | null;
    email: string;
  };
  seller: {
    id: string;
    full_name: string | null;
    company_name: string | null;
  };
  listing: {
    id: string;
    title: string;
    fixed_price: number | null;
    images: { url: string }[];
  };
}

type FilterType = 'all' | 'pending' | 'accepted' | 'declined' | 'expired';

export default function AdminOffersScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: offers, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['adminOffers', filter],
    queryFn: async () => {
      let query = supabase
        .from('offers')
        .select(`
          *,
          buyer:profiles!buyer_id(id, full_name, company_name, email),
          seller:profiles!seller_id(id, full_name, company_name),
          listing:listings(id, title, fixed_price, images:listing_images(url))
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data as Offer[];
    },
    enabled: !!profile?.is_admin,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ offerId, status }: { offerId: string; status: string }) => {
      const { error } = await supabase
        .from('offers')
        .update({ status })
        .eq('id', offerId);
      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['adminOffers'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to update offer');
    },
  });

  const handleStatusChange = (offer: Offer, newStatus: string) => {
    lightTap();
    Alert.alert(
      'Update Offer Status',
      `Mark this offer as "${newStatus}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => updateStatusMutation.mutate({ offerId: offer.id, status: newStatus }) },
      ]
    );
  };

  const filteredOffers = offers?.filter(offer => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      offer.buyer?.full_name?.toLowerCase().includes(query) ||
      offer.buyer?.company_name?.toLowerCase().includes(query) ||
      offer.buyer?.email?.toLowerCase().includes(query) ||
      offer.listing?.title?.toLowerCase().includes(query)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted': return colors.success;
      case 'pending': return colors.warning;
      case 'declined': return colors.error;
      case 'countered': return colors.accent;
      case 'expired': return colors.textMuted;
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

  const renderOffer = ({ item }: { item: Offer }) => {
    const listingPrice = item.listing?.fixed_price || 0;
    const percentOfAsk = listingPrice > 0 ? Math.round((item.amount / listingPrice) * 100) : 0;
    const imageUrl = item.listing?.images?.[0]?.url;
    const isExpired = new Date(item.expires_at) < new Date() && item.status === 'pending';

    return (
      <View style={styles.offerCard}>
        <View style={styles.offerHeader}>
          <Image
            source={imageUrl || require('../../../assets/placeholder.png')}
            style={styles.listingImage}
            contentFit="cover"
          />
          <View style={styles.offerInfo}>
            <Text style={styles.listingTitle} numberOfLines={2}>
              {item.listing?.title || 'Unknown Listing'}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: isExpired ? colors.textMuted : getStatusColor(item.status) }]}>
              <Text style={styles.statusText}>{isExpired ? 'expired' : item.status}</Text>
            </View>
          </View>
        </View>

        <View style={styles.amountRow}>
          <View>
            <Text style={styles.amountLabel}>Offer Amount</Text>
            <Text style={styles.offerAmount}>{formatCurrency(item.amount)}</Text>
            {listingPrice > 0 && (
              <Text style={[styles.percentText, percentOfAsk < 80 && styles.lowOffer]}>
                {percentOfAsk}% of asking ({formatCurrency(listingPrice)})
              </Text>
            )}
          </View>
          {item.counter_amount && (
            <View style={styles.counterInfo}>
              <Text style={styles.amountLabel}>Counter</Text>
              <Text style={styles.counterAmount}>{formatCurrency(item.counter_amount)}</Text>
              <Text style={styles.counterCount}>({item.counter_count} rounds)</Text>
            </View>
          )}
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyInfo}>
            <Text style={styles.partyLabel}>Buyer</Text>
            <Text style={styles.partyName}>
              {item.buyer?.company_name || item.buyer?.full_name || 'Unknown'}
            </Text>
          </View>
          <Feather name="arrow-right" size={16} color={colors.textLight} />
          <View style={[styles.partyInfo, styles.partyInfoRight]}>
            <Text style={styles.partyLabel}>Seller</Text>
            <Text style={styles.partyName}>
              {item.seller?.company_name || item.seller?.full_name || 'Unknown'}
            </Text>
          </View>
        </View>

        {item.message && (
          <View style={styles.messageBox}>
            <Feather name="message-circle" size={14} color={colors.textMuted} />
            <Text style={styles.messageText} numberOfLines={2}>{item.message}</Text>
          </View>
        )}

        <View style={styles.dateRow}>
          <Text style={styles.dateText}>Created {formatRelativeTime(item.created_at)}</Text>
          <Text style={styles.dateText}>
            Expires {formatRelativeTime(item.expires_at)}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          {item.status === 'pending' && !isExpired && (
            <>
              <TouchableOpacity
                style={[styles.actionButton, styles.acceptButton]}
                onPress={() => handleStatusChange(item, 'accepted')}
              >
                <Feather name="check" size={14} color={colors.white} />
                <Text style={styles.actionButtonTextWhite}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.declineButton]}
                onPress={() => handleStatusChange(item, 'declined')}
              >
                <Feather name="x" size={14} color={colors.error} />
                <Text style={styles.actionButtonTextDanger}>Decline</Text>
              </TouchableOpacity>
            </>
          )}
          {(item.status === 'pending' && isExpired) && (
            <TouchableOpacity
              style={[styles.actionButton, styles.expireButton]}
              onPress={() => handleStatusChange(item, 'expired')}
            >
              <Feather name="clock" size={14} color={colors.textMuted} />
              <Text style={styles.actionButtonTextMuted}>Mark Expired</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
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
            placeholder="Search offers..."
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
        <FilterButton type="accepted" label="Accepted" />
        <FilterButton type="declined" label="Declined" />
        <FilterButton type="expired" label="Expired" />
      </View>

      {/* Offers List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredOffers}
          renderItem={renderOffer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="message-square" size={48} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No Offers Found</Text>
              <Text style={styles.emptyText}>
                {searchQuery ? 'Try a different search term' : 'No offers match the current filter'}
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
  offerCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  offerHeader: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  listingImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
    backgroundColor: colors.sand,
  },
  offerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  listingTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginTop: spacing.xs,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.white,
    textTransform: 'capitalize',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  amountLabel: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  offerAmount: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.accent,
    marginTop: 2,
  },
  percentText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  lowOffer: {
    color: colors.warning,
  },
  counterInfo: {
    alignItems: 'flex-end',
  },
  counterAmount: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: 2,
  },
  counterCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  partiesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  partyInfo: {
    flex: 1,
  },
  partyInfoRight: {
    alignItems: 'flex-end',
  },
  partyLabel: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  partyName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    marginTop: 2,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.sand,
    borderRadius: borderRadius.md,
  },
  messageText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textLight,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  acceptButton: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  declineButton: {
    backgroundColor: colors.white,
    borderColor: colors.error,
  },
  expireButton: {
    backgroundColor: colors.white,
    borderColor: colors.textMuted,
  },
  actionButtonTextWhite: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.white,
  },
  actionButtonTextDanger: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.error,
  },
  actionButtonTextMuted: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textMuted,
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
