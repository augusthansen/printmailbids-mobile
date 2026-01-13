import React, { useState, useMemo } from 'react';
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

// Greeting messages that rotate based on time of day and randomness
function getGreeting(name: string): { welcome: string; subtitle: string } {
  const hour = new Date().getHours();
  const random = Math.random();

  // Time-based greetings
  if (hour < 12) {
    // Morning greetings
    const morningGreetings = [
      { welcome: `Good morning, ${name}`, subtitle: "Let's see what's happening today." },
      { welcome: `Morning, ${name}`, subtitle: "Ready to find your next deal?" },
      { welcome: `Good morning, ${name}`, subtitle: "Here's your activity overview." },
      { welcome: `Rise and shine, ${name}`, subtitle: "Your dashboard is ready." },
    ];
    return morningGreetings[Math.floor(random * morningGreetings.length)];
  } else if (hour < 17) {
    // Afternoon greetings
    const afternoonGreetings = [
      { welcome: `Good afternoon, ${name}`, subtitle: "Let's check on your activity." },
      { welcome: `Hey there, ${name}`, subtitle: "Here's what's going on today." },
      { welcome: `Welcome back, ${name}`, subtitle: "Your dashboard awaits." },
      { welcome: `Good to see you, ${name}`, subtitle: "Let's dive into the action." },
    ];
    return afternoonGreetings[Math.floor(random * afternoonGreetings.length)];
  } else {
    // Evening greetings
    const eveningGreetings = [
      { welcome: `Good evening, ${name}`, subtitle: "Here's your latest activity." },
      { welcome: `Evening, ${name}`, subtitle: "Let's see what you've missed." },
      { welcome: `Welcome back, ${name}`, subtitle: "Winding down? Here's your summary." },
      { welcome: `Hey ${name}`, subtitle: "Quick look at your dashboard." },
    ];
    return eveningGreetings[Math.floor(random * eveningGreetings.length)];
  }
}

interface BuyerStats {
  activeBids: number;
  winningBids: number;
  pendingOffers: number;
  acceptedOffers: number;
  unpaidInvoices: number;
  totalPurchases: number;
  pipelineValue: number;
  activeTransactions: number;
  activeTransactionsAmount: number;
}

interface SellerStats {
  activeListings: number;
  totalSales: number;
  pendingOffers: number;
  totalRevenue: number;
  pendingPayouts: number;
  totalViews: number;
  activeTransactions: number;
  activeTransactionsAmount: number;
  awaitingPayment: number;
}

// Helper function to get notification icon config
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

  // Memoize greeting so it doesn't change on every re-render (only when profile changes)
  const greeting = useMemo(() => {
    const name = profile?.full_name?.split(' ')[0] || profile?.company_name || 'there';
    return getGreeting(name);
  }, [profile?.full_name, profile?.company_name]);

  // Fetch buyer stats
  const { data: buyerStats, isLoading: loadingBuyer, refetch: refetchBuyer } = useQuery<BuyerStats>({
    queryKey: ['buyerStats', user?.id],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      if (!user) return { activeBids: 0, winningBids: 0, pendingOffers: 0, acceptedOffers: 0, unpaidInvoices: 0, totalPurchases: 0, pipelineValue: 0, activeTransactions: 0, activeTransactionsAmount: 0 };

      const [bidsResult, pendingOffersResult, acceptedOffersResult, invoicesResult, paidInvoicesResult, activeTransactionsResult] = await Promise.all([
        supabase
          .from('bids')
          .select('id, status, amount, listing_id, listing:listings(id, status)')
          .eq('bidder_id', user.id)
          .in('status', ['active', 'winning']),
        supabase
          .from('offers')
          .select('id, listing:listings(status)')
          .eq('buyer_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('offers')
          .select('id, amount, listing:listings(title)')
          .eq('buyer_id', user.id)
          .eq('status', 'accepted'),
        supabase
          .from('invoices')
          .select('id, total_amount')
          .eq('buyer_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('buyer_id', user.id)
          .eq('status', 'paid'),
        supabase
          .from('invoices')
          .select('id, total_amount, fulfillment_status, delivery_confirmed_at')
          .eq('buyer_id', user.id)
          .eq('status', 'paid'),
      ]);

      const bids = bidsResult.data || [];

      type ListingData = { id: string; status: string } | { id: string; status: string }[] | null;
      const getListingStatus = (listing: ListingData): string | undefined => {
        if (!listing) return undefined;
        if (Array.isArray(listing)) return listing[0]?.status;
        return listing.status;
      };

      const activeBidsData = bids.filter(b => {
        const listingStatus = getListingStatus(b.listing as ListingData);
        return b.status === 'active' && listingStatus === 'active';
      });
      const winningBidsData = bids.filter(b => {
        const listingStatus = getListingStatus(b.listing as ListingData);
        return b.status === 'winning' && listingStatus === 'active';
      });

      const uniqueActiveListings = new Set(activeBidsData.map(b => b.listing_id));
      const uniqueWinningListings = new Set(winningBidsData.map(b => b.listing_id));
      const activeBids = uniqueActiveListings.size;
      const winningBids = uniqueWinningListings.size;
      const unpaidInvoices = invoicesResult.data || [];
      const pipelineValue = unpaidInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      const allPaidInvoices = activeTransactionsResult.data || [];
      const activeTransactions = allPaidInvoices.filter(inv => {
        if (inv.fulfillment_status === 'completed') return false;
        if (inv.fulfillment_status === 'delivered' && inv.delivery_confirmed_at) return false;
        return true;
      });
      const activeTransactionsAmount = activeTransactions.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      // Filter pending offers to exclude those where listing is sold
      type OfferListingData = { status: string } | { status: string }[] | null;
      const getOfferListingStatus = (listing: OfferListingData): string | undefined => {
        if (!listing) return undefined;
        if (Array.isArray(listing)) return listing[0]?.status;
        return listing.status;
      };
      const pendingOffers = (pendingOffersResult.data || []).filter(offer => {
        const listingStatus = getOfferListingStatus(offer.listing as OfferListingData);
        return listingStatus !== 'sold';
      });

      return {
        activeBids,
        winningBids,
        pendingOffers: pendingOffers.length,
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

  // Fetch seller stats
  const { data: sellerStats, isLoading: loadingSeller, refetch: refetchSeller } = useQuery<SellerStats>({
    queryKey: ['sellerStats', user?.id],
    queryFn: async () => {
      if (!user) return { activeListings: 0, totalSales: 0, pendingOffers: 0, totalRevenue: 0, pendingPayouts: 0, totalViews: 0, activeTransactions: 0, activeTransactionsAmount: 0, awaitingPayment: 0 };

      const [listingsResult, salesResult, offersResult, viewsResult] = await Promise.all([
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('seller_id', user.id)
          .eq('status', 'active'),
        supabase
          .from('invoices')
          .select('id, seller_payout_amount, total_amount, status, fulfillment_status, delivery_confirmed_at')
          .eq('seller_id', user.id),
        supabase
          .from('offers')
          .select('id, listing:listings(status)')
          .eq('seller_id', user.id)
          .eq('status', 'pending'),
        supabase
          .from('listings')
          .select('view_count')
          .eq('seller_id', user.id),
      ]);

      const sales = salesResult.data || [];
      const paidSales = sales.filter(s => s.status === 'paid');

      const activeSales = sales.filter(s => {
        if (s.status === 'cancelled' || s.status === 'expired' || s.status === 'refunded') return false;
        if (s.fulfillment_status === 'completed') return false;
        if (s.delivery_confirmed_at) return false;
        return true;
      });

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

      // Filter pending offers to exclude those where listing is sold
      type SellerOfferListingData = { status: string } | { status: string }[] | null;
      const getSellerOfferListingStatus = (listing: SellerOfferListingData): string | undefined => {
        if (!listing) return undefined;
        if (Array.isArray(listing)) return listing[0]?.status;
        return listing.status;
      };
      const sellerPendingOffers = (offersResult.data || []).filter(offer => {
        const listingStatus = getSellerOfferListingStatus(offer.listing as SellerOfferListingData);
        return listingStatus !== 'sold';
      });

      return {
        activeListings: listingsResult.count || 0,
        totalSales: paidSales.length,
        pendingOffers: sellerPendingOffers.length,
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
        .limit(20);

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

  // Mark all notifications as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (!user) return;

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadNotifications = notifications?.filter(n => !n.is_read) || [];

  const handleNotificationPress = (notification: Notification) => {
    lightTap();

    if (!notification.is_read) {
      markReadMutation.mutate(notification.id);
    }

    // Special handling for wire payment request notifications
    // These are sent as 'payment_reminder' type but have a specific title
    if (notification.title === 'Wire Payment Requested') {
      // Navigate directly to Wire Instructions screen so seller can add bank details
      navigation.navigate('ProfileTab', { screen: 'WireInstructions' });
      return;
    }

    // Special handling for wire instructions available notifications
    // Navigate buyer to checkout screen so they can pay via wire
    if (notification.title === 'Wire Instructions Available' && notification.invoice_id) {
      navigation.navigate('Checkout', { invoiceId: notification.invoice_id });
      return;
    }

    const offerTypes: NotificationType[] = ['new_offer', 'offer_accepted', 'offer_declined', 'offer_countered', 'offer_expired', 'offer_withdrawn', 'offer_response_needed'];
    const bidTypes: NotificationType[] = ['outbid', 'auction_won', 'new_bid', 'auction_ending_soon', 'auction_ending'];
    const invoiceTypes: NotificationType[] = ['payment_reminder', 'payment_received', 'payment_confirmed', 'item_shipped', 'item_delivered'];

    if (offerTypes.includes(notification.type)) {
      if (notification.type === 'offer_accepted' && notification.invoice_id) {
        navigation.navigate('InvoiceDetail', { invoiceId: notification.invoice_id });
        return;
      }

      // Determine view mode based on notification type and user role
      // For 'new_offer' - seller receives, go to received
      // For 'offer_countered' - need to check if user is seller (received) or buyer (sent)
      // For other offer types - default to sent
      let targetViewMode: 'sent' | 'received' = 'sent';

      if (notification.type === 'new_offer') {
        // New offers are always received by sellers
        targetViewMode = 'received';
      } else if (notification.type === 'offer_countered' && profile?.is_seller) {
        // If user is a seller and receives counter offer notification,
        // they likely need to see their received offers (buyer countered their counter)
        // Navigate to received so they can toggle if needed
        targetViewMode = 'received';
      }

      navigation.navigate('MyOffers', {
        viewMode: targetViewMode,
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
    await Promise.all([refetchBuyer(), refetchSeller(), refetchNotifications()]);
  };

  const navigateTo = (screen: string, params?: object) => {
    lightTap();
    navigation.navigate(screen as never, params as never);
  };

  const isLoading = loadingBuyer || loadingSeller;

  // Calculate if there are any urgent items
  const hasUrgentItems = (buyerStats?.unpaidInvoices || 0) > 0 ||
    (buyerStats?.activeTransactions || 0) > 0 ||
    ((profile?.is_seller || profile?.is_admin) && (sellerStats?.activeTransactions || 0) > 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={themeColors.accent} />
      }
    >
      {/* Header with Greeting Card */}
      <View style={styles.header}>
        <View
          style={[
            styles.greetingCard,
            {
              backgroundColor: isDark
                ? 'rgba(37, 99, 235, 0.15)'
                : 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)',
            },
            isDark ? {} : { backgroundColor: '#EFF6FF' },
          ]}
        >
          <View style={styles.greetingContent}>
            <View style={styles.greetingIconContainer}>
              <View style={[styles.greetingIcon, { backgroundColor: themeColors.accent }]}>
                <Feather
                  name={new Date().getHours() < 12 ? 'sun' : new Date().getHours() < 17 ? 'cloud' : 'moon'}
                  size={20}
                  color="#ffffff"
                />
              </View>
            </View>
            <View style={styles.greetingTextContainer}>
              <Text style={[styles.greetingText, { color: themeColors.textPrimary }]}>
                {greeting.welcome}
              </Text>
              <Text style={[styles.greetingSubtitle, { color: themeColors.textSecondary }]}>
                {greeting.subtitle}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.notificationBell, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
            onPress={() => {
              lightTap();
              setShowNotificationsModal(true);
            }}
            accessibilityLabel="Notifications"
            accessibilityRole="button"
          >
            <Feather name="bell" size={22} color={themeColors.textPrimary} />
            {unreadNotifications.length > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {unreadNotifications.length > 9 ? '9+' : unreadNotifications.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile Completion Reminder */}
      {profile && !profile.onboarding_completed && (!profile.full_name || !profile.phone_verified) && (
        <TouchableOpacity
          style={[styles.alertBanner, { backgroundColor: isDark ? 'rgba(251, 191, 36, 0.15)' : '#FEF3C7' }]}
          onPress={() => {
            lightTap();
            navigation.navigate('ProfileTab', { screen: 'EditProfile' });
          }}
          accessibilityRole="button"
          accessibilityLabel="Complete your profile"
        >
          <View style={[styles.alertIcon, { backgroundColor: colors.warningLight }]}>
            <Feather name="user" size={18} color={colors.warning} />
          </View>
          <View style={styles.alertContent}>
            <Text style={[styles.alertTitle, { color: isDark ? '#FBBF24' : '#92400E' }]}>
              Complete Your Profile
            </Text>
            <Text style={[styles.alertText, { color: isDark ? themeColors.textMuted : '#B45309' }]}>
              {!profile.full_name ? 'Add your name' : ''}
              {!profile.full_name && !profile.phone_verified ? ' and ' : ''}
              {!profile.phone_verified ? 'verify your phone' : ''}
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={isDark ? '#FBBF24' : '#92400E'} />
        </TouchableOpacity>
      )}

      {/* Quick Actions - Urgent Items */}
      {hasUrgentItems && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Action Required</Text>

          {/* Unpaid Invoices */}
          {(buyerStats?.unpaidInvoices || 0) > 0 && (
            <TouchableOpacity
              style={[styles.urgentCard, { backgroundColor: '#f59e0b' }]}
              onPress={() => navigateTo('MyInvoices')}
              activeOpacity={0.8}
            >
              <View style={styles.urgentIconContainer}>
                <Feather name="credit-card" size={24} color="#ffffff" />
              </View>
              <View style={styles.urgentContent}>
                <Text style={styles.urgentTitle}>
                  {buyerStats?.unpaidInvoices === 1 ? '1 Invoice Ready' : `${buyerStats?.unpaidInvoices} Invoices Ready`}
                </Text>
                <Text style={styles.urgentSubtitle}>
                  {formatCurrency(buyerStats?.pipelineValue || 0)} awaiting payment
                </Text>
              </View>
              <Feather name="arrow-right" size={20} color="#ffffff" />
            </TouchableOpacity>
          )}

          {/* Buyer Active Orders */}
          {(buyerStats?.activeTransactions || 0) > 0 && (
            <TouchableOpacity
              style={[styles.urgentCard, { backgroundColor: themeColors.accent }]}
              onPress={() => navigateTo('MyInvoices')}
              activeOpacity={0.8}
            >
              <View style={styles.urgentIconContainer}>
                <Feather name="truck" size={24} color="#ffffff" />
              </View>
              <View style={styles.urgentContent}>
                <Text style={styles.urgentTitle}>
                  {buyerStats?.activeTransactions === 1 ? '1 Order In Progress' : `${buyerStats?.activeTransactions} Orders In Progress`}
                </Text>
                <Text style={styles.urgentSubtitle}>
                  {formatCurrency(buyerStats?.activeTransactionsAmount || 0)} in transit
                </Text>
              </View>
              <Feather name="arrow-right" size={20} color="#ffffff" />
            </TouchableOpacity>
          )}

          {/* Seller Active Sales */}
          {(profile?.is_seller || profile?.is_admin) && (sellerStats?.activeTransactions || 0) > 0 && (
            <TouchableOpacity
              style={[styles.urgentCard, { backgroundColor: themeColors.success }]}
              onPress={() => navigateTo('MySales')}
              activeOpacity={0.8}
            >
              <View style={styles.urgentIconContainer}>
                <Feather name="package" size={24} color="#ffffff" />
              </View>
              <View style={styles.urgentContent}>
                <Text style={styles.urgentTitle}>
                  {sellerStats?.activeTransactions === 1 ? '1 Active Sale' : `${sellerStats?.activeTransactions} Active Sales`}
                </Text>
                <Text style={styles.urgentSubtitle}>
                  {sellerStats?.awaitingPayment ? `${sellerStats.awaitingPayment} awaiting payment` : 'In progress'}
                </Text>
              </View>
              <Feather name="arrow-right" size={20} color="#ffffff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Buying Activity Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Buying Activity</Text>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
            onPress={() => navigateTo('MyBids')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIconSmall, { backgroundColor: themeColors.accentFaint }]}>
              <Feather name="trending-up" size={16} color={themeColors.accent} />
            </View>
            <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
              {buyerStats?.activeBids || 0}
            </Text>
            <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Active Bids</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
            onPress={() => navigateTo('MyBids')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIconSmall, { backgroundColor: themeColors.successLight }]}>
              <Feather name="award" size={16} color={themeColors.success} />
            </View>
            <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
              {buyerStats?.winningBids || 0}
            </Text>
            <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Winning</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
            onPress={() => navigateTo('MyOffers')}
            activeOpacity={0.7}
          >
            <View style={[styles.statIconSmall, { backgroundColor: themeColors.warningLight }]}>
              <Feather name="send" size={16} color={themeColors.warning} />
            </View>
            <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
              {buyerStats?.pendingOffers || 0}
            </Text>
            <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Open Offers</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Links */}
        <View style={[styles.linksCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigateTo('MyBids')}
            activeOpacity={0.7}
          >
            <View style={[styles.linkIcon, { backgroundColor: themeColors.accentFaint }]}>
              <Feather name="trending-up" size={18} color={themeColors.accent} />
            </View>
            <Text style={[styles.linkText, { color: themeColors.textPrimary }]}>My Bids</Text>
            {(buyerStats?.activeBids || 0) > 0 && (
              <View style={[styles.linkBadge, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.linkBadgeText}>{buyerStats?.activeBids}</Text>
              </View>
            )}
            <Feather name="chevron-right" size={18} color={themeColors.textLight} style={styles.linkArrow} />
          </TouchableOpacity>

          <View style={[styles.linkDivider, { backgroundColor: themeColors.borderLight }]} />

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigateTo('MyOffers')}
            activeOpacity={0.7}
          >
            <View style={[styles.linkIcon, { backgroundColor: themeColors.warningLight }]}>
              <Feather name="message-square" size={18} color={themeColors.warning} />
            </View>
            <Text style={[styles.linkText, { color: themeColors.textPrimary }]}>My Offers</Text>
            {(buyerStats?.pendingOffers || 0) > 0 && (
              <View style={[styles.linkBadge, { backgroundColor: themeColors.warning }]}>
                <Text style={styles.linkBadgeText}>{buyerStats?.pendingOffers}</Text>
              </View>
            )}
            <Feather name="chevron-right" size={18} color={themeColors.textLight} style={styles.linkArrow} />
          </TouchableOpacity>

          <View style={[styles.linkDivider, { backgroundColor: themeColors.borderLight }]} />

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => navigateTo('MyInvoices')}
            activeOpacity={0.7}
          >
            <View style={[styles.linkIcon, { backgroundColor: themeColors.successLight }]}>
              <Feather name="shopping-bag" size={18} color={themeColors.success} />
            </View>
            <Text style={[styles.linkText, { color: themeColors.textPrimary }]}>Purchases</Text>
            {(buyerStats?.totalPurchases || 0) > 0 && (
              <Text style={[styles.linkSubtext, { color: themeColors.textMuted }]}>
                {buyerStats?.totalPurchases} completed
              </Text>
            )}
            <Feather name="chevron-right" size={18} color={themeColors.textLight} style={styles.linkArrow} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Selling Activity Section */}
      {(profile?.is_seller || profile?.is_admin) && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Selling Activity</Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
              onPress={() => navigateTo('MyListings')}
              activeOpacity={0.7}
            >
              <View style={[styles.statIconSmall, { backgroundColor: themeColors.accentFaint }]}>
                <Feather name="box" size={16} color={themeColors.accent} />
              </View>
              <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
                {sellerStats?.activeListings || 0}
              </Text>
              <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Listings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
              onPress={() => navigation.navigate('SellerOffers', { viewMode: 'received' })}
              activeOpacity={0.7}
            >
              <View style={[styles.statIconSmall, { backgroundColor: themeColors.warningLight }]}>
                <Feather name="inbox" size={16} color={themeColors.warning} />
              </View>
              <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
                {sellerStats?.pendingOffers || 0}
              </Text>
              <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Offers</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
              onPress={() => navigateTo('MySales')}
              activeOpacity={0.7}
            >
              <View style={[styles.statIconSmall, { backgroundColor: themeColors.successLight }]}>
                <Feather name="dollar-sign" size={16} color={themeColors.success} />
              </View>
              <Text style={[styles.statValue, { color: themeColors.textPrimary }]}>
                {sellerStats?.totalSales || 0}
              </Text>
              <Text style={[styles.statLabel, { color: themeColors.textMuted }]}>Sales</Text>
            </TouchableOpacity>
          </View>

          {/* Revenue Summary */}
          <View style={[styles.revenueCard, { backgroundColor: themeColors.accent }]}>
            <View style={styles.revenueRow}>
              <View>
                <Text style={styles.revenueLabel}>Total Revenue</Text>
                <Text style={styles.revenueValue}>{formatCurrency(sellerStats?.totalRevenue || 0)}</Text>
              </View>
              <View style={styles.revenueRight}>
                <Text style={styles.revenueLabel}>Pending</Text>
                <Text style={styles.pendingValue}>{formatCurrency(sellerStats?.pendingPayouts || 0)}</Text>
              </View>
            </View>
          </View>

          {/* Quick Links */}
          <View style={[styles.linksCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigateTo('MyListings')}
              activeOpacity={0.7}
            >
              <View style={[styles.linkIcon, { backgroundColor: themeColors.accentFaint }]}>
                <Feather name="package" size={18} color={themeColors.accent} />
              </View>
              <Text style={[styles.linkText, { color: themeColors.textPrimary }]}>My Listings</Text>
              <Feather name="chevron-right" size={18} color={themeColors.textLight} style={styles.linkArrow} />
            </TouchableOpacity>

            <View style={[styles.linkDivider, { backgroundColor: themeColors.borderLight }]} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate('SellerOffers', { viewMode: 'received' })}
              activeOpacity={0.7}
            >
              <View style={[styles.linkIcon, { backgroundColor: themeColors.warningLight }]}>
                <Feather name="inbox" size={18} color={themeColors.warning} />
              </View>
              <Text style={[styles.linkText, { color: themeColors.textPrimary }]}>Received Offers</Text>
              {(sellerStats?.pendingOffers || 0) > 0 && (
                <View style={[styles.linkBadge, { backgroundColor: themeColors.warning }]}>
                  <Text style={styles.linkBadgeText}>{sellerStats?.pendingOffers}</Text>
                </View>
              )}
              <Feather name="chevron-right" size={18} color={themeColors.textLight} style={styles.linkArrow} />
            </TouchableOpacity>

            <View style={[styles.linkDivider, { backgroundColor: themeColors.borderLight }]} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigateTo('MySales')}
              activeOpacity={0.7}
            >
              <View style={[styles.linkIcon, { backgroundColor: themeColors.successLight }]}>
                <Feather name="dollar-sign" size={18} color={themeColors.success} />
              </View>
              <Text style={[styles.linkText, { color: themeColors.textPrimary }]}>Sales History</Text>
              <Feather name="chevron-right" size={18} color={themeColors.textLight} style={styles.linkArrow} />
            </TouchableOpacity>

            <View style={[styles.linkDivider, { backgroundColor: themeColors.borderLight }]} />

            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => navigation.navigate('ProfileTab', { screen: 'SellerDashboard' })}
              activeOpacity={0.7}
            >
              <View style={[styles.linkIcon, { backgroundColor: themeColors.accentFaint }]}>
                <Feather name="bar-chart-2" size={18} color={themeColors.accent} />
              </View>
              <Text style={[styles.linkText, { color: themeColors.textPrimary }]}>Seller Analytics</Text>
              <Text style={[styles.linkSubtext, { color: themeColors.textMuted }]}>
                {sellerStats?.totalViews || 0} views
              </Text>
              <Feather name="chevron-right" size={18} color={themeColors.textLight} style={styles.linkArrow} />
            </TouchableOpacity>
          </View>

          {/* Create Listing CTA */}
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: themeColors.accent }]}
            onPress={() => navigateTo('CreateListing')}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={20} color="#ffffff" />
            <Text style={styles.createButtonText}>Create New Listing</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Become a Seller CTA */}
      {!profile?.is_seller && !profile?.is_admin && (
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
              <Feather name="package" size={24} color={themeColors.accent} />
            </View>
            <View style={styles.sellerCtaContent}>
              <Text style={[styles.sellerCtaTitle, { color: themeColors.textPrimary }]}>Start Selling</Text>
              <Text style={[styles.sellerCtaSubtitle, { color: themeColors.textMuted }]}>
                List your equipment and reach thousands of buyers
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={themeColors.textLight} />
          </TouchableOpacity>
        </View>
      )}

      {/* Admin Section */}
      {profile?.is_admin && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Administration</Text>
          <TouchableOpacity
            style={[styles.adminCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
            onPress={() => navigation.navigate('ProfileTab', { screen: 'AdminPanel' })}
            activeOpacity={0.7}
          >
            <View style={[styles.adminIcon, { backgroundColor: themeColors.accentFaint }]}>
              <Feather name="shield" size={20} color={themeColors.accent} />
            </View>
            <View style={styles.adminContent}>
              <Text style={[styles.adminTitle, { color: themeColors.textPrimary }]}>Admin Panel</Text>
              <Text style={[styles.adminSubtitle, { color: themeColors.textMuted }]}>
                Manage users, listings, and settings
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={themeColors.textLight} />
          </TouchableOpacity>
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
            <View style={[styles.modalHeader, { borderBottomColor: themeColors.borderLight }]}>
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Notifications</Text>
              <View style={styles.modalHeaderActions}>
                {unreadNotifications.length > 0 && (
                  <TouchableOpacity
                    style={styles.markAllReadButton}
                    onPress={() => {
                      lightTap();
                      markAllReadMutation.mutate();
                    }}
                    disabled={markAllReadMutation.isPending}
                  >
                    <Text style={[styles.markAllReadText, { color: themeColors.accent }]}>
                      {markAllReadMutation.isPending ? 'Marking...' : 'Mark All Read'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.modalCloseButton, { backgroundColor: themeColors.sand }]}
                  onPress={() => setShowNotificationsModal(false)}
                >
                  <Feather name="x" size={20} color={themeColors.textPrimary} />
                </TouchableOpacity>
              </View>
            </View>

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
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xs,
  },
  greetingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.xl,
  },
  greetingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  greetingIconContainer: {
    marginRight: spacing.md,
  },
  greetingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  greetingTextContainer: {
    flex: 1,
  },
  greetingText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
  greetingSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  notificationBell: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  notificationBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
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
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  // Alert Banner
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    gap: spacing.md,
  },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  alertText: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  // Urgent Cards
  urgentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
  },
  urgentIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  urgentContent: {
    flex: 1,
  },
  urgentTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: '#ffffff',
  },
  urgentSubtitle: {
    fontSize: fontSize.xs,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  // Stats Row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...shadows.sm,
  },
  statIconSmall: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  statValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  statLabel: {
    fontSize: fontSize.xs,
    marginTop: 2,
    textAlign: 'center',
  },
  // Links Card
  linksCard: {
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  linkText: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  linkSubtext: {
    fontSize: fontSize.xs,
    marginRight: spacing.sm,
  },
  linkBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginRight: spacing.sm,
  },
  linkBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: '#ffffff',
  },
  linkArrow: {
    marginLeft: 'auto',
  },
  linkDivider: {
    height: 1,
    marginLeft: spacing.md + 36 + spacing.md,
  },
  // Revenue Card
  revenueCard: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  revenueLabel: {
    fontSize: fontSize.xs,
    color: 'rgba(255, 255, 255, 0.75)',
  },
  revenueValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: '#ffffff',
    marginTop: 2,
  },
  revenueRight: {
    alignItems: 'flex-end',
  },
  pendingValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  // Create Button
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  createButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: '#ffffff',
  },
  // Seller CTA
  sellerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  sellerCtaIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  sellerCtaContent: {
    flex: 1,
  },
  sellerCtaTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  sellerCtaSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  // Admin Card
  adminCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    ...shadows.sm,
  },
  adminIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  adminContent: {
    flex: 1,
  },
  adminTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  adminSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  // Notification Icon
  notificationIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
  },
  // Modal Styles
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
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  markAllReadButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  markAllReadText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
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
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  modalNotificationContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  modalNotificationTitle: {
    fontSize: fontSize.sm,
  },
  modalNotificationBody: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    lineHeight: 18,
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
    paddingVertical: spacing['4xl'],
    paddingHorizontal: spacing['2xl'],
  },
  emptyNotificationsTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
  },
  emptyNotificationsText: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
});
