import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';

interface ActivityStats {
  activeBids: number;
  wonAuctions: number;
  pendingOffers: number;
  unpaidInvoices: number;
}

interface MenuItem {
  title: string;
  subtitle: string;
  screen: string;
  icon: keyof typeof Feather.glyphMap;
  badge?: number;
  badgeColor?: string;
}

export default function ActivityScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { colors: themeColors, isDark } = useTheme();

  const { data: stats } = useQuery<ActivityStats>({
    queryKey: ['activityStats', user?.id],
    queryFn: async () => {
      if (!user) return { activeBids: 0, wonAuctions: 0, pendingOffers: 0, unpaidInvoices: 0 };

      const [bidsResult, offersResult, invoicesResult] = await Promise.all([
        supabase
          .from('bids')
          .select('id', { count: 'exact', head: true })
          .eq('bidder_id', user.id)
          .in('status', ['active', 'winning']),
        supabase
          .from('offers')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', user.id)
          .eq('status', 'pending'),
      ]);

      return {
        activeBids: bidsResult.count || 0,
        wonAuctions: 0,
        pendingOffers: offersResult.count || 0,
        unpaidInvoices: invoicesResult.count || 0,
      };
    },
    enabled: !!user,
  });

  const buyingItems: MenuItem[] = [
    {
      title: 'My Bids',
      subtitle: stats?.activeBids ? `${stats.activeBids} active` : 'View all your bids',
      screen: 'MyBids',
      icon: 'trending-up',
      badge: stats?.activeBids,
    },
    {
      title: 'My Offers',
      subtitle: stats?.pendingOffers ? `${stats.pendingOffers} pending` : 'View all your offers',
      screen: 'MyOffers',
      icon: 'message-square',
      badge: stats?.pendingOffers,
    },
    {
      title: 'Purchases',
      subtitle: stats?.unpaidInvoices ? `${stats.unpaidInvoices} awaiting payment` : 'View your purchases',
      screen: 'MyInvoices',
      icon: 'shopping-bag',
      badge: stats?.unpaidInvoices,
      badgeColor: stats?.unpaidInvoices ? colors.error : undefined,
    },
  ];

  const sellingItems: MenuItem[] = profile?.is_seller ? [
    {
      title: 'My Sales',
      subtitle: 'View items you\'ve sold',
      screen: 'MySales',
      icon: 'dollar-sign',
    },
  ] : [];

  const renderMenuItem = (item: MenuItem, index: number, isLast: boolean) => (
    <TouchableOpacity
      key={item.screen}
      style={[
        styles.menuItem,
        !isLast && { ...styles.menuItemBorder, borderBottomColor: themeColors.border },
      ]}
      onPress={() => navigation.navigate(item.screen as never)}
    >
      <View style={styles.menuIconContainer}>
        <Feather name={item.icon} size={20} color={colors.accent} />
      </View>
      <View style={styles.menuItemContent}>
        <Text style={[styles.menuItemTitle, { color: themeColors.textPrimary }]}>{item.title}</Text>
        <Text style={[styles.menuItemSubtitle, { color: themeColors.textMuted }]}>{item.subtitle}</Text>
      </View>
      {item.badge ? (
        <View style={[styles.badge, item.badgeColor && { backgroundColor: item.badgeColor }]}>
          <Text style={styles.badgeText}>{item.badge}</Text>
        </View>
      ) : (
        <Feather name="chevron-right" size={20} color={themeColors.textMuted} />
      )}
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
    >
      {/* Quick Stats */}
      <View style={styles.statsContainer}>
        <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
          <View style={[styles.statIcon, { backgroundColor: colors.accentFaint }]}>
            <Feather name="trending-up" size={20} color={colors.accent} />
          </View>
          <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>{stats?.activeBids || 0}</Text>
          <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Active Bids</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
          <View style={[styles.statIcon, { backgroundColor: colors.successLight }]}>
            <Feather name="check-circle" size={20} color={colors.success} />
          </View>
          <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>{stats?.wonAuctions || 0}</Text>
          <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Won</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: themeColors.surface }]}>
          <View style={[styles.statIcon, { backgroundColor: colors.warningLight }]}>
            <Feather name="clock" size={20} color={colors.warning} />
          </View>
          <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>{stats?.pendingOffers || 0}</Text>
          <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Pending</Text>
        </View>
      </View>

      {/* Buying Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Buying</Text>
        <View style={[styles.menuCard, { backgroundColor: themeColors.surface }]}>
          {buyingItems.map((item, index) =>
            renderMenuItem(item, index, index === buyingItems.length - 1)
          )}
        </View>
      </View>

      {/* Selling Section */}
      {sellingItems.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Selling</Text>
          <View style={[styles.menuCard, { backgroundColor: themeColors.surface }]}>
            {sellingItems.map((item, index) =>
              renderMenuItem(item, index, index === sellingItems.length - 1)
            )}
          </View>
        </View>
      )}

      {/* Become a Seller CTA */}
      {!profile?.is_seller && (
        <View style={styles.section}>
          <View style={[styles.sellerCta, { backgroundColor: themeColors.surface }]}>
            <View style={styles.sellerCtaIcon}>
              <Feather name="package" size={28} color={colors.accent} />
            </View>
            <View style={styles.sellerCtaContent}>
              <Text style={[styles.sellerCtaTitle, { color: themeColors.textPrimary }]}>Start Selling</Text>
              <Text style={[styles.sellerCtaSubtitle, { color: themeColors.textMuted }]}>
                List your equipment and reach thousands of buyers
              </Text>
            </View>
            <TouchableOpacity style={styles.sellerCtaButton}>
              <Text style={styles.sellerCtaButtonText}>Learn More</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    alignItems: 'center',
    ...shadows.sm,
  },
  statIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
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
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
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
  menuItemContent: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  menuItemSubtitle: {
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
  sellerCta: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  sellerCtaIcon: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accentFaint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sellerCtaContent: {
    marginBottom: spacing.lg,
  },
  sellerCtaTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sellerCtaSubtitle: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 20,
  },
  sellerCtaButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    alignSelf: 'flex-start',
  },
  sellerCtaButtonText: {
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
