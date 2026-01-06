import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatRelativeTime } from '../../utils/formatters';
import { lightTap, successFeedback, errorFeedback } from '../../utils/haptics';

interface User {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  is_seller: boolean;
  is_admin: boolean;
  is_verified: boolean;
  created_at: string;
  status: 'active' | 'suspended' | 'pending';
}

type FilterType = 'all' | 'sellers' | 'admins' | 'suspended';

export default function AdminUsersScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');

  const { data: users, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['adminUsers', filter],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (filter === 'sellers') {
        query = query.eq('is_seller', true);
      } else if (filter === 'admins') {
        query = query.eq('is_admin', true);
      } else if (filter === 'suspended') {
        query = query.eq('status', 'suspended');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as User[];
    },
    enabled: !!profile?.is_admin,
  });

  const toggleSellerMutation = useMutation({
    mutationFn: async ({ userId, isSeller }: { userId: string; isSeller: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_seller: !isSeller })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to update user');
    },
  });

  const toggleSuspendMutation = useMutation({
    mutationFn: async ({ userId, status }: { userId: string; status: string }) => {
      const newStatus = status === 'suspended' ? 'active' : 'suspended';
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to update user status');
    },
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_admin: !isAdmin })
        .eq('id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to update admin status');
    },
  });

  const handleUserAction = (user: User, action: 'seller' | 'suspend' | 'admin') => {
    lightTap();

    if (action === 'seller') {
      Alert.alert(
        user.is_seller ? 'Remove Seller Status' : 'Make Seller',
        `Are you sure you want to ${user.is_seller ? 'remove seller status from' : 'make'} ${user.full_name || user.email} ${user.is_seller ? '' : 'a seller'}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', onPress: () => toggleSellerMutation.mutate({ userId: user.id, isSeller: user.is_seller }) },
        ]
      );
    } else if (action === 'suspend') {
      Alert.alert(
        user.status === 'suspended' ? 'Reactivate User' : 'Suspend User',
        `Are you sure you want to ${user.status === 'suspended' ? 'reactivate' : 'suspend'} ${user.full_name || user.email}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', style: user.status === 'suspended' ? 'default' : 'destructive', onPress: () => toggleSuspendMutation.mutate({ userId: user.id, status: user.status }) },
        ]
      );
    } else if (action === 'admin') {
      Alert.alert(
        user.is_admin ? 'Remove Admin' : 'Make Admin',
        `Are you sure you want to ${user.is_admin ? 'remove admin privileges from' : 'give admin privileges to'} ${user.full_name || user.email}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Confirm', style: 'destructive', onPress: () => toggleAdminMutation.mutate({ userId: user.id, isAdmin: user.is_admin }) },
        ]
      );
    }
  };

  const filteredUsers = users?.filter(user => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      user.email?.toLowerCase().includes(query) ||
      user.full_name?.toLowerCase().includes(query) ||
      user.company_name?.toLowerCase().includes(query)
    );
  });

  const FilterButton = ({ type, label }: { type: FilterType; label: string }) => (
    <TouchableOpacity
      style={[
        styles.filterButton,
        { backgroundColor: themeColors.surface },
        filter === type && { backgroundColor: themeColors.accent }
      ]}
      onPress={() => {
        lightTap();
        setFilter(type);
      }}
    >
      <Text style={[
        styles.filterButtonText,
        { color: themeColors.textSecondary },
        filter === type && { color: colors.white }
      ]}>
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderUser = ({ item }: { item: User }) => (
    <View style={[styles.userCard, { backgroundColor: themeColors.surface }]}>
      <View style={styles.userHeader}>
        <Image
          source={item.avatar_url ? { uri: item.avatar_url } : require('../../../assets/avatar-placeholder.png')}
          style={styles.avatar}
          contentFit="cover"
        />
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: themeColors.textPrimary }]} numberOfLines={1}>
            {item.full_name || item.company_name || 'No name'}
          </Text>
          <Text style={[styles.userEmail, { color: themeColors.textMuted }]} numberOfLines={1}>{item.email}</Text>
          <View style={styles.badgeRow}>
            {item.is_admin && (
              <View style={[styles.badge, styles.adminBadge]}>
                <Feather name="shield" size={10} color={colors.white} />
                <Text style={styles.badgeText}>Admin</Text>
              </View>
            )}
            {item.is_seller && (
              <View style={[styles.badge, styles.sellerBadge]}>
                <Text style={styles.badgeText}>Seller</Text>
              </View>
            )}
            {item.is_verified && (
              <View style={[styles.badge, styles.verifiedBadge]}>
                <Feather name="check" size={10} color={colors.white} />
                <Text style={styles.badgeText}>Verified</Text>
              </View>
            )}
            {item.status === 'suspended' && (
              <View style={[styles.badge, styles.suspendedBadge]}>
                <Text style={styles.badgeText}>Suspended</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <Text style={[styles.joinedText, { color: themeColors.textMuted }]}>
        Joined {formatRelativeTime(item.created_at)}
      </Text>

      <View style={[styles.actionRow, { borderTopColor: themeColors.border }]}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            { borderColor: themeColors.border },
            item.is_seller && { backgroundColor: themeColors.accent, borderColor: themeColors.accent }
          ]}
          onPress={() => handleUserAction(item, 'seller')}
        >
          <Feather name="package" size={16} color={item.is_seller ? colors.white : themeColors.accent} />
          <Text style={[
            styles.actionButtonText,
            { color: themeColors.textSecondary },
            item.is_seller && { color: colors.white }
          ]}>
            {item.is_seller ? 'Is Seller' : 'Make Seller'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            { borderColor: themeColors.border },
            item.status === 'suspended' && styles.actionButtonDanger
          ]}
          onPress={() => handleUserAction(item, 'suspend')}
        >
          <Feather
            name={item.status === 'suspended' ? 'user-check' : 'user-x'}
            size={16}
            color={item.status === 'suspended' ? colors.white : colors.error}
          />
          <Text style={[styles.actionButtonText, item.status === 'suspended' ? styles.actionButtonTextActive : styles.actionButtonTextDanger]}>
            {item.status === 'suspended' ? 'Activate' : 'Suspend'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            { borderColor: themeColors.border },
            item.is_admin && styles.actionButtonWarning
          ]}
          onPress={() => handleUserAction(item, 'admin')}
        >
          <Feather name="shield" size={16} color={item.is_admin ? colors.white : colors.warning} />
          <Text style={[styles.actionButtonText, item.is_admin ? styles.actionButtonTextActive : styles.actionButtonTextWarning]}>
            {item.is_admin ? 'Admin' : 'Make Admin'}
          </Text>
        </TouchableOpacity>
      </View>
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
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <View style={[styles.searchInputContainer, { backgroundColor: themeColors.inputBackground }]}>
          <Feather name="search" size={20} color={themeColors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: themeColors.textPrimary }]}
            placeholder="Search users..."
            placeholderTextColor={themeColors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Feather name="x" size={20} color={themeColors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filters */}
      <View style={[styles.filterRow, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
        <FilterButton type="all" label="All" />
        <FilterButton type="sellers" label="Sellers" />
        <FilterButton type="admins" label="Admins" />
        <FilterButton type="suspended" label="Suspended" />
      </View>

      {/* User List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={themeColors.accent} />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={themeColors.accent} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="users" size={48} color={themeColors.textMuted} />
              <Text style={[styles.emptyTitle, { color: themeColors.textPrimary }]}>No Users Found</Text>
              <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
                {searchQuery ? 'Try a different search term' : 'No users match the current filter'}
              </Text>
            </View>
          }
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
  searchContainer: {
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.sand,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.sand,
  },
  filterButtonActive: {
    backgroundColor: colors.accent,
  },
  filterButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  userCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.sand,
    marginRight: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  userEmail: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  adminBadge: {
    backgroundColor: colors.error,
  },
  sellerBadge: {
    backgroundColor: colors.accent,
  },
  verifiedBadge: {
    backgroundColor: colors.success,
  },
  suspendedBadge: {
    backgroundColor: colors.textMuted,
  },
  badgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.white,
  },
  joinedText: {
    fontSize: fontSize.xs,
    color: colors.textLight,
    marginTop: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  actionButtonDanger: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  actionButtonWarning: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  actionButtonText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
  },
  actionButtonTextActive: {
    color: colors.white,
  },
  actionButtonTextDanger: {
    color: colors.error,
  },
  actionButtonTextWarning: {
    color: colors.warning,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginTop: spacing.lg,
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
