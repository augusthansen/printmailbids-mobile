import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency } from '../../utils/formatters';
import { lightTap } from '../../utils/haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type TimeRange = '7d' | '30d' | '90d' | 'all';

interface AnalyticsData {
  revenue: {
    total: number;
    platformFees: number;
    trend: number;
  };
  users: {
    total: number;
    newThisPeriod: number;
    sellers: number;
    activeUsers: number;
  };
  listings: {
    total: number;
    active: number;
    sold: number;
    avgPrice: number;
  };
  transactions: {
    totalSales: number;
    pendingInvoices: number;
    avgOrderValue: number;
    conversionRate: number;
  };
  topCategories: { name: string; count: number; revenue: number }[];
  recentActivity: { date: string; sales: number; revenue: number }[];
}

export default function AdminAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');

  const getDateRange = (range: TimeRange) => {
    const now = new Date();
    switch (range) {
      case '7d':
        return new Date(now.setDate(now.getDate() - 7)).toISOString();
      case '30d':
        return new Date(now.setDate(now.getDate() - 30)).toISOString();
      case '90d':
        return new Date(now.setDate(now.getDate() - 90)).toISOString();
      default:
        return null;
    }
  };

  const { data: analytics, isLoading, refetch } = useQuery<AnalyticsData>({
    queryKey: ['adminAnalytics', timeRange],
    queryFn: async () => {
      const startDate = getDateRange(timeRange);

      // Fetch all data in parallel
      const [
        usersResult,
        newUsersResult,
        sellersResult,
        listingsResult,
        activeListingsResult,
        soldListingsResult,
        invoicesResult,
        pendingInvoicesResult,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        startDate
          ? supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', startDate)
          : supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_seller', true),
        supabase.from('listings').select('id', { count: 'exact', head: true }),
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'sold'),
        startDate
          ? supabase.from('invoices').select('id, total_amount, platform_fee, status').gte('created_at', startDate)
          : supabase.from('invoices').select('id, total_amount, platform_fee, status'),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

      const invoices = invoicesResult.data || [];
      const paidInvoices = invoices.filter(i => i.status === 'paid');
      const totalRevenue = paidInvoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);
      const platformFees = paidInvoices.reduce((sum, i) => sum + (i.platform_fee || 0), 0);
      const avgOrderValue = paidInvoices.length > 0 ? totalRevenue / paidInvoices.length : 0;

      // Get listing prices for average
      const { data: listingPrices } = await supabase
        .from('listings')
        .select('fixed_price, starting_price')
        .eq('status', 'active');

      const avgPrice = listingPrices && listingPrices.length > 0
        ? listingPrices.reduce((sum, l) => sum + (l.fixed_price || l.starting_price || 0), 0) / listingPrices.length
        : 0;

      return {
        revenue: {
          total: totalRevenue,
          platformFees,
          trend: 12.5, // Would calculate from previous period
        },
        users: {
          total: usersResult.count || 0,
          newThisPeriod: newUsersResult.count || 0,
          sellers: sellersResult.count || 0,
          activeUsers: Math.floor((usersResult.count || 0) * 0.3), // Placeholder
        },
        listings: {
          total: listingsResult.count || 0,
          active: activeListingsResult.count || 0,
          sold: soldListingsResult.count || 0,
          avgPrice,
        },
        transactions: {
          totalSales: paidInvoices.length,
          pendingInvoices: pendingInvoicesResult.count || 0,
          avgOrderValue,
          conversionRate: 3.2, // Placeholder
        },
        topCategories: [
          { name: 'Printing Equipment', count: 45, revenue: 125000 },
          { name: 'Mailing Systems', count: 32, revenue: 89000 },
          { name: 'Bindery', count: 28, revenue: 67000 },
          { name: 'Wide Format', count: 21, revenue: 54000 },
        ],
        recentActivity: [
          { date: '7 days', sales: 12, revenue: 34500 },
          { date: '14 days', sales: 18, revenue: 52000 },
          { date: '30 days', sales: 45, revenue: 128000 },
        ],
      };
    },
    enabled: !!profile?.is_admin,
  });

  const TimeRangeButton = ({ range, label }: { range: TimeRange; label: string }) => (
    <TouchableOpacity
      style={[
        styles.timeButton,
        { backgroundColor: themeColors.surface },
        timeRange === range && { backgroundColor: themeColors.accent }
      ]}
      onPress={() => {
        lightTap();
        setTimeRange(range);
      }}
    >
      <Text style={[
        styles.timeButtonText,
        { color: themeColors.textSecondary },
        timeRange === range && { color: colors.white }
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const StatCard = ({
    title,
    value,
    subtitle,
    icon,
    iconColor,
    trend,
  }: {
    title: string;
    value: string;
    subtitle?: string;
    icon: keyof typeof Feather.glyphMap;
    iconColor: string;
    trend?: number;
  }) => (
    <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
      <View style={styles.statHeader}>
        <View style={[styles.statIconContainer, { backgroundColor: iconColor + '20' }]}>
          <Feather name={icon} size={18} color={iconColor} />
        </View>
        {trend !== undefined && (
          <View style={[styles.trendBadge, trend >= 0 ? styles.trendUp : styles.trendDown]}>
            <Feather name={trend >= 0 ? 'trending-up' : 'trending-down'} size={12} color={trend >= 0 ? colors.success : colors.error} />
            <Text style={[styles.trendText, { color: trend >= 0 ? colors.success : colors.error }]}>
              {Math.abs(trend)}%
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statTitle, { color: themeColors.textMuted }]}>{title}</Text>
      {subtitle && <Text style={[styles.statSubtitle, { color: themeColors.textMuted }]}>{subtitle}</Text>}
    </View>
  );

  if (!profile?.is_admin) {
    return (
      <View style={[styles.unauthorizedContainer, { backgroundColor: themeColors.background }]}>
        <Feather name="shield-off" size={48} color={colors.error} />
        <Text style={[styles.unauthorizedText, { color: themeColors.textMuted }]}>Access Denied</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={themeColors.accent} />
      }
    >
      {/* Time Range Selector */}
      <View style={styles.timeRangeContainer}>
        <TimeRangeButton range="7d" label="7 Days" />
        <TimeRangeButton range="30d" label="30 Days" />
        <TimeRangeButton range="90d" label="90 Days" />
        <TimeRangeButton range="all" label="All Time" />
      </View>

      {/* Revenue Overview */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Revenue</Text>
        <View style={[styles.revenueCard, { backgroundColor: themeColors.accent }]}>
          <View style={styles.revenueMain}>
            <Text style={styles.revenueLabel}>Total Revenue</Text>
            <Text style={styles.revenueValue}>{formatCurrency(analytics?.revenue.total || 0)}</Text>
          </View>
          <View style={styles.revenueSub}>
            <Text style={styles.revenueSubLabel}>Platform Fees</Text>
            <Text style={styles.revenueSubValue}>{formatCurrency(analytics?.revenue.platformFees || 0)}</Text>
          </View>
        </View>
      </View>

      {/* Key Metrics Grid */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Key Metrics</Text>
        <View style={styles.metricsGrid}>
          <StatCard
            title="Total Users"
            value={analytics?.users.total.toString() || '0'}
            subtitle={`${analytics?.users.newThisPeriod || 0} new`}
            icon="users"
            iconColor={colors.accent}
            trend={analytics?.revenue.trend}
          />
          <StatCard
            title="Active Listings"
            value={analytics?.listings.active.toString() || '0'}
            subtitle={`of ${analytics?.listings.total || 0} total`}
            icon="package"
            iconColor={colors.success}
          />
          <StatCard
            title="Total Sales"
            value={analytics?.transactions.totalSales.toString() || '0'}
            subtitle={`${analytics?.transactions.pendingInvoices || 0} pending`}
            icon="shopping-bag"
            iconColor={colors.warning}
          />
          <StatCard
            title="Avg Order Value"
            value={formatCurrency(analytics?.transactions.avgOrderValue || 0)}
            icon="dollar-sign"
            iconColor={colors.accent}
          />
        </View>
      </View>

      {/* User Breakdown */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>User Breakdown</Text>
        <View style={[styles.breakdownCard, { backgroundColor: themeColors.surface }]}>
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <Text style={[styles.breakdownValue, { color: themeColors.textPrimary }]}>{analytics?.users.total || 0}</Text>
              <Text style={[styles.breakdownLabel, { color: themeColors.textMuted }]}>Total Users</Text>
            </View>
            <View style={[styles.breakdownDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.breakdownItem}>
              <Text style={[styles.breakdownValue, { color: themeColors.textPrimary }]}>{analytics?.users.sellers || 0}</Text>
              <Text style={[styles.breakdownLabel, { color: themeColors.textMuted }]}>Sellers</Text>
            </View>
            <View style={[styles.breakdownDivider, { backgroundColor: themeColors.border }]} />
            <View style={styles.breakdownItem}>
              <Text style={[styles.breakdownValue, { color: themeColors.textPrimary }]}>{analytics?.users.activeUsers || 0}</Text>
              <Text style={[styles.breakdownLabel, { color: themeColors.textMuted }]}>Active</Text>
            </View>
          </View>
          <View style={[styles.progressBar, { backgroundColor: themeColors.inputBackground }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: themeColors.accent, width: `${((analytics?.users.sellers || 0) / (analytics?.users.total || 1)) * 100}%` }
              ]}
            />
          </View>
          <Text style={[styles.progressLabel, { color: themeColors.textMuted }]}>
            {(((analytics?.users.sellers || 0) / (analytics?.users.total || 1)) * 100).toFixed(1)}% of users are sellers
          </Text>
        </View>
      </View>

      {/* Listings Stats */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Listings</Text>
        <View style={[styles.listingsCard, { backgroundColor: themeColors.surface }]}>
          <View style={styles.listingsStat}>
            <Feather name="package" size={24} color={themeColors.accent} />
            <Text style={[styles.listingsValue, { color: themeColors.textPrimary }]}>{analytics?.listings.active || 0}</Text>
            <Text style={[styles.listingsLabel, { color: themeColors.textMuted }]}>Active</Text>
          </View>
          <View style={styles.listingsStat}>
            <Feather name="check-circle" size={24} color={colors.success} />
            <Text style={[styles.listingsValue, { color: themeColors.textPrimary }]}>{analytics?.listings.sold || 0}</Text>
            <Text style={[styles.listingsLabel, { color: themeColors.textMuted }]}>Sold</Text>
          </View>
          <View style={styles.listingsStat}>
            <Feather name="dollar-sign" size={24} color={colors.warning} />
            <Text style={[styles.listingsValue, { color: themeColors.textPrimary }]}>{formatCurrency(analytics?.listings.avgPrice || 0)}</Text>
            <Text style={[styles.listingsLabel, { color: themeColors.textMuted }]}>Avg Price</Text>
          </View>
        </View>
      </View>

      {/* Top Categories */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Top Categories</Text>
        <View style={[styles.categoriesCard, { backgroundColor: themeColors.surface }]}>
          {analytics?.topCategories.map((category, index) => (
            <View key={category.name} style={[styles.categoryRow, { borderBottomColor: themeColors.border }]}>
              <View style={[styles.categoryRank, { backgroundColor: themeColors.accentFaint }]}>
                <Text style={[styles.categoryRankText, { color: themeColors.accent }]}>{index + 1}</Text>
              </View>
              <View style={styles.categoryInfo}>
                <Text style={[styles.categoryName, { color: themeColors.textPrimary }]}>{category.name}</Text>
                <Text style={[styles.categoryCount, { color: themeColors.textMuted }]}>{category.count} listings</Text>
              </View>
              <Text style={[styles.categoryRevenue, { color: themeColors.accent }]}>{formatCurrency(category.revenue)}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
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
  timeRangeContainer: {
    flexDirection: 'row',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  timeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  timeButtonActive: {
    backgroundColor: colors.accent,
  },
  timeButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  timeButtonTextActive: {
    color: colors.white,
  },
  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  revenueCard: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    padding: spacing.xl,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueMain: {},
  revenueLabel: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  revenueValue: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.white,
    marginTop: spacing.xs,
  },
  revenueSub: {
    alignItems: 'flex-end',
  },
  revenueSubLabel: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  revenueSubValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.accentMuted,
    marginTop: spacing.xs,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statCard: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statIconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  trendUp: {
    backgroundColor: colors.successLight,
  },
  trendDown: {
    backgroundColor: colors.errorLight,
  },
  trendText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  statTitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  statSubtitle: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: 2,
  },
  breakdownCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
  },
  breakdownDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.borderLight,
  },
  breakdownValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  breakdownLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.sand,
    borderRadius: borderRadius.full,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.full,
  },
  progressLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  listingsCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  listingsStat: {
    flex: 1,
    alignItems: 'center',
  },
  listingsValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  listingsLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  categoriesCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    ...shadows.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  categoryRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentFaint,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  categoryRankText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  categoryCount: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  categoryRevenue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.accent,
  },
});
