import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
  Modal,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Invoice, Listing, ListingImage, Profile, FulfillmentStatus, DeliveryCondition } from '../../types/database';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { formatCurrency, formatDate, formatRelativeTime } from '../../utils/formatters';
import { lightTap, successFeedback, errorFeedback } from '../../utils/haptics';
import { DashboardStackParamList } from '../../navigation/types';

type RouteProps = RouteProp<DashboardStackParamList, 'InvoiceDetail'>;

interface InvoiceWithDetails extends Invoice {
  listing: Listing & {
    images: ListingImage[];
  };
  seller: Profile;
  buyer: Profile;
}

// Full pipeline steps for visualization
const PIPELINE_STEPS: {
  key: FulfillmentStatus;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  description: string;
}[] = [
  { key: 'awaiting_payment', label: 'Payment', icon: 'credit-card', description: 'Awaiting payment' },
  { key: 'paid', label: 'Paid', icon: 'check-circle', description: 'Payment received' },
  { key: 'packaging', label: 'Packaging', icon: 'package', description: 'Item being prepared' },
  { key: 'ready_for_pickup', label: 'Ready', icon: 'box', description: 'Ready for pickup/shipping' },
  { key: 'shipped', label: 'Shipped', icon: 'truck', description: 'In transit' },
  { key: 'delivered', label: 'Delivered', icon: 'home', description: 'Delivered to destination' },
  { key: 'completed', label: 'Completed', icon: 'check', description: 'Transaction complete' },
];

const DELIVERY_CONDITIONS: { key: DeliveryCondition; label: string; icon: keyof typeof Feather.glyphMap; color: string }[] = [
  { key: 'good', label: 'Good Condition', icon: 'check-circle', color: colors.success },
  { key: 'damaged', label: 'Damaged', icon: 'alert-triangle', color: colors.error },
  { key: 'partial', label: 'Partial Delivery', icon: 'alert-circle', color: colors.warning },
];

export default function InvoiceDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProps>();
  const { invoiceId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showShippingModal, setShowShippingModal] = useState(false);
  const [showUploadBolModal, setShowUploadBolModal] = useState(false);
  const [deliveryCondition, setDeliveryCondition] = useState<DeliveryCondition>('good');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [bolImage, setBolImage] = useState<string | null>(null);
  const [damagePhotos, setDamagePhotos] = useState<string[]>([]);
  const [shippingPhotos, setShippingPhotos] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Shipping details state (seller)
  const [shippingCarrier, setShippingCarrier] = useState('Freight');
  const [trackingNumber, setTrackingNumber] = useState('');

  // Freight shipping details state (seller - enhanced)
  const [freightCarrier, setFreightCarrier] = useState('');
  const [freightProNumber, setFreightProNumber] = useState('');
  const [freightBolNumber, setFreightBolNumber] = useState('');
  const [freightClass, setFreightClass] = useState('');
  const [freightWeightLbs, setFreightWeightLbs] = useState('');
  const [freightPickupDate, setFreightPickupDate] = useState('');
  const [freightEstimatedDelivery, setFreightEstimatedDelivery] = useState('');
  const [freightSpecialInstructions, setFreightSpecialInstructions] = useState('');

  // Pickup contact state
  const [pickupContactName, setPickupContactName] = useState('');
  const [pickupContactCompany, setPickupContactCompany] = useState('');
  const [pickupContactPhone, setPickupContactPhone] = useState('');
  const [pickupContactEmail, setPickupContactEmail] = useState('');

  // Delivery contact state
  const [deliveryContactName, setDeliveryContactName] = useState('');
  const [deliveryContactCompany, setDeliveryContactCompany] = useState('');
  const [deliveryContactPhone, setDeliveryContactPhone] = useState('');
  const [deliveryContactEmail, setDeliveryContactEmail] = useState('');

  const { data: invoice, isLoading, refetch } = useQuery<InvoiceWithDetails>({
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

  // Upload image to Supabase Storage
  const uploadImage = async (uri: string, path: string): Promise<string | null> => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const fileExt = uri.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `${path}/${Date.now()}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('delivery-documents')
        .upload(fileName, blob, {
          contentType: `image/${fileExt}`,
          upsert: false,
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('delivery-documents')
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      return null;
    }
  };

  const confirmDeliveryMutation = useMutation({
    mutationFn: async (params: {
      condition: DeliveryCondition;
      notes: string;
      bolImageUrl: string | null;
      damagePhotoUrls: string[];
    }) => {
      const { error } = await supabase
        .from('invoices')
        .update({
          fulfillment_status: 'completed',
          delivery_confirmed_at: new Date().toISOString(),
          delivery_confirmed_by: user?.id,
          delivery_condition: params.condition,
          delivery_notes: params.notes,
          delivery_bol_url: params.bolImageUrl,
          delivery_damage_photos: params.damagePhotoUrls.length > 0 ? params.damagePhotoUrls : null,
        })
        .eq('id', invoiceId);

      if (error) throw error;

      // Send notification to seller about delivery confirmation
      const conditionText = {
        'good': 'in good condition',
        'damaged': 'with reported damage',
        'partial': 'as a partial delivery',
      }[params.condition];

      await supabase.from('notifications').insert({
        user_id: invoice?.seller_id,
        type: 'item_delivered',
        title: 'Delivery Confirmed',
        body: `Buyer has confirmed receipt of "${invoice?.listing?.title}" ${conditionText}.${params.notes ? ` Notes: ${params.notes}` : ''}`,
        invoice_id: invoiceId,
        listing_id: invoice?.listing_id,
      });
    },
    onSuccess: () => {
      successFeedback();
      setShowDeliveryModal(false);
      setBolImage(null);
      setDamagePhotos([]);
      setDeliveryNotes('');
      setDeliveryCondition('good');
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['myInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['mySales'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      Alert.alert('Success', 'Delivery confirmed successfully!');
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to confirm delivery. Please try again.');
    },
  });

  // Mutation for updating BOL after delivery (for adding BOL later)
  const updateBolMutation = useMutation({
    mutationFn: async (bolUrl: string) => {
      const { error } = await supabase
        .from('invoices')
        .update({ delivery_bol_url: bolUrl })
        .eq('id', invoiceId);

      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      setBolImage(null);
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      Alert.alert('Success', 'Bill of Lading uploaded successfully!');
    },
    onError: () => {
      errorFeedback();
      setIsUploading(false);
      Alert.alert('Error', 'Failed to upload BOL. Please try again.');
    },
  });

  // Mutation for uploading BOL and shipping photos before delivery confirmation
  const uploadBolAndPhotosMutation = useMutation({
    mutationFn: async (params: { bolUrl: string | null; shippingPhotoUrls: string[] }) => {
      const updateData: Record<string, unknown> = {};

      if (params.bolUrl) {
        updateData.delivery_bol_url = params.bolUrl;
      }

      // Note: shipping_photos field would need to be added to database if not present
      // For now, we store them along with the BOL

      if (Object.keys(updateData).length === 0 && params.shippingPhotoUrls.length === 0) {
        throw new Error('No files to upload');
      }

      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId);

      if (error) throw error;

      // Notify seller that buyer uploaded documents
      await supabase.from('notifications').insert({
        user_id: invoice?.seller_id,
        type: 'payment_confirmed',
        title: 'Documents Uploaded',
        body: `Buyer has uploaded ${params.bolUrl ? 'a signed BOL' : ''}${params.bolUrl && params.shippingPhotoUrls.length > 0 ? ' and ' : ''}${params.shippingPhotoUrls.length > 0 ? `${params.shippingPhotoUrls.length} shipping photo(s)` : ''} for "${invoice?.listing?.title}".`,
        invoice_id: invoiceId,
        listing_id: invoice?.listing_id,
      });
    },
    onSuccess: () => {
      successFeedback();
      setShowUploadBolModal(false);
      setBolImage(null);
      setShippingPhotos([]);
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      Alert.alert('Success', 'Documents uploaded successfully!');
    },
    onError: () => {
      errorFeedback();
      setIsUploading(false);
      Alert.alert('Error', 'Failed to upload documents. Please try again.');
    },
  });

  // Mutation for seller to confirm wire payment received
  const confirmWireMutation = useMutation({
    mutationFn: async (referenceNumber?: string) => {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'paid',
          fulfillment_status: 'paid',
          paid_at: new Date().toISOString(),
          wire_confirmed_at: new Date().toISOString(),
          wire_confirmed_by: user?.id,
          wire_reference_number: referenceNumber || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId);

      if (error) throw error;
    },
    onSuccess: () => {
      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['myInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['mySales'] });
      Alert.alert('Success', 'Wire payment confirmed! You can now proceed with packaging and shipping.');
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to confirm wire payment. Please try again.');
    },
  });

  // Mutation for seller to update fulfillment status (packaging, ready, shipped, delivered)
  const updateFulfillmentMutation = useMutation({
    mutationFn: async (params: {
      status: FulfillmentStatus;
      trackingNumber?: string;
      shippingCarrier?: string;
      // Freight details
      freightCarrier?: string;
      freightProNumber?: string;
      freightBolNumber?: string;
      freightClass?: string;
      freightWeightLbs?: number;
      freightPickupDate?: string;
      freightEstimatedDelivery?: string;
      freightSpecialInstructions?: string;
      // Pickup contact
      pickupContact?: {
        name?: string;
        company?: string;
        phone?: string;
        email?: string;
      };
      // Delivery contact
      deliveryContact?: {
        name?: string;
        company?: string;
        phone?: string;
        email?: string;
      };
    }) => {
      const updateData: Record<string, unknown> = {
        fulfillment_status: params.status,
        updated_at: new Date().toISOString(),
      };

      // Add shipped_at timestamp when marking as shipped
      if (params.status === 'shipped') {
        updateData.shipped_at = new Date().toISOString();
        if (params.trackingNumber) {
          updateData.tracking_number = params.trackingNumber;
        }
        if (params.shippingCarrier) {
          updateData.shipping_carrier = params.shippingCarrier;
        }
        // Freight carrier (for freight shipments)
        if (params.freightCarrier) {
          updateData.shipping_carrier = params.freightCarrier;
        }
        // Freight PRO number (use as tracking for freight)
        if (params.freightProNumber) {
          updateData.freight_pro_number = params.freightProNumber;
          updateData.tracking_number = params.freightProNumber;
        }
        // Freight details
        if (params.freightBolNumber) {
          updateData.freight_bol_number = params.freightBolNumber;
        }
        if (params.freightClass) {
          updateData.freight_class = params.freightClass;
        }
        if (params.freightWeightLbs) {
          updateData.freight_weight_lbs = params.freightWeightLbs;
        }
        if (params.freightPickupDate) {
          updateData.freight_pickup_date = params.freightPickupDate;
        }
        if (params.freightEstimatedDelivery) {
          updateData.freight_estimated_delivery = params.freightEstimatedDelivery;
        }
        if (params.freightSpecialInstructions) {
          updateData.freight_special_instructions = params.freightSpecialInstructions;
        }
        // Pickup contact (stored as JSON)
        if (params.pickupContact && Object.values(params.pickupContact).some(v => v)) {
          updateData.freight_pickup_contact = params.pickupContact;
        }
        // Delivery contact (stored as JSON)
        if (params.deliveryContact && Object.values(params.deliveryContact).some(v => v)) {
          updateData.freight_delivery_contact = params.deliveryContact;
        }
      }

      // Add delivered_at timestamp when marking as delivered
      if (params.status === 'delivered') {
        updateData.delivered_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId);

      if (error) throw error;

      // Send notification to buyer
      const notificationTitle = {
        'packaging': 'Order Being Prepared',
        'ready_for_pickup': 'Order Ready for Pickup',
        'shipped': 'Order Shipped!',
        'delivered': 'Order Delivered',
      }[params.status] || 'Order Status Updated';

      const notificationBody = {
        'packaging': `Your order for "${invoice?.listing?.title}" is being prepared for shipment.`,
        'ready_for_pickup': `Your order for "${invoice?.listing?.title}" is ready for pickup/shipping.`,
        'shipped': params.trackingNumber
          ? `Your order for "${invoice?.listing?.title}" has shipped! Tracking: ${params.trackingNumber}`
          : `Your order for "${invoice?.listing?.title}" has shipped!`,
        'delivered': `Your order for "${invoice?.listing?.title}" has been delivered. Please confirm receipt.`,
      }[params.status] || `Order status updated to ${params.status}`;

      await supabase.from('notifications').insert({
        user_id: invoice?.buyer_id,
        type: params.status === 'shipped' ? 'item_shipped' : params.status === 'delivered' ? 'item_delivered' : 'payment_confirmed',
        title: notificationTitle,
        body: notificationBody,
        invoice_id: invoiceId,
        listing_id: invoice?.listing_id,
      });
    },
    onSuccess: () => {
      successFeedback();
      setShowShippingModal(false);
      setShippingCarrier('');
      setTrackingNumber('');
      setFreightCarrier('');
      setFreightProNumber('');
      setFreightBolNumber('');
      setFreightClass('');
      setFreightWeightLbs('');
      setFreightPickupDate('');
      setFreightEstimatedDelivery('');
      setFreightSpecialInstructions('');
      setPickupContactName('');
      setPickupContactCompany('');
      setPickupContactPhone('');
      setPickupContactEmail('');
      setDeliveryContactName('');
      setDeliveryContactCompany('');
      setDeliveryContactPhone('');
      setDeliveryContactEmail('');
      queryClient.invalidateQueries({ queryKey: ['invoice', invoiceId] });
      queryClient.invalidateQueries({ queryKey: ['myInvoices'] });
      queryClient.invalidateQueries({ queryKey: ['mySales'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: () => {
      errorFeedback();
      Alert.alert('Error', 'Failed to update order status. Please try again.');
    },
  });

  const isBuyer = user?.id === invoice?.buyer_id;
  const isSeller = user?.id === invoice?.seller_id;

  const getPipelineStep = (fulfillmentStatus: FulfillmentStatus): number => {
    const index = PIPELINE_STEPS.findIndex(step => step.key === fulfillmentStatus);
    return index >= 0 ? index : 0;
  };

  const handleTrackingPress = useCallback(() => {
    if (!invoice?.tracking_number || !invoice?.shipping_carrier) return;

    lightTap();
    const carrier = invoice.shipping_carrier.toLowerCase();
    let url = '';

    if (carrier.includes('ups')) {
      url = `https://www.ups.com/track?tracknum=${invoice.tracking_number}`;
    } else if (carrier.includes('fedex')) {
      url = `https://www.fedex.com/fedextrack/?trknbr=${invoice.tracking_number}`;
    } else if (carrier.includes('usps')) {
      url = `https://tools.usps.com/go/TrackConfirmAction?tLabels=${invoice.tracking_number}`;
    } else {
      url = `https://www.google.com/search?q=${carrier}+tracking+${invoice.tracking_number}`;
    }

    Linking.openURL(url);
  }, [invoice]);

  const handlePayNow = useCallback(() => {
    lightTap();
    navigation.navigate('Checkout', { invoiceId });
  }, [navigation, invoiceId]);

  const handleConfirmDelivery = () => {
    lightTap();
    setShowDeliveryModal(true);
  };

  const handleConfirmWirePayment = () => {
    lightTap();
    Alert.alert(
      'Confirm Wire Payment Received',
      'Have you verified that the wire transfer has been received in your bank account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Enter Reference',
          onPress: () => {
            Alert.prompt(
              'Wire Reference Number',
              'Enter the wire transfer reference number (optional)',
              [
                { text: 'Skip', onPress: () => confirmWireMutation.mutate(undefined) },
                { text: 'Confirm', onPress: (ref) => confirmWireMutation.mutate(ref) },
              ],
              'plain-text'
            );
          },
        },
        {
          text: 'Confirm Without Reference',
          onPress: () => confirmWireMutation.mutate(undefined),
        },
      ]
    );
  };

  // Seller fulfillment status handlers
  const handleMarkPackaging = () => {
    lightTap();
    Alert.alert(
      'Start Packaging',
      'Mark this order as being prepared for shipment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => updateFulfillmentMutation.mutate({ status: 'packaging' }),
        },
      ]
    );
  };

  const handleMarkReady = () => {
    lightTap();
    Alert.alert(
      'Ready for Pickup/Shipping',
      'Mark this order as ready for pickup or shipping?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => updateFulfillmentMutation.mutate({ status: 'ready_for_pickup' }),
        },
      ]
    );
  };

  const handleMarkShipped = () => {
    lightTap();
    setShowShippingModal(true);
  };

  const handleSubmitShipping = () => {
    lightTap();

    // Require freight carrier
    if (!freightCarrier.trim()) {
      Alert.alert('Required Field', 'Please enter the freight carrier name.');
      return;
    }

    updateFulfillmentMutation.mutate({
      status: 'shipped',
      // Freight-specific fields
      freightCarrier: freightCarrier.trim(),
      freightProNumber: freightProNumber.trim() || undefined,
      freightBolNumber: freightBolNumber.trim() || undefined,
      freightClass: freightClass || undefined,
      freightWeightLbs: freightWeightLbs ? parseInt(freightWeightLbs, 10) : undefined,
      freightPickupDate: freightPickupDate || undefined,
      freightEstimatedDelivery: freightEstimatedDelivery || undefined,
      freightSpecialInstructions: freightSpecialInstructions.trim() || undefined,
      // Pickup contact
      pickupContact: (pickupContactName || pickupContactCompany || pickupContactPhone || pickupContactEmail) ? {
        name: pickupContactName.trim() || undefined,
        company: pickupContactCompany.trim() || undefined,
        phone: pickupContactPhone.trim() || undefined,
        email: pickupContactEmail.trim() || undefined,
      } : undefined,
      // Delivery contact
      deliveryContact: (deliveryContactName || deliveryContactCompany || deliveryContactPhone || deliveryContactEmail) ? {
        name: deliveryContactName.trim() || undefined,
        company: deliveryContactCompany.trim() || undefined,
        phone: deliveryContactPhone.trim() || undefined,
        email: deliveryContactEmail.trim() || undefined,
      } : undefined,
    });
  };

  // Handler for buyer to open pre-delivery BOL/photos upload modal
  const handleOpenUploadBolModal = () => {
    lightTap();
    setShowUploadBolModal(true);
  };

  // Handler for buyer to submit pre-delivery BOL and shipping photos
  const handleSubmitUploadBol = async () => {
    lightTap();

    if (!bolImage && shippingPhotos.length === 0) {
      Alert.alert('No Files', 'Please select a BOL or shipping photos to upload.');
      return;
    }

    setIsUploading(true);

    try {
      let bolUrl: string | null = null;
      const uploadedShippingPhotoUrls: string[] = [];

      // Upload BOL if selected
      if (bolImage) {
        bolUrl = await uploadImage(bolImage, `${invoiceId}/bol`);
      }

      // Upload shipping photos
      for (const photo of shippingPhotos) {
        const url = await uploadImage(photo, `${invoiceId}/shipping`);
        if (url) {
          uploadedShippingPhotoUrls.push(url);
        }
      }

      uploadBolAndPhotosMutation.mutate({
        bolUrl,
        shippingPhotoUrls: uploadedShippingPhotoUrls,
      });
    } catch (error) {
      setIsUploading(false);
      Alert.alert('Error', 'Failed to upload files. Please try again.');
    }
  };

  // Handler for adding shipping photos
  const pickShippingPhoto = async () => {
    lightTap();

    if (shippingPhotos.length >= 5) {
      Alert.alert('Limit Reached', 'You can upload a maximum of 5 shipping photos.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 5 - shippingPhotos.length,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newPhotos = result.assets.map(asset => asset.uri);
      setShippingPhotos(prev => [...prev, ...newPhotos].slice(0, 5));
    }
  };

  const removeShippingPhoto = (index: number) => {
    lightTap();
    setShippingPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleMarkDelivered = () => {
    lightTap();
    Alert.alert(
      'Mark as Delivered',
      'Confirm that this order has been delivered to the buyer? The buyer will be prompted to confirm receipt.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Delivered',
          onPress: () => updateFulfillmentMutation.mutate({ status: 'delivered' }),
        },
      ]
    );
  };

  const pickBolImage = async () => {
    lightTap();

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload BOL documents.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setBolImage(result.assets[0].uri);
    }
  };

  const takeBolPhoto = async () => {
    lightTap();

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access to take photos of BOL documents.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setBolImage(result.assets[0].uri);
    }
  };

  const showBolOptions = () => {
    Alert.alert(
      'Add Signed BOL',
      'Choose how to add your signed Bill of Lading',
      [
        { text: 'Take Photo', onPress: takeBolPhoto },
        { text: 'Choose from Library', onPress: pickBolImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const pickDamagePhoto = async () => {
    lightTap();

    if (damagePhotos.length >= 5) {
      Alert.alert('Limit Reached', 'You can upload a maximum of 5 damage photos.');
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setDamagePhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const takeDamagePhoto = async () => {
    lightTap();

    if (damagePhotos.length >= 5) {
      Alert.alert('Limit Reached', 'You can upload a maximum of 5 damage photos.');
      return;
    }

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setDamagePhotos(prev => [...prev, result.assets[0].uri]);
    }
  };

  const showDamagePhotoOptions = () => {
    Alert.alert(
      'Add Damage Photo',
      'Document any damage to the shipment',
      [
        { text: 'Take Photo', onPress: takeDamagePhoto },
        { text: 'Choose from Library', onPress: pickDamagePhoto },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const removeDamagePhoto = (index: number) => {
    lightTap();
    setDamagePhotos(prev => prev.filter((_, i) => i !== index));
  };

  // Handle standalone BOL upload (after delivery confirmation)
  const handleStandaloneBolUpload = async (uri: string) => {
    setIsUploading(true);
    try {
      const bolUrl = await uploadImage(uri, `bol/${invoiceId}`);
      if (bolUrl) {
        updateBolMutation.mutate(bolUrl);
      } else {
        throw new Error('Upload failed');
      }
    } catch (error) {
      errorFeedback();
      setIsUploading(false);
      Alert.alert('Error', 'Failed to upload BOL. Please try again.');
    }
  };

  const pickStandaloneBolImage = async () => {
    lightTap();

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload BOL documents.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      handleStandaloneBolUpload(result.assets[0].uri);
    }
  };

  const takeStandaloneBolPhoto = async () => {
    lightTap();

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow camera access to take photos of BOL documents.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      handleStandaloneBolUpload(result.assets[0].uri);
    }
  };

  const showStandaloneBolOptions = () => {
    Alert.alert(
      'Add Signed BOL',
      'Choose how to add your signed Bill of Lading',
      [
        { text: 'Take Photo', onPress: takeStandaloneBolPhoto },
        { text: 'Choose from Library', onPress: pickStandaloneBolImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const submitDeliveryConfirmation = async () => {
    lightTap();

    // Validate required fields for damaged/partial condition
    if ((deliveryCondition === 'damaged' || deliveryCondition === 'partial') && !deliveryNotes.trim()) {
      errorFeedback();
      Alert.alert(
        'Notes Required',
        deliveryCondition === 'damaged'
          ? 'Please describe the damage in detail before confirming delivery.'
          : 'Please describe what items are missing or incomplete before confirming delivery.'
      );
      return;
    }

    setIsUploading(true);

    try {
      let bolImageUrl: string | null = null;
      const damagePhotoUrls: string[] = [];

      // Upload BOL image if present
      if (bolImage) {
        bolImageUrl = await uploadImage(bolImage, `bol/${invoiceId}`);
      }

      // Upload damage photos if present
      for (const photoUri of damagePhotos) {
        const url = await uploadImage(photoUri, `damage/${invoiceId}`);
        if (url) {
          damagePhotoUrls.push(url);
        }
      }

      // Submit the confirmation
      confirmDeliveryMutation.mutate({
        condition: deliveryCondition,
        notes: deliveryNotes,
        bolImageUrl,
        damagePhotoUrls,
      });
    } catch (error) {
      errorFeedback();
      Alert.alert('Error', 'Failed to upload images. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleContactSeller = useCallback(() => {
    if (!invoice?.seller_id || !invoice?.listing_id) return;
    lightTap();
    navigation.navigate('MessagesTab', {
      screen: 'Conversation',
      params: {
        otherUserId: invoice.seller_id,
        listingId: invoice.listing_id,
      },
    });
  }, [navigation, invoice]);

  const handleViewListing = useCallback(() => {
    if (!invoice?.listing_id) return;
    lightTap();
    navigation.navigate('HomeTab', {
      screen: 'ListingDetail',
      params: { listingId: invoice.listing_id },
    });
  }, [navigation, invoice]);

  // Generate and share PDF invoice/receipt
  const handleDownloadReceipt = useCallback(async () => {
    if (!invoice) return;
    lightTap();

    const isPaid = invoice.status === 'paid';
    const documentTitle = isPaid ? 'Receipt' : 'Invoice';

    // Generate HTML for the PDF
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${documentTitle} #${invoice.invoice_number}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1a1a1a; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
            .logo { font-size: 24px; font-weight: bold; color: #1a1a1a; }
            .logo span { color: #0066cc; }
            .document-info { text-align: right; }
            .document-type { font-size: 28px; font-weight: bold; color: #1a1a1a; }
            .document-number { font-size: 14px; color: #666; margin-top: 4px; }
            .paid-stamp { display: inline-block; background: #e6f4ea; color: #137333; padding: 8px 16px; border-radius: 8px; border: 2px solid #137333; font-weight: bold; font-size: 18px; margin-top: 12px; }
            .section { margin-bottom: 30px; }
            .section-title { font-size: 12px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
            .card { background: #f8f9fa; border-radius: 12px; padding: 20px; }
            .row { display: flex; justify-content: space-between; padding: 8px 0; }
            .row.total { border-top: 2px solid #e0e0e0; margin-top: 12px; padding-top: 16px; }
            .label { color: #666; }
            .value { font-weight: 500; }
            .total .label { font-weight: 600; color: #1a1a1a; }
            .total .value { font-size: 20px; font-weight: bold; color: #0066cc; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .info-box h4 { font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 8px; }
            .info-box p { margin: 4px 0; }
            .item-row { display: flex; align-items: center; gap: 16px; }
            .item-details { flex: 1; }
            .item-title { font-weight: 600; font-size: 16px; }
            .item-meta { color: #666; font-size: 14px; }
            .footer { margin-top: 40px; text-align: center; color: #999; font-size: 12px; border-top: 1px solid #e0e0e0; padding-top: 20px; }
            .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
            .status-paid { background: #e6f4ea; color: #137333; }
            .status-pending { background: #fef7e0; color: #b45309; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">PrintMail<span>Bids</span></div>
            <div class="document-info">
              <div class="document-type">${documentTitle}</div>
              <div class="document-number">#${invoice.invoice_number}</div>
              ${isPaid ? '<div class="paid-stamp">✓ PAID</div>' : ''}
            </div>
          </div>

          <div class="section">
            <div class="info-grid">
              <div class="info-box">
                <h4>Bill To</h4>
                <p><strong>${invoice.buyer?.company_name || invoice.buyer?.full_name || 'Buyer'}</strong></p>
                ${invoice.buyer?.email ? `<p>${invoice.buyer.email}</p>` : ''}
              </div>
              <div class="info-box">
                <h4>Seller</h4>
                <p><strong>${invoice.seller?.company_name || invoice.seller?.full_name || 'Seller'}</strong></p>
                ${invoice.seller?.email ? `<p>${invoice.seller.email}</p>` : ''}
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Item</div>
            <div class="card">
              <div class="item-row">
                <div class="item-details">
                  <div class="item-title">${invoice.listing?.title || 'Item'}</div>
                  ${invoice.listing?.make && invoice.listing?.model ?
                    `<div class="item-meta">${invoice.listing.make} ${invoice.listing.model}${invoice.listing.year ? ` (${invoice.listing.year})` : ''}</div>` : ''}
                </div>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Price Breakdown</div>
            <div class="card">
              <div class="row">
                <span class="label">Sale Amount</span>
                <span class="value">${formatCurrency(invoice.sale_amount)}</span>
              </div>
              ${invoice.buyer_premium_amount > 0 ? `
              <div class="row">
                <span class="label">Buyer Premium (${invoice.buyer_premium_percent}%)</span>
                <span class="value">${formatCurrency(invoice.buyer_premium_amount)}</span>
              </div>` : ''}
              ${invoice.shipping_amount > 0 ? `
              <div class="row">
                <span class="label">Shipping</span>
                <span class="value">${formatCurrency(invoice.shipping_amount)}</span>
              </div>` : ''}
              ${invoice.packaging_amount > 0 ? `
              <div class="row">
                <span class="label">Packaging</span>
                <span class="value">${formatCurrency(invoice.packaging_amount)}</span>
              </div>` : ''}
              ${invoice.tax_amount > 0 ? `
              <div class="row">
                <span class="label">Tax</span>
                <span class="value">${formatCurrency(invoice.tax_amount)}</span>
              </div>` : ''}
              <div class="row total">
                <span class="label">${isPaid ? 'Total Paid' : 'Total Due'}</span>
                <span class="value">${formatCurrency(invoice.total_amount)}</span>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">Payment Status</div>
            <div class="card">
              <span class="status-badge ${isPaid ? 'status-paid' : 'status-pending'}">
                ${isPaid ? '✓ Paid' : 'Awaiting Payment'}
              </span>
              ${isPaid && invoice.paid_at ? `<p style="margin-top: 12px; color: #666;">Paid on ${formatDate(invoice.paid_at)}${invoice.payment_method ? ` via ${invoice.payment_method.replace('_', ' ')}` : ''}</p>` : ''}
              ${!isPaid && invoice.payment_due_date ? `<p style="margin-top: 12px; color: #b45309;">Payment due by ${formatDate(invoice.payment_due_date)}</p>` : ''}
            </div>
          </div>

          <div class="footer">
            <p>Invoice Date: ${formatDate(invoice.created_at)}</p>
            <p style="margin-top: 8px;">PrintMailBids - B2B Equipment Marketplace</p>
            <p style="margin-top: 4px;">Thank you for your business!</p>
          </div>
        </body>
      </html>
    `;

    try {
      // Generate PDF
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      // Check if sharing is available
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `${documentTitle} #${invoice.invoice_number}`,
          UTI: 'com.adobe.pdf',
        });
        successFeedback();
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to generate document. Please try again.');
    }
  }, [invoice]);

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
        <Feather name="alert-circle" size={48} color={colors.error} />
        <Text style={[styles.errorText, { color: themeColors.textMuted }]}>Invoice not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentStep = getPipelineStep(invoice.fulfillment_status);
  const primaryImage = invoice.listing?.images?.find(img => img.is_primary) || invoice.listing?.images?.[0];
  const isPaymentPending = invoice.status === 'pending';
  const isAwaitingWire = invoice.status === 'awaiting_wire';
  const isPaid = invoice.status === 'paid';
  const isDelivered = invoice.fulfillment_status === 'delivered';
  const canConfirmDelivery = isBuyer && isDelivered && !invoice.delivery_confirmed_at;
  const canConfirmWire = isSeller && isAwaitingWire;

  // Seller fulfillment status progression
  const canMarkPackaging = isSeller && isPaid && invoice.fulfillment_status === 'paid';
  const canMarkReady = isSeller && isPaid && invoice.fulfillment_status === 'packaging';
  const canMarkShipped = isSeller && isPaid && invoice.fulfillment_status === 'ready_for_pickup';
  const canMarkDelivered = isSeller && isPaid && invoice.fulfillment_status === 'shipped';
  const hasSellerAction = canMarkPackaging || canMarkReady || canMarkShipped || canMarkDelivered;

  // Buyer can upload BOL/photos when order is shipped but not yet confirmed delivered
  const isShipped = invoice.fulfillment_status === 'shipped';
  const canUploadBol = isBuyer && isShipped && !invoice.delivery_confirmed_at;

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] + 80 }}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={themeColors.accent} />
        }
      >
        {/* Invoice Header - Shows as Receipt when paid */}
        <View style={[styles.header, { backgroundColor: themeColors.surface, borderBottomColor: themeColors.border }]}>
          <View style={styles.invoiceNumberRow}>
            <Text style={[styles.invoiceLabel, { color: themeColors.textMuted }]}>
              {invoice.status === 'paid' ? 'Receipt' : 'Invoice'}
            </Text>
            <Text style={[styles.invoiceNumber, { color: themeColors.textPrimary }]}>#{invoice.invoice_number}</Text>
          </View>
          <Text style={[styles.invoiceDate, { color: themeColors.textMuted }]}>Created {formatDate(invoice.created_at)}</Text>

          {/* PAID Stamp for paid invoices */}
          {invoice.status === 'paid' && (
            <View style={styles.paidStamp}>
              <View style={styles.paidStampInner}>
                <Feather name="check-circle" size={16} color={colors.success} />
                <Text style={styles.paidStampText}>PAID</Text>
              </View>
              {invoice.paid_at && (
                <Text style={styles.paidStampDate}>{formatDate(invoice.paid_at)}</Text>
              )}
            </View>
          )}

          {/* Download/Share Button */}
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={handleDownloadReceipt}
          >
            <Feather name="download" size={16} color={colors.accent} />
            <Text style={styles.downloadButtonText}>
              Download {invoice.status === 'paid' ? 'Receipt' : 'Invoice'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Pipeline Timeline */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Order Status</Text>
          <View style={[styles.pipelineCard, { backgroundColor: themeColors.surface }]}>
            <View style={styles.timeline}>
              {PIPELINE_STEPS.map((step, index) => {
                const isCompleted = index <= currentStep;
                const isCurrent = index === currentStep;
                const isLast = index === PIPELINE_STEPS.length - 1;

                return (
                  <View key={step.key} style={styles.timelineItem}>
                    <View style={styles.timelineLeft}>
                      <View style={[
                        styles.timelineIcon,
                        isCompleted && styles.timelineIconCompleted,
                        isCurrent && styles.timelineIconCurrent,
                      ]}>
                        <Feather
                          name={step.icon}
                          size={16}
                          color={isCompleted ? colors.white : colors.textLight}
                        />
                      </View>
                      {!isLast && (
                        <View style={[
                          styles.timelineLine,
                          isCompleted && index < currentStep && styles.timelineLineCompleted,
                        ]} />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text style={[
                        styles.timelineLabel,
                        { color: isCompleted ? themeColors.textPrimary : themeColors.textMuted },
                        isCompleted && styles.timelineLabelCompleted,
                        isCurrent && styles.timelineLabelCurrent,
                      ]}>
                        {step.label}
                      </Text>
                      <Text style={[styles.timelineDescription, { color: themeColors.textMuted }]}>{step.description}</Text>
                      {isCurrent && step.key === 'shipped' && invoice.shipped_at && (
                        <Text style={[styles.timelineDate, { color: themeColors.textMuted }]}>
                          Shipped {formatRelativeTime(invoice.shipped_at)}
                        </Text>
                      )}
                      {isCurrent && step.key === 'delivered' && invoice.delivered_at && (
                        <Text style={[styles.timelineDate, { color: themeColors.textMuted }]}>
                          Delivered {formatRelativeTime(invoice.delivered_at)}
                        </Text>
                      )}
                      {step.key === 'completed' && invoice.delivery_confirmed_at && (
                        <Text style={[styles.timelineDate, { color: themeColors.textMuted }]}>
                          Confirmed {formatRelativeTime(invoice.delivery_confirmed_at)}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Shipping Information */}
        {(invoice.tracking_number || invoice.freight_bol_number) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Shipping Details</Text>
            <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
              {/* Standard Shipping */}
              {invoice.tracking_number && (
                <TouchableOpacity style={styles.trackingRow} onPress={handleTrackingPress}>
                  <View style={styles.trackingInfo}>
                    <Feather name="truck" size={20} color={colors.accent} />
                    <View style={styles.trackingDetails}>
                      <Text style={[styles.carrierName, { color: themeColors.textPrimary }]}>{invoice.shipping_carrier || 'Carrier'}</Text>
                      <Text style={styles.trackingNumber}>{invoice.tracking_number}</Text>
                    </View>
                  </View>
                  <Feather name="external-link" size={18} color={colors.accent} />
                </TouchableOpacity>
              )}

              {/* Freight Shipping */}
              {invoice.freight_bol_number && (
                <View style={[styles.freightSection, { borderTopColor: themeColors.border }]}>
                  <View style={styles.freightHeader}>
                    <Feather name="box" size={20} color={colors.primary} />
                    <Text style={[styles.freightTitle, { color: themeColors.textPrimary }]}>Freight Shipment</Text>
                  </View>

                  <View style={styles.freightGrid}>
                    {invoice.freight_bol_number && (
                      <View style={styles.freightItem}>
                        <Text style={[styles.freightLabel, { color: themeColors.textMuted }]}>BOL Number</Text>
                        <Text style={[styles.freightValue, { color: themeColors.textPrimary }]}>{invoice.freight_bol_number}</Text>
                      </View>
                    )}
                    {invoice.freight_pro_number && (
                      <View style={styles.freightItem}>
                        <Text style={[styles.freightLabel, { color: themeColors.textMuted }]}>PRO Number</Text>
                        <Text style={[styles.freightValue, { color: themeColors.textPrimary }]}>{invoice.freight_pro_number}</Text>
                      </View>
                    )}
                    {invoice.freight_class && (
                      <View style={styles.freightItem}>
                        <Text style={[styles.freightLabel, { color: themeColors.textMuted }]}>Freight Class</Text>
                        <Text style={[styles.freightValue, { color: themeColors.textPrimary }]}>{invoice.freight_class}</Text>
                      </View>
                    )}
                    {invoice.freight_weight_lbs && (
                      <View style={styles.freightItem}>
                        <Text style={[styles.freightLabel, { color: themeColors.textMuted }]}>Weight</Text>
                        <Text style={[styles.freightValue, { color: themeColors.textPrimary }]}>{invoice.freight_weight_lbs.toLocaleString()} lbs</Text>
                      </View>
                    )}
                    {invoice.freight_pickup_date && (
                      <View style={styles.freightItem}>
                        <Text style={[styles.freightLabel, { color: themeColors.textMuted }]}>Pickup Date</Text>
                        <Text style={[styles.freightValue, { color: themeColors.textPrimary }]}>{formatDate(invoice.freight_pickup_date)}</Text>
                      </View>
                    )}
                    {invoice.freight_estimated_delivery && (
                      <View style={styles.freightItem}>
                        <Text style={[styles.freightLabel, { color: themeColors.textMuted }]}>Est. Delivery</Text>
                        <Text style={[styles.freightValue, { color: themeColors.textPrimary }]}>{formatDate(invoice.freight_estimated_delivery)}</Text>
                      </View>
                    )}
                  </View>

                  {invoice.freight_special_instructions && (
                    <View style={[styles.freightInstructions, { borderTopColor: themeColors.border }]}>
                      <Text style={[styles.freightLabel, { color: themeColors.textMuted }]}>Special Instructions</Text>
                      <Text style={[styles.freightInstructionsText, { color: themeColors.textSecondary }]}>{invoice.freight_special_instructions}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Delivery Confirmation (if completed) */}
        {invoice.delivery_confirmed_at && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Delivery Confirmation</Text>
            <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
              <View style={styles.deliveryConfirmation}>
                <View style={styles.deliveryConditionRow}>
                  {DELIVERY_CONDITIONS.find(c => c.key === invoice.delivery_condition) && (
                    <>
                      <Feather
                        name={DELIVERY_CONDITIONS.find(c => c.key === invoice.delivery_condition)?.icon || 'check'}
                        size={20}
                        color={DELIVERY_CONDITIONS.find(c => c.key === invoice.delivery_condition)?.color}
                      />
                      <Text style={[
                        styles.deliveryConditionText,
                        { color: DELIVERY_CONDITIONS.find(c => c.key === invoice.delivery_condition)?.color }
                      ]}>
                        {DELIVERY_CONDITIONS.find(c => c.key === invoice.delivery_condition)?.label}
                      </Text>
                    </>
                  )}
                </View>
                <Text style={[styles.deliveryConfirmedDate, { color: themeColors.textMuted }]}>
                  Confirmed {formatRelativeTime(invoice.delivery_confirmed_at)}
                </Text>
                {invoice.delivery_notes && (
                  <Text style={[styles.deliveryNotes, { color: themeColors.textSecondary }]}>{invoice.delivery_notes}</Text>
                )}

                {/* Signed BOL */}
                {invoice.delivery_bol_url ? (
                  <View style={[styles.documentSection, { borderTopColor: themeColors.border }]}>
                    <Text style={[styles.documentLabel, { color: themeColors.textSecondary }]}>Signed Bill of Lading</Text>
                    <TouchableOpacity
                      style={styles.documentPreview}
                      onPress={() => Linking.openURL(invoice.delivery_bol_url!)}
                    >
                      <Image
                        source={invoice.delivery_bol_url}
                        style={styles.documentImage}
                        contentFit="cover"
                      />
                      <View style={styles.documentOverlay}>
                        <Feather name="external-link" size={20} color={colors.white} />
                        <Text style={styles.documentOverlayText}>View Full Size</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                ) : (isBuyer || isSeller) && (
                  <View style={[styles.documentSection, { borderTopColor: themeColors.border }]}>
                    <Text style={[styles.documentLabel, { color: themeColors.textSecondary }]}>Bill of Lading</Text>
                    <Text style={[styles.bolMissingText, { color: themeColors.textMuted }]}>
                      No signed BOL has been attached yet.
                    </Text>
                    <TouchableOpacity
                      style={styles.attachBolButton}
                      onPress={showStandaloneBolOptions}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <ActivityIndicator size="small" color={themeColors.accent} />
                      ) : (
                        <>
                          <Feather name="camera" size={18} color={colors.accent} />
                          <Text style={styles.attachBolButtonText}>Attach Signed BOL</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

                {/* Option to update/replace BOL even if one exists */}
                {invoice.delivery_bol_url && (isBuyer || isSeller) && (
                  <TouchableOpacity
                    style={styles.replaceBolButton}
                    onPress={showStandaloneBolOptions}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <ActivityIndicator size="small" color={colors.textMuted} />
                    ) : (
                      <>
                        <Feather name="refresh-cw" size={14} color={colors.textMuted} />
                        <Text style={styles.replaceBolButtonText}>Replace BOL</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {/* Damage Photos */}
                {invoice.delivery_damage_photos && invoice.delivery_damage_photos.length > 0 && (
                  <View style={[styles.documentSection, { borderTopColor: themeColors.border }]}>
                    <Text style={[styles.documentLabel, { color: themeColors.textSecondary }]}>Damage Documentation</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.damagePhotosScroll}
                    >
                      {invoice.delivery_damage_photos.map((photoUrl, index) => (
                        <TouchableOpacity
                          key={index}
                          style={styles.damagePhotoPreview}
                          onPress={() => Linking.openURL(photoUrl)}
                        >
                          <Image
                            source={photoUrl}
                            style={styles.damagePhotoImage}
                            contentFit="cover"
                          />
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Item Details */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Item</Text>
          <TouchableOpacity style={[styles.itemCard, { backgroundColor: themeColors.surface }]} onPress={handleViewListing}>
            {primaryImage?.url ? (
              <Image source={primaryImage.url} style={styles.itemImage} contentFit="cover" />
            ) : (
              <View style={styles.imagePlaceholder}>
                <Feather name="package" size={24} color={themeColors.textMuted} />
              </View>
            )}
            <View style={styles.itemDetails}>
              <Text style={[styles.itemTitle, { color: themeColors.textPrimary }]} numberOfLines={2}>{invoice.listing?.title || 'Item'}</Text>
              {invoice.listing?.make && invoice.listing?.model && (
                <Text style={[styles.itemMeta, { color: themeColors.textMuted }]}>
                  {invoice.listing.make} {invoice.listing.model} {invoice.listing.year ? `(${invoice.listing.year})` : ''}
                </Text>
              )}
            </View>
            <Feather name="chevron-right" size={20} color={themeColors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Seller Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Seller</Text>
          <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
            <View style={styles.sellerRow}>
              {invoice.seller?.avatar_url ? (
                <Image source={{ uri: invoice.seller.avatar_url }} style={styles.sellerAvatar} contentFit="cover" />
              ) : (
                <View style={styles.sellerAvatarPlaceholder}>
                  <Feather name="user" size={20} color={themeColors.textMuted} />
                </View>
              )}
              <View style={styles.sellerInfo}>
                <Text style={[styles.sellerName, { color: themeColors.textPrimary }]}>{invoice.seller?.company_name || invoice.seller?.full_name}</Text>
                {invoice.seller?.is_verified && (
                  <View style={styles.verifiedBadge}>
                    <Feather name="check-circle" size={12} color={colors.accent} />
                    <Text style={styles.verifiedText}>Verified Seller</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity style={styles.contactButton} onPress={handleContactSeller}>
                <Feather name="message-circle" size={18} color={colors.accent} />
              </TouchableOpacity>
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
            {invoice.packaging_amount > 0 && (
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: themeColors.textSecondary }]}>Packaging</Text>
                <Text style={[styles.priceValue, { color: themeColors.textPrimary }]}>{formatCurrency(invoice.packaging_amount)}</Text>
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
              <Text style={styles.totalValue}>{formatCurrency(invoice.total_amount)}</Text>
            </View>
          </View>
        </View>

        {/* Payment Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Payment</Text>
          <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
            <View style={styles.paymentStatusRow}>
              <View style={[
                styles.paymentStatusBadge,
                { backgroundColor: invoice.status === 'paid' ? colors.successLight : invoice.status === 'awaiting_wire' ? '#dbeafe' : colors.warningLight }
              ]}>
                <Feather
                  name={invoice.status === 'paid' ? 'check-circle' : invoice.status === 'awaiting_wire' ? 'send' : 'clock'}
                  size={16}
                  color={invoice.status === 'paid' ? colors.success : invoice.status === 'awaiting_wire' ? '#2563eb' : colors.warning}
                />
                <Text style={[
                  styles.paymentStatusText,
                  { color: invoice.status === 'paid' ? colors.success : invoice.status === 'awaiting_wire' ? '#2563eb' : colors.warning }
                ]}>
                  {invoice.status === 'paid' ? 'Paid' : invoice.status === 'awaiting_wire' ? 'Awaiting Wire' : 'Awaiting Payment'}
                </Text>
              </View>
            </View>
            {invoice.status === 'pending' && (
              <Text style={[styles.paymentDueText, { color: themeColors.textMuted }]}>
                Payment due by {formatDate(invoice.payment_due_date)}
              </Text>
            )}
            {invoice.status === 'awaiting_wire' && (
              <View style={styles.wireStatusInfo}>
                <Feather name="info" size={14} color={themeColors.textMuted} />
                <Text style={[styles.wireStatusText, { color: themeColors.textMuted }]}>
                  {isSeller
                    ? 'Buyer has initiated wire transfer. Confirm when funds are received in your account.'
                    : 'Wire transfer initiated. Seller will confirm once funds are received.'}
                </Text>
              </View>
            )}
            {invoice.wire_initiated_at && (
              <Text style={[styles.wireInitiatedText, { color: themeColors.textMuted }]}>
                Wire initiated on {formatDate(invoice.wire_initiated_at)}
              </Text>
            )}
            {invoice.paid_at && (
              <Text style={[styles.paidAtText, { color: themeColors.textMuted }]}>
                Paid on {formatDate(invoice.paid_at)}
                {invoice.payment_method && ` via ${invoice.payment_method.replace('_', ' ')}`}
              </Text>
            )}
            {invoice.wire_confirmed_at && invoice.payment_method === 'wire' && (
              <Text style={[styles.wireConfirmedText, { color: themeColors.success }]}>
                Wire confirmed by seller on {formatDate(invoice.wire_confirmed_at)}
                {invoice.wire_reference_number && ` (Ref: ${invoice.wire_reference_number})`}
              </Text>
            )}
          </View>
        </View>

        {/* Notes */}
        {(invoice.seller_notes || invoice.buyer_notes) && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>Notes</Text>
            <View style={[styles.card, { backgroundColor: themeColors.surface }]}>
              {invoice.seller_notes && (
                <View style={styles.noteItem}>
                  <Text style={[styles.noteLabel, { color: themeColors.textMuted }]}>From Seller</Text>
                  <Text style={[styles.noteText, { color: themeColors.textSecondary }]}>{invoice.seller_notes}</Text>
                </View>
              )}
              {invoice.buyer_notes && (
                <View style={styles.noteItem}>
                  <Text style={[styles.noteLabel, { color: themeColors.textMuted }]}>Your Notes</Text>
                  <Text style={[styles.noteText, { color: themeColors.textSecondary }]}>{invoice.buyer_notes}</Text>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Action Footer */}
      {(isPaymentPending || canConfirmDelivery || canConfirmWire || isAwaitingWire || hasSellerAction || canUploadBol) && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: themeColors.surface, borderTopColor: themeColors.border }]}>
          {isPaymentPending && isBuyer && (
            <TouchableOpacity style={styles.payButton} onPress={handlePayNow}>
              <Feather name="credit-card" size={20} color={colors.white} />
              <Text style={styles.payButtonText}>Pay Now - {formatCurrency(invoice.total_amount)}</Text>
            </TouchableOpacity>
          )}
          {canConfirmWire && (
            <TouchableOpacity
              style={[styles.confirmButton, { backgroundColor: '#2563eb' }]}
              onPress={handleConfirmWirePayment}
              disabled={confirmWireMutation.isPending}
            >
              {confirmWireMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Feather name="check-circle" size={20} color={colors.white} />
                  <Text style={styles.confirmButtonText}>Confirm Wire Received</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {isAwaitingWire && isBuyer && (
            <View style={styles.awaitingWireInfo}>
              <Feather name="clock" size={18} color={themeColors.warning} />
              <Text style={[styles.awaitingWireText, { color: themeColors.textSecondary }]}>
                Awaiting wire transfer confirmation from seller
              </Text>
            </View>
          )}

          {/* Buyer Upload BOL/Photos Action - show when shipped but not yet delivered */}
          {canUploadBol && (
            <TouchableOpacity
              style={[styles.sellerActionButton, { backgroundColor: themeColors.accent }]}
              onPress={handleOpenUploadBolModal}
            >
              <Feather name="upload" size={20} color={colors.white} />
              <Text style={styles.sellerActionButtonText}>Upload BOL / Photos</Text>
            </TouchableOpacity>
          )}

          {/* Seller Fulfillment Actions */}
          {canMarkPackaging && (
            <TouchableOpacity
              style={[styles.sellerActionButton, { backgroundColor: themeColors.accent }]}
              onPress={handleMarkPackaging}
              disabled={updateFulfillmentMutation.isPending}
            >
              {updateFulfillmentMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Feather name="package" size={20} color={colors.white} />
                  <Text style={styles.sellerActionButtonText}>Start Packaging</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {canMarkReady && (
            <TouchableOpacity
              style={[styles.sellerActionButton, { backgroundColor: themeColors.accent }]}
              onPress={handleMarkReady}
              disabled={updateFulfillmentMutation.isPending}
            >
              {updateFulfillmentMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Feather name="box" size={20} color={colors.white} />
                  <Text style={styles.sellerActionButtonText}>Mark Ready for Pickup</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {canMarkShipped && (
            <TouchableOpacity
              style={[styles.sellerActionButton, { backgroundColor: themeColors.accent }]}
              onPress={handleMarkShipped}
              disabled={updateFulfillmentMutation.isPending}
            >
              {updateFulfillmentMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Feather name="truck" size={20} color={colors.white} />
                  <Text style={styles.sellerActionButtonText}>Mark as Shipped</Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {canMarkDelivered && (
            <TouchableOpacity
              style={[styles.sellerActionButton, { backgroundColor: colors.success }]}
              onPress={handleMarkDelivered}
              disabled={updateFulfillmentMutation.isPending}
            >
              {updateFulfillmentMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Feather name="home" size={20} color={colors.white} />
                  <Text style={styles.sellerActionButtonText}>Mark as Delivered</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {canConfirmDelivery && (
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmDelivery}>
              <Feather name="check-circle" size={20} color={colors.white} />
              <Text style={styles.confirmButtonText}>Confirm Delivery</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Delivery Confirmation Modal */}
      <Modal
        visible={showDeliveryModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDeliveryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + spacing.lg, backgroundColor: themeColors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Confirm Delivery</Text>
              <TouchableOpacity onPress={() => setShowDeliveryModal(false)}>
                <Feather name="x" size={24} color={themeColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>How did the item arrive?</Text>

            <View style={styles.conditionOptions}>
              {DELIVERY_CONDITIONS.map(condition => (
                <TouchableOpacity
                  key={condition.key}
                  style={[
                    styles.conditionOption,
                    { borderColor: deliveryCondition === condition.key ? condition.color : themeColors.border },
                    deliveryCondition === condition.key && styles.conditionOptionSelected,
                    deliveryCondition === condition.key && { backgroundColor: isDark ? 'rgba(0,0,0,0.2)' : colors.background },
                  ]}
                  onPress={() => {
                    lightTap();
                    setDeliveryCondition(condition.key);
                  }}
                >
                  <Feather name={condition.icon} size={24} color={condition.color} />
                  <Text style={[
                    styles.conditionLabel,
                    { color: deliveryCondition === condition.key ? condition.color : themeColors.textSecondary },
                  ]}>
                    {condition.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Signed BOL Upload */}
            <View style={styles.uploadSection}>
              <Text style={[styles.uploadLabel, { color: themeColors.textPrimary }]}>Signed Bill of Lading (Recommended)</Text>
              <Text style={[styles.uploadDescription, { color: themeColors.textMuted }]}>
                Upload a photo of the signed BOL for your records
              </Text>
              {bolImage ? (
                <View style={styles.uploadedImageContainer}>
                  <Image source={bolImage} style={styles.uploadedImage} contentFit="cover" />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setBolImage(null)}
                  >
                    <Feather name="x" size={16} color={colors.white} />
                  </TouchableOpacity>
                  <View style={styles.imageLabel}>
                    <Feather name="file-text" size={12} color={colors.accent} />
                    <Text style={styles.imageLabelText}>Signed BOL</Text>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadButton} onPress={showBolOptions}>
                  <Feather name="camera" size={24} color={colors.accent} />
                  <Text style={styles.uploadButtonText}>Add Signed BOL</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Damage Photos - Only show if condition is damaged or partial */}
            {(deliveryCondition === 'damaged' || deliveryCondition === 'partial') && (
              <View style={styles.uploadSection}>
                <Text style={[styles.uploadLabel, { color: themeColors.textPrimary }]}>Damage Documentation</Text>
                <Text style={[styles.uploadDescription, { color: themeColors.textMuted }]}>
                  Take photos of any damage for dispute resolution (max 5)
                </Text>
                <View style={styles.damagePhotosGrid}>
                  {damagePhotos.map((photo, index) => (
                    <View key={index} style={styles.damagePhotoContainer}>
                      <Image source={photo} style={styles.damagePhoto} contentFit="cover" />
                      <TouchableOpacity
                        style={styles.removeDamageButton}
                        onPress={() => removeDamagePhoto(index)}
                      >
                        <Feather name="x" size={14} color={colors.white} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {damagePhotos.length < 5 && (
                    <TouchableOpacity
                      style={styles.addDamageButton}
                      onPress={showDamagePhotoOptions}
                    >
                      <Feather name="plus" size={24} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}

            <Text style={[styles.notesLabel, { color: themeColors.textSecondary }]}>
              {deliveryCondition === 'good' ? 'Additional Notes (Optional)' : 'Describe the Issue (Required)'}
            </Text>
            <TextInput
              style={[
                styles.notesInput,
                { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary },
                (deliveryCondition !== 'good' && !deliveryNotes.trim()) && { borderColor: colors.error, borderWidth: 1 },
              ]}
              placeholder={deliveryCondition === 'good'
                ? "Any comments about the delivery..."
                : deliveryCondition === 'damaged'
                  ? "Please describe the damage in detail..."
                  : "Please describe what items are missing or incomplete..."}
              placeholderTextColor={themeColors.textMuted}
              value={deliveryNotes}
              onChangeText={setDeliveryNotes}
              multiline
              numberOfLines={3}
            />

            <TouchableOpacity
              style={[
                styles.submitButton,
                (confirmDeliveryMutation.isPending || isUploading) && styles.submitButtonDisabled
              ]}
              onPress={submitDeliveryConfirmation}
              disabled={confirmDeliveryMutation.isPending || isUploading}
            >
              {confirmDeliveryMutation.isPending || isUploading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.white} />
                  <Text style={styles.submitButtonText}>
                    {isUploading ? 'Uploading...' : 'Confirming...'}
                  </Text>
                </View>
              ) : (
                <>
                  <Feather name="check" size={20} color={colors.white} />
                  <Text style={styles.submitButtonText}>Confirm Delivery</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Shipping Details Modal */}
      <Modal
        visible={showShippingModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowShippingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: themeColors.surface, maxHeight: '92%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Freight Shipping</Text>
              <TouchableOpacity onPress={() => setShowShippingModal(false)}>
                <Feather name="x" size={24} color={themeColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
            >
              {/* Freight Carrier (Required) */}
              <View style={styles.shippingInputGroup}>
                <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>
                  Freight Carrier <Text style={{ color: themeColors.error }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  placeholder="e.g., XPO, Estes, Old Dominion, R+L Carriers..."
                  placeholderTextColor={themeColors.textMuted}
                  value={freightCarrier}
                  onChangeText={setFreightCarrier}
                />
              </View>

              {/* PRO Number and BOL Number */}
              <View style={styles.shippingInputRow}>
                <View style={[styles.shippingInputGroup, { flex: 1, marginRight: spacing.sm }]}>
                  <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>PRO Number</Text>
                  <TextInput
                    style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                    placeholder="PRO #..."
                    placeholderTextColor={themeColors.textMuted}
                    value={freightProNumber}
                    onChangeText={setFreightProNumber}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={[styles.shippingInputGroup, { flex: 1 }]}>
                  <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>BOL Number</Text>
                  <TextInput
                    style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                    placeholder="BOL #..."
                    placeholderTextColor={themeColors.textMuted}
                    value={freightBolNumber}
                    onChangeText={setFreightBolNumber}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              {/* Freight Class */}
              <View style={styles.shippingInputGroup}>
                <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Freight Class</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.freightClassOptions}>
                    {['50', '55', '60', '65', '70', '77.5', '85', '92.5', '100', '110', '125', '150', '175', '200', '250', '300', '400', '500'].map(fc => (
                      <TouchableOpacity
                        key={fc}
                        style={[
                          styles.freightClassOption,
                          { borderColor: freightClass === fc ? themeColors.accent : themeColors.border },
                          freightClass === fc && { backgroundColor: themeColors.accentFaint },
                        ]}
                        onPress={() => {
                          lightTap();
                          setFreightClass(fc);
                        }}
                      >
                        <Text style={[
                          styles.freightClassText,
                          { color: freightClass === fc ? themeColors.accent : themeColors.textSecondary },
                        ]}>
                          {fc}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* Weight */}
              <View style={styles.shippingInputGroup}>
                <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Weight (lbs)</Text>
                <TextInput
                  style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  placeholder="Total shipment weight..."
                  placeholderTextColor={themeColors.textMuted}
                  value={freightWeightLbs}
                  onChangeText={setFreightWeightLbs}
                  keyboardType="numeric"
                />
              </View>

              {/* Pickup Date and Est. Delivery */}
              <View style={styles.shippingInputRow}>
                <View style={[styles.shippingInputGroup, { flex: 1, marginRight: spacing.sm }]}>
                  <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Pickup Date</Text>
                  <TextInput
                    style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                    placeholder="MM/DD/YYYY"
                    placeholderTextColor={themeColors.textMuted}
                    value={freightPickupDate}
                    onChangeText={setFreightPickupDate}
                  />
                </View>
                <View style={[styles.shippingInputGroup, { flex: 1 }]}>
                  <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Est. Delivery</Text>
                  <TextInput
                    style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                    placeholder="MM/DD/YYYY"
                    placeholderTextColor={themeColors.textMuted}
                    value={freightEstimatedDelivery}
                    onChangeText={setFreightEstimatedDelivery}
                  />
                </View>
              </View>

              {/* Pickup Contact Section */}
              <View style={[styles.contactSection, { borderTopColor: themeColors.borderLight }]}>
                <Text style={[styles.contactSectionTitle, { color: themeColors.textPrimary }]}>
                  Pickup Contact
                </Text>
                <View style={styles.shippingInputRow}>
                  <View style={[styles.shippingInputGroup, { flex: 1, marginRight: spacing.sm }]}>
                    <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Name</Text>
                    <TextInput
                      style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                      placeholder="Contact name..."
                      placeholderTextColor={themeColors.textMuted}
                      value={pickupContactName}
                      onChangeText={setPickupContactName}
                    />
                  </View>
                  <View style={[styles.shippingInputGroup, { flex: 1 }]}>
                    <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Company</Text>
                    <TextInput
                      style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                      placeholder="Company name..."
                      placeholderTextColor={themeColors.textMuted}
                      value={pickupContactCompany}
                      onChangeText={setPickupContactCompany}
                    />
                  </View>
                </View>
                <View style={styles.shippingInputRow}>
                  <View style={[styles.shippingInputGroup, { flex: 1, marginRight: spacing.sm }]}>
                    <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Phone</Text>
                    <TextInput
                      style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                      placeholder="Phone number..."
                      placeholderTextColor={themeColors.textMuted}
                      value={pickupContactPhone}
                      onChangeText={setPickupContactPhone}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={[styles.shippingInputGroup, { flex: 1 }]}>
                    <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Email</Text>
                    <TextInput
                      style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                      placeholder="Email address..."
                      placeholderTextColor={themeColors.textMuted}
                      value={pickupContactEmail}
                      onChangeText={setPickupContactEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>

              {/* Delivery Contact Section */}
              <View style={[styles.contactSection, { borderTopColor: themeColors.borderLight }]}>
                <Text style={[styles.contactSectionTitle, { color: themeColors.textPrimary }]}>
                  Delivery Contact
                </Text>
                <View style={styles.shippingInputRow}>
                  <View style={[styles.shippingInputGroup, { flex: 1, marginRight: spacing.sm }]}>
                    <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Name</Text>
                    <TextInput
                      style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                      placeholder="Contact name..."
                      placeholderTextColor={themeColors.textMuted}
                      value={deliveryContactName}
                      onChangeText={setDeliveryContactName}
                    />
                  </View>
                  <View style={[styles.shippingInputGroup, { flex: 1 }]}>
                    <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Company</Text>
                    <TextInput
                      style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                      placeholder="Company name..."
                      placeholderTextColor={themeColors.textMuted}
                      value={deliveryContactCompany}
                      onChangeText={setDeliveryContactCompany}
                    />
                  </View>
                </View>
                <View style={styles.shippingInputRow}>
                  <View style={[styles.shippingInputGroup, { flex: 1, marginRight: spacing.sm }]}>
                    <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Phone</Text>
                    <TextInput
                      style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                      placeholder="Phone number..."
                      placeholderTextColor={themeColors.textMuted}
                      value={deliveryContactPhone}
                      onChangeText={setDeliveryContactPhone}
                      keyboardType="phone-pad"
                    />
                  </View>
                  <View style={[styles.shippingInputGroup, { flex: 1 }]}>
                    <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Email</Text>
                    <TextInput
                      style={[styles.shippingInput, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                      placeholder="Email address..."
                      placeholderTextColor={themeColors.textMuted}
                      value={deliveryContactEmail}
                      onChangeText={setDeliveryContactEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                </View>
              </View>

              {/* Special Instructions */}
              <View style={styles.shippingInputGroup}>
                <Text style={[styles.shippingInputLabel, { color: themeColors.textSecondary }]}>Special Instructions</Text>
                <TextInput
                  style={[styles.shippingInput, styles.shippingTextArea, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.sand, color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  placeholder="Liftgate required, appointment delivery, dock hours, call before delivery..."
                  placeholderTextColor={themeColors.textMuted}
                  value={freightSpecialInstructions}
                  onChangeText={setFreightSpecialInstructions}
                  multiline
                  numberOfLines={3}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.submitButton,
                  !freightCarrier.trim() && styles.submitButtonDisabled,
                  updateFulfillmentMutation.isPending && styles.submitButtonDisabled
                ]}
                onPress={handleSubmitShipping}
                disabled={updateFulfillmentMutation.isPending || !freightCarrier.trim()}
              >
                {updateFulfillmentMutation.isPending ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator color={colors.white} />
                    <Text style={styles.submitButtonText}>Updating...</Text>
                  </View>
                ) : (
                  <>
                    <Feather name="truck" size={20} color={colors.white} />
                    <Text style={styles.submitButtonText}>Mark as Shipped</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Upload BOL/Photos Modal - for buyer pre-delivery upload */}
      <Modal
        visible={showUploadBolModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowUploadBolModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + spacing.lg, backgroundColor: themeColors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Upload Documents</Text>
              <TouchableOpacity onPress={() => setShowUploadBolModal(false)}>
                <Feather name="x" size={24} color={themeColors.textPrimary} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: themeColors.textSecondary }]}>
              Upload your signed Bill of Lading and shipping photos to document the delivery condition.
            </Text>

            {/* Signed BOL Upload */}
            <View style={styles.uploadSection}>
              <Text style={[styles.uploadLabel, { color: themeColors.textPrimary }]}>Signed Bill of Lading</Text>
              <Text style={[styles.uploadDescription, { color: themeColors.textMuted }]}>
                Upload a photo of the signed BOL from the carrier
              </Text>
              {bolImage ? (
                <View style={styles.uploadedImageContainer}>
                  <Image source={bolImage} style={styles.uploadedImage} contentFit="cover" />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setBolImage(null)}
                  >
                    <Feather name="x" size={16} color={colors.white} />
                  </TouchableOpacity>
                  <View style={styles.imageLabel}>
                    <Feather name="file-text" size={12} color={colors.accent} />
                    <Text style={styles.imageLabelText}>Signed BOL</Text>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.uploadButton} onPress={showBolOptions}>
                  <Feather name="camera" size={24} color={colors.accent} />
                  <Text style={styles.uploadButtonText}>Add Signed BOL</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Shipping Photos Upload */}
            <View style={styles.uploadSection}>
              <Text style={[styles.uploadLabel, { color: themeColors.textPrimary }]}>Shipping Photos (Optional)</Text>
              <Text style={[styles.uploadDescription, { color: themeColors.textMuted }]}>
                Document the condition upon arrival (max 5 photos)
              </Text>
              <View style={styles.damagePhotosGrid}>
                {shippingPhotos.map((photo, index) => (
                  <View key={index} style={styles.damagePhotoContainer}>
                    <Image source={photo} style={styles.damagePhoto} contentFit="cover" />
                    <TouchableOpacity
                      style={styles.removeDamageButton}
                      onPress={() => removeShippingPhoto(index)}
                    >
                      <Feather name="x" size={14} color={colors.white} />
                    </TouchableOpacity>
                  </View>
                ))}
                {shippingPhotos.length < 5 && (
                  <TouchableOpacity
                    style={[styles.addDamageButton, { borderColor: themeColors.accent }]}
                    onPress={pickShippingPhoto}
                  >
                    <Feather name="plus" size={24} color={themeColors.accent} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.shippingNote}>
              <Feather name="info" size={16} color={themeColors.textMuted} />
              <Text style={[styles.shippingNoteText, { color: themeColors.textMuted }]}>
                These documents will be saved to your invoice record. You can also upload them during delivery confirmation.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (uploadBolAndPhotosMutation.isPending || isUploading || (!bolImage && shippingPhotos.length === 0)) && styles.submitButtonDisabled
              ]}
              onPress={handleSubmitUploadBol}
              disabled={uploadBolAndPhotosMutation.isPending || isUploading || (!bolImage && shippingPhotos.length === 0)}
            >
              {uploadBolAndPhotosMutation.isPending || isUploading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.white} />
                  <Text style={styles.submitButtonText}>Uploading...</Text>
                </View>
              ) : (
                <>
                  <Feather name="upload" size={20} color={colors.white} />
                  <Text style={styles.submitButtonText}>Upload Documents</Text>
                </>
              )}
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
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  errorText: {
    fontSize: fontSize.lg,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  backButton: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
  },
  backButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },

  // Header
  header: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  invoiceNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  invoiceLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  invoiceNumber: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.textPrimary,
  },
  invoiceDate: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  paidStamp: {
    position: 'absolute',
    right: spacing.lg,
    top: spacing.lg,
    alignItems: 'center',
  },
  paidStampInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.success,
  },
  paidStampText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.success,
    letterSpacing: 1,
  },
  paidStampDate: {
    fontSize: fontSize.xs,
    color: colors.success,
    marginTop: spacing.xs,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accentFaint,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  downloadButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },

  // Sections
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
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },

  // Pipeline
  pipelineCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
  },
  timeline: {},
  timelineItem: {
    flexDirection: 'row',
    minHeight: 60,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 40,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineIconCompleted: {
    backgroundColor: colors.success,
  },
  timelineIconCurrent: {
    backgroundColor: colors.accent,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: colors.sand,
    marginVertical: spacing.xs,
  },
  timelineLineCompleted: {
    backgroundColor: colors.success,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: spacing.md,
    paddingBottom: spacing.lg,
  },
  timelineLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.textLight,
  },
  timelineLabelCompleted: {
    color: colors.textPrimary,
  },
  timelineLabelCurrent: {
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
  timelineDescription: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },
  timelineDate: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // Tracking
  trackingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trackingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  trackingDetails: {},
  carrierName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  trackingNumber: {
    fontSize: fontSize.sm,
    color: colors.accent,
    marginTop: 2,
  },

  // Freight
  freightSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  freightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  freightTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  freightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  freightItem: {
    width: '45%',
  },
  freightLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: 2,
  },
  freightValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  freightInstructions: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  freightInstructionsText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },

  // Delivery Confirmation
  deliveryConfirmation: {},
  deliveryConditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deliveryConditionText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  deliveryConfirmedDate: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  deliveryNotes: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
  bolMissingText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  attachBolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 48,
    backgroundColor: colors.accentFaint,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  attachBolButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  replaceBolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  replaceBolButtonText: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },

  // Item Card
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    ...shadows.sm,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.lg,
  },
  imagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.sand,
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
    color: colors.textPrimary,
  },
  itemMeta: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Seller
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sellerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  sellerAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.sand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  sellerName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  verifiedText: {
    fontSize: fontSize.xs,
    color: colors.accent,
  },
  contactButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentFaint,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Price Breakdown
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  priceLabel: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  priceValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
  },
  totalValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.accent,
  },

  // Payment Status
  paymentStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  paymentStatusText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  paymentDueText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  paidAtText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  wireStatusInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  wireStatusText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  wireInitiatedText: {
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
  wireConfirmedText: {
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },

  // Notes
  noteItem: {
    marginBottom: spacing.md,
  },
  noteLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  noteText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.lg,
  },
  payButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    backgroundColor: colors.success,
    borderRadius: borderRadius.lg,
  },
  confirmButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  awaitingWireInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  awaitingWireText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    padding: spacing.lg,
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
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  conditionOptions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  conditionOption: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  conditionOptionSelected: {
    backgroundColor: colors.background,
  },
  conditionLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  notesLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  notesInput: {
    backgroundColor: colors.sand,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.lg,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    backgroundColor: colors.success,
    borderRadius: borderRadius.lg,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  // Upload Section
  uploadSection: {
    marginBottom: spacing.lg,
  },
  uploadLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  uploadDescription: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 80,
    backgroundColor: colors.accentFaint,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  uploadButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },
  uploadedImageContainer: {
    position: 'relative',
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  uploadedImage: {
    width: '100%',
    height: 150,
    borderRadius: borderRadius.xl,
  },
  removeImageButton: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageLabel: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  imageLabelText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: colors.accent,
  },

  // Damage Photos Grid
  damagePhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  damagePhotoContainer: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  damagePhoto: {
    width: '100%',
    height: '100%',
  },
  removeDamageButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addDamageButton: {
    width: 80,
    height: 80,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.error,
    borderStyle: 'dashed',
    backgroundColor: colors.errorLight,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Document Display (for completed deliveries)
  documentSection: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  documentLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  documentPreview: {
    position: 'relative',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  documentImage: {
    width: '100%',
    height: 180,
  },
  documentOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingVertical: spacing.md,
  },
  documentOverlayText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.white,
  },
  damagePhotosScroll: {
    marginHorizontal: -spacing.xs,
  },
  damagePhotoPreview: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.lg,
    marginHorizontal: spacing.xs,
    overflow: 'hidden',
  },
  damagePhotoImage: {
    width: '100%',
    height: '100%',
  },

  // Seller Action Buttons
  sellerActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: borderRadius.lg,
  },
  sellerActionButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },

  // Shipping Modal
  shippingInputGroup: {
    marginBottom: spacing.lg,
  },
  shippingInputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  carrierOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  carrierOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  carrierOptionText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  shippingInput: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    fontSize: fontSize.base,
  },
  shippingTextArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  shippingInputRow: {
    flexDirection: 'row',
  },
  shippingNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.sand,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  shippingNoteText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },

  // Freight Class Options
  freightClassScroll: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  freightClassOptions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  freightClassOption: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 48,
    alignItems: 'center',
  },
  freightClassText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },

  // Modal Scroll Wrapper (for long forms like freight shipping)
  modalScrollWrapper: {
    maxHeight: '90%',
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  modalScrollContent: {
    flex: 1,
  },

  // Contact Section Styles
  contactSection: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  contactSectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.md,
  },
});
