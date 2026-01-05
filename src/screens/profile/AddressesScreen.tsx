import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ProfileStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { UserAddress } from '../../types/database';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap } from '../../utils/haptics';

export default function AddressesScreen() {
  const navigation = useNavigation<NavigationProp<ProfileStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const { data: addresses, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['addresses', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as UserAddress[];
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (addressId: string) => {
      const { error } = await supabase
        .from('user_addresses')
        .delete()
        .eq('id', addressId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (addressId: string) => {
      if (!user) return;

      // First, unset all defaults
      await supabase
        .from('user_addresses')
        .update({ is_default: false })
        .eq('user_id', user.id);

      // Then set the new default
      const { error } = await supabase
        .from('user_addresses')
        .update({ is_default: true })
        .eq('id', addressId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });

  const handleDelete = (address: UserAddress) => {
    mediumTap();
    Alert.alert(
      'Delete Address',
      `Are you sure you want to delete "${address.label || 'this address'}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(address.id),
        },
      ]
    );
  };

  const handleSetDefault = (addressId: string) => {
    mediumTap();
    setDefaultMutation.mutate(addressId);
  };

  const renderAddress = ({ item }: { item: UserAddress }) => (
    <TouchableOpacity
      style={[styles.addressCard, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}
      onPress={() => navigation.navigate('EditAddress', { addressId: item.id })}
    >
      <View style={styles.addressHeader}>
        <View style={styles.addressTitleRow}>
          <Text style={[styles.addressLabel, { color: colors.textPrimary }]}>
            {item.label || 'Address'}
          </Text>
          {item.is_default && (
            <View style={[styles.defaultBadge, { backgroundColor: colors.accentFaint }]}>
              <Text style={[styles.defaultBadgeText, { color: colors.accent }]}>Default</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => {
            Alert.alert(
              item.label || 'Address',
              'What would you like to do?',
              [
                { text: 'Cancel', style: 'cancel' },
                !item.is_default && {
                  text: 'Set as Default',
                  onPress: () => handleSetDefault(item.id),
                },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => handleDelete(item),
                },
              ].filter(Boolean) as any
            );
          }}
        >
          <Feather name="more-vertical" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <Text style={[styles.addressLine, { color: colors.textSecondary }]}>
        {item.address_line1}
      </Text>
      {item.address_line2 && (
        <Text style={[styles.addressLine, { color: colors.textSecondary }]}>
          {item.address_line2}
        </Text>
      )}
      <Text style={[styles.addressLine, { color: colors.textSecondary }]}>
        {item.city}, {item.state} {item.zip}
      </Text>
      <Text style={[styles.addressLine, { color: colors.textMuted }]}>
        {item.country}
      </Text>

      {/* Equipment Handling Capabilities */}
      {(item.has_loading_dock || item.has_forklift || item.has_overhead_crane || item.ground_level_access) && (
        <View style={styles.capabilitiesRow}>
          {item.has_loading_dock && (
            <View style={[styles.capabilityBadge, { backgroundColor: colors.successLight }]}>
              <Feather name="package" size={10} color={colors.success} />
              <Text style={[styles.capabilityText, { color: colors.success }]}>Dock</Text>
            </View>
          )}
          {item.has_forklift && (
            <View style={[styles.capabilityBadge, { backgroundColor: colors.successLight }]}>
              <Feather name="truck" size={10} color={colors.success} />
              <Text style={[styles.capabilityText, { color: colors.success }]}>
                Forklift{item.forklift_capacity_lbs ? ` ${(item.forklift_capacity_lbs / 1000).toFixed(0)}k lbs` : ''}
              </Text>
            </View>
          )}
          {item.has_overhead_crane && (
            <View style={[styles.capabilityBadge, { backgroundColor: colors.successLight }]}>
              <Feather name="anchor" size={10} color={colors.success} />
              <Text style={[styles.capabilityText, { color: colors.success }]}>
                Crane{item.crane_capacity_lbs ? ` ${(item.crane_capacity_lbs / 1000).toFixed(0)}k lbs` : ''}
              </Text>
            </View>
          )}
          {item.ground_level_access && (
            <View style={[styles.capabilityBadge, { backgroundColor: colors.successLight }]}>
              <Feather name="log-in" size={10} color={colors.success} />
              <Text style={[styles.capabilityText, { color: colors.success }]}>Ground Access</Text>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={addresses}
        renderItem={renderAddress}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + spacing['3xl'] },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={colors.accent}
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Feather name="map-pin" size={48} color={colors.textLight} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No Addresses</Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Add an address for shipping and equipment pickup
            </Text>
          </View>
        }
        ListFooterComponent={
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.accent }]}
            onPress={() => navigation.navigate('AddAddress')}
          >
            <Feather name="plus" size={20} color="#ffffff" />
            <Text style={styles.addButtonText}>Add New Address</Text>
          </TouchableOpacity>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  addressCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  addressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  addressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  addressLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  defaultBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  defaultBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  menuButton: {
    padding: spacing.xs,
    marginRight: -spacing.xs,
    marginTop: -spacing.xs,
  },
  addressLine: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  capabilitiesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  capabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  capabilityText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['5xl'],
    paddingHorizontal: spacing['3xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
