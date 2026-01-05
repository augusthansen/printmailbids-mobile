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
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { lightTap, successFeedback, errorFeedback } from '../../utils/haptics';

interface Invoice {
  id: string;
  invoice_number: string;
  status: 'pending' | 'paid' | 'cancelled' | 'refunded';
  total_amount: number;
  buyer_premium: number;
  seller_payout_amount: number;
  platform_fee: number;
  created_at: string;
  paid_at: string | null;
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
  };
}

type FilterType = 'all' | 'pending' | 'paid' | 'refunded';

export default function AdminSalesScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: invoices, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['adminInvoices', filter],
    queryFn: async () => {
      let query = supabase
        .from('invoices')
        .select(`
          *,
          buyer:profiles!buyer_id(id, full_name, company_name, email),
          seller:profiles!seller_id(id, full_name, company_name),
          listing:listings(id, title)
        `)
        .order('created_at', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data as Invoice[];
    },
    enabled: !!profile?.is_admin,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ invoiceId, status, paidAt }: { invoiceId: string; status: string; paidAt?: string }) => {
      const updateData: any = { status };
      if (paidAt) updateData.paid_at = paidAt;

      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['adminInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to update invoice');
    },
  });

  const handleStatusChange = (invoice: Invoice, newStatus: string) => {
    lightTap();
    Alert.alert(
      'Update Invoice Status',
      `Mark invoice #${invoice.invoice_number} as "${newStatus}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => updateStatusMutation.mutate({
            invoiceId: invoice.id,
            status: newStatus,
            paidAt: newStatus === 'paid' ? new Date().toISOString() : undefined
          })
        },
      ]
    );
  };

  const filteredInvoices = invoices?.filter(invoice => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      invoice.invoice_number?.toLowerCase().includes(query) ||
      invoice.buyer?.full_name?.toLowerCase().includes(query) ||
      invoice.buyer?.company_name?.toLowerCase().includes(query) ||
      invoice.buyer?.email?.toLowerCase().includes(query) ||
      invoice.listing?.title?.toLowerCase().includes(query)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return colors.success;
      case 'pending': return colors.warning;
      case 'refunded': return colors.accent;
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

  // Calculate totals
  const totals = invoices?.reduce((acc, inv) => {
    if (inv.status === 'paid') {
      acc.revenue += inv.total_amount || 0;
      acc.platformFees += inv.platform_fee || 0;
      acc.sellerPayouts += inv.seller_payout_amount || 0;
    }
    return acc;
  }, { revenue: 0, platformFees: 0, sellerPayouts: 0 });

  const renderInvoice = ({ item }: { item: Invoice }) => (
    <View style={styles.invoiceCard}>
      <View style={styles.invoiceHeader}>
        <View>
          <Text style={styles.invoiceNumber}>#{item.invoice_number}</Text>
          <Text style={styles.listingTitle} numberOfLines={1}>
            {item.listing?.title || 'Unknown Listing'}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
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

      <View style={styles.amountsRow}>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Total</Text>
          <Text style={styles.amountValue}>{formatCurrency(item.total_amount)}</Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Platform Fee</Text>
          <Text style={styles.amountValueSmall}>{formatCurrency(item.platform_fee || 0)}</Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Seller Payout</Text>
          <Text style={styles.amountValueSmall}>{formatCurrency(item.seller_payout_amount || 0)}</Text>
        </View>
      </View>

      <View style={styles.dateRow}>
        <Text style={styles.dateText}>Created {formatRelativeTime(item.created_at)}</Text>
        {item.paid_at && (
          <Text style={styles.dateText}>Paid {formatRelativeTime(item.paid_at)}</Text>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionRow}>
        {item.status === 'pending' && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, styles.paidButton]}
              onPress={() => handleStatusChange(item, 'paid')}
            >
              <Feather name="check" size={14} color={colors.white} />
              <Text style={styles.actionButtonTextWhite}>Mark Paid</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton]}
              onPress={() => handleStatusChange(item, 'cancelled')}
            >
              <Feather name="x" size={14} color={colors.error} />
              <Text style={styles.actionButtonTextDanger}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
        {item.status === 'paid' && (
          <TouchableOpacity
            style={[styles.actionButton, styles.refundButton]}
            onPress={() => handleStatusChange(item, 'refunded')}
          >
            <Feather name="rotate-ccw" size={14} color={colors.warning} />
            <Text style={styles.actionButtonTextWarning}>Refund</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

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
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{formatCurrency(totals?.revenue || 0)}</Text>
          <Text style={styles.summaryLabel}>Total Revenue</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{formatCurrency(totals?.platformFees || 0)}</Text>
          <Text style={styles.summaryLabel}>Platform Fees</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{formatCurrency(totals?.sellerPayouts || 0)}</Text>
          <Text style={styles.summaryLabel}>Seller Payouts</Text>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Feather name="search" size={20} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search invoices..."
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
        <FilterButton type="paid" label="Paid" />
        <FilterButton type="refunded" label="Refunded" />
      </View>

      {/* Invoice List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredInvoices}
          renderItem={renderInvoice}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="file-text" size={48} color={colors.textLight} />
              <Text style={styles.emptyTitle}>No Invoices Found</Text>
              <Text style={styles.emptyText}>
                {searchQuery ? 'Try a different search term' : 'No invoices match the current filter'}
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
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    backgroundColor: colors.textLight,
    opacity: 0.3,
  },
  summaryValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  summaryLabel: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.xs,
  },
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
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
  invoiceCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  invoiceNumber: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  listingTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
    maxWidth: 200,
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
  partiesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
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
  amountsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  amountItem: {
    flex: 1,
  },
  amountLabel: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  amountValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.accent,
    marginTop: 2,
  },
  amountValueSmall: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: 2,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  paidButton: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  cancelButton: {
    backgroundColor: colors.white,
    borderColor: colors.error,
  },
  refundButton: {
    backgroundColor: colors.white,
    borderColor: colors.warning,
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
  actionButtonTextWarning: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.warning,
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
