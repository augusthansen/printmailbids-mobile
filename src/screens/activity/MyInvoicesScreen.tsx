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
import { useTheme } from '../../contexts/ThemeContext';
import { Invoice, Listing, ListingImage, Profile } from '../../types/database';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatDate, formatRelativeTime } from '../../utils/formatters';
import { lightTap } from '../../utils/haptics';

type FilterType = 'all' | 'pending' | 'paid' | 'shipped' | 'delivered';

interface InvoiceWithDetails extends Invoice {
  listing: Listing & {
    images: ListingImage[];
  };
  seller: Profile;
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Awaiting Payment' },
  { key: 'paid', label: 'Paid' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
];

// Pipeline steps for fulfillment
const PIPELINE_STEPS = [
  { key: 'awaiting_payment', label: 'Payment', icon: 'credit-card' },
  { key: 'paid', label: 'Processing', icon: 'package' },
  { key: 'ready_for_pickup', label: 'Ready', icon: 'check-circle' },
  { key: 'shipped', label: 'Shipped', icon: 'truck' },
  { key: 'delivered', label: 'Delivered', icon: 'home' },
  { key: 'completed', label: 'Complete', icon: 'check' },
] as const;

export default function MyInvoicesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: invoices, isLoading, refetch } = useQuery<InvoiceWithDetails[]>({
    queryKey: ['myInvoices', user?.id],
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
          seller:profiles!seller_id(*)
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as InvoiceWithDetails[];
    },
    enabled: !!user,
  });

  const filteredInvoices = invoices?.filter(invoice => {
    if (filter === 'all') return true;
    if (filter === 'pending') return invoice.status === 'pending';
    if (filter === 'paid') return invoice.status === 'paid' && invoice.fulfillment_status === 'paid';
    if (filter === 'shipped') return invoice.fulfillment_status === 'shipped';
    if (filter === 'delivered') return invoice.fulfillment_status === 'delivered' || invoice.fulfillment_status === 'completed';
    return true;
  }) || [];

  const getPaymentStatusStyle = (status: Invoice['status']) => {
    switch (status) {
      case 'pending':
        return { bg: colors.warningLight, text: colors.warning, label: 'Awaiting Payment' };
      case 'paid':
        return { bg: colors.successLight, text: colors.success, label: 'Paid' };
      case 'overdue':
        return { bg: colors.errorLight, text: colors.error, label: 'Overdue' };
      default:
        return { bg: colors.sand, text: colors.textMuted, label: status };
    }
  };

  const getPipelineStep = (fulfillmentStatus: Invoice['fulfillment_status']) => {
    const stepIndex = PIPELINE_STEPS.findIndex(step => step.key === fulfillmentStatus);
    return stepIndex >= 0 ? stepIndex : 0;
  };

  const handleInvoicePress = useCallback((invoice: InvoiceWithDetails) => {
    lightTap();
    navigation.navigate('InvoiceDetail' as never, { invoiceId: invoice.id } as never);
  }, [navigation]);

  const handlePayNow = useCallback((invoice: InvoiceWithDetails) => {
    lightTap();
    navigation.navigate('Checkout' as never, { invoiceId: invoice.id } as never);
  }, [navigation]);

  const renderPipeline = (fulfillmentStatus: Invoice['fulfillment_status']) => {
    const currentStep = getPipelineStep(fulfillmentStatus);

    return (
      <View style={styles.pipeline}>
        {PIPELINE_STEPS.map((step, index) => {
          const isCompleted = index <= currentStep;
          const isCurrent = index === currentStep;

          return (
            <React.Fragment key={step.key}>
              <View style={styles.pipelineStep}>
                <View style={[
                  styles.pipelineIcon,
                  isCompleted && styles.pipelineIconCompleted,
                  isCurrent && styles.pipelineIconCurrent,
                ]}>
                  <Feather
                    name={step.icon as keyof typeof Feather.glyphMap}
                    size={12}
                    color={isCompleted ? colors.white : colors.textLight}
                  />
                </View>
                <Text style={[
                  styles.pipelineLabel,
                  isCompleted && styles.pipelineLabelCompleted,
                ]}>
                  {step.label}
                </Text>
              </View>
              {index < PIPELINE_STEPS.length - 1 && (
                <View style={[
                  styles.pipelineLine,
                  index < currentStep && styles.pipelineLineCompleted,
                ]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    );
  };

  const renderInvoiceItem = useCallback(({ item }: { item: InvoiceWithDetails }) => {
    const paymentStatus = getPaymentStatusStyle(item.status);
    const primaryImage = item.listing?.images?.find(img => img.is_primary) || item.listing?.images?.[0];
    const isOverdue = item.status === 'pending' && new Date(item.payment_due_date) < new Date();
    const showPipeline = item.status === 'paid';

    return (
      <TouchableOpacity
        style={[styles.invoiceCard, { backgroundColor: themeColors.surface }]}
        onPress={() => handleInvoicePress(item)}
        activeOpacity={0.7}
      >
        {/* Overdue Alert */}
        {isOverdue && (
          <View style={styles.overdueAlert}>
            <Feather name="alert-triangle" size={14} color={colors.error} />
            <Text style={styles.overdueText}>Payment overdue</Text>
          </View>
        )}

        <View style={styles.invoiceCardContent}>
          {/* Image */}
          {primaryImage?.url ? (
            <Image source={primaryImage.url} style={styles.listingImage} contentFit="cover" />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Feather name="package" size={24} color={themeColors.textMuted} />
            </View>
          )}

          {/* Details */}
          <View style={styles.invoiceDetails}>
            <Text style={[styles.invoiceNumber, { color: themeColors.textMuted }]}>#{item.invoice_number}</Text>
            <Text style={[styles.listingTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>
              {item.listing?.title || 'Item'}
            </Text>

            <View style={styles.priceRow}>
              <Text style={[styles.totalLabel, { color: themeColors.textMuted }]}>Total:</Text>
              <Text style={[styles.totalAmount, { color: themeColors.textPrimary }]}>{formatCurrency(item.total_amount)}</Text>
            </View>

            {item.seller && (
              <View style={styles.sellerRow}>
                <Feather name="user" size={12} color={themeColors.textMuted} />
                <Text style={[styles.sellerName, { color: themeColors.textMuted }]}>
                  {item.seller.company_name || item.seller.full_name}
                </Text>
              </View>
            )}

            <View style={styles.metaRow}>
              <View style={[styles.statusBadge, { backgroundColor: paymentStatus.bg }]}>
                <Text style={[styles.statusText, { color: paymentStatus.text }]}>
                  {paymentStatus.label}
                </Text>
              </View>
              <Text style={[styles.dateText, { color: themeColors.textMuted }]}>
                {item.status === 'pending'
                  ? `Due: ${formatDate(item.payment_due_date)}`
                  : formatRelativeTime(item.created_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* Fulfillment Pipeline for paid invoices */}
        {showPipeline && (
          <View style={styles.pipelineContainer}>
            {renderPipeline(item.fulfillment_status)}
          </View>
        )}

        {/* Tracking info if shipped */}
        {item.tracking_number && (
          <View style={styles.trackingContainer}>
            <Feather name="truck" size={14} color={colors.accent} />
            <Text style={styles.trackingText}>
              {item.shipping_carrier}: {item.tracking_number}
            </Text>
          </View>
        )}

        {/* Pay Now button for pending invoices */}
        {item.status === 'pending' && (
          <TouchableOpacity
            style={[styles.payNowButton, isOverdue && styles.payNowButtonUrgent]}
            onPress={() => handlePayNow(item)}
          >
            <Text style={styles.payNowButtonText}>Pay Now</Text>
            <Feather name="arrow-right" size={16} color={colors.white} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  }, [handleInvoicePress, handlePayNow]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Feather name="shopping-bag" size={48} color={themeColors.textMuted} />
      <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No purchases yet</Text>
      <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
        {filter === 'all'
          ? "When you win auctions or have accepted offers, your invoices will appear here."
          : `No ${filter} purchases found.`}
      </Text>
      {filter === 'all' && (
        <TouchableOpacity
          style={styles.browseButton}
          onPress={() => navigation.navigate('HomeTab' as never)}
        >
          <Text style={styles.browseButtonText}>Browse Listings</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Calculate summary stats
  const pendingCount = invoices?.filter(i => i.status === 'pending').length || 0;
  const pendingTotal = invoices
    ?.filter(i => i.status === 'pending')
    .reduce((sum, i) => sum + i.total_amount, 0) || 0;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Summary Card */}
      {pendingCount > 0 && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryLabel}>Awaiting Payment</Text>
            <Text style={styles.summaryValue}>{pendingCount} invoices</Text>
          </View>
          <View style={styles.summaryRight}>
            <Text style={styles.summaryTotal}>{formatCurrency(pendingTotal)}</Text>
          </View>
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

      {/* Invoices List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredInvoices}
          renderItem={renderInvoiceItem}
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
  },
  summaryLeft: {},
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  summaryValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
    marginTop: spacing.xs,
  },
  summaryRight: {},
  summaryTotal: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.white,
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
  invoiceCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  overdueAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.errorLight,
    borderBottomWidth: 1,
    borderBottomColor: colors.error,
  },
  overdueText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.error,
  },
  invoiceCardContent: {
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
  invoiceDetails: {
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
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  totalLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  totalAmount: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  sellerName: {
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
  dateText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  pipelineContainer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  pipeline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  pipelineStep: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  pipelineIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pipelineIconCompleted: {
    backgroundColor: colors.success,
  },
  pipelineIconCurrent: {
    backgroundColor: colors.accent,
  },
  pipelineLabel: {
    fontSize: 9,
    color: colors.textMuted,
  },
  pipelineLabelCompleted: {
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  pipelineLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.sand,
    marginHorizontal: spacing.xs,
    marginBottom: spacing.lg,
  },
  pipelineLineCompleted: {
    backgroundColor: colors.success,
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
  trackingText: {
    fontSize: fontSize.sm,
    color: colors.accent,
    fontWeight: fontWeight.medium,
  },
  payNowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    backgroundColor: colors.accent,
  },
  payNowButtonUrgent: {
    backgroundColor: colors.error,
  },
  payNowButtonText: {
    fontSize: fontSize.base,
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
