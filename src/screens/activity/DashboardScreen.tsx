import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Notification, NotificationType } from '../../types/database';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows, ThemeColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { lightTap } from '../../utils/haptics';

interface BuyerStats {
  activeBids: number;
  winningBids: number;
  pendingOffers: number;
  acceptedOffers: number;  // Offers accepted but not yet paid
  unpaidInvoices: number;
  totalPurchases: number;
  pipelineValue: number;
  activeTransactions: number;  // Paid but not yet completed/delivered
  activeTransactionsAmount: number;
}

interface SellerStats {
  activeListings: number;
  totalSales: number;
  pendingOffers: number;
  totalRevenue: number;
  pendingPayouts: number;
  totalViews: number;
  activeTransactions: number;  // All non-completed transactions
  activeTransactionsAmount: number;
  awaitingPayment: number;  // Specifically unpaid invoices
}

interface RecentActivity {
  id: string;
  type: 'bid' | 'offer' | 'purchase' | 'sale' | 'message';
  title: string;
  subtitle: string;
  amount?: number;
  timestamp: string;
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  iconBg: string;
  isReceived?: boolean; // For offers - determines color at render time
}

// Helper function to get notification icon config - accepts theme colors for dark mode support
function getNotificationConfig(type: NotificationType, themeColors: ThemeColors): { icon: keyof typeof Feather.glyphMap; iconColor: string; iconBg: string } {
  switch (type) {
    case 'outbid':
      return { icon: 'trending-down', iconColor: themeColors.warning, iconBg: themeColors.warningLight };
    case 'auction_won':
      return { icon: 'award', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'auction_ending_soon':
    case 'auction_ending':
      return { icon: 'clock', iconColor: themeColors.warning, iconBg: themeColors.warningLight };
    case 'new_bid':
      return { icon: 'trending-up', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'new_offer':
    case 'offer_response_needed':
      return { icon: 'message-square', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'offer_accepted':
      return { icon: 'check', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'offer_declined':
      return { icon: 'x', iconColor: themeColors.error, iconBg: themeColors.errorLight };
    case 'payment_reminder':
      return { icon: 'alert-circle', iconColor: themeColors.warning, iconBg: themeColors.warningLight };
    case 'payment_received':
    case 'payment_confirmed':
      return { icon: 'dollar-sign', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'item_shipped':
      return { icon: 'truck', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'item_delivered':
      return { icon: 'home', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'buyer_message':
      return { icon: 'message-circle', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    default:
      return { icon: 'bell', iconColor: themeColors.textMuted, iconBg: themeColors.sand };
  }
}

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { colors: themeColors, isDark } = useTheme();
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  // Fetch buyer stats
  const { data: buyerStats, isLoading: loadingBuyer, refetch: refetchBuyer } = useQuery<BuyerStats>({
    queryKey: ['buyerStats', user?.id],
    queryFn: async () => {
      if (!user) return { activeBids: 0, winningBids: 0, pendingOffers: 0, acceptedOffers: 0, unpaidInvoices: 0, totalPurchases: 0, pipelineValue: 0, activeTransactions: 0, activeTransactionsAmount: 0 };

      const [bidsResult, pendingOffersResult, acceptedOffersResult, invoicesResult, paidInvoicesResult, activeTransactionsResult] = await Promise.all([
        // Active and winning bids - include listing_id to count unique listings
        supabase
          .from('bids')
          .select('id, status, amount, listing_id')
          .eq('bidder_id', user.id)
          .in('status', ['active', 'winning']),
        // Pending offers (awaiting seller response)
        supabase
          .from('offers')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', user.id)
          .eq('status', 'pending'),
        // Accepted offers (need to pay!)
        supabase
          .from('offers')
          .select('id, amount, listing:listings(title)')
          .eq('buyer_id', user.id)
          .eq('status', 'accepted'),
        // Unpaid invoices
        supabase
          .from('invoices')
          .select('id, total_amount')
          .eq('buyer_id', user.id)
          .eq('status', 'pending'),
        // Paid invoices (total purchases)
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', user.id)
          .eq('status', 'paid'),
        // Active transactions (paid but not yet completed)
        supabase
          .from('invoices')
          .select('id, total_amount, fulfillment_status, delivery_confirmed_at')
          .eq('buyer_id', user.id)
          .eq('status', 'paid'),
      ]);

      const bids = bidsResult.data || [];
      // Count unique listings, not total bids (user can have multiple bids on same listing)
      const uniqueActiveListings = new Set(bids.filter(b => b.status === 'active').map(b => b.listing_id));
      const uniqueWinningListings = new Set(bids.filter(b => b.status === 'winning').map(b => b.listing_id));
      const activeBids = uniqueActiveListings.size;
      const winningBids = uniqueWinningListings.size;
      const unpaidInvoices = invoicesResult.data || [];
      const pipelineValue = unpaidInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      // Active transactions = paid but not yet completed
      const allPaidInvoices = activeTransactionsResult.data || [];
      const activeTransactions = allPaidInvoices.filter(inv => {
        // If completed, it's not active
        if (inv.fulfillment_status === 'completed') return false;
        // If delivered AND confirmed, it's not active
        if (inv.fulfillment_status === 'delivered' && inv.delivery_confirmed_at) return false;
        // Everything else is active
        return true;
      });
      const activeTransactionsAmount = activeTransactions.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      return {
        activeBids,
        winningBids,
        pendingOffers: pendingOffersResult.count || 0,
        acceptedOffers: acceptedOffersResult.data?.length || 0,
        unpaidInvoices: unpaidInvoices.length,
        totalPurchases: paidInvoicesResult.count || 0,
        pipelineValue,
        activeTransactions: activeTransactions.length,
        activeTransactionsAmount,
      };
    },
    enabled: !!user,
  });

  // Fetch seller stats (only if seller)
  const { data: sellerStats, isLoading: loadingSeller, refetch: refetchSeller } = useQuery<SellerStats>({
    queryKey: ['sellerStats', user?.id],
    queryFn: async () => {
      if (!user) return { activeListings: 0, totalSales: 0, pendingOffers: 0, totalRevenue: 0, pendingPayouts: 0, totalViews: 0, activeTransactions: 0, activeTransactionsAmount: 0, awaitingPayment: 0 };

      const [listingsResult, salesResult, offersResult, viewsResult] = await Promise.all([
        // Active listings
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id)
          .eq('status', 'active'),
        // All invoices (for completed sales and pending transactions)
        supabase
          .from('invoices')
          .select('id, seller_payout_amount, total_amount, status, fulfillment_status, delivery_confirmed_at')
          .eq('seller_id', user.id),
        // Pending offers received
        supabase
          .from('offers')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id)
          .eq('status', 'pending'),
        // Total listing views
        supabase
          .from('listings')
          .select('view_count')
          .eq('seller_id', user.id),
      ]);

      const sales = salesResult.data || [];
      const paidSales = sales.filter(s => s.status === 'paid');

      // Active transactions = any invoice not yet completed (excluding cancelled/expired)
      // A transaction is complete when: fulfillment_status is 'completed' OR delivery_confirmed_at is set
      const activeSales = sales.filter(s => {
        // Exclude cancelled or expired invoices
        if (s.status === 'cancelled' || s.status === 'expired' || s.status === 'refunded') return false;
        // If completed, it's not active
        if (s.fulfillment_status === 'completed') return false;
        // If delivery was confirmed (regardless of fulfillment_status), it's not active
        if (s.delivery_confirmed_at) return false;
        // Everything else is active (pending, paid, packaging, ready_for_pickup, shipped, or delivered but not confirmed)
        return true;
      });

      // Awaiting payment = unpaid invoices specifically
      const awaitingPaymentSales = sales.filter(s =>
        s.status === 'pending' ||
        s.status === 'awaiting_wire' ||
        s.status === 'partial' ||
        s.status === 'overdue'
      );

      const totalRevenue = paidSales.reduce((sum, s) => sum + (s.seller_payout_amount || 0), 0);
      const pendingPayouts = awaitingPaymentSales.reduce((sum, s) => sum + (s.seller_payout_amount || 0), 0);
      const pendingTransactionsAmount = activeSales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const totalViews = (viewsResult.data || []).reduce((sum, l) => sum + (l.view_count || 0), 0);

      return {
        activeListings: listingsResult.count || 0,
        totalSales: paidSales.length,
        pendingOffers: offersResult.count || 0,
        totalRevenue,
        pendingPayouts,
        totalViews,
        activeTransactions: activeSales.length,
        activeTransactionsAmount: pendingTransactionsAmount,
        awaitingPayment: awaitingPaymentSales.length,
      };
    },
    enabled: !!user && (!!profile?.is_seller || !!profile?.is_admin),
  });

  // Fetch recent activity
  const { data: recentActivity, refetch: refetchActivity } = useQuery<RecentActivity[]>({
    queryKey: ['recentActivity', user?.id],
    queryFn: async () => {
      if (!user) return [];

      // Get recent bids
      const { data: bids } = await supabase
        .from('bids')
        .select('id, amount, status, created_at, listing:listings(title)')
        .eq('bidder_id', user.id)
        .order('created_at', { ascending: false })
        .limit(3);

      // Get recent offers
      const { data: offers } = await supabase
        .from('offers')
        .select('id, amount, status, created_at, buyer_id, seller_id, listing:listings(title)')
        .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(3);

      const activities: RecentActivity[] = [];

      // Add bids - note: colors set at render time via themeColors
      (bids || []).forEach(bid => {
        activities.push({
          id: `bid-${bid.id}`,
          type: 'bid',
          title: 'Bid Placed',
          subtitle: (bid.listing as { title?: string })?.title || 'Unknown listing',
          amount: bid.amount,
          timestamp: bid.created_at,
          icon: 'trending-up',
          iconColor: '', // Will be set at render time
          iconBg: '',
        });
      });

      // Add offers - note: colors set at render time via themeColors
      (offers || []).forEach(offer => {
        const isReceived = (offer as { seller_id?: string }).seller_id === user.id;
        activities.push({
          id: `offer-${offer.id}`,
          type: 'offer',
          title: isReceived ? 'Offer Received' : 'Offer Sent',
          subtitle: (offer.listing as { title?: string })?.title || 'Unknown listing',
          amount: offer.amount,
          timestamp: offer.created_at,
          icon: 'message-square',
          iconColor: '', // Will be set at render time
          iconBg: '',
          isReceived, // Store for color determination at render
        } as RecentActivity);
      });

      // Sort by timestamp and limit
      return activities
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 5);
    },
    enabled: !!user,
  });

  // Fetch notifications
  const { data: notifications, refetch: refetchNotifications } = useQuery<Notification[]>({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as Notification[];
    },
    enabled: !!user,
  });

  // Mark notification as read mutation
  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadNotifications = notifications?.filter(n => !n.is_read) || [];
  const recentNotifications = notifications?.slice(0, 3) || [];

  const handleNotificationPress = (notification: Notification) => {
    lightTap();

    // Mark as read
    if (!notification.is_read) {
      markReadMutation.mutate(notification.id);
    }

    // Navigate based on notification type - check specific types first, then fall back to IDs
    const offerTypes: NotificationType[] = ['new_offer', 'offer_accepted', 'offer_declined', 'offer_countered', 'offer_expired', 'offer_withdrawn', 'offer_response_needed'];
    const bidTypes: NotificationType[] = ['outbid', 'auction_won', 'new_bid', 'auction_ending_soon', 'auction_ending'];
    const invoiceTypes: NotificationType[] = ['payment_reminder', 'payment_received', 'payment_confirmed', 'item_shipped', 'item_delivered'];

    if (offerTypes.includes(notification.type)) {
      // For offer_accepted with invoice_id, go directly to invoice for payment
      if (notification.type === 'offer_accepted' && notification.invoice_id) {
        navigation.navigate('InvoiceDetail', { invoiceId: notification.invoice_id });
        return;
      }

      // For other offer notifications, determine the appropriate view and filter
      // new_offer = seller received a new offer
      // offer_countered = other party countered your offer
      // offer_declined/withdrawn/expired = response to your offer
      const sellerReceivedTypes: NotificationType[] = ['new_offer'];
      const isSellerNotification = sellerReceivedTypes.includes(notification.type);

      navigation.navigate('MyOffers', {
        viewMode: isSellerNotification ? 'received' : 'sent',
        filter: notification.type === 'offer_accepted' ? 'accepted' : 'pending',
      });
    } else if (invoiceTypes.includes(notification.type) && notification.invoice_id) {
      navigation.navigate('InvoiceDetail', { invoiceId: notification.invoice_id });
    } else if (bidTypes.includes(notification.type)) {
      if (notification.listing_id) {
        navigation.navigate('ListingDetail', { listingId: notification.listing_id });
      } else {
        navigation.navigate('MyBids');
      }
    } else if (notification.invoice_id) {
      navigation.navigate('InvoiceDetail', { invoiceId: notification.invoice_id });
    } else if (notification.offer_id) {
      navigation.navigate('MyOffers');
    } else if (notification.bid_id) {
      navigation.navigate('MyBids');
    } else if (notification.listing_id) {
      navigation.navigate('ListingDetail', { listingId: notification.listing_id });
    }
  };

  const onRefresh = async () => {
    await Promise.all([refetchBuyer(), refetchSeller(), refetchActivity(), refetchNotifications()]);
  };

  const navigateTo = (screen: string) => {
    lightTap();
    navigation.navigate(screen as never);
  };

  const StatCard = ({
    icon,
    iconColor,
    iconBg,
    value,
    label,
    onPress,
  }: {
    icon: keyof typeof Feather.glyphMap;
    iconColor: string;
    iconBg: string;
    value: string | number;
    label: string;
    onPress?: () => void;
  }) => (
    <TouchableOpacity
      style={[styles.statCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );

  const ActionCard = ({
    icon,
    title,
    subtitle,
    badge,
    badgeColor,
    onPress,
  }: {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    subtitle: string;
    badge?: number;
    badgeColor?: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.actionIconContainer, { backgroundColor: themeColors.accentFaint }]}>
        <Feather name={icon} size={20} color={themeColors.accent} />
      </View>
      <View style={styles.actionContent}>
        <Text style={[styles.actionTitle, { color: themeColors.textPrimary }]}>{title}</Text>
        <Text style={[styles.actionSubtitle, { color: themeColors.textMuted }]}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={[styles.badge, badgeColor && { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : (
        <Feather name="chevron-right" size={20} color={themeColors.textLight} />
      )}
    </TouchableOpacity>
  );

  const isLoading = loadingBuyer || loadingSeller;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={themeColors.accent} />
      }
    >
      {/* Welcome Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.welcomeText, { color: themeColors.textMuted }]}>Welcome back,</Text>
          <Text style={[styles.userName, { color: themeColors.textPrimary }]}>{profile?.full_name || profile?.company_name || 'User'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.notificationBell, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
          onPress={() => {
            lightTap();
            setShowNotificationsModal(true);
          }}
        >
          <Feather name="bell" size={24} color={themeColors.textPrimary} />
          {unreadNotifications.length > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Profile Completion Reminder - shown if user skipped onboarding or has incomplete profile */}
      {profile && !profile.onboarding_completed && (!profile.full_name || !profile.phone_verified) && (
        <TouchableOpacity
          style={[styles.profileReminderBanner, { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7' }]}
          onPress={() => {
            lightTap();
            navigation.navigate('ProfileTab', { screen: 'EditProfile' });
          }}
        >
          <View style={[styles.profileReminderIcon, { backgroundColor: colors.warningLight }]}>
            <Feather name="user" size={20} color={colors.warning} />
          </View>
          <View style={styles.profileReminderContent}>
            <Text style={[styles.profileReminderTitle, { color: isDark ? '#FBBF24' : '#92400E' }]}>
              Complete Your Profile
            </Text>
            <Text style={[styles.profileReminderText, { color: isDark ? themeColors.textMuted : '#B45309' }]}>
              {!profile.full_name ? 'Add your name' : ''}
              {!profile.full_name && !profile.phone_verified ? ' and ' : ''}
              {!profile.phone_verified ? 'verify your phone' : ''}
              {' to build trust with sellers'}
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={isDark ? '#FBBF24' : '#92400E'} />
        </TouchableOpacity>
      )}

      {/* Notifications Section */}
      {recentNotifications.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Notifications</Text>
            {unreadNotifications.length > 0 && (
              <TouchableOpacity
                onPress={() => navigation.navigate('ProfileTab', { screen: 'Notifications' })}
              >
                <Text style={styles.seeAllLink}>
                  {unreadNotifications.length} unread
                </Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.notificationsCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
            {recentNotifications.map((notification, index) => {
              const config = getNotificationConfig(notification.type, themeColors);
              return (
                <React.Fragment key={notification.id}>
                  <TouchableOpacity
                    style={[
                      styles.notificationItem,
                      !notification.is_read && [styles.notificationItemUnread, { backgroundColor: themeColors.accentFaint }],
                    ]}
                    onPress={() => handleNotificationPress(notification)}
                  >
                    <View style={[styles.notificationIcon, { backgroundColor: config.iconBg }]}>
                      <Feather name={config.icon} size={16} color={config.iconColor} />
                    </View>
                    <View style={styles.notificationContent}>
                      <Text
                        style={[
                          styles.notificationTitle,
                          { color: themeColors.textPrimary },
                          !notification.is_read && styles.notificationTitleUnread,
                        ]}
                        numberOfLines={1}
                      >
                        {notification.title}
                      </Text>
                      <Text style={[styles.notificationTime, { color: themeColors.textMuted }]}>
                        {formatRelativeTime(notification.created_at)}
                      </Text>
                    </View>
                    {!notification.is_read && <View style={[styles.unreadDot, { backgroundColor: themeColors.accent }]} />}
                  </TouchableOpacity>
                  {index < recentNotifications.length - 1 && <View style={[styles.divider, { backgroundColor: themeColors.borderLight }]} />}
                </React.Fragment>
              );
            })}
            <TouchableOpacity
              style={[styles.viewAllButton, { borderTopColor: themeColors.borderLight }]}
              onPress={() => navigation.navigate('ProfileTab', { screen: 'Notifications' })}
            >
              <Text style={[styles.viewAllText, { color: themeColors.accent }]}>View All Notifications</Text>
              <Feather name="chevron-right" size={16} color={themeColors.accent} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ACTIVE TRANSACTION BANNERS - Always at top of dashboard */}
      {/* Buyer: Orders in progress */}
      {(buyerStats?.activeTransactions || 0) > 0 && (
        <TouchableOpacity
          style={[styles.pendingTransactionsBanner, { backgroundColor: themeColors.accent }]}
          onPress={() => navigateTo('MyInvoices')}
          activeOpacity={0.8}
        >
          <View style={styles.pendingTransactionsIconContainer}>
            <Feather name="truck" size={32} color="#ffffff" />
          </View>
          <View style={styles.pendingTransactionsContent}>
            <Text style={styles.pendingTransactionsTitle}>
              {buyerStats?.activeTransactions === 1 ? 'Order In Progress' : `${buyerStats?.activeTransactions} Orders In Progress`}
            </Text>
            <Text style={styles.pendingTransactionsSubtitle}>
              Tap to track status • {formatCurrency(buyerStats?.activeTransactionsAmount || 0)}
            </Text>
          </View>
          <View style={styles.pendingTransactionsArrow}>
            <Feather name="arrow-right" size={24} color="#ffffff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Seller: Active sales transactions */}
      {(profile?.is_seller || profile?.is_admin) && (sellerStats?.activeTransactions || 0) > 0 && (
        <TouchableOpacity
          style={[styles.pendingTransactionsBanner, { backgroundColor: themeColors.success }]}
          onPress={() => navigateTo('MySales')}
          activeOpacity={0.8}
        >
          <View style={styles.pendingTransactionsIconContainer}>
            <Feather name="clock" size={32} color="#ffffff" />
          </View>
          <View style={styles.pendingTransactionsContent}>
            <Text style={styles.pendingTransactionsTitle}>
              {sellerStats?.activeTransactions === 1 ? 'Active Sale' : `${sellerStats?.activeTransactions} Active Sales`}
            </Text>
            <Text style={styles.pendingTransactionsSubtitle}>
              {sellerStats?.awaitingPayment
                ? `${sellerStats.awaitingPayment} awaiting payment`
                : 'In progress'} • {formatCurrency(sellerStats?.activeTransactionsAmount || 0)}
            </Text>
          </View>
          <View style={styles.pendingTransactionsArrow}>
            <Feather name="arrow-right" size={24} color="#ffffff" />
          </View>
        </TouchableOpacity>
      )}

      {/* Buyer: Unpaid invoices */}
      {(buyerStats?.unpaidInvoices || 0) > 0 && (
        <TouchableOpacity
          style={[styles.acceptedOffersBanner, { backgroundColor: '#f59e0b' }]}
          onPress={() => navigateTo('MyInvoices')}
          activeOpacity={0.8}
        >
          <View style={styles.acceptedOffersIconContainer}>
            <Feather name="credit-card" size={32} color="#ffffff" />
          </View>
          <View style={styles.acceptedOffersContent}>
            <Text style={styles.acceptedOffersTitle}>
              {buyerStats?.unpaidInvoices === 1 ? 'Invoice Ready!' : `${buyerStats?.unpaidInvoices} Invoices Ready!`}
            </Text>
            <Text style={styles.acceptedOffersSubtitle}>
              Tap here to view and complete payment • {formatCurrency(buyerStats?.pipelineValue || 0)}
            </Text>
          </View>
          <View style={styles.acceptedOffersArrow}>
            <Feather name="arrow-right" size={24} color="#ffffff" />
          </View>
        </TouchableOpacity>
      )}

      {/*
        Dashboard section ordering:
        - Admin accounts: Seller first, then Buyer
        - All other accounts: Buyer first, then Seller
      */}

      {/* BUYER SECTION - Show first for all non-admin accounts */}
      {!profile?.is_admin && (
        <>
          {/* Buyer Stats */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Buying Activity</Text>
            <View style={styles.statsGrid}>
              <StatCard
                icon="trending-up"
                iconColor={themeColors.accent}
                iconBg={themeColors.accentFaint}
                value={buyerStats?.activeBids || 0}
                label="Active Bids"
                onPress={() => navigateTo('MyBids')}
              />
              <StatCard
                icon="award"
                iconColor={themeColors.success}
                iconBg={themeColors.successLight}
                value={buyerStats?.winningBids || 0}
                label="Winning"
                onPress={() => navigateTo('MyBids')}
              />
              <StatCard
                icon="clock"
                iconColor={themeColors.warning}
                iconBg={themeColors.warningLight}
                value={buyerStats?.pendingOffers || 0}
                label="Pending Offers"
                onPress={() => navigateTo('MyOffers')}
              />
            </View>
          </View>

          {/* Buyer Actions */}
          <View style={styles.section}>
            <View style={[styles.menuCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
              <ActionCard
                icon="trending-up"
                title="My Bids"
                subtitle={buyerStats?.activeBids ? `${buyerStats.activeBids} active` : 'View all your bids'}
                badge={buyerStats?.activeBids}
                onPress={() => navigateTo('MyBids')}
              />
              <View style={styles.divider} />
              <ActionCard
                icon="message-square"
                title="My Offers"
                subtitle={buyerStats?.pendingOffers ? `${buyerStats.pendingOffers} pending` : 'View all your offers'}
                badge={buyerStats?.pendingOffers}
                onPress={() => navigateTo('MyOffers')}
              />
              <View style={styles.divider} />
              <ActionCard
                icon="shopping-bag"
                title="Purchases"
                subtitle={buyerStats?.unpaidInvoices ? `${buyerStats.unpaidInvoices} awaiting payment` : 'View your purchases'}
                badge={buyerStats?.unpaidInvoices}
                badgeColor={themeColors.error}
                onPress={() => navigateTo('MyInvoices')}
              />
            </View>
          </View>

          {/* Become a Seller CTA (hide for sellers) */}
          {!profile?.is_seller && (
            <View style={styles.section}>
              <TouchableOpacity
                style={[styles.sellerCta, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
                onPress={() => {
                  lightTap();
                  navigation.navigate('ProfileTab', { screen: 'EditProfile' });
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sellerCtaIcon, { backgroundColor: themeColors.accentFaint }]}>
                  <Feather name="package" size={28} color={themeColors.accent} />
                </View>
                <View style={styles.sellerCtaContent}>
                  <Text style={[styles.sellerCtaTitle, { color: themeColors.textPrimary }]}>Start Selling</Text>
                  <Text style={[styles.sellerCtaSubtitle, { color: themeColors.textMuted }]}>
                    List your equipment and reach thousands of buyers
                  </Text>
                </View>
                <View style={[styles.sellerCtaButton, { backgroundColor: themeColors.accent }]}>
                  <Text style={styles.sellerCtaButtonText}>Get Started</Text>
                  <Feather name="arrow-right" size={16} color="#ffffff" />
                </View>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* SELLER SECTION (if seller or admin) */}
      {(profile?.is_seller || profile?.is_admin) && (
        <>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Selling Activity</Text>
            <View style={styles.statsGrid}>
              <StatCard
                icon="package"
                iconColor={themeColors.accent}
                iconBg={themeColors.accentFaint}
                value={sellerStats?.activeListings || 0}
                label="Active Listings"
                onPress={() => navigateTo('MyListings')}
              />
              <StatCard
                icon="inbox"
                iconColor={themeColors.warning}
                iconBg={themeColors.warningLight}
                value={sellerStats?.pendingOffers || 0}
                label="Pending Offers"
                onPress={() => {
                  lightTap();
                  navigation.navigate('SellerOffers', { viewMode: 'received' });
                }}
              />
              <StatCard
                icon="dollar-sign"
                iconColor={themeColors.success}
                iconBg={themeColors.successLight}
                value={sellerStats?.totalSales || 0}
                label="Total Sales"
                onPress={() => navigateTo('MySales')}
              />
            </View>
          </View>

          {/* Seller Revenue Card */}
          <View style={styles.revenueCard}>
            <View style={styles.revenueRow}>
              <View>
                <Text style={styles.revenueLabel}>Total Revenue</Text>
                <Text style={styles.revenueValue}>{formatCurrency(sellerStats?.totalRevenue || 0)}</Text>
              </View>
              <View style={styles.revenueRight}>
                <Text style={styles.pendingLabel}>Pending Payouts</Text>
                <Text style={styles.pendingValue}>{formatCurrency(sellerStats?.pendingPayouts || 0)}</Text>
              </View>
            </View>
          </View>

          {/* Seller Actions */}
          <View style={styles.section}>
            <View style={[styles.menuCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
              <ActionCard
                icon="package"
                title="My Listings"
                subtitle="Manage your listings"
                onPress={() => navigateTo('MyListings')}
              />
              <View style={[styles.divider, { borderBottomColor: themeColors.borderLight }]} />
              <ActionCard
                icon="dollar-sign"
                title="Sales"
                subtitle="View your sales history"
                onPress={() => navigateTo('MySales')}
              />
            </View>
          </View>

          {/* Create Listing CTA */}
          <TouchableOpacity
            style={[styles.createListingButton, { backgroundColor: themeColors.accent }]}
            onPress={() => navigateTo('CreateListing')}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={20} color="#ffffff" />
            <Text style={styles.createListingText}>Create New Listing</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Admin Section */}
      {profile?.is_admin && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Administration</Text>
          <View style={[styles.menuCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
            <ActionCard
              icon="shield"
              title="Admin Panel"
              subtitle="Manage users, listings, and platform settings"
              onPress={() => navigation.navigate('ProfileTab', { screen: 'AdminPanel' })}
            />
          </View>
        </View>
      )}

      {/* Recent Activity */}
      {(recentActivity?.length || 0) > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Recent Activity</Text>
          <View style={[styles.menuCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
            {recentActivity?.map((activity, index) => {
              // Compute colors dynamically based on theme
              let iconColor: string;
              let iconBg: string;
              if (activity.type === 'bid') {
                iconColor = themeColors.accent;
                iconBg = themeColors.accentFaint;
              } else if (activity.type === 'offer') {
                iconColor = activity.isReceived ? themeColors.success : themeColors.warning;
                iconBg = activity.isReceived ? themeColors.successLight : themeColors.warningLight;
              } else {
                iconColor = themeColors.accent;
                iconBg = themeColors.accentFaint;
              }

              return (
              <React.Fragment key={activity.id}>
                <View style={styles.activityItem}>
                  <View style={[styles.activityIcon, { backgroundColor: iconBg }]}>
                    <Feather name={activity.icon} size={16} color={iconColor} />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={[styles.activityTitle, { color: themeColors.textPrimary }]}>{activity.title}</Text>
                    <Text style={[styles.activitySubtitle, { color: themeColors.textMuted }]} numberOfLines={1}>{activity.subtitle}</Text>
                  </View>
                  {activity.amount && (
                    <Text style={[styles.activityAmount, { color: themeColors.textPrimary }]}>{formatCurrency(activity.amount)}</Text>
                  )}
                </View>
                {index < (recentActivity?.length || 0) - 1 && <View style={[styles.divider, { borderBottomColor: themeColors.borderLight }]} />}
              </React.Fragment>
              );
            })}
          </View>
        </View>
      )}

      {/* Notifications Modal */}
      <Modal
        visible={showNotificationsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowNotificationsModal(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: isDark ? themeColors.background : '#ffffff', paddingBottom: insets.bottom }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.borderLight }]}>
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Notifications</Text>
              <TouchableOpacity
                style={[styles.modalCloseButton, { backgroundColor: themeColors.sand }]}
                onPress={() => setShowNotificationsModal(false)}
              >
                <Feather name="x" size={20} color={themeColors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Notifications List */}
            {notifications && notifications.length > 0 ? (
              <FlatList
                data={notifications}
                keyExtractor={(item) => item.id}
                style={styles.modalList}
                renderItem={({ item: notification }) => {
                  const config = getNotificationConfig(notification.type, themeColors);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.modalNotificationItem,
                        !notification.is_read && { backgroundColor: themeColors.accentFaint },
                      ]}
                      onPress={() => {
                        setShowNotificationsModal(false);
                        handleNotificationPress(notification);
                      }}
                    >
                      <View style={[styles.notificationIcon, { backgroundColor: config.iconBg }]}>
                        <Feather name={config.icon} size={16} color={config.iconColor} />
                      </View>
                      <View style={styles.modalNotificationContent}>
                        <Text
                          style={[
                            styles.modalNotificationTitle,
                            { color: themeColors.textPrimary },
                            !notification.is_read && { fontWeight: fontWeight.semibold },
                          ]}
                          numberOfLines={1}
                        >
                          {notification.title}
                        </Text>
                        {notification.body && (
                          <Text
                            style={[styles.modalNotificationBody, { color: themeColors.textSecondary }]}
                            numberOfLines={2}
                          >
                            {notification.body}
                          </Text>
                        )}
                        <Text style={[styles.modalNotificationTime, { color: themeColors.textMuted }]}>
                          {formatRelativeTime(notification.created_at)}
                        </Text>
                      </View>
                      {!notification.is_read && (
                        <View style={[styles.unreadDot, { backgroundColor: themeColors.accent }]} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ItemSeparatorComponent={() => (
                  <View style={[styles.modalDivider, { backgroundColor: themeColors.borderLight }]} />
                )}
              />
            ) : (
              <View style={styles.emptyNotifications}>
                <Feather name="bell-off" size={48} color={themeColors.textLight} />
                <Text style={[styles.emptyNotificationsTitle, { color: themeColors.textPrimary }]}>
                  No Notifications
                </Text>
                <Text style={[styles.emptyNotificationsText, { color: themeColors.textMuted }]}>
                  You're all caught up!
                </Text>
              </View>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerLeft: {
    flex: 1,
  },
  welcomeText: {
    fontSize: fontSize.base,
    color: colors.textMuted,
  },
  userName: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  notificationBell: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },
  profileReminderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  profileReminderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileReminderContent: {
    flex: 1,
  },
  profileReminderTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  profileReminderText: {
    fontSize: fontSize.sm,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  seeAllLink: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },

  // Notifications
  notificationsCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    ...shadows.sm,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  notificationItemUnread: {
    backgroundColor: colors.accentFaint,
  },
  notificationIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  notificationTitleUnread: {
    fontWeight: fontWeight.semibold,
  },
  notificationTime: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginLeft: spacing.sm,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.xs,
  },
  viewAllText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  statsGrid: {
    flexDirection: 'row',
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
    textAlign: 'center',
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.errorLight,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.error,
  },
  alertIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.error,
  },
  alertSubtitle: {
    fontSize: fontSize.sm,
    color: colors.error,
    opacity: 0.8,
    marginTop: spacing.xs,
  },
  menuCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  actionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accentFaint,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  actionSubtitle: {
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
  revenueCard: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: borderRadius.xl,
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  revenueRight: {
    alignItems: 'flex-end',
  },
  pendingLabel: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  pendingValue: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.accentMuted,
    marginTop: spacing.xs,
  },
  createListingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    gap: spacing.sm,
    ...shadows.md,
  },
  createListingText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.white,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  activitySubtitle: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  activityAmount: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalList: {
    flexGrow: 0,
  },
  modalNotificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  modalNotificationContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  modalNotificationTitle: {
    fontSize: fontSize.base,
  },
  modalNotificationBody: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  modalNotificationTime: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  modalDivider: {
    height: 1,
    marginLeft: spacing.lg + 32 + spacing.md,
  },
  emptyNotifications: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['5xl'],
    paddingHorizontal: spacing['2xl'],
  },
  emptyNotificationsTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.lg,
  },
  emptyNotificationsText: {
    fontSize: fontSize.base,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  // Accepted Offers Banner - prominent CTA
  acceptedOffersBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.lg,
  },
  acceptedOffersIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  acceptedOffersContent: {
    flex: 1,
  },
  acceptedOffersTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: '#ffffff',
  },
  acceptedOffersSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: spacing.xs,
  },
  acceptedOffersArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Pending Transactions Banner - for sellers
  pendingTransactionsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.lg,
  },
  pendingTransactionsIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  pendingTransactionsContent: {
    flex: 1,
  },
  pendingTransactionsTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: '#ffffff',
  },
  pendingTransactionsSubtitle: {
    fontSize: fontSize.sm,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: spacing.xs,
  },
  pendingTransactionsArrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
