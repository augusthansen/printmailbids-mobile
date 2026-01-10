import React, { useState } from 'react';
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
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency } from '../../utils/formatters';
import { lightTap } from '../../utils/haptics';

interface AdminStats {
  totalUsers: number;
  totalSellers: number;
  totalListings: number;
  activeListings: number;
  totalSales: number;
  totalRevenue: number;
  pendingOffers: number;
  pendingInvoices: number;
}

interface MenuItem {
  title: string;
  subtitle: string;
  icon: keyof typeof Feather.glyphMap;
  screen: string;
  badge?: number;
  badgeColor?: string;
}

export default function AdminPanelScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors: themeColors, isDark } = useTheme();

  const { data: stats, isLoading, refetch } = useQuery<AdminStats>({
    queryKey: ['adminStats'],
    queryFn: async () => {
      const [usersResult, sellersResult, listingsResult, activeListingsResult, salesResult, offersResult, invoicesResult] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_seller', true),
        supabase.from('listings').select('id', { count: 'exact', head: true }),
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('invoices').select('id, total_amount, status'),
        supabase.from('offers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

      const paidInvoices = (salesResult.data || []).filter(i => i.status === 'paid');
      const totalRevenue = paidInvoices.reduce((sum, i) => sum + (i.total_amount || 0), 0);

      return {
        totalUsers: usersResult.count || 0,
        totalSellers: sellersResult.count || 0,
        totalListings: listingsResult.count || 0,
        activeListings: activeListingsResult.count || 0,
        totalSales: paidInvoices.length,
        totalRevenue,
        pendingOffers: offersResult.count || 0,
        pendingInvoices: invoicesResult.count || 0,
      };
    },
    enabled: !!profile?.is_admin,
  });

  if (!profile?.is_admin) {
    return (
      <View style={[styles.unauthorizedContainer, { backgroundColor: themeColors.background }]}>
        <Feather name="shield-off" size={48} color={colors.error} />
        <Text style={[styles.unauthorizedTitle, { color: themeColors.textPrimary }]}>Access Denied</Text>
        <Text style={[styles.unauthorizedText, { color: themeColors.textMuted }]}>
          You don't have permission to access the admin panel.
        </Text>
      </View>
    );
  }

  const menuItems: MenuItem[] = [
    {
      title: 'Manage Users',
      subtitle: `${stats?.totalUsers || 0} total users`,
      icon: 'users',
      screen: 'AdminUsers',
    },
    {
      title: 'Manage Listings',
      subtitle: `${stats?.activeListings || 0} active listings`,
      icon: 'package',
      screen: 'AdminListings',
    },
    {
      title: 'Sales & Invoices',
      subtitle: `${stats?.pendingInvoices || 0} pending`,
      icon: 'file-text',
      screen: 'AdminSales',
      badge: stats?.pendingInvoices,
      badgeColor: stats?.pendingInvoices ? colors.warning : undefined,
    },
    {
      title: 'Offers',
      subtitle: `${stats?.pendingOffers || 0} pending review`,
      icon: 'message-square',
      screen: 'AdminOffers',
      badge: stats?.pendingOffers,
    },
    {
      title: 'Analytics',
      subtitle: 'View platform metrics',
      icon: 'bar-chart-2',
      screen: 'AdminAnalytics',
    },
    {
      title: 'Settings',
      subtitle: 'Platform configuration',
      icon: 'settings',
      screen: 'AdminSettings',
    },
  ];

  const StatCard = ({
    icon,
    iconColor,
    iconBg,
    value,
    label,
  }: {
    icon: keyof typeof Feather.glyphMap;
    iconColor: string;
    iconBg: string;
    value: string | number;
    label: string;
  }) => (
    <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>{label}</Text>
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={themeColors.accent} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.adminBadge}>
          <Feather name="shield" size={16} color={colors.white} />
          <Text style={styles.adminBadgeText}>Admin</Text>
        </View>
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>Platform Overview</Text>
      </View>

      {/* Quick Stats */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="users"
          iconColor={colors.accent}
          iconBg={colors.accentFaint}
          value={stats?.totalUsers || 0}
          label="Users"
        />
        <StatCard
          icon="package"
          iconColor={colors.success}
          iconBg={colors.successLight}
          value={stats?.activeListings || 0}
          label="Active Listings"
        />
        <StatCard
          icon="shopping-bag"
          iconColor={colors.warning}
          iconBg={colors.warningLight}
          value={stats?.totalSales || 0}
          label="Total Sales"
        />
      </View>

      {/* Revenue Card */}
      <View style={[styles.revenueCard, { backgroundColor: themeColors.accent }]}>
        <View>
          <Text style={styles.revenueLabel}>Total Platform Revenue</Text>
          <Text style={styles.revenueValue}>
            {formatCurrency(stats?.totalRevenue || 0)}
          </Text>
        </View>
        <View style={styles.revenueMeta}>
          <Text style={styles.revenueMetaLabel}>Sellers</Text>
          <Text style={styles.revenueMetaValue}>{stats?.totalSellers || 0}</Text>
        </View>
      </View>

      {/* Menu Items */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Admin Tools</Text>
        <View style={[styles.menuCard, { backgroundColor: themeColors.surface }]}>
          {menuItems.map((item, index) => (
            <React.Fragment key={item.screen}>
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  lightTap();
                  navigation.navigate(item.screen);
                }}
              >
                <View style={[styles.menuIconContainer, { backgroundColor: themeColors.accentFaint }]}>
                  <Feather name={item.icon} size={20} color={themeColors.accent} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={[styles.menuTitle, { color: themeColors.textPrimary }]}>{item.title}</Text>
                  <Text style={[styles.menuSubtitle, { color: themeColors.textMuted }]}>{item.subtitle}</Text>
                </View>
                {item.badge ? (
                  <View style={[styles.badge, item.badgeColor && { backgroundColor: item.badgeColor }]}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                  </View>
                ) : (
                  <Feather name="chevron-right" size={20} color={themeColors.textMuted} />
                )}
              </TouchableOpacity>
              {index < menuItems.length - 1 && <View style={[styles.divider, { backgroundColor: themeColors.border }]} />}
            </React.Fragment>
          ))}
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Quick Actions</Text>
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={[styles.quickActionButton, { backgroundColor: themeColors.surface }]}
            onPress={() => {
              lightTap();
              navigation.navigate('AdminUsers');
            }}
          >
            <Feather name="user-plus" size={20} color={themeColors.accent} />
            <Text style={[styles.quickActionText, { color: themeColors.accent }]}>Add User</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickActionButton, { backgroundColor: themeColors.surface }]}
            onPress={() => {
              lightTap();
              navigation.navigate('AdminListings');
            }}
          >
            <Feather name="eye" size={20} color={themeColors.accent} />
            <Text style={[styles.quickActionText, { color: themeColors.accent }]}>Review Listings</Text>
          </TouchableOpacity>
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
    paddingHorizontal: spacing['3xl'],
  },
  unauthorizedTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  unauthorizedText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.error,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  adminBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  headerTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    alignItems: 'center',
    ...shadows.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  revenueCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
  },
  revenueLabel: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  revenueValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.white,
    marginTop: spacing.xs,
  },
  revenueMeta: {
    alignItems: 'flex-end',
  },
  revenueMetaLabel: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  revenueMetaValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
    marginTop: spacing.xs,
  },
  section: {
    marginTop: spacing.xl,
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
  menuCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accentFaint,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  menuSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    minWidth: 28,
    alignItems: 'center',
  },
  badgeText: {
    color: colors.white,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginLeft: spacing.lg + 40 + spacing.md,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  quickActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  quickActionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
});
