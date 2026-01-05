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
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Invoice, Listing, ListingImage, Profile } from '../../types/database';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatDate, formatRelativeTime } from '../../utils/formatters';
import { lightTap } from '../../utils/haptics';

type FilterType = 'all' | 'pending' | 'processing' | 'shipped' | 'completed';

interface SaleWithDetails extends Invoice {
  listing: Listing & {
    images: ListingImage[];
  };
  buyer: Profile;
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Awaiting Payment' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'completed', label: 'Completed' },
];

export default function MySalesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: sales, isLoading, refetch } = useQuery<SaleWithDetails[]>({
    queryKey: ['mySales', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          listing:listings(
            *,
            images:listing_images(*)
          ),
          buyer:profiles!buyer_id(*)
        `)
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SaleWithDetails[];
    },
    enabled: !!user,
  });

  const filteredSales = sales?.filter(sale => {
    if (filter === 'all') return true;
    if (filter === 'pending') return sale.status === 'pending';
    if (filter === 'processing') return sale.status === 'paid' &&
      ['paid', 'packaging', 'ready_for_pickup'].includes(sale.fulfillment_status);
    if (filter === 'shipped') return sale.fulfillment_status === 'shipped';
    if (filter === 'completed') return ['delivered', 'completed'].includes(sale.fulfillment_status);
    return true;
  }) || [];

  const getFulfillmentStatusStyle = (status: Invoice['fulfillment_status']) => {
    switch (status) {
      case 'awaiting_payment':
        return { bg: colors.warningLight, text: colors.warning, label: 'Awaiting Payment' };
      case 'paid':
        return { bg: colors.accentFaint, text: colors.accent, label: 'Payment Received' };
      case 'packaging':
        return { bg: colors.accentFaint, text: colors.accent, label: 'Packaging' };
      case 'ready_for_pickup':
        return { bg: colors.successLight, text: colors.success, label: 'Ready for Pickup' };
      case 'shipped':
        return { bg: colors.accentFaint, text: colors.accent, label: 'Shipped' };
      case 'delivered':
        return { bg: colors.successLight, text: colors.success, label: 'Delivered' };
      case 'completed':
        return { bg: colors.successLight, text: colors.success, label: 'Completed' };
      default:
        return { bg: colors.sand, text: colors.textMuted, label: status };
    }
  };

  const handleSalePress = useCallback((sale: SaleWithDetails) => {
    lightTap();
    navigation.navigate('InvoiceDetail' as never, { invoiceId: sale.id } as never);
  }, [navigation]);

  const renderSaleItem = useCallback(({ item }: { item: SaleWithDetails }) => {
    const status = getFulfillmentStatusStyle(item.fulfillment_status);
    const primaryImage = item.listing?.images?.find(img => img.is_primary) || item.listing?.images?.[0];
    const needsAction = item.status === 'paid' &&
      ['paid', 'packaging'].includes(item.fulfillment_status);

    return (
      <TouchableOpacity
        style={styles.saleCard}
        onPress={() => handleSalePress(item)}
        activeOpacity={0.7}
      >
        {/* Action needed banner */}
        {needsAction && (
          <View style={styles.actionBanner}>
            <Feather name="alert-circle" size={14} color={colors.accent} />
            <Text style={styles.actionBannerText}>Action needed - ship item</Text>
          </View>
        )}

        <View style={styles.saleCardContent}>
          {/* Image */}
          {primaryImage?.url ? (
            <Image source={primaryImage.url} style={styles.listingImage} contentFit="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Feather name="package" size={24} color={colors.textLight} />
            </View>
          )}

          {/* Details */}
          <View style={styles.saleDetails}>
            <Text style={styles.invoiceNumber}>#{item.invoice_number}</Text>
            <Text style={styles.listingTitle} numberOfLines={2}>
              {item.listing?.title || 'Item'}
            </Text>

            {/* Buyer info */}
            {item.buyer && (
              <View style={styles.buyerRow}>
                <Feather name="user" size={12} color={colors.textMuted} />
                <Text style={styles.buyerName}>
                  {item.buyer.company_name || item.buyer.full_name}
                </Text>
              </View>
            )}

            {/* Price breakdown */}
            <View style={styles.priceBreakdown}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Sale Amount:</Text>
                <Text style={styles.priceValue}>{formatCurrency(item.sale_amount)}</Text>
              </View>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Commission:</Text>
                <Text style={styles.priceValueMuted}>
                  -{formatCurrency(item.seller_commission_amount)}
                </Text>
              </View>
              <View style={[styles.priceRow, styles.payoutRow]}>
                <Text style={styles.payoutLabel}>Your Payout:</Text>
                <Text style={styles.payoutValue}>
                  {formatCurrency(item.seller_payout_amount)}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
              </View>
              <Text style={styles.dateText}>
                {formatRelativeTime(item.created_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* Tracking info if shipped */}
        {item.tracking_number && (
          <View style={styles.trackingContainer}>
            <Feather name="truck" size={14} color={colors.accent} />
            <View style={styles.trackingInfo}>
              <Text style={styles.trackingLabel}>
                {item.shipping_carrier || 'Tracking'}:
              </Text>
              <Text style={styles.trackingNumber}>{item.tracking_number}</Text>
            </View>
          </View>
        )}

        {/* Action buttons for processing items */}
        {needsAction && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.updateButton}
              onPress={() => handleSalePress(item)}
            >
              <Feather name="edit-2" size={14} color={colors.white} />
              <Text style={styles.updateButtonText}>Update Status</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  }, [handleSalePress]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Feather name="dollar-sign" size={48} color={colors.textLight} />
      <Text style={styles.emptyTitle}>No sales yet</Text>
      <Text style={styles.emptyText}>
        {filter === 'all'
          ? "When you sell items, they'll appear here."
          : `No ${filter} sales found.`}
      </Text>
    </View>
  );

  // Calculate summary stats
  const totalRevenue = sales?.reduce((sum, s) =>
    s.status === 'paid' ? sum + s.seller_payout_amount : sum, 0) || 0;
  const pendingPayments = sales?.filter(s => s.status === 'pending').length || 0;
  const needsShipping = sales?.filter(s =>
    s.status === 'paid' && ['paid', 'packaging'].includes(s.fulfillment_status)
  ).length || 0;

  return (
    <View style={styles.container}>
      {/* Summary Card */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Earnings</Text>
          <Text style={styles.summaryValue}>{formatCurrency(totalRevenue)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.miniStat}>
            <View style={[styles.miniStatIcon, { backgroundColor: colors.warningLight }]}>
              <Feather name="clock" size={14} color={colors.warning} />
            </View>
            <Text style={styles.miniStatValue}>{pendingPayments}</Text>
            <Text style={styles.miniStatLabel}>Pending</Text>
          </View>
          <View style={styles.miniStat}>
            <View style={[styles.miniStatIcon, { backgroundColor: colors.accentFaint }]}>
              <Feather name="package" size={14} color={colors.accent} />
            </View>
            <Text style={styles.miniStatValue}>{needsShipping}</Text>
            <Text style={styles.miniStatLabel}>To Ship</Text>
          </View>
        </View>
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

      {/* Sales List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredSales}
          renderItem={renderSaleItem}
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
  summaryContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  summaryCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  summaryValue: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.white,
    marginTop: spacing.xs,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  miniStat: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  miniStatIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  miniStatValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  miniStatLabel: {
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
  saleCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  actionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.accentFaint,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
  },
  actionBannerText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  saleCardContent: {
    flexDirection: 'row',
    padding: spacing.md,
  },
  listingImage: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
  },
  imagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saleDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  invoiceNumber: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  listingTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  buyerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  buyerName: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  priceBreakdown: {
    marginBottom: spacing.sm,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  priceLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  priceValue: {
    fontSize: fontSize.xs,
    color: colors.textPrimary,
  },
  priceValueMuted: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  payoutRow: {
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  payoutLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  payoutValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.success,
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
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  trackingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.accentFaint,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  trackingInfo: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  trackingLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  trackingNumber: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  actionButtons: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accent,
  },
  updateButtonText: {
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
});
