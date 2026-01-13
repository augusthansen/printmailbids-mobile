import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Invoice, Listing, ListingImage, Profile, PaymentMethod } from '../../types/database';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { API_URL } from '../../constants/config';
import { formatCurrency } from '../../utils/formatters';
import { lightTap, successFeedback, errorFeedback, mediumTap } from '../../utils/haptics';
import { DashboardStackParamList } from '../../navigation/types';

type RouteProps = RouteProp<DashboardStackParamList, 'Checkout'>;

interface InvoiceWithDetails extends Invoice {
  listing: Listing & {
    images: ListingImage[];
  };
  seller: Profile;
  buyer: Profile;
}

type PaymentOption = 'card' | 'ach' | 'wire';

export default function CheckoutScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProps>();
  const { invoiceId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [selectedPayment, setSelectedPayment] = useState<PaymentOption | null>(null);
  const [showWireInstructions, setShowWireInstructions] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [wireRequestSent, setWireRequestSent] = useState(false);

  const { data: invoice, isLoading } = useQuery<InvoiceWithDetails>({
    queryKey: ['invoice', invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          *,
          listing:listings(
            *,
            images:listing_images(*)
          ),
          seller:profiles!seller_id(*),
          buyer:profiles!buyer_id(*)
        `)
        .eq('id', invoiceId)
        .single();

      if (error) throw error;
      return data as InvoiceWithDetails;
    },
    enabled: !!invoiceId,
  });

  const initiateWireMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'awaiting_wire',
          payment_method: 'wire',
          wire_initiated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['myInvoices'] });
      setShowWireInstructions(true);
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to initiate wire transfer. Please try again.');
    },
  });

  const handlePaymentSelect = (method: PaymentOption) => {
    lightTap();
    setSelectedPayment(method);
  };

  const handleProceed = async () => {
    if (!selectedPayment) {
      Alert.alert('Select Payment', 'Please select a payment method.');
      return;
    }

    mediumTap();

    if (selectedPayment === 'wire') {
      // Check if seller has wire instructions
      if (!invoice?.seller?.wire_bank_name || !invoice?.seller?.wire_routing_number) {
        Alert.alert(
          'Wire Transfer Unavailable',
          'The seller has not set up wire transfer instructions. Please choose another payment method.'
        );
        return;
      }
      initiateWireMutation.mutate();
    } else if (selectedPayment === 'card') {
      // In a real implementation, this would integrate with Stripe
      Alert.alert(
        'Credit Card Payment',
        'This will integrate with Stripe to process your credit card payment securely.',
        [{ text: 'OK' }]
      );
    } else if (selectedPayment === 'ach') {
      // In a real implementation, this would integrate with Stripe/Plaid
      Alert.alert(
        'ACH Payment',
        'This will integrate with Stripe/Plaid for bank account verification and ACH transfer.',
        [{ text: 'OK' }]
      );
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    lightTap();
    await Clipboard.setStringAsync(text);
    Alert.alert('Copied', `${label} copied to clipboard.`);
  };

  const handleWireComplete = () => {
    setShowWireInstructions(false);
    navigation.goBack();
  };

  // Request wire instructions from seller via API (enables push notifications)
  const requestWireInstructionsMutation = useMutation({
    mutationFn: async () => {
      if (!invoice) throw new Error('Invoice not found');

      console.log('[Wire Request] Starting request for invoice:', invoiceId);

      // Get auth session for API call
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Call API endpoint to request wire instructions (sends push notification)
      const response = await fetch(`${API_URL}/wire/request-instructions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ invoiceId }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('[Wire Request] API error:', result.error);
        throw new Error(result.error || 'Failed to request wire instructions');
      }

      console.log('[Wire Request] Success:', result);
      return result;
    },
    onSuccess: () => {
      successFeedback();
      setWireRequestSent(true);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      Alert.alert(
        'Request Sent',
        'We\'ve notified the seller that you\'d like to pay by wire transfer. They\'ll be asked to add their wire details. You\'ll be notified when wire payment becomes available.',
        [{ text: 'OK' }]
      );
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to send request. Please try again.');
    },
  });

  const handleRequestWireInstructions = () => {
    lightTap();
    Alert.alert(
      'Request Wire Payment',
      `Would you like to request wire transfer details from ${invoice?.seller?.company_name || invoice?.seller?.full_name || 'the seller'}? They'll be notified to add their banking information.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          onPress: () => requestWireInstructionsMutation.mutate(),
        },
      ]
    );
  };

  const primaryImage = invoice?.listing?.images?.find(img => img.is_primary) || invoice?.listing?.images?.[0];

  // Check which payment methods are accepted
  const acceptsCard = invoice?.listing?.accepts_credit_card !== false;
  const acceptsACH = invoice?.listing?.accepts_ach !== false;
  const acceptsWire = invoice?.listing?.accepts_wire !== false;
  const sellerHasWireDetails = !!invoice?.seller?.wire_bank_name && !!invoice?.seller?.wire_routing_number;

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  if (!invoice) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: themeColors.background }]}>
        <Feather name="alert-circle" size={48} color={themeColors.error} />
        <Text style={[styles.errorText, { color: themeColors.textMuted }]}>Invoice not found</Text>
        <TouchableOpacity style={[styles.backButton, { backgroundColor: themeColors.accent }]} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] + 100 }}
      >
        {/* Order Summary */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Order Summary</Text>
          <View style={[styles.itemCard, { backgroundColor: themeColors.surface }]}>
            {primaryImage?.url ? (
              <Image source={primaryImage.url} style={styles.itemImage} contentFit="cover" />
            ) : (
              <View style={[styles.imagePlaceholder, { backgroundColor: themeColors.sand }]}>
                <Feather name="package" size={24} color={themeColors.textMuted} />
              </View>
            )}
            <View style={styles.itemDetails}>
              <Text style={[styles.itemTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>
                {invoice.listing?.title || 'Item'}
              </Text>
              <Text style={[styles.itemSeller, { color: themeColors.textMuted }]}>
                from {invoice.seller?.company_name || invoice.seller?.full_name}
              </Text>
            </View>
          </View>
        </View>

        {/* Price Breakdown */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Price Breakdown</Text>
          <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { color: themeColors.textSecondary }]}>Sale Amount</Text>
              <Text style={[styles.priceValue, { color: themeColors.textPrimary }]}>{formatCurrency(invoice.sale_amount)}</Text>
            </View>
            {invoice.buyer_premium_amount > 0 && (
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: themeColors.textSecondary }]}>Buyer Premium ({invoice.buyer_premium_percent}%)</Text>
                <Text style={[styles.priceValue, { color: themeColors.textPrimary }]}>{formatCurrency(invoice.buyer_premium_amount)}</Text>
              </View>
            )}
            {invoice.shipping_amount > 0 && (
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: themeColors.textSecondary }]}>Shipping</Text>
                <Text style={[styles.priceValue, { color: themeColors.textPrimary }]}>{formatCurrency(invoice.shipping_amount)}</Text>
              </View>
            )}
            {invoice.tax_amount > 0 && (
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: themeColors.textSecondary }]}>Tax</Text>
                <Text style={[styles.priceValue, { color: themeColors.textPrimary }]}>{formatCurrency(invoice.tax_amount)}</Text>
              </View>
            )}
            <View style={[styles.divider, { backgroundColor: themeColors.border }]} />
            <View style={styles.priceRow}>
              <Text style={[styles.totalLabel, { color: themeColors.textPrimary }]}>Total</Text>
              <Text style={[styles.totalValue, { color: themeColors.accent }]}>{formatCurrency(invoice.total_amount)}</Text>
            </View>
          </View>
        </View>

        {/* Payment Methods */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Payment Method</Text>

          {/* Credit Card Option */}
          {acceptsCard && (
            <TouchableOpacity
              style={[
                styles.paymentOption,
                { backgroundColor: themeColors.surface, borderColor: selectedPayment === 'card' ? themeColors.accent : themeColors.border },
                selectedPayment === 'card' && styles.paymentOptionSelected,
              ]}
              onPress={() => handlePaymentSelect('card')}
            >
              <View style={[styles.paymentIcon, { backgroundColor: themeColors.accentFaint }]}>
                <Feather name="credit-card" size={20} color={themeColors.accent} />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={[styles.paymentTitle, { color: themeColors.textPrimary }]}>Credit/Debit Card</Text>
                <Text style={[styles.paymentDescription, { color: themeColors.textMuted }]}>
                  Secure payment via Stripe
                </Text>
              </View>
              <View style={[
                styles.radioOuter,
                { borderColor: selectedPayment === 'card' ? themeColors.accent : themeColors.border }
              ]}>
                {selectedPayment === 'card' && (
                  <View style={[styles.radioInner, { backgroundColor: themeColors.accent }]} />
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* ACH Option */}
          {acceptsACH && (
            <TouchableOpacity
              style={[
                styles.paymentOption,
                { backgroundColor: themeColors.surface, borderColor: selectedPayment === 'ach' ? themeColors.accent : themeColors.border },
                selectedPayment === 'ach' && styles.paymentOptionSelected,
              ]}
              onPress={() => handlePaymentSelect('ach')}
            >
              <View style={[styles.paymentIcon, { backgroundColor: themeColors.successLight }]}>
                <Feather name="home" size={20} color={themeColors.success} />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={[styles.paymentTitle, { color: themeColors.textPrimary }]}>Bank Account (ACH)</Text>
                <Text style={[styles.paymentDescription, { color: themeColors.textMuted }]}>
                  Direct bank transfer • Lower fees
                </Text>
              </View>
              <View style={[
                styles.radioOuter,
                { borderColor: selectedPayment === 'ach' ? themeColors.accent : themeColors.border }
              ]}>
                {selectedPayment === 'ach' && (
                  <View style={[styles.radioInner, { backgroundColor: themeColors.accent }]} />
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* Wire Transfer Option */}
          {acceptsWire && sellerHasWireDetails && (
            <TouchableOpacity
              style={[
                styles.paymentOption,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: selectedPayment === 'wire' ? themeColors.accent : themeColors.border,
                },
                selectedPayment === 'wire' && styles.paymentOptionSelected,
              ]}
              onPress={() => handlePaymentSelect('wire')}
            >
              <View style={[styles.paymentIcon, { backgroundColor: isDark ? '#1e3a5f' : '#dbeafe' }]}>
                <Feather name="send" size={20} color="#2563eb" />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={[styles.paymentTitle, { color: themeColors.textPrimary }]}>Wire Transfer</Text>
                <Text style={[styles.paymentDescription, { color: themeColors.textMuted }]}>
                  Irrevocable bank wire • Ideal for high-value transactions
                </Text>
                <View style={styles.wireBadge}>
                  <Feather name="shield" size={10} color={themeColors.success} />
                  <Text style={[styles.wireBadgeText, { color: themeColors.success }]}>Most Secure</Text>
                </View>
              </View>
              <View style={[
                styles.radioOuter,
                { borderColor: selectedPayment === 'wire' ? themeColors.accent : themeColors.border }
              ]}>
                {selectedPayment === 'wire' && (
                  <View style={[styles.radioInner, { backgroundColor: themeColors.accent }]} />
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* Wire Transfer Request Option - shown when seller hasn't set up wire */}
          {acceptsWire && !sellerHasWireDetails && (
            <View
              style={[
                styles.paymentOption,
                {
                  backgroundColor: themeColors.surface,
                  borderColor: themeColors.border,
                },
              ]}
            >
              <View style={[styles.paymentIcon, { backgroundColor: isDark ? '#1e3a5f' : '#dbeafe' }]}>
                <Feather name="send" size={20} color="#2563eb" />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={[styles.paymentTitle, { color: themeColors.textPrimary }]}>Wire Transfer</Text>
                {wireRequestSent || invoice?.wire_requested_at ? (
                  <View style={styles.wireRequestedBadge}>
                    <Feather name="check-circle" size={12} color={themeColors.success} />
                    <Text style={[styles.wireRequestedText, { color: themeColors.success }]}>
                      Request sent to seller
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text style={[styles.paymentDescription, { color: themeColors.textMuted }]}>
                      Seller hasn't set up wire details yet
                    </Text>
                    <TouchableOpacity
                      style={[styles.requestWireButton, { backgroundColor: themeColors.accentFaint }]}
                      onPress={handleRequestWireInstructions}
                      disabled={requestWireInstructionsMutation.isPending}
                    >
                      {requestWireInstructionsMutation.isPending ? (
                        <ActivityIndicator size="small" color={themeColors.accent} />
                      ) : (
                        <>
                          <Feather name="mail" size={14} color={themeColors.accent} />
                          <Text style={[styles.requestWireButtonText, { color: themeColors.accent }]}>
                            Request Wire Instructions
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          )}

          {/* Wire Transfer Note */}
          {selectedPayment === 'wire' && (
            <View style={[styles.wireNote, { backgroundColor: themeColors.accentFaint }]}>
              <Feather name="info" size={16} color={themeColors.accent} />
              <Text style={[styles.wireNoteText, { color: themeColors.accent }]}>
                Wire transfers are irrevocable once sent. You'll receive the seller's bank details to initiate the wire from your bank.
                The seller will confirm receipt before shipping.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Pay Button Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
        <View style={styles.footerTotal}>
          <Text style={[styles.footerTotalLabel, { color: themeColors.textMuted }]}>Total</Text>
          <Text style={[styles.footerTotalValue, { color: themeColors.textPrimary }]}>{formatCurrency(invoice.total_amount)}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.payButton,
            { backgroundColor: selectedPayment ? themeColors.accent : themeColors.textLight },
          ]}
          onPress={handleProceed}
          disabled={!selectedPayment || isProcessing || initiateWireMutation.isPending}
        >
          {isProcessing || initiateWireMutation.isPending ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Feather name={selectedPayment === 'wire' ? 'send' : 'lock'} size={18} color="#ffffff" />
              <Text style={styles.payButtonText}>
                {selectedPayment === 'wire' ? 'Get Wire Instructions' : 'Pay Now'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Wire Instructions Modal */}
      <Modal
        visible={showWireInstructions}
        animationType="slide"
        transparent
        onRequestClose={() => setShowWireInstructions(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + spacing.lg, backgroundColor: themeColors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Wire Transfer Instructions</Text>
              <TouchableOpacity onPress={handleWireComplete}>
                <Feather name="x" size={24} color={themeColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* Amount to Wire */}
              <View style={[styles.wireAmountCard, { backgroundColor: themeColors.accentFaint }]}>
                <Text style={[styles.wireAmountLabel, { color: themeColors.accent }]}>Amount to Wire</Text>
                <Text style={[styles.wireAmountValue, { color: themeColors.accent }]}>{formatCurrency(invoice.total_amount)}</Text>
              </View>

              {/* Bank Details */}
              <Text style={[styles.wireDetailsTitle, { color: themeColors.textMuted }]}>Seller's Bank Details</Text>

              <View style={[styles.wireDetailCard, { backgroundColor: isDark ? themeColors.sand : themeColors.background }]}>
                <View style={styles.wireDetailRow}>
                  <Text style={[styles.wireDetailLabel, { color: themeColors.textMuted }]}>Bank Name</Text>
                  <View style={styles.wireDetailValueRow}>
                    <Text style={[styles.wireDetailValue, { color: themeColors.textPrimary }]}>{invoice.seller?.wire_bank_name}</Text>
                    <TouchableOpacity onPress={() => copyToClipboard(invoice.seller?.wire_bank_name || '', 'Bank name')}>
                      <Feather name="copy" size={16} color={themeColors.accent} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.wireDetailDivider, { backgroundColor: themeColors.border }]} />

                <View style={styles.wireDetailRow}>
                  <Text style={[styles.wireDetailLabel, { color: themeColors.textMuted }]}>Routing Number (ABA)</Text>
                  <View style={styles.wireDetailValueRow}>
                    <Text style={[styles.wireDetailValue, { color: themeColors.textPrimary }]}>{invoice.seller?.wire_routing_number}</Text>
                    <TouchableOpacity onPress={() => copyToClipboard(invoice.seller?.wire_routing_number || '', 'Routing number')}>
                      <Feather name="copy" size={16} color={themeColors.accent} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.wireDetailDivider, { backgroundColor: themeColors.border }]} />

                <View style={styles.wireDetailRow}>
                  <Text style={[styles.wireDetailLabel, { color: themeColors.textMuted }]}>Account Number</Text>
                  <View style={styles.wireDetailValueRow}>
                    <Text style={[styles.wireDetailValue, { color: themeColors.textPrimary }]}>{invoice.seller?.wire_account_number}</Text>
                    <TouchableOpacity onPress={() => copyToClipboard(invoice.seller?.wire_account_number || '', 'Account number')}>
                      <Feather name="copy" size={16} color={themeColors.accent} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={[styles.wireDetailDivider, { backgroundColor: themeColors.border }]} />

                <View style={styles.wireDetailRow}>
                  <Text style={[styles.wireDetailLabel, { color: themeColors.textMuted }]}>Beneficiary Name</Text>
                  <View style={styles.wireDetailValueRow}>
                    <Text style={[styles.wireDetailValue, { color: themeColors.textPrimary }]}>{invoice.seller?.wire_account_name}</Text>
                    <TouchableOpacity onPress={() => copyToClipboard(invoice.seller?.wire_account_name || '', 'Account name')}>
                      <Feather name="copy" size={16} color={themeColors.accent} />
                    </TouchableOpacity>
                  </View>
                </View>

                {invoice.seller?.wire_bank_address && (
                  <>
                    <View style={[styles.wireDetailDivider, { backgroundColor: themeColors.border }]} />
                    <View style={styles.wireDetailRow}>
                      <Text style={[styles.wireDetailLabel, { color: themeColors.textMuted }]}>Bank Address</Text>
                      <Text style={[styles.wireDetailValue, { color: themeColors.textPrimary }]}>{invoice.seller?.wire_bank_address}</Text>
                    </View>
                  </>
                )}

                {invoice.seller?.wire_swift_code && (
                  <>
                    <View style={[styles.wireDetailDivider, { backgroundColor: themeColors.border }]} />
                    <View style={styles.wireDetailRow}>
                      <Text style={[styles.wireDetailLabel, { color: themeColors.textMuted }]}>SWIFT/BIC Code</Text>
                      <View style={styles.wireDetailValueRow}>
                        <Text style={[styles.wireDetailValue, { color: themeColors.textPrimary }]}>{invoice.seller?.wire_swift_code}</Text>
                        <TouchableOpacity onPress={() => copyToClipboard(invoice.seller?.wire_swift_code || '', 'SWIFT code')}>
                          <Feather name="copy" size={16} color={themeColors.accent} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                )}
              </View>

              {/* Reference Instructions */}
              <View style={[styles.referenceCard, { backgroundColor: themeColors.warningLight }]}>
                <Feather name="alert-triangle" size={18} color={themeColors.warning} />
                <View style={styles.referenceContent}>
                  <Text style={[styles.referenceTitle, { color: themeColors.warning }]}>Important: Include Reference</Text>
                  <Text style={[styles.referenceText, { color: themeColors.warning }]}>
                    Include invoice number <Text style={{ fontWeight: '700' }}>#{invoice.invoice_number}</Text> in the wire transfer memo/reference field.
                  </Text>
                </View>
              </View>

              {invoice.seller?.wire_additional_instructions && (
                <View style={styles.additionalInstructions}>
                  <Text style={[styles.additionalTitle, { color: themeColors.textMuted }]}>Additional Instructions from Seller</Text>
                  <Text style={[styles.additionalText, { color: themeColors.textSecondary }]}>{invoice.seller.wire_additional_instructions}</Text>
                </View>
              )}

              {/* Next Steps */}
              <View style={styles.nextSteps}>
                <Text style={[styles.nextStepsTitle, { color: themeColors.textPrimary }]}>What Happens Next</Text>
                <View style={styles.stepItem}>
                  <View style={[styles.stepNumber, { backgroundColor: themeColors.accent }]}>
                    <Text style={styles.stepNumberText}>1</Text>
                  </View>
                  <Text style={[styles.stepText, { color: themeColors.textSecondary }]}>
                    Initiate the wire transfer from your bank using the details above
                  </Text>
                </View>
                <View style={styles.stepItem}>
                  <View style={[styles.stepNumber, { backgroundColor: themeColors.accent }]}>
                    <Text style={styles.stepNumberText}>2</Text>
                  </View>
                  <Text style={[styles.stepText, { color: themeColors.textSecondary }]}>
                    Wire transfers typically take 1-2 business days to arrive
                  </Text>
                </View>
                <View style={styles.stepItem}>
                  <View style={[styles.stepNumber, { backgroundColor: themeColors.accent }]}>
                    <Text style={styles.stepNumberText}>3</Text>
                  </View>
                  <Text style={[styles.stepText, { color: themeColors.textSecondary }]}>
                    The seller will confirm receipt and begin processing your order
                  </Text>
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: themeColors.accent }]}
              onPress={handleWireComplete}
            >
              <Text style={styles.doneButtonText}>I've Initiated the Wire</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: fontSize.lg,
    marginTop: spacing.md,
  },
  backButton: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
  },
  backButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: '#ffffff',
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
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    ...shadows.sm,
  },
  itemImage: {
    width: 70,
    height: 70,
    borderRadius: borderRadius.lg,
  },
  imagePlaceholder: {
    width: 70,
    height: 70,
    borderRadius: borderRadius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemDetails: {
    flex: 1,
    marginLeft: spacing.md,
  },
  itemTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  itemSeller: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  priceLabel: {
    fontSize: fontSize.sm,
  },
  priceValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  totalValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    ...shadows.sm,
  },
  paymentOptionSelected: {
    borderWidth: 2,
  },
  paymentIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  paymentTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  paymentDescription: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  wireBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  wireBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  requestWireButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  requestWireButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  wireRequestedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  wireRequestedText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  wireNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.xs,
  },
  wireNoteText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    ...shadows.lg,
  },
  footerTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  footerTotalLabel: {
    fontSize: fontSize.sm,
  },
  footerTotalValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: borderRadius.lg,
  },
  payButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: '#ffffff',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    padding: spacing.lg,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
  },
  modalScroll: {
    marginBottom: spacing.lg,
  },
  wireAmountCard: {
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.xl,
  },
  wireAmountLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  wireAmountValue: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    marginTop: spacing.xs,
  },
  wireDetailsTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  wireDetailCard: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  wireDetailRow: {
    paddingVertical: spacing.md,
  },
  wireDetailLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  wireDetailValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  wireDetailValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    flex: 1,
  },
  wireDetailDivider: {
    height: 1,
  },
  referenceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.lg,
  },
  referenceContent: {
    flex: 1,
  },
  referenceTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  referenceText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  additionalInstructions: {
    marginBottom: spacing.lg,
  },
  additionalTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  additionalText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  nextSteps: {
    marginBottom: spacing.lg,
  },
  nextStepsTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#ffffff',
  },
  stepText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  doneButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: borderRadius.lg,
  },
  doneButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: '#ffffff',
  },
});
