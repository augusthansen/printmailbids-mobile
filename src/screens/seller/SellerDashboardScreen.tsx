import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Invoice, Listing } from '../../types/database';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency } from '../../utils/formatters';
import { lightTap } from '../../utils/haptics';

type TimePeriod = '7d' | '30d' | '90d' | 'all';

interface SellerStats {
  totalRevenue: number;
  totalSales: number;
  pendingPayments: number;
  pendingPaymentsAmount: number;
  activeListings: number;
  endingSoonListings: number;
  totalViews: number;
  totalWatchers: number;
  averageOrderValue: number;
  conversionRate: number;
  revenueByPeriod: { date: string; amount: number }[];
  topListings: Listing[];
  recentSales: Invoice[];
  pendingActions: {
    toShip: number;
    offersToReview: number;
    expiringSoon: number;
  };
}

const TIME_PERIODS: { key: TimePeriod; label: string }[] = [
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
  { key: 'all', label: 'All Time' },
];

export default function SellerDashboardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('30d');

  const getDateRange = (period: TimePeriod): Date | null => {
    const now = new Date();
    switch (period) {
      case '7d':
        return new Date(now.setDate(now.getDate() - 7));
      case '30d':
        return new Date(now.setDate(now.getDate() - 30));
      case '90d':
        return new Date(now.setDate(now.getDate() - 90));
      case 'all':
        return null;
    }
  };

  const { data: stats, isLoading, refetch, isRefetching } = useQuery<SellerStats>({
    queryKey: ['sellerDashboard', user?.id, timePeriod],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const startDate = getDateRange(timePeriod);
      const startDateStr = startDate?.toISOString();

      // Fetch invoices (sales)
      let invoicesQuery = supabase
        .from('invoices')
        .select('*')
        .eq('seller_id', user.id);

      if (startDateStr) {
        invoicesQuery = invoicesQuery.gte('created_at', startDateStr);
      }

      const { data: invoices, error: invoicesError } = await invoicesQuery.order('created_at', { ascending: false });
      if (invoicesError) throw invoicesError;

      // Fetch listings
      const { data: listings, error: listingsError } = await supabase
        .from('listings')
        .select('*')
        .eq('seller_id', user.id)
        .order('view_count', { ascending: false });

      if (listingsError) throw listingsError;

      // Fetch pending offers
      const { data: offers, error: offersError } = await supabase
        .from('offers')
        .select('*')
        .eq('seller_id', user.id)
        .eq('status', 'pending');

      if (offersError) throw offersError;

      // Calculate stats
      const paidInvoices = (invoices || []).filter(i => i.status === 'paid');
      const pendingInvoices = (invoices || []).filter(i => i.status === 'pending');
      const activeListings = (listings || []).filter(l => l.status === 'active');

      const now = new Date();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      const endingSoon = activeListings.filter(l => {
        if (!l.end_time) return false;
        const endTime = new Date(l.end_time);
        return endTime.getTime() - now.getTime() < twentyFourHours && endTime > now;
      });

      const toShip = (invoices || []).filter(i =>
        i.status === 'paid' && ['paid', 'packaging'].includes(i.fulfillment_status)
      );

      const totalRevenue = paidInvoices.reduce((sum, i) => sum + (i.seller_payout_amount || 0), 0);
      const totalViews = (listings || []).reduce((sum, l) => sum + (l.view_count || 0), 0);
      const totalWatchers = (listings || []).reduce((sum, l) => sum + (l.watch_count || 0), 0);
      const averageOrderValue = paidInvoices.length > 0 ? totalRevenue / paidInvoices.length : 0;

      // Calculate conversion rate (sales / total views)
      const conversionRate = totalViews > 0 ? (paidInvoices.length / totalViews) * 100 : 0;

      // Revenue by period (group by day for 7d/30d, by week for 90d, by month for all)
      const revenueByPeriod = calculateRevenueByPeriod(paidInvoices, timePeriod);

      // Top performing listings
      const topListings = activeListings.slice(0, 5);

      return {
        totalRevenue,
        totalSales: paidInvoices.length,
        pendingPayments: pendingInvoices.length,
        pendingPaymentsAmount: pendingInvoices.reduce((sum, i) => sum + (i.total_amount || 0), 0),
        activeListings: activeListings.length,
        endingSoonListings: endingSoon.length,
        totalViews,
        totalWatchers,
        averageOrderValue,
        conversionRate,
        revenueByPeriod,
        topListings,
        recentSales: (invoices || []).slice(0, 5) as Invoice[],
        pendingActions: {
          toShip: toShip.length,
          offersToReview: (offers || []).length,
          expiringSoon: endingSoon.length,
        },
      };
    },
    enabled: !!user,
  });

  const calculateRevenueByPeriod = (invoices: any[], period: TimePeriod) => {
    const grouped: Record<string, number> = {};

    invoices.forEach(invoice => {
      const date = new Date(invoice.created_at);
      let key: string;

      if (period === '7d' || period === '30d') {
        key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (period === '90d') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        key = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      }

      grouped[key] = (grouped[key] || 0) + (invoice.seller_payout_amount || 0);
    });

    return Object.entries(grouped)
      .map(([date, amount]) => ({ date, amount }))
      .slice(-10); // Last 10 periods
  };

  // Calculate max revenue for chart scaling
  const maxRevenue = useMemo(() => {
    if (!stats?.revenueByPeriod.length) return 1;
    return Math.max(...stats.revenueByPeriod.map(r => r.amount), 1);
  }, [stats?.revenueByPeriod]);

  const handleNavigate = (screen: string, params?: any) => {
    lightTap();
    navigation.navigate(screen as never, params as never);
  };

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={themeColors.accent}
        />
      }
    >
      {/* Time Period Selector */}
      <View style={[styles.periodSelector, { backgroundColor: themeColors.surface }]}>
        {TIME_PERIODS.map(period => (
          <TouchableOpacity
            key={period.key}
            style={[
              styles.periodButton,
              timePeriod === period.key && [styles.periodButtonActive, { backgroundColor: themeColors.accent }],
            ]}
            onPress={() => {
              lightTap();
              setTimePeriod(period.key);
            }}
          >
            <Text
              style={[
                styles.periodButtonText,
                { color: timePeriod === period.key ? '#ffffff' : themeColors.textMuted },
              ]}
            >
              {period.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Pending Actions Alert */}
      {stats && (stats.pendingActions.toShip > 0 || stats.pendingActions.offersToReview > 0) && (
        <View style={[styles.alertCard, { backgroundColor: themeColors.warningLight, borderColor: themeColors.warning }]}>
          <Feather name="alert-circle" size={20} color={themeColors.warning} />
          <View style={styles.alertContent}>
            <Text style={[styles.alertTitle, { color: themeColors.warning }]}>Actions Needed</Text>
            <View style={styles.alertItems}>
              {stats.pendingActions.toShip > 0 && (
                <TouchableOpacity
                  style={styles.alertItem}
                  onPress={() => handleNavigate('MySales')}
                >
                  <Text style={[styles.alertItemText, { color: themeColors.textPrimary }]}>
                    {stats.pendingActions.toShip} item{stats.pendingActions.toShip !== 1 ? 's' : ''} to ship
                  </Text>
                  <Feather name="chevron-right" size={16} color={themeColors.textMuted} />
                </TouchableOpacity>
              )}
              {stats.pendingActions.offersToReview > 0 && (
                <TouchableOpacity
                  style={styles.alertItem}
                  onPress={() => handleNavigate('SellerOffers')}
                >
                  <Text style={[styles.alertItemText, { color: themeColors.textPrimary }]}>
                    {stats.pendingActions.offersToReview} offer{stats.pendingActions.offersToReview !== 1 ? 's' : ''} to review
                  </Text>
                  <Feather name="chevron-right" size={16} color={themeColors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Key Metrics */}
      <View style={styles.metricsContainer}>
        {/* Main Revenue Card */}
        <View style={[styles.metricCardLarge, { backgroundColor: themeColors.accent }]}>
          <View style={styles.metricIcon}>
            <Feather name="dollar-sign" size={24} color="#ffffff" />
          </View>
          <Text style={styles.metricLabelLight}>Total Revenue</Text>
          <Text style={styles.metricValueLarge}>{formatCurrency(stats?.totalRevenue || 0)}</Text>
          <Text style={styles.metricSubtext}>{stats?.totalSales || 0} sales completed</Text>
        </View>

        {/* Small Metrics Row */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCardSmall, { backgroundColor: themeColors.surface }]}>
            <View style={[styles.metricIconSmall, { backgroundColor: themeColors.successLight }]}>
              <Feather name="trending-up" size={16} color={themeColors.success} />
            </View>
            <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>Avg Order</Text>
            <Text style={[styles.metricValue, { color: themeColors.textPrimary }]}>
              {formatCurrency(stats?.averageOrderValue || 0)}
            </Text>
          </View>

          <View style={[styles.metricCardSmall, { backgroundColor: themeColors.surface }]}>
            <View style={[styles.metricIconSmall, { backgroundColor: themeColors.accentFaint }]}>
              <Feather name="percent" size={16} color={themeColors.accent} />
            </View>
            <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>Conversion</Text>
            <Text style={[styles.metricValue, { color: themeColors.textPrimary }]}>
              {(stats?.conversionRate || 0).toFixed(1)}%
            </Text>
          </View>

          <View style={[styles.metricCardSmall, { backgroundColor: themeColors.surface }]}>
            <View style={[styles.metricIconSmall, { backgroundColor: themeColors.warningLight }]}>
              <Feather name="clock" size={16} color={themeColors.warning} />
            </View>
            <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>Pending</Text>
            <Text style={[styles.metricValue, { color: themeColors.textPrimary }]}>
              {formatCurrency(stats?.pendingPaymentsAmount || 0)}
            </Text>
          </View>

          <View style={[styles.metricCardSmall, { backgroundColor: themeColors.surface }]}>
            <View style={[styles.metricIconSmall, { backgroundColor: themeColors.successLight }]}>
              <Feather name="package" size={16} color={themeColors.success} />
            </View>
            <Text style={[styles.metricLabel, { color: themeColors.textMuted }]}>Active</Text>
            <Text style={[styles.metricValue, { color: themeColors.textPrimary }]}>
              {stats?.activeListings || 0}
            </Text>
          </View>
        </View>
      </View>

      {/* Revenue Chart */}
      {stats && stats.revenueByPeriod.length > 0 && (
        <View style={[styles.chartCard, { backgroundColor: themeColors.surface }]}>
          <View style={styles.chartHeader}>
            <Text style={[styles.chartTitle, { color: themeColors.textPrimary }]}>Revenue Trend</Text>
          </View>
          <View style={styles.chartContainer}>
            {stats.revenueByPeriod.map((item, index) => (
              <View key={index} style={styles.chartBarContainer}>
                <View style={styles.chartBarWrapper}>
                  <View
                    style={[
                      styles.chartBar,
                      {
                        height: `${(item.amount / maxRevenue) * 100}%`,
                        backgroundColor: themeColors.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.chartLabel, { color: themeColors.textMuted }]} numberOfLines={1}>
                  {item.date}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Listing Performance */}
      <View style={[styles.sectionCard, { backgroundColor: themeColors.surface }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: themeColors.textPrimary }]}>Listing Performance</Text>
          <TouchableOpacity onPress={() => handleNavigate('MyListings')}>
            <Text style={[styles.sectionLink, { color: themeColors.accent }]}>View All</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.performanceGrid}>
          <View style={[styles.performanceItem, { borderRightColor: themeColors.border }]}>
            <Feather name="eye" size={20} color={themeColors.accent} />
            <Text style={[styles.performanceValue, { color: themeColors.textPrimary }]}>
              {stats?.totalViews || 0}
            </Text>
            <Text style={[styles.performanceLabel, { color: themeColors.textMuted }]}>Total Views</Text>
          </View>
          <View style={[styles.performanceItem, { borderRightColor: themeColors.border }]}>
            <Feather name="heart" size={20} color={themeColors.error} />
            <Text style={[styles.performanceValue, { color: themeColors.textPrimary }]}>
              {stats?.totalWatchers || 0}
            </Text>
            <Text style={[styles.performanceLabel, { color: themeColors.textMuted }]}>Watchers</Text>
          </View>
          <View style={styles.performanceItem}>
            <Feather name="clock" size={20} color={themeColors.warning} />
            <Text style={[styles.performanceValue, { color: themeColors.textPrimary }]}>
              {stats?.endingSoonListings || 0}
            </Text>
            <Text style={[styles.performanceLabel, { color: themeColors.textMuted }]}>Ending Soon</Text>
          </View>
        </View>

        {/* Top Listings */}
        {stats && stats.topListings.length > 0 && (
          <View style={styles.topListings}>
            <Text style={[styles.subsectionTitle, { color: themeColors.textSecondary }]}>
              Top Performing
            </Text>
            {stats.topListings.map((listing, index) => (
              <TouchableOpacity
                key={listing.id}
                style={[styles.topListingItem, { borderBottomColor: themeColors.borderLight }]}
                onPress={() => handleNavigate('ListingDetail', { listingId: listing.id })}
              >
                <View style={[styles.topListingRank, { backgroundColor: themeColors.accentFaint }]}>
                  <Text style={[styles.topListingRankText, { color: themeColors.accent }]}>
                    {index + 1}
                  </Text>
                </View>
                <View style={styles.topListingInfo}>
                  <Text style={[styles.topListingTitle, { color: themeColors.textPrimary }]} numberOfLines={1}>
                    {listing.title}
                  </Text>
                  <View style={styles.topListingStats}>
                    <Text style={[styles.topListingStat, { color: themeColors.textMuted }]}>
                      <Feather name="eye" size={10} /> {listing.view_count || 0}
                    </Text>
                    <Text style={[styles.topListingStat, { color: themeColors.textMuted }]}>
                      <Feather name="heart" size={10} /> {listing.watch_count || 0}
                    </Text>
                    {listing.bid_count > 0 && (
                      <Text style={[styles.topListingStat, { color: themeColors.textMuted }]}>
                        <Feather name="activity" size={10} /> {listing.bid_count} bids
                      </Text>
                    )}
                  </View>
                </View>
                <Feather name="chevron-right" size={16} color={themeColors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <View style={[styles.sectionCard, { backgroundColor: themeColors.surface }]}>
        <Text style={[styles.sectionTitle, { color: themeColors.textPrimary, marginBottom: spacing.md }]}>
          Quick Actions
        </Text>
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={[styles.quickAction, { backgroundColor: themeColors.accentFaint }]}
            onPress={() => handleNavigate('CreateListing')}
          >
            <Feather name="plus-circle" size={22} color={themeColors.accent} />
            <Text style={[styles.quickActionText, { color: themeColors.accent }]}>New Listing</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickAction, { backgroundColor: themeColors.successLight }]}
            onPress={() => handleNavigate('MySales')}
          >
            <Feather name="dollar-sign" size={22} color={themeColors.success} />
            <Text style={[styles.quickActionText, { color: themeColors.success }]}>Sales</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickAction, { backgroundColor: themeColors.warningLight }]}
            onPress={() => handleNavigate('SellerOffers')}
          >
            <Feather name="tag" size={22} color={themeColors.warning} />
            <Text style={[styles.quickActionText, { color: themeColors.warning }]}>Offers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickAction, { backgroundColor: isDark ? themeColors.stone : themeColors.sand }]}
            onPress={() => handleNavigate('MyListings')}
          >
            <Feather name="package" size={22} color={themeColors.textSecondary} />
            <Text style={[styles.quickActionText, { color: themeColors.textSecondary }]}>Listings</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Seller Tips */}
      <View style={[styles.tipsCard, { backgroundColor: themeColors.accentFaint }]}>
        <View style={styles.tipsHeader}>
          <Feather name="zap" size={20} color={themeColors.accent} />
          <Text style={[styles.tipsTitle, { color: themeColors.accent }]}>Seller Tip</Text>
        </View>
        <Text style={[styles.tipsText, { color: themeColors.textSecondary }]}>
          Listings with detailed descriptions and multiple high-quality photos receive 40% more engagement.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodSelector: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    padding: spacing.xs,
    ...shadows.sm,
  },
  periodButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.lg,
  },
  periodButtonActive: {
    ...shadows.sm,
  },
  periodButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  alertCard: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    gap: spacing.md,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  alertItems: {
    gap: spacing.sm,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertItemText: {
    fontSize: fontSize.sm,
  },
  metricsContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCardSmall: {
    width: '23.5%',
    borderRadius: borderRadius.lg,
    padding: spacing.sm,
    alignItems: 'center',
    ...shadows.sm,
  },
  metricCardLarge: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  metricIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  metricIconSmall: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  metricLabel: {
    fontSize: 10,
    marginTop: spacing.xs,
  },
  metricLabelLight: {
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  metricValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  metricValueLarge: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: '#ffffff',
    marginTop: spacing.xs,
  },
  metricSubtext: {
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: spacing.xs,
  },
  chartCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  chartHeader: {
    marginBottom: spacing.lg,
  },
  chartTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: spacing.xs,
  },
  chartBarContainer: {
    flex: 1,
    alignItems: 'center',
  },
  chartBarWrapper: {
    width: '100%',
    height: 100,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  chartBar: {
    width: '80%',
    borderRadius: borderRadius.sm,
    minHeight: 4,
  },
  chartLabel: {
    fontSize: 9,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  sectionCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  sectionLink: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  performanceGrid: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  performanceItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRightWidth: 1,
  },
  performanceValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginTop: spacing.sm,
  },
  performanceLabel: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  subsectionTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  topListings: {
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.md,
  },
  topListingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    gap: spacing.md,
  },
  topListingRank: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topListingRankText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  topListingInfo: {
    flex: 1,
  },
  topListingTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  topListingStats: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  topListingStat: {
    fontSize: fontSize.xs,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickAction: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  quickActionText: {
    fontSize: 10,
    fontWeight: fontWeight.medium,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  tipsCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  tipsTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  tipsText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
});
