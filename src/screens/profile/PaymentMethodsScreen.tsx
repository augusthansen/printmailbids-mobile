import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap, lightTap } from '../../utils/haptics';

type PaymentMethodType = 'card' | 'bank';

interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  last4: string;
  brand?: string;
  bankName?: string;
  isDefault: boolean;
  expiryMonth?: number;
  expiryYear?: number;
}

// Mock data for demonstration - in real app, this would come from Stripe
const mockPaymentMethods: PaymentMethod[] = [];

export default function PaymentMethodsScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { colors, isDark } = useTheme();

  const [isLoading, setIsLoading] = useState(false);
  const [paymentMethods] = useState<PaymentMethod[]>(mockPaymentMethods);

  const handleAddCard = async () => {
    lightTap();
    // In a real implementation, this would open Stripe's payment sheet
    Alert.alert(
      'Add Payment Method',
      'This will integrate with Stripe to securely add a new payment method.',
      [{ text: 'OK' }]
    );
  };

  const handleSetDefault = async (methodId: string) => {
    mediumTap();
    // In a real implementation, this would update the default payment method in Stripe
    Alert.alert('Set as Default', 'This payment method has been set as your default.');
  };

  const handleRemove = (method: PaymentMethod) => {
    mediumTap();
    Alert.alert(
      'Remove Payment Method',
      `Are you sure you want to remove the ${method.type === 'card' ? 'card' : 'bank account'} ending in ${method.last4}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            // In a real implementation, this would remove the payment method from Stripe
          },
        },
      ]
    );
  };

  const getCardIcon = (brand?: string): keyof typeof Feather.glyphMap => {
    // In a real app, you'd use brand-specific icons
    return 'credit-card';
  };

  const renderPaymentMethod = (method: PaymentMethod) => (
    <View
      key={method.id}
      style={[styles.methodCard, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}
    >
      <View style={styles.methodHeader}>
        <View style={styles.methodInfo}>
          <View style={[styles.methodIcon, { backgroundColor: colors.accentFaint }]}>
            <Feather
              name={method.type === 'card' ? getCardIcon(method.brand) : 'home'}
              size={20}
              color={colors.accent}
            />
          </View>
          <View>
            <View style={styles.methodTitleRow}>
              <Text style={[styles.methodTitle, { color: colors.textPrimary }]}>
                {method.type === 'card'
                  ? `${method.brand || 'Card'} •••• ${method.last4}`
                  : `${method.bankName || 'Bank'} •••• ${method.last4}`}
              </Text>
              {method.isDefault && (
                <View style={[styles.defaultBadge, { backgroundColor: colors.accentFaint }]}>
                  <Text style={[styles.defaultBadgeText, { color: colors.accent }]}>Default</Text>
                </View>
              )}
            </View>
            {method.type === 'card' && method.expiryMonth && method.expiryYear && (
              <Text style={[styles.methodSubtitle, { color: colors.textMuted }]}>
                Expires {method.expiryMonth.toString().padStart(2, '0')}/{method.expiryYear.toString().slice(-2)}
              </Text>
            )}
            {method.type === 'bank' && (
              <Text style={[styles.methodSubtitle, { color: colors.textMuted }]}>
                Checking Account
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => {
            Alert.alert(
              method.type === 'card' ? 'Card Options' : 'Bank Account Options',
              'What would you like to do?',
              [
                { text: 'Cancel', style: 'cancel' },
                !method.isDefault && {
                  text: 'Set as Default',
                  onPress: () => handleSetDefault(method.id),
                },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () => handleRemove(method),
                },
              ].filter(Boolean) as any
            );
          }}
        >
          <Feather name="more-vertical" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
    >
      {/* Stripe Connection Status */}
      {!profile?.stripe_customer_id && (
        <View style={[styles.infoCard, { backgroundColor: colors.warningLight }]}>
          <Feather name="info" size={20} color={colors.warning} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: colors.warning }]}>
              No Payment Account
            </Text>
            <Text style={[styles.infoText, { color: colors.warning }]}>
              Add a payment method to make purchases on PrintMailBids.
            </Text>
          </View>
        </View>
      )}

      {/* Payment Methods List */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Payment Methods</Text>

        {paymentMethods.length > 0 ? (
          <View style={styles.methodsList}>
            {paymentMethods.map(renderPaymentMethod)}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <Feather name="credit-card" size={40} color={colors.textLight} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              No Payment Methods
            </Text>
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              Add a credit card or bank account to start bidding and purchasing.
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.accent }]}
          onPress={handleAddCard}
        >
          <Feather name="plus" size={20} color="#ffffff" />
          <Text style={styles.addButtonText}>Add Payment Method</Text>
        </TouchableOpacity>
      </View>

      {/* Security Info */}
      <View style={styles.section}>
        <View style={[styles.securityCard, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
          <View style={[styles.securityIcon, { backgroundColor: colors.successLight }]}>
            <Feather name="shield" size={20} color={colors.success} />
          </View>
          <View style={styles.securityContent}>
            <Text style={[styles.securityTitle, { color: colors.textPrimary }]}>
              Secure Payments
            </Text>
            <Text style={[styles.securityText, { color: colors.textMuted }]}>
              Your payment information is securely stored and processed by Stripe. We never store your full card details.
            </Text>
          </View>
        </View>
      </View>

      {/* Seller Payouts Section - only for sellers */}
      {profile?.is_seller && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Seller Payouts</Text>
          {profile.stripe_account_id ? (
            <View style={[styles.payoutCard, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
              <View style={styles.payoutHeader}>
                <View style={[styles.payoutIcon, { backgroundColor: colors.successLight }]}>
                  <Feather name="check-circle" size={20} color={colors.success} />
                </View>
                <View style={styles.payoutInfo}>
                  <Text style={[styles.payoutTitle, { color: colors.textPrimary }]}>
                    Payout Account Connected
                  </Text>
                  <Text style={[styles.payoutSubtitle, { color: colors.textMuted }]}>
                    Your earnings will be deposited to your linked account
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.manageButton, { borderColor: colors.border }]}
                onPress={() => {
                  Alert.alert('Manage Payouts', 'This will open the Stripe dashboard to manage your payout settings.');
                }}
              >
                <Text style={[styles.manageButtonText, { color: colors.accent }]}>
                  Manage Payouts
                </Text>
                <Feather name="external-link" size={16} color={colors.accent} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.payoutCard, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
              <View style={styles.payoutHeader}>
                <View style={[styles.payoutIcon, { backgroundColor: colors.warningLight }]}>
                  <Feather name="alert-circle" size={20} color={colors.warning} />
                </View>
                <View style={styles.payoutInfo}>
                  <Text style={[styles.payoutTitle, { color: colors.textPrimary }]}>
                    Payout Account Not Set Up
                  </Text>
                  <Text style={[styles.payoutSubtitle, { color: colors.textMuted }]}>
                    Connect a bank account to receive payments for your sales
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.setupButton, { backgroundColor: colors.accent }]}
                onPress={() => {
                  Alert.alert('Set Up Payouts', 'This will start the Stripe Connect onboarding process.');
                }}
              >
                <Text style={styles.setupButtonText}>Set Up Payouts</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </ScrollView>
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
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  infoText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  methodsList: {
    gap: spacing.md,
  },
  methodCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  methodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  methodTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  methodSubtitle: {
    fontSize: fontSize.sm,
    marginTop: 2,
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
  emptyCard: {
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    ...shadows.sm,
  },
  emptyTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  securityCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  securityIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  securityContent: {
    flex: 1,
  },
  securityTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  securityText: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  payoutCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  payoutHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  payoutIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  payoutInfo: {
    flex: 1,
  },
  payoutTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  payoutSubtitle: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  manageButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  setupButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  setupButtonText: {
    color: '#ffffff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
});
