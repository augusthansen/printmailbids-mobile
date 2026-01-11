import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { EventSubscription } from 'expo-modules-core';
import { NavigationContainerRef } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import {
  registerForPushNotifications,
  savePushToken,
  removePushToken,
  setBadgeCount,
  clearAllNotifications,
} from '../utils/pushNotifications';
import { useAuth } from './AuthContext';
import { NotificationType } from '../types/database';

interface NotificationContextType {
  expoPushToken: string | null;
  notification: Notifications.Notification | null;
  error: string | null;
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  clearNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Store navigation ref for use outside of React components
let navigationRef: NavigationContainerRef<any> | null = null;

export function setNavigationRef(ref: NavigationContainerRef<any> | null) {
  navigationRef = ref;
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const notificationListener = useRef<EventSubscription | null>(null);
  const responseListener = useRef<EventSubscription | null>(null);

  // Register for push notifications when user signs in
  useEffect(() => {
    if (!user || !profile) {
      // User signed out - clean up
      if (expoPushToken && user) {
        removePushToken(user.id);
      }
      setExpoPushToken(null);
      return;
    }

    // Skip if push notifications are disabled in settings
    if (profile.notify_push === false) {
      console.log('Push notifications disabled in user settings');
      return;
    }

    // Register and save token
    const setupPushNotifications = async () => {
      const result = await registerForPushNotifications();

      if (result.error) {
        setError(result.error);
        console.log('Push notification setup error:', result.error);
        return;
      }

      if (result.token) {
        setExpoPushToken(result.token);
        console.log('Expo push token:', result.token);

        // Only save if token changed
        if (result.token !== profile.expo_push_token) {
          await savePushToken(user.id, result.token);
        }
      }
    };

    setupPushNotifications();
  }, [user, profile]);

  // Set up notification listeners
  useEffect(() => {
    // Listener for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received in foreground:', notification);
      setNotification(notification);

      // Increment unread count and invalidate notifications query
      setUnreadCount((prev) => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    // Listener for when user taps on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification tapped:', response);
      handleNotificationResponse(response.notification);
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [queryClient]);

  // Handle navigation when notification is tapped
  const handleNotificationResponse = useCallback((notification: Notifications.Notification) => {
    const data = notification.request.content.data as {
      type?: NotificationType;
      listing_id?: string;
      invoice_id?: string;
      offer_id?: string;
      conversation_id?: string;
    };

    if (!navigationRef) {
      console.log('Navigation not ready');
      return;
    }

    const { type, listing_id, invoice_id, offer_id, conversation_id } = data;

    // Navigate based on notification type and data
    const offerTypes: NotificationType[] = [
      'new_offer', 'offer_accepted', 'offer_declined', 'offer_countered',
      'offer_expired', 'offer_withdrawn', 'offer_response_needed'
    ];
    const bidTypes: NotificationType[] = [
      'outbid', 'auction_won', 'new_bid', 'auction_ending_soon', 'auction_ending'
    ];
    const invoiceTypes: NotificationType[] = [
      'payment_reminder', 'payment_received', 'payment_confirmed',
      'item_shipped', 'item_delivered'
    ];
    const messageTypes: NotificationType[] = ['buyer_message'];

    if (type && offerTypes.includes(type)) {
      if (type === 'offer_accepted' && invoice_id) {
        navigationRef.navigate('InvoiceDetail', { invoiceId: invoice_id });
      } else {
        const isSellerNotification = type === 'new_offer';
        navigationRef.navigate('MyOffers', {
          viewMode: isSellerNotification ? 'received' : 'sent',
          filter: type === 'offer_accepted' ? 'accepted' : 'pending',
        });
      }
    } else if (type && invoiceTypes.includes(type) && invoice_id) {
      navigationRef.navigate('InvoiceDetail', { invoiceId: invoice_id });
    } else if (type && bidTypes.includes(type)) {
      if (listing_id) {
        navigationRef.navigate('ListingDetail', { listingId: listing_id });
      } else {
        navigationRef.navigate('MyBids');
      }
    } else if (type && messageTypes.includes(type) && conversation_id) {
      navigationRef.navigate('Conversation', { conversationId: conversation_id });
    } else if (invoice_id) {
      navigationRef.navigate('InvoiceDetail', { invoiceId: invoice_id });
    } else if (offer_id) {
      navigationRef.navigate('MyOffers');
    } else if (listing_id) {
      navigationRef.navigate('ListingDetail', { listingId: listing_id });
    } else {
      // Default: go to notifications screen
      navigationRef.navigate('Notifications');
    }

    // Invalidate notifications to refresh the list
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const clearNotifications = useCallback(async () => {
    await clearAllNotifications();
    setUnreadCount(0);
  }, []);

  // Update badge count when unread count changes
  useEffect(() => {
    setBadgeCount(unreadCount);
  }, [unreadCount]);

  const value: NotificationContextType = {
    expoPushToken,
    notification,
    error,
    unreadCount,
    setUnreadCount,
    clearNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
