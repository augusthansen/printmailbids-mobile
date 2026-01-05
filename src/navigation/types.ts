import { NavigatorScreenParams } from '@react-navigation/native';

// Auth Stack
export type AuthStackParamList = {
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
};

// Main Tab Navigator
export type MainTabParamList = {
  DashboardTab: NavigatorScreenParams<DashboardStackParamList>;
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  WatchlistTab: NavigatorScreenParams<WatchlistStackParamList>;
  MessagesTab: NavigatorScreenParams<MessagesStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

// Home Stack
export type HomeStackParamList = {
  Home: undefined;
  Search: { query?: string; categoryId?: string };
  ListingDetail: { listingId: string };
  PlaceBid: { listingId: string };
  MakeOffer: { listingId: string };
  SellerProfile: { sellerId: string };
};

// Watchlist Stack
export type WatchlistStackParamList = {
  Watchlist: undefined;
  ListingDetail: { listingId: string };
};

// Dashboard Stack
export type DashboardStackParamList = {
  Dashboard: undefined;
  MyBids: undefined;
  MyOffers: undefined;
  MyInvoices: undefined;
  MySales: undefined;
  MyListings: undefined;
  SellerOffers: undefined;
  InvoiceDetail: { invoiceId: string };
  ListingDetail: { listingId: string };
  Checkout: { invoiceId: string };
  CreateListing: undefined;
  EditListing: { listingId: string };
};

// Messages Stack
export type MessagesStackParamList = {
  MessagesList: undefined;
  Conversation: { conversationId: string; otherUserId?: string; listingId?: string };
};

// Profile Stack
export type ProfileStackParamList = {
  Profile: undefined;
  EditProfile: undefined;
  Addresses: undefined;
  AddAddress: undefined;
  EditAddress: { addressId: string };
  Notifications: undefined;
  NotificationSettings: undefined;
  PaymentMethods: undefined;
  SellerDashboard: undefined;
  MyListings: undefined;
  MySales: undefined;
  SellerOffers: undefined;
  CreateListing: undefined;
  EditListing: { listingId: string };
  ListingDetail: { listingId: string };
  Settings: undefined;
  // Admin screens
  AdminPanel: undefined;
  AdminUsers: undefined;
  AdminListings: undefined;
  AdminSales: undefined;
  AdminOffers: undefined;
  AdminAnalytics: undefined;
  AdminSettings: undefined;
};

// Root Navigator
export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

// Declare global types for navigation
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
