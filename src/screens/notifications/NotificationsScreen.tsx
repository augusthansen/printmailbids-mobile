import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Notification, NotificationType } from '../../types/database';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows, ThemeColors } from '../../constants/theme';
import { formatRelativeTime } from '../../utils/formatters';
import { lightTap } from '../../utils/haptics';

interface NotificationConfig {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  iconBg: string;
}

function getNotificationConfig(type: NotificationType, themeColors: ThemeColors): NotificationConfig {
  switch (type) {
    case 'outbid':
      return { icon: 'trending-down', iconColor: themeColors.warning, iconBg: themeColors.warningLight };
    case 'auction_won':
      return { icon: 'award', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'auction_ending_soon':
    case 'auction_ending':
      return { icon: 'clock', iconColor: themeColors.warning, iconBg: themeColors.warningLight };
    case 'auction_ended':
      return { icon: 'flag', iconColor: themeColors.textMuted, iconBg: themeColors.sand };
    case 'new_bid':
      return { icon: 'trending-up', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'reserve_met':
      return { icon: 'check-circle', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'new_offer':
    case 'offer_response_needed':
      return { icon: 'message-square', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'offer_accepted':
      return { icon: 'check', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'offer_declined':
      return { icon: 'x', iconColor: themeColors.error, iconBg: themeColors.errorLight };
    case 'offer_countered':
      return { icon: 'repeat', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'offer_expired':
      return { icon: 'clock', iconColor: themeColors.textMuted, iconBg: themeColors.sand };
    case 'payment_reminder':
      return { icon: 'alert-circle', iconColor: themeColors.warning, iconBg: themeColors.warningLight };
    case 'payment_received':
    case 'payment_confirmed':
      return { icon: 'dollar-sign', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'item_shipped':
      return { icon: 'truck', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'item_delivered':
      return { icon: 'home', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'shipping_quote_received':
    case 'shipping_quote_requested':
      return { icon: 'file-text', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'buyer_message':
      return { icon: 'message-circle', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'review_received':
      return { icon: 'star', iconColor: themeColors.warning, iconBg: themeColors.warningLight };
    case 'payout_processed':
      return { icon: 'credit-card', iconColor: themeColors.success, iconBg: themeColors.successLight };
    case 'new_listing_saved_search':
      return { icon: 'bell', iconColor: themeColors.accent, iconBg: themeColors.accentFaint };
    case 'price_drop':
      return { icon: 'tag', iconColor: themeColors.success, iconBg: themeColors.successLight };
    default:
      return { icon: 'bell', iconColor: themeColors.textMuted, iconBg: themeColors.sand };
  }
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { colors: themeColors, isDark } = useTheme();

  const { data: notifications, isLoading, refetch } = useQuery<Notification[]>({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as Notification[];
    },
    enabled: !!user,
  });

  // Mark as read mutation
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

  // Mark all as read mutation
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

  const handleNotificationPress = useCallback((notification: Notification) => {
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
        navigation.navigate('InvoiceDetail' as never, { invoiceId: notification.invoice_id } as never);
        return;
      }

      // For other offer notifications, determine the appropriate view and filter
      // new_offer = seller received a new offer → go to "Offers Received"
      // offer_countered = other party countered your offer → go to "Offers Sent" for buyer, "Offers Received" for seller
      // offer_declined/withdrawn/expired = response to your offer → go to appropriate tab
      const sellerReceivedTypes: NotificationType[] = ['new_offer'];
      const isSellerNotification = sellerReceivedTypes.includes(notification.type);

      navigation.navigate('MyOffers' as never, {
        viewMode: isSellerNotification ? 'received' : 'sent',
        filter: notification.type === 'offer_accepted' ? 'accepted' : 'pending',
      } as never);
    } else if (invoiceTypes.includes(notification.type) && notification.invoice_id) {
      navigation.navigate('InvoiceDetail' as never, { invoiceId: notification.invoice_id } as never);
    } else if (bidTypes.includes(notification.type)) {
      if (notification.listing_id) {
        navigation.navigate('ListingDetail' as never, { listingId: notification.listing_id } as never);
      } else {
        navigation.navigate('MyBids' as never);
      }
    } else if (notification.invoice_id) {
      navigation.navigate('InvoiceDetail' as never, { invoiceId: notification.invoice_id } as never);
    } else if (notification.offer_id) {
      navigation.navigate('MyOffers' as never);
    } else if (notification.bid_id) {
      navigation.navigate('MyBids' as never);
    } else if (notification.listing_id) {
      navigation.navigate('ListingDetail' as never, { listingId: notification.listing_id } as never);
    }
  }, [navigation, markReadMutation]);

  const renderNotificationItem = useCallback(({ item }: { item: Notification }) => {
    const config = getNotificationConfig(item.type, themeColors);

    return (
      <TouchableOpacity
        style={[
          styles.notificationCard,
          { backgroundColor: isDark ? themeColors.sand : '#ffffff' },
          !item.is_read && [styles.notificationCardUnread, { backgroundColor: themeColors.accentFaint }],
        ]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: config.iconBg }]}>
          <Feather name={config.icon} size={18} color={config.iconColor} />
        </View>

        <View style={styles.content}>
          <Text style={[
            styles.title,
            { color: themeColors.textPrimary },
            !item.is_read && styles.titleUnread,
          ]} numberOfLines={2}>
            {item.title}
          </Text>
          {item.body && (
            <Text style={[styles.body, { color: themeColors.textMuted }]} numberOfLines={2}>
              {item.body}
            </Text>
          )}
          <Text style={[styles.time, { color: themeColors.textLight }]}>
            {formatRelativeTime(item.created_at)}
          </Text>
        </View>

        {!item.is_read && <View style={[styles.unreadDot, { backgroundColor: themeColors.accent }]} />}
      </TouchableOpacity>
    );
  }, [handleNotificationPress, themeColors, isDark]);

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Feather name="bell-off" size={48} color={themeColors.textLight} />
      <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No notifications</Text>
      <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
        When you have new activity, you'll see it here.
      </Text>
    </View>
  );

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Header with Mark All Read */}
      {unreadCount > 0 && (
        <View style={[styles.header, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderBottomColor: themeColors.border }]}>
          <Text style={[styles.unreadCount, { color: themeColors.textMuted }]}>
            {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            onPress={() => {
              lightTap();
              markAllReadMutation.mutate();
            }}
            disabled={markAllReadMutation.isPending}
          >
            <Text style={[styles.markAllRead, { color: themeColors.accent }]}>Mark all as read</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Notifications List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotificationItem}
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
          ItemSeparatorComponent={() => <View style={[styles.separator, { backgroundColor: themeColors.borderLight }]} />}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  unreadCount: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  markAllRead: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingTop: spacing.sm,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.white,
  },
  notificationCardUnread: {
    backgroundColor: colors.accentFaint,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  content: {
    flex: 1,
    marginRight: spacing.md,
  },
  title: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  titleUnread: {
    fontWeight: fontWeight.semibold,
  },
  body: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  time: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginTop: spacing.xs,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderLight,
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
