import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { mediumTap } from '../../utils/haptics';

type MenuItem = {
  label: string;
  screen: string;
  icon: keyof typeof Feather.glyphMap;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const { colors: themeColors, isDark } = useTheme();

  const handleSignOut = () => {
    mediumTap();
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: signOut },
      ]
    );
  };

  const menuSections: MenuSection[] = [
    {
      title: 'Account',
      items: [
        { label: 'Edit Profile', screen: 'EditProfile', icon: 'user' },
        { label: 'Addresses', screen: 'Addresses', icon: 'map-pin' },
        { label: 'Payment Methods', screen: 'PaymentMethods', icon: 'credit-card' },
      ],
    },
    {
      title: 'Notifications',
      items: [
        { label: 'Notification Center', screen: 'Notifications', icon: 'bell' },
        { label: 'Notification Settings', screen: 'NotificationSettings', icon: 'settings' },
      ],
    },
    ...(profile?.is_seller ? [{
      title: 'Seller',
      items: [
        { label: 'Seller Analytics', screen: 'SellerDashboard', icon: 'bar-chart-2' as const },
        { label: 'My Listings', screen: 'MyListings', icon: 'package' as const },
        { label: 'Create Listing', screen: 'CreateListing', icon: 'plus-circle' as const },
      ],
    }] : [] as MenuSection[]),
    ...(profile?.is_admin ? [{
      title: 'Admin',
      items: [
        { label: 'Admin Panel', screen: 'AdminPanel', icon: 'shield' as const },
      ],
    }] : [] as MenuSection[]),
    {
      title: 'App',
      items: [
        { label: 'Settings', screen: 'Settings', icon: 'sliders' },
      ],
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
    >
      {/* Profile Header */}
      <View style={[styles.header, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
        <View style={styles.avatarContainer}>
          <Image
            source={profile?.avatar_url ? { uri: profile.avatar_url } : require('../../../assets/avatar-placeholder.png')}
            style={styles.avatar}
            contentFit="cover"
            placeholder={require('../../../assets/avatar-placeholder.png')}
          />
          <TouchableOpacity style={[styles.editAvatarButton, { backgroundColor: themeColors.accent }]}>
            <Feather name="camera" size={14} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <Text style={[styles.name, { color: themeColors.textPrimary }]}>
          {profile?.full_name || 'User'}
        </Text>
        {profile?.company_name && (
          <Text style={[styles.company, { color: themeColors.textSecondary }]}>{profile.company_name}</Text>
        )}
        <Text style={[styles.email, { color: themeColors.textMuted }]}>{user?.email}</Text>

        <View style={styles.badges}>
          {profile?.is_verified && (
            <View style={[styles.badge, styles.verifiedBadge, { backgroundColor: themeColors.successLight }]}>
              <Feather name="check-circle" size={12} color={themeColors.success} />
              <Text style={[styles.badgeText, styles.verifiedBadgeText, { color: themeColors.success }]}>Verified</Text>
            </View>
          )}
          {profile?.is_seller && (
            <View style={[styles.badge, styles.sellerBadge, { backgroundColor: themeColors.accentFaint }]}>
              <Feather name="package" size={12} color={themeColors.accent} />
              <Text style={[styles.badgeText, styles.sellerBadgeText, { color: themeColors.accent }]}>Seller</Text>
            </View>
          )}
        </View>

        {(profile?.seller_rating || 0) > 0 && (
          <View style={styles.ratingContainer}>
            <Feather name="star" size={16} color={themeColors.warning} />
            <Text style={[styles.rating, { color: themeColors.textPrimary }]}>{profile?.seller_rating?.toFixed(1)}</Text>
            <Text style={[styles.reviewCount, { color: themeColors.textMuted }]}>
              ({profile?.seller_review_count} reviews)
            </Text>
          </View>
        )}
      </View>

      {/* Menu Sections */}
      {menuSections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>{section.title}</Text>
          <View style={[styles.menuCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
            {section.items.map((item, index) => (
              <TouchableOpacity
                key={item.screen}
                style={[
                  styles.menuItem,
                  index < section.items.length - 1 && [styles.menuItemBorder, { borderBottomColor: themeColors.borderLight }],
                ]}
                onPress={() => navigation.navigate(item.screen as never)}
              >
                <View style={styles.menuItemLeft}>
                  <View style={[styles.menuIconContainer, { backgroundColor: themeColors.accentFaint }]}>
                    <Feather name={item.icon} size={18} color={themeColors.accent} />
                  </View>
                  <Text style={[styles.menuItemText, { color: themeColors.textPrimary }]}>{item.label}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={themeColors.textLight} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      {/* Sign Out Button */}
      <TouchableOpacity style={[styles.signOutButton, { backgroundColor: themeColors.errorLight, borderColor: themeColors.error }]} onPress={handleSignOut}>
        <Feather name="log-out" size={18} color={themeColors.error} />
        <Text style={[styles.signOutText, { color: themeColors.error }]}>Sign Out</Text>
      </TouchableOpacity>

      {/* Version */}
      <Text style={[styles.version, { color: themeColors.textMuted }]}>PrintMailBids v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.white,
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.sand,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  company: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  email: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  verifiedBadge: {
    backgroundColor: colors.successLight,
  },
  sellerBadge: {
    backgroundColor: colors.accentFaint,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  verifiedBadgeText: {
    color: colors.success,
  },
  sellerBadgeText: {
    color: colors.accent,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.lg,
  },
  rating: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.warning,
  },
  reviewCount: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
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
    marginBottom: spacing.sm,
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
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuIconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    backgroundColor: colors.accentFaint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuItemText: {
    fontSize: fontSize.base,
    color: colors.textPrimary,
    fontWeight: fontWeight.medium,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing['2xl'],
    marginHorizontal: spacing.lg,
    backgroundColor: colors.white,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.error,
    ...shadows.sm,
  },
  signOutText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.error,
  },
  version: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.xl,
  },
});
