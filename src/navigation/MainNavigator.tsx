import React, { useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import { Text, View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { colors, fontSize, fontWeight, spacing, borderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  MainTabParamList,
  HomeStackParamList,
  WatchlistStackParamList,
  DashboardStackParamList,
  MessagesStackParamList,
  ProfileStackParamList,
} from './types';

// Screens
import HomeScreen from '../screens/home/HomeScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import DashboardScreen from '../screens/activity/DashboardScreen';
import MessagesListScreen from '../screens/messages/MessagesListScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import ListingDetailScreen from '../screens/listing/ListingDetailScreen';
import PlaceBidScreen from '../screens/listing/PlaceBidScreen';
import MakeOfferScreen from '../screens/listing/MakeOfferScreen';
import ConversationScreen from '../screens/messages/ConversationScreen';
import MyBidsScreen from '../screens/activity/MyBidsScreen';
import MyOffersScreen from '../screens/activity/MyOffersScreen';
import MyInvoicesScreen from '../screens/activity/MyInvoicesScreen';
import MyListingsScreen from '../screens/seller/MyListingsScreen';
import MySalesScreen from '../screens/seller/MySalesScreen';
import EditListingScreen from '../screens/seller/EditListingScreen';
import InvoiceDetailScreen from '../screens/activity/InvoiceDetailScreen';
import NotificationsScreen from '../screens/notifications/NotificationsScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import AddressesScreen from '../screens/profile/AddressesScreen';
import AddAddressScreen from '../screens/profile/AddAddressScreen';
import EditAddressScreen from '../screens/profile/EditAddressScreen';
import PaymentMethodsScreen from '../screens/profile/PaymentMethodsScreen';
import NotificationSettingsScreen from '../screens/profile/NotificationSettingsScreen';
import AdminPanelScreen from '../screens/admin/AdminPanelScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminListingsScreen from '../screens/admin/AdminListingsScreen';
import AdminSalesScreen from '../screens/admin/AdminSalesScreen';
import AdminOffersScreen from '../screens/admin/AdminOffersScreen';
import AdminAnalyticsScreen from '../screens/admin/AdminAnalyticsScreen';
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import SellerDashboardScreen from '../screens/seller/SellerDashboardScreen';
import WireInstructionsScreen from '../screens/profile/WireInstructionsScreen';
import PhoneVerificationScreen from '../screens/profile/PhoneVerificationScreen';
import SellerSettingsScreen from '../screens/profile/SellerSettingsScreen';
import CheckoutScreen from '../screens/checkout/CheckoutScreen';
import CreateListingScreen from '../screens/seller/CreateListingScreen';

// Create navigators
const Tab = createBottomTabNavigator<MainTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const WatchlistStack = createNativeStackNavigator<WatchlistStackParamList>();
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();
const MessagesStack = createNativeStackNavigator<MessagesStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

// Placeholder screen for not-yet-implemented screens
function PlaceholderScreen({ route }: { route: { name: string } }) {
  const { colors: themeColors } = useTheme();

  const getFeatureInfo = (name: string) => {
    switch (name) {
      case 'Search':
        return {
          icon: 'search' as const,
          title: 'Advanced Search',
          description: 'Advanced search filters coming soon. Use the search bar on the Browse tab to find equipment.',
        };
      case 'SellerProfile':
        return {
          icon: 'user' as const,
          title: 'Seller Profiles',
          description: 'View detailed seller profiles and ratings. This feature is coming soon.',
        };
      default:
        return {
          icon: 'tool' as const,
          title: name,
          description: 'This feature is coming soon.',
        };
    }
  };

  const info = getFeatureInfo(route.name);

  return (
    <View
      style={[placeholderStyles.container, { backgroundColor: themeColors.background }]}
      accessible={true}
      accessibilityRole="none"
      accessibilityLabel={`${info.title} - Coming soon`}
    >
      <View style={[placeholderStyles.iconContainer, { backgroundColor: themeColors.accentFaint }]}>
        <Feather name={info.icon} size={40} color={themeColors.accent} />
      </View>
      <Text style={[placeholderStyles.title, { color: themeColors.textPrimary }]}>{info.title}</Text>
      <Text style={[placeholderStyles.subtitle, { color: themeColors.textMuted }]}>{info.description}</Text>
    </View>
  );
}

const placeholderStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
});

// Custom header title with logo - now theme-aware
function HeaderLogo() {
  const { colors: themeColors } = useTheme();
  return (
    <View style={headerStyles.logoRow}>
      <View style={[headerStyles.logoContainer, { backgroundColor: themeColors.accent }]}>
        <Text style={headerStyles.logoText}>PMB</Text>
      </View>
      <View style={headerStyles.titleRow}>
        <Text style={[headerStyles.titlePrimary, { color: themeColors.primary }]}>PrintMail</Text>
        <Text style={[headerStyles.titleAccent, { color: themeColors.accent }]}>Bids</Text>
      </View>
    </View>
  );
}

const headerStyles = StyleSheet.create({
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoContainer: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#ffffff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titlePrimary: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  titleAccent: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
});

// Hook to get dynamic header options
function useHeaderOptions() {
  const { colors: themeColors, isDark } = useTheme();
  return {
    headerStyle: {
      backgroundColor: isDark ? themeColors.sand : '#ffffff',
    },
    headerTitleStyle: {
      fontWeight: fontWeight.semibold as '600',
      color: themeColors.textPrimary,
      fontSize: fontSize.lg,
    },
    headerShadowVisible: false,
    headerTintColor: themeColors.textPrimary,
  };
}

// Home Stack
function HomeStackNavigator() {
  const headerOptions = useHeaderOptions();
  return (
    <HomeStack.Navigator screenOptions={headerOptions}>
      <HomeStack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerTitle: () => <HeaderLogo /> }}
      />
      <HomeStack.Screen name="Search" component={PlaceholderScreen} options={{ title: 'Search' }} />
      <HomeStack.Screen name="ListingDetail" component={ListingDetailScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="PlaceBid" component={PlaceBidScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <HomeStack.Screen name="MakeOffer" component={MakeOfferScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <HomeStack.Screen name="SellerProfile" component={PlaceholderScreen} options={{ title: 'Seller' }} />
    </HomeStack.Navigator>
  );
}

// Watchlist Stack
function WatchlistStackNavigator() {
  const headerOptions = useHeaderOptions();
  return (
    <WatchlistStack.Navigator screenOptions={headerOptions}>
      <WatchlistStack.Screen
        name="Watchlist"
        component={WatchlistScreen}
        options={{ title: 'Watchlist' }}
      />
      <WatchlistStack.Screen name="ListingDetail" component={ListingDetailScreen} options={{ headerShown: false }} />
      <WatchlistStack.Screen name="PlaceBid" component={PlaceBidScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <WatchlistStack.Screen name="MakeOffer" component={MakeOfferScreen} options={{ headerShown: false, presentation: 'modal' }} />
    </WatchlistStack.Navigator>
  );
}

// Dashboard Stack
function DashboardStackNavigator() {
  const headerOptions = useHeaderOptions();
  return (
    <DashboardStack.Navigator screenOptions={headerOptions}>
      <DashboardStack.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: 'Dashboard' }}
      />
      <DashboardStack.Screen name="MyBids" component={MyBidsScreen} options={{ title: 'My Bids' }} />
      <DashboardStack.Screen name="MyOffers" component={MyOffersScreen} options={{ title: 'My Offers' }} />
      <DashboardStack.Screen name="MyInvoices" component={MyInvoicesScreen} options={{ title: 'Purchases' }} />
      <DashboardStack.Screen name="MySales" component={MySalesScreen} options={{ title: 'My Sales' }} />
      <DashboardStack.Screen name="MyListings" component={MyListingsScreen} options={{ title: 'My Listings' }} />
      <DashboardStack.Screen name="SellerOffers" component={MyOffersScreen} options={{ title: 'Offers Received' }} />
      <DashboardStack.Screen name="InvoiceDetail" component={InvoiceDetailScreen} options={{ title: 'Invoice Details' }} />
      <DashboardStack.Screen name="ListingDetail" component={ListingDetailScreen} options={{ headerShown: false }} />
      <DashboardStack.Screen name="PlaceBid" component={PlaceBidScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <DashboardStack.Screen name="MakeOffer" component={MakeOfferScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <DashboardStack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout', presentation: 'modal' }} />
      <DashboardStack.Screen name="CreateListing" component={CreateListingScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <DashboardStack.Screen name="EditListing" component={EditListingScreen} options={{ title: 'Edit Listing' }} />
    </DashboardStack.Navigator>
  );
}

// Messages Stack
function MessagesStackNavigator() {
  const headerOptions = useHeaderOptions();
  return (
    <MessagesStack.Navigator screenOptions={headerOptions}>
      <MessagesStack.Screen
        name="MessagesList"
        component={MessagesListScreen}
        options={{ title: 'Messages' }}
      />
      <MessagesStack.Screen name="Conversation" component={ConversationScreen} options={{ title: 'Chat' }} />
    </MessagesStack.Navigator>
  );
}

// Profile Stack
function ProfileStackNavigator() {
  const headerOptions = useHeaderOptions();
  return (
    <ProfileStack.Navigator screenOptions={headerOptions}>
      <ProfileStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
      <ProfileStack.Screen name="PhoneVerification" component={PhoneVerificationScreen} options={{ title: 'Verify Phone' }} />
      <ProfileStack.Screen name="SellerSettings" component={SellerSettingsScreen} options={{ title: 'Seller Settings' }} />
      <ProfileStack.Screen name="Addresses" component={AddressesScreen} options={{ title: 'Addresses' }} />
      <ProfileStack.Screen name="AddAddress" component={AddAddressScreen} options={{ title: 'Add Address' }} />
      <ProfileStack.Screen name="EditAddress" component={EditAddressScreen} options={{ title: 'Edit Address' }} />
      <ProfileStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
      <ProfileStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ title: 'Notification Settings' }} />
      <ProfileStack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ title: 'Payment Methods' }} />
      <ProfileStack.Screen name="WireInstructions" component={WireInstructionsScreen} options={{ title: 'Wire Instructions' }} />
      <ProfileStack.Screen name="SellerDashboard" component={SellerDashboardScreen} options={{ title: 'Seller Analytics' }} />
      <ProfileStack.Screen name="MyListings" component={MyListingsScreen} options={{ title: 'My Listings' }} />
      <ProfileStack.Screen name="MySales" component={MySalesScreen} options={{ title: 'My Sales' }} />
      <ProfileStack.Screen name="SellerOffers" component={MyOffersScreen} options={{ title: 'Offers Received' }} />
      <ProfileStack.Screen name="CreateListing" component={CreateListingScreen} options={{ headerShown: false, presentation: 'modal' }} />
      <ProfileStack.Screen name="EditListing" component={EditListingScreen} options={{ title: 'Edit Listing' }} />
      <ProfileStack.Screen name="ListingDetail" component={ListingDetailScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <ProfileStack.Screen name="AdminPanel" component={AdminPanelScreen} options={{ title: 'Admin Panel' }} />
      <ProfileStack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ title: 'Manage Users' }} />
      <ProfileStack.Screen name="AdminListings" component={AdminListingsScreen} options={{ title: 'Manage Listings' }} />
      <ProfileStack.Screen name="AdminSales" component={AdminSalesScreen} options={{ title: 'Sales & Invoices' }} />
      <ProfileStack.Screen name="AdminOffers" component={AdminOffersScreen} options={{ title: 'Offers' }} />
      <ProfileStack.Screen name="AdminAnalytics" component={AdminAnalyticsScreen} options={{ title: 'Analytics' }} />
      <ProfileStack.Screen name="AdminSettings" component={AdminSettingsScreen} options={{ title: 'Platform Settings' }} />
    </ProfileStack.Navigator>
  );
}

// Tab icon component
type TabIconProps = {
  name: keyof typeof Feather.glyphMap;
  focused: boolean;
  activeColor: string;
  inactiveColor: string;
};

function TabIcon({ name, focused, activeColor, inactiveColor }: TabIconProps) {
  return (
    <Feather
      name={name}
      size={22}
      color={focused ? activeColor : inactiveColor}
    />
  );
}

export default function MainNavigator() {
  const { colors: themeColors, isDark } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Real-time subscription for new messages to update badge
  useEffect(() => {
    if (!user) return;

    const channel = supabase.channel('messages-badge')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          // Only refresh if the message is not from us
          if (payload.new && payload.new.sender_id !== user.id) {
            queryClient.invalidateQueries({ queryKey: ['unreadMessages', user.id] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  // Query for unread message count
  const { data: unreadCount } = useQuery({
    queryKey: ['unreadMessages', user?.id],
    queryFn: async () => {
      if (!user) return 0;

      try {
        // Get conversations where user is a participant
        const { data: conversations, error: convError } = await supabase
          .from('conversations')
          .select('id')
          .or(`participant_1_id.eq.${user.id},participant_2_id.eq.${user.id}`);

        if (convError || !conversations || conversations.length === 0) {
          return 0;
        }

        const conversationIds = conversations.map(c => c.id);

        // Count all unread messages in user's conversations that weren't sent by them
        const { count, error: msgError } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .in('conversation_id', conversationIds)
          .neq('sender_id', user.id)
          .eq('is_read', false);

        if (msgError) {
          console.log('[UnreadMessages] Error:', msgError);
          return 0;
        }

        return count || 0;
      } catch (err) {
        console.log('[UnreadMessages] Exception:', err);
        return 0;
      }
    },
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  return (
    <Tab.Navigator
      initialRouteName="DashboardTab"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: themeColors.accent,
        tabBarInactiveTintColor: themeColors.textMuted,
        tabBarStyle: {
          backgroundColor: isDark ? themeColors.sand : '#ffffff',
          borderTopColor: themeColors.border,
          borderTopWidth: 1,
          height: 85,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tab.Screen
        name="DashboardTab"
        component={DashboardStackNavigator}
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} activeColor={themeColors.accent} inactiveColor={themeColors.textMuted} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: 'DashboardTab', state: { routes: [{ name: 'Dashboard' }] } }],
              })
            );
          },
        })}
      />
      <Tab.Screen
        name="HomeTab"
        component={HomeStackNavigator}
        options={{
          title: 'Browse',
          tabBarIcon: ({ focused }) => <TabIcon name="search" focused={focused} activeColor={themeColors.accent} inactiveColor={themeColors.textMuted} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.dispatch(
              CommonActions.reset({
                index: 1,
                routes: [
                  { name: 'DashboardTab' },
                  { name: 'HomeTab', state: { routes: [{ name: 'Home' }] } },
                ],
              })
            );
          },
        })}
      />
      <Tab.Screen
        name="WatchlistTab"
        component={WatchlistStackNavigator}
        options={{
          title: 'Watchlist',
          tabBarIcon: ({ focused }) => <TabIcon name="eye" focused={focused} activeColor={themeColors.accent} inactiveColor={themeColors.textMuted} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.dispatch(
              CommonActions.reset({
                index: 2,
                routes: [
                  { name: 'DashboardTab' },
                  { name: 'HomeTab' },
                  { name: 'WatchlistTab', state: { routes: [{ name: 'Watchlist' }] } },
                ],
              })
            );
          },
        })}
      />
      <Tab.Screen
        name="MessagesTab"
        component={MessagesStackNavigator}
        options={{
          title: 'Messages',
          tabBarIcon: ({ focused }) => <TabIcon name="message-circle" focused={focused} activeColor={themeColors.accent} inactiveColor={themeColors.textMuted} />,
          tabBarBadge: unreadCount && unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: themeColors.error, fontSize: 10 },
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.dispatch(
              CommonActions.reset({
                index: 3,
                routes: [
                  { name: 'DashboardTab' },
                  { name: 'HomeTab' },
                  { name: 'WatchlistTab' },
                  { name: 'MessagesTab', state: { routes: [{ name: 'MessagesList' }] } },
                ],
              })
            );
          },
        })}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon name="user" focused={focused} activeColor={themeColors.accent} inactiveColor={themeColors.textMuted} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.dispatch(
              CommonActions.reset({
                index: 4,
                routes: [
                  { name: 'DashboardTab' },
                  { name: 'HomeTab' },
                  { name: 'WatchlistTab' },
                  { name: 'MessagesTab' },
                  { name: 'ProfileTab', state: { routes: [{ name: 'Profile' }] } },
                ],
              })
            );
          },
        })}
      />
    </Tab.Navigator>
  );
}
