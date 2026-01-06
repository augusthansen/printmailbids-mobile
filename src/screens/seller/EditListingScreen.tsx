import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  Listing,
  ListingImage,
  ListingType,
  EquipmentStatus,
  DeinstallResponsibility,
  OnsiteAssistance,
  UserAddress,
  Category,
} from '../../types/database';
import { DashboardStackParamList } from '../../navigation/types';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { lightTap, mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';

type Props = NativeStackScreenProps<DashboardStackParamList, 'EditListing'>;

interface ListingFormData {
  title: string;
  description: string;
  seller_terms: string;
  listing_type: ListingType;
  starting_price: string;
  reserve_price: string;
  buy_now_price: string;
  fixed_price: string;
  accept_offers: boolean;
  auto_accept_price: string;
  auto_decline_price: string;
  // Timing
  auction_duration_days: string;
  schedule_start: 'now' | 'scheduled';
  scheduled_start_days: string;
  make: string;
  model: string;
  year: string;
  serial_number: string;
  condition: string;
  hours_count: string;
  equipment_status: EquipmentStatus | '';
  weight_lbs: string;
  length_inches: string;
  width_inches: string;
  height_inches: string;
  floor_length_ft: string;
  floor_width_ft: string;
  electrical_requirements: string;
  air_requirements_psi: string;
  deinstall_responsibility: DeinstallResponsibility;
  deinstall_fee: string;
  onsite_assistance: OnsiteAssistance;
  location_id: string;
  removal_deadline: string;
  pickup_hours: string;
  pickup_notes: string;
  payment_due_days: string;
  accepts_credit_card: boolean;
  accepts_ach: boolean;
  accepts_wire: boolean;
  accepts_check: boolean;
}

const LISTING_TYPES: { key: ListingType; label: string; description: string }[] = [
  { key: 'auction', label: 'Auction', description: 'Competitive bidding with reserve option' },
  { key: 'make_offer', label: 'Make An Offer', description: 'Accept offers from buyers' },
  { key: 'auction_with_offers', label: 'Auction & Make An Offer', description: 'Bidding plus direct offers' },
];

const EQUIPMENT_STATUSES: { key: EquipmentStatus; label: string }[] = [
  { key: 'in_production', label: 'In Production' },
  { key: 'installed_idle', label: 'Installed (Idle)' },
  { key: 'needs_deinstall', label: 'Needs De-installation' },
  { key: 'deinstalled', label: 'Already De-installed' },
  { key: 'broken_down', label: 'Broken Down' },
  { key: 'palletized', label: 'Palletized' },
  { key: 'crated', label: 'Crated' },
];

const CONDITIONS = [
  'New',
  'Like New',
  'Excellent',
  'Good',
  'Fair',
  'As-Is',
  'For Parts',
];

const DEINSTALL_OPTIONS: { key: DeinstallResponsibility; label: string }[] = [
  { key: 'buyer', label: 'Buyer Responsible' },
  { key: 'seller_included', label: 'Seller Will Handle (Included)' },
  { key: 'seller_additional_fee', label: 'Seller Available (Additional Fee)' },
];

const ASSISTANCE_OPTIONS: { key: OnsiteAssistance; label: string }[] = [
  { key: 'full_assistance', label: 'Full Assistance Available' },
  { key: 'forklift_available', label: 'Forklift Available' },
  { key: 'limited_assistance', label: 'Limited Assistance' },
  { key: 'no_assistance', label: 'No On-site Assistance' },
];

const AUCTION_DURATIONS: { key: string; label: string; days: number }[] = [
  { key: '3', label: '3 Days', days: 3 },
  { key: '5', label: '5 Days', days: 5 },
  { key: '7', label: '7 Days', days: 7 },
  { key: '10', label: '10 Days', days: 10 },
  { key: '14', label: '14 Days', days: 14 },
  { key: '21', label: '21 Days', days: 21 },
  { key: '30', label: '30 Days', days: 30 },
];

export default function EditListingScreen({ route, navigation }: Props) {
  const { listingId } = route.params;
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();

  const [isSaving, setIsSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('basic');
  const [images, setImages] = useState<ListingImage[]>([]);
  const [formData, setFormData] = useState<ListingFormData>({
    title: '',
    description: '',
    seller_terms: '',
    listing_type: 'auction',
    starting_price: '',
    reserve_price: '',
    buy_now_price: '',
    fixed_price: '',
    accept_offers: false,
    auto_accept_price: '',
    auto_decline_price: '',
    auction_duration_days: '7',
    schedule_start: 'now',
    scheduled_start_days: '1',
    make: '',
    model: '',
    year: '',
    serial_number: '',
    condition: '',
    hours_count: '',
    equipment_status: '',
    weight_lbs: '',
    length_inches: '',
    width_inches: '',
    height_inches: '',
    floor_length_ft: '',
    floor_width_ft: '',
    electrical_requirements: '',
    air_requirements_psi: '',
    deinstall_responsibility: 'buyer',
    deinstall_fee: '',
    onsite_assistance: 'limited_assistance',
    location_id: '',
    removal_deadline: '',
    pickup_hours: '',
    pickup_notes: '',
    payment_due_days: '7',
    accepts_credit_card: true,
    accepts_ach: true,
    accepts_wire: true,
    accepts_check: false,
  });

  // Fetch listing data
  const { data: listing, isLoading } = useQuery({
    queryKey: ['editListing', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          images:listing_images(*)
        `)
        .eq('id', listingId)
        .single();

      if (error) throw error;
      return data as Listing & { images: ListingImage[] };
    },
  });

  // Fetch user addresses for location selection
  const { data: addresses } = useQuery({
    queryKey: ['userAddresses', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_addresses')
        .select('*')
        .eq('user_id', user.id)
        .order('is_default', { ascending: false });

      if (error) throw error;
      return data as UserAddress[];
    },
    enabled: !!user,
  });

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      return data as Category[];
    },
  });

  // Populate form with listing data
  useEffect(() => {
    if (listing) {
      setFormData({
        title: listing.title || '',
        description: listing.description || '',
        seller_terms: listing.seller_terms || '',
        listing_type: listing.listing_type,
        starting_price: listing.starting_price?.toString() || '',
        reserve_price: listing.reserve_price?.toString() || '',
        buy_now_price: listing.buy_now_price?.toString() || '',
        fixed_price: listing.fixed_price?.toString() || '',
        accept_offers: listing.accept_offers,
        auto_accept_price: listing.auto_accept_price?.toString() || '',
        auto_decline_price: listing.auto_decline_price?.toString() || '',
        make: listing.make || '',
        model: listing.model || '',
        year: listing.year?.toString() || '',
        serial_number: listing.serial_number || '',
        condition: listing.condition || '',
        hours_count: listing.hours_count?.toString() || '',
        equipment_status: listing.equipment_status || '',
        weight_lbs: listing.weight_lbs?.toString() || '',
        length_inches: listing.length_inches?.toString() || '',
        width_inches: listing.width_inches?.toString() || '',
        height_inches: listing.height_inches?.toString() || '',
        floor_length_ft: listing.floor_length_ft?.toString() || '',
        floor_width_ft: listing.floor_width_ft?.toString() || '',
        electrical_requirements: listing.electrical_requirements || '',
        air_requirements_psi: listing.air_requirements_psi?.toString() || '',
        deinstall_responsibility: listing.deinstall_responsibility,
        deinstall_fee: listing.deinstall_fee?.toString() || '',
        onsite_assistance: listing.onsite_assistance,
        location_id: listing.location_id || '',
        removal_deadline: listing.removal_deadline || '',
        pickup_hours: listing.pickup_hours || '',
        pickup_notes: listing.pickup_notes || '',
        payment_due_days: listing.payment_due_days?.toString() || '7',
        accepts_credit_card: listing.accepts_credit_card,
        accepts_ach: listing.accepts_ach,
        accepts_wire: listing.accepts_wire,
        accepts_check: listing.accepts_check,
      });
      setImages(listing.images?.sort((a, b) => a.sort_order - b.sort_order) || []);
    }
  }, [listing]);

  const updateField = (field: keyof ListingFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Please enter a title for your listing');
      return;
    }

    setIsSaving(true);
    mediumTap();

    try {
      const hasAuction = formData.listing_type === 'auction' || formData.listing_type === 'auction_with_offers';
      const isEnded = listing?.status === 'ended' || listing?.status === 'expired' ||
        (listing?.end_time && new Date(listing.end_time) < new Date());

      // Only include fields that exist in the actual database schema
      // Many fields in the TypeScript types don't exist in the DB yet
      const updateData: Record<string, unknown> = {
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        listing_type: formData.listing_type,
        starting_price: formData.starting_price ? parseFloat(formData.starting_price) : null,
        reserve_price: formData.reserve_price ? parseFloat(formData.reserve_price) : null,
        accept_offers: formData.accept_offers,
        auto_accept_price: formData.auto_accept_price ? parseFloat(formData.auto_accept_price) : null,
        auto_decline_price: formData.auto_decline_price ? parseFloat(formData.auto_decline_price) : null,
        make: formData.make.trim() || null,
        model: formData.model.trim() || null,
        year: formData.year ? parseInt(formData.year) : null,
        serial_number: formData.serial_number.trim() || null,
        condition: formData.condition || null,
        updated_at: new Date().toISOString(),
      };

      // Handle relisting / timing changes for auction listings
      if (hasAuction) {
        const durationDays = parseInt(formData.auction_duration_days) || 7;
        let startDate = new Date();

        if (formData.schedule_start === 'scheduled') {
          // Schedule for later
          const scheduledDays = parseInt(formData.scheduled_start_days) || 1;
          startDate.setDate(startDate.getDate() + scheduledDays);
          updateData.status = 'scheduled';
        } else {
          // Start immediately
          updateData.status = 'active';
        }

        // Calculate end date
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + durationDays);

        updateData.start_time = startDate.toISOString();
        updateData.end_time = endDate.toISOString();

        // Reset bid-related fields when relisting
        if (isEnded) {
          updateData.current_price = null;
          updateData.bid_count = 0;
          updateData.winning_bid_id = null;
        }
      }

      const { error } = await supabase
        .from('listings')
        .update(updateData)
        .eq('id', listingId);

      if (error) throw error;

      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['myListings'] });
      queryClient.invalidateQueries({ queryKey: ['listing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['editListing', listingId] });
      queryClient.invalidateQueries({ queryKey: ['activeListings'] });
      queryClient.invalidateQueries({ queryKey: ['endingSoonListings'] });

      const successMessage = isEnded && hasAuction
        ? formData.schedule_start === 'scheduled'
          ? 'Listing scheduled for relisting!'
          : 'Listing relisted successfully!'
        : 'Listing updated successfully';

      Alert.alert('Success', successMessage, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error updating listing:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to update listing. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      // TODO: Upload images to Supabase storage
      Alert.alert('Coming Soon', 'Image upload will be implemented with Supabase storage.');
    }
  };

  const handleRemoveImage = (imageId: string) => {
    Alert.alert(
      'Remove Image',
      'Are you sure you want to remove this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('listing_images')
                .delete()
                .eq('id', imageId);

              if (error) throw error;

              setImages(prev => prev.filter(img => img.id !== imageId));
              successFeedback();
            } catch (error) {
              console.error('Error removing image:', error);
              errorFeedback();
              Alert.alert('Error', 'Failed to remove image');
            }
          },
        },
      ]
    );
  };

  const handleSetPrimaryImage = async (imageId: string) => {
    try {
      // First, unset all primary images
      await supabase
        .from('listing_images')
        .update({ is_primary: false })
        .eq('listing_id', listingId);

      // Then set the selected image as primary
      await supabase
        .from('listing_images')
        .update({ is_primary: true })
        .eq('id', imageId);

      setImages(prev =>
        prev.map(img => ({
          ...img,
          is_primary: img.id === imageId,
        }))
      );
      successFeedback();
    } catch (error) {
      console.error('Error setting primary image:', error);
      errorFeedback();
    }
  };

  const renderSectionTab = (key: string, label: string, icon: keyof typeof Feather.glyphMap) => (
    <TouchableOpacity
      key={key}
      style={[
        styles.sectionTab,
        activeSection === key && { backgroundColor: themeColors.accent },
      ]}
      onPress={() => {
        lightTap();
        setActiveSection(key);
      }}
    >
      <Feather
        name={icon}
        size={16}
        color={activeSection === key ? '#ffffff' : themeColors.textMuted}
      />
      <Text
        style={[
          styles.sectionTabText,
          { color: activeSection === key ? '#ffffff' : themeColors.textMuted },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  const renderBasicSection = () => (
    <View style={styles.sectionContent}>
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Title *</Text>
        <TextInput
          style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.title}
          onChangeText={(v) => updateField('title', v)}
          placeholder="e.g., 2020 Heidelberg Speedmaster XL 106"
          placeholderTextColor={themeColors.textLight}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Description</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.description}
          onChangeText={(v) => updateField('description', v)}
          placeholder="Describe the equipment, its features, and condition..."
          placeholderTextColor={themeColors.textLight}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Listing Type</Text>
        <View style={styles.optionsGrid}>
          {LISTING_TYPES.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.optionCard,
                { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                formData.listing_type === type.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                lightTap();
                updateField('listing_type', type.key);
              }}
            >
              <Text style={[styles.optionLabel, { color: themeColors.textPrimary }]}>{type.label}</Text>
              <Text style={[styles.optionDescription, { color: themeColors.textMuted }]}>{type.description}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Seller Terms</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.seller_terms}
          onChangeText={(v) => updateField('seller_terms', v)}
          placeholder="Any specific terms or conditions for this listing..."
          placeholderTextColor={themeColors.textLight}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>
    </View>
  );

  const renderPricingSection = () => {
    const hasAuction = formData.listing_type === 'auction' || formData.listing_type === 'auction_with_offers';
    const hasOffers = formData.listing_type === 'make_offer' || formData.listing_type === 'auction_with_offers';

    return (
      <View style={styles.sectionContent}>
        {hasAuction && (
          <>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Starting Price *</Text>
              <View style={styles.currencyInput}>
                <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
                <TextInput
                  style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.starting_price}
                  onChangeText={(v) => updateField('starting_price', v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Reserve Price (Optional)</Text>
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                Minimum price you'll accept. Hidden from buyers.
              </Text>
              <View style={styles.currencyInput}>
                <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
                <TextInput
                  style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.reserve_price}
                  onChangeText={(v) => updateField('reserve_price', v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </>
        )}

        {formData.listing_type === 'make_offer' && (
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.textPrimary }]}>Asking Price (Optional)</Text>
            <Text style={[styles.hint, { color: themeColors.textMuted }]}>
              Set an asking price to guide buyers. Leave blank to accept any offer.
            </Text>
            <View style={styles.currencyInput}>
              <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
              <TextInput
                style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                value={formData.fixed_price}
                onChangeText={(v) => updateField('fixed_price', v.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                placeholderTextColor={themeColors.textLight}
                keyboardType="decimal-pad"
              />
            </View>
          </View>
        )}

        {hasOffers && (
          <>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Auto-Accept Above (Optional)</Text>
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                Automatically accept offers at or above this amount
              </Text>
              <View style={styles.currencyInput}>
                <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
                <TextInput
                  style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.auto_accept_price}
                  onChangeText={(v) => updateField('auto_accept_price', v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Auto-Decline Below (Optional)</Text>
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                Automatically decline offers below this amount
              </Text>
              <View style={styles.currencyInput}>
                <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
                <TextInput
                  style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.auto_decline_price}
                  onChangeText={(v) => updateField('auto_decline_price', v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </>
        )}

        <View style={[styles.infoCard, { backgroundColor: themeColors.accentFaint }]}>
          <Feather name="info" size={16} color={themeColors.accent} />
          <Text style={[styles.infoText, { color: themeColors.accent }]}>
            An 8% buyer premium will be added to the final sale price.
          </Text>
        </View>
      </View>
    );
  };

  const renderTimingSection = () => {
    const hasAuction = formData.listing_type === 'auction' || formData.listing_type === 'auction_with_offers';
    const isEnded = listing?.status === 'ended' || listing?.status === 'expired' ||
      (listing?.end_time && new Date(listing.end_time) < new Date());
    const isActive = listing?.status === 'active';

    // Calculate what the end date would be with current settings
    const getPreviewEndDate = () => {
      const durationDays = parseInt(formData.auction_duration_days) || 7;
      let startDate = new Date();

      if (formData.schedule_start === 'scheduled') {
        const scheduledDays = parseInt(formData.scheduled_start_days) || 1;
        startDate.setDate(startDate.getDate() + scheduledDays);
      }

      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays);

      return endDate.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    };

    return (
      <View style={styles.sectionContent}>
        {/* Show current status for ended listings */}
        {isEnded && (
          <View style={[styles.statusBanner, { backgroundColor: colors.error + '15' }]}>
            <Feather name="alert-circle" size={20} color={colors.error} />
            <View style={styles.statusBannerContent}>
              <Text style={[styles.statusBannerTitle, { color: colors.error }]}>
                Auction Ended
              </Text>
              <Text style={[styles.statusBannerText, { color: themeColors.textMuted }]}>
                Set new timing below to relist this item
              </Text>
            </View>
          </View>
        )}

        {/* Show current end time for active auctions */}
        {isActive && listing?.end_time && (
          <View style={[styles.statusBanner, { backgroundColor: themeColors.accent + '15' }]}>
            <Feather name="clock" size={20} color={themeColors.accent} />
            <View style={styles.statusBannerContent}>
              <Text style={[styles.statusBannerTitle, { color: themeColors.accent }]}>
                Currently Active
              </Text>
              <Text style={[styles.statusBannerText, { color: themeColors.textMuted }]}>
                Ends {new Date(listing.end_time).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        )}

        {hasAuction && (
          <>
            {/* When to Start */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>
                {isEnded ? 'When to Relist' : 'When to Start'}
              </Text>
              <View style={styles.optionsGrid}>
                <TouchableOpacity
                  style={[
                    styles.optionCard,
                    { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                    formData.schedule_start === 'now' && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                  ]}
                  onPress={() => {
                    lightTap();
                    updateField('schedule_start', 'now');
                  }}
                >
                  <View style={styles.optionRow}>
                    <Feather name="zap" size={18} color={formData.schedule_start === 'now' ? themeColors.accent : themeColors.textMuted} />
                    <Text style={[styles.optionLabel, { color: themeColors.textPrimary, marginBottom: 0 }]}>Start Immediately</Text>
                  </View>
                  <Text style={[styles.optionDescription, { color: themeColors.textMuted }]}>
                    Auction begins as soon as you save
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.optionCard,
                    { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                    formData.schedule_start === 'scheduled' && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                  ]}
                  onPress={() => {
                    lightTap();
                    updateField('schedule_start', 'scheduled');
                  }}
                >
                  <View style={styles.optionRow}>
                    <Feather name="calendar" size={18} color={formData.schedule_start === 'scheduled' ? themeColors.accent : themeColors.textMuted} />
                    <Text style={[styles.optionLabel, { color: themeColors.textPrimary, marginBottom: 0 }]}>Schedule for Later</Text>
                  </View>
                  <Text style={[styles.optionDescription, { color: themeColors.textMuted }]}>
                    Set when the auction should begin
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Schedule delay (if scheduled) */}
            {formData.schedule_start === 'scheduled' && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: themeColors.textPrimary }]}>Start In</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                  {[
                    { key: '1', label: '1 Day' },
                    { key: '2', label: '2 Days' },
                    { key: '3', label: '3 Days' },
                    { key: '5', label: '5 Days' },
                    { key: '7', label: '1 Week' },
                  ].map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[
                        styles.chip,
                        { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                        formData.scheduled_start_days === option.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                      ]}
                      onPress={() => {
                        lightTap();
                        updateField('scheduled_start_days', option.key);
                      }}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: formData.scheduled_start_days === option.key ? themeColors.accent : themeColors.textSecondary },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Auction Duration */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Auction Duration</Text>
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                How long the auction will run once started
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {AUCTION_DURATIONS.map((duration) => (
                  <TouchableOpacity
                    key={duration.key}
                    style={[
                      styles.chip,
                      { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                      formData.auction_duration_days === duration.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                    ]}
                    onPress={() => {
                      lightTap();
                      updateField('auction_duration_days', duration.key);
                    }}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: formData.auction_duration_days === duration.key ? themeColors.accent : themeColors.textSecondary },
                      ]}
                    >
                      {duration.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Preview of end date */}
            <View style={[styles.previewCard, { backgroundColor: themeColors.sand }]}>
              <Feather name="calendar" size={18} color={themeColors.textMuted} />
              <View style={styles.previewContent}>
                <Text style={[styles.previewLabel, { color: themeColors.textMuted }]}>
                  {isEnded ? 'New auction will end' : 'Auction will end'}
                </Text>
                <Text style={[styles.previewValue, { color: themeColors.textPrimary }]}>
                  {getPreviewEndDate()}
                </Text>
              </View>
            </View>
          </>
        )}

        {!hasAuction && (
          <View style={[styles.infoCard, { backgroundColor: themeColors.sand }]}>
            <Feather name="info" size={16} color={themeColors.textMuted} />
            <Text style={[styles.infoText, { color: themeColors.textMuted }]}>
              Timing settings are only applicable for auction listings. Your "Make An Offer" listing will remain active until you manually end it or accept an offer.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderEquipmentSection = () => (
    <View style={styles.sectionContent}>
      <View style={styles.inputRow}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Make</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.make}
            onChangeText={(v) => updateField('make', v)}
            placeholder="e.g., Heidelberg"
            placeholderTextColor={themeColors.textLight}
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Model</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.model}
            onChangeText={(v) => updateField('model', v)}
            placeholder="e.g., Speedmaster XL 106"
            placeholderTextColor={themeColors.textLight}
          />
        </View>
      </View>

      <View style={styles.inputRow}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Year</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.year}
            onChangeText={(v) => updateField('year', v.replace(/[^0-9]/g, ''))}
            placeholder="e.g., 2020"
            placeholderTextColor={themeColors.textLight}
            keyboardType="number-pad"
            maxLength={4}
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Serial Number</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.serial_number}
            onChangeText={(v) => updateField('serial_number', v)}
            placeholder="Optional"
            placeholderTextColor={themeColors.textLight}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Condition</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {CONDITIONS.map((condition) => (
            <TouchableOpacity
              key={condition}
              style={[
                styles.chip,
                { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                formData.condition === condition && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                lightTap();
                updateField('condition', condition);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: formData.condition === condition ? themeColors.accent : themeColors.textSecondary },
                ]}
              >
                {condition}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Equipment Status</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {EQUIPMENT_STATUSES.map((status) => (
            <TouchableOpacity
              key={status.key}
              style={[
                styles.chip,
                { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                formData.equipment_status === status.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                lightTap();
                updateField('equipment_status', status.key);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: formData.equipment_status === status.key ? themeColors.accent : themeColors.textSecondary },
                ]}
              >
                {status.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.inputRow}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Hours Count</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.hours_count}
            onChangeText={(v) => updateField('hours_count', v.replace(/[^0-9]/g, ''))}
            placeholder="e.g., 12500"
            placeholderTextColor={themeColors.textLight}
            keyboardType="number-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Weight (lbs)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.weight_lbs}
            onChangeText={(v) => updateField('weight_lbs', v.replace(/[^0-9.]/g, ''))}
            placeholder="e.g., 5000"
            placeholderTextColor={themeColors.textLight}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <Text style={[styles.subheading, { color: themeColors.textPrimary }]}>Dimensions (inches)</Text>
      <View style={styles.inputRow}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textMuted }]}>Length</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.length_inches}
            onChangeText={(v) => updateField('length_inches', v.replace(/[^0-9.]/g, ''))}
            placeholder="L"
            placeholderTextColor={themeColors.textLight}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textMuted }]}>Width</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.width_inches}
            onChangeText={(v) => updateField('width_inches', v.replace(/[^0-9.]/g, ''))}
            placeholder="W"
            placeholderTextColor={themeColors.textLight}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textMuted }]}>Height</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.height_inches}
            onChangeText={(v) => updateField('height_inches', v.replace(/[^0-9.]/g, ''))}
            placeholder="H"
            placeholderTextColor={themeColors.textLight}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Electrical Requirements</Text>
        <TextInput
          style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.electrical_requirements}
          onChangeText={(v) => updateField('electrical_requirements', v)}
          placeholder="e.g., 480V 3-Phase"
          placeholderTextColor={themeColors.textLight}
        />
      </View>
    </View>
  );

  const renderLogisticsSection = () => (
    <View style={styles.sectionContent}>
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Equipment Location</Text>
        {addresses && addresses.length > 0 ? (
          <View style={styles.addressList}>
            {addresses.map((address) => (
              <TouchableOpacity
                key={address.id}
                style={[
                  styles.addressCard,
                  { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                  formData.location_id === address.id && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                ]}
                onPress={() => {
                  lightTap();
                  updateField('location_id', address.id);
                }}
              >
                <View style={styles.addressContent}>
                  <Text style={[styles.addressLabel, { color: themeColors.textPrimary }]}>
                    {address.label || 'Address'}
                  </Text>
                  <Text style={[styles.addressText, { color: themeColors.textSecondary }]}>
                    {address.city}, {address.state}
                  </Text>
                </View>
                {formData.location_id === address.id && (
                  <Feather name="check-circle" size={20} color={themeColors.accent} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyAddresses, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
            <Feather name="map-pin" size={24} color={themeColors.textLight} />
            <Text style={[styles.emptyAddressesText, { color: themeColors.textMuted }]}>
              No addresses found. Add an address in your profile.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>De-installation</Text>
        {DEINSTALL_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.radioOption,
              { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
              formData.deinstall_responsibility === option.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
            ]}
            onPress={() => {
              lightTap();
              updateField('deinstall_responsibility', option.key);
            }}
          >
            <View style={[
              styles.radio,
              { borderColor: formData.deinstall_responsibility === option.key ? themeColors.accent : themeColors.border },
            ]}>
              {formData.deinstall_responsibility === option.key && (
                <View style={[styles.radioInner, { backgroundColor: themeColors.accent }]} />
              )}
            </View>
            <Text style={[styles.radioLabel, { color: themeColors.textPrimary }]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {formData.deinstall_responsibility === 'seller_additional_fee' && (
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>De-installation Fee</Text>
          <View style={styles.currencyInput}>
            <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
            <TextInput
              style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
              value={formData.deinstall_fee}
              onChangeText={(v) => updateField('deinstall_fee', v.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={themeColors.textLight}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>On-site Assistance</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {ASSISTANCE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.chip,
                { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                formData.onsite_assistance === option.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                lightTap();
                updateField('onsite_assistance', option.key);
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: formData.onsite_assistance === option.key ? themeColors.accent : themeColors.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Pickup Hours</Text>
        <TextInput
          style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.pickup_hours}
          onChangeText={(v) => updateField('pickup_hours', v)}
          placeholder="e.g., Mon-Fri 8am-5pm"
          placeholderTextColor={themeColors.textLight}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Pickup Notes</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.pickup_notes}
          onChangeText={(v) => updateField('pickup_notes', v)}
          placeholder="Any special instructions for pickup..."
          placeholderTextColor={themeColors.textLight}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>
    </View>
  );

  const renderImagesSection = () => (
    <View style={styles.sectionContent}>
      <View style={styles.imagesGrid}>
        {images.map((image) => (
          <View key={image.id} style={styles.imageItem}>
            <Image source={{ uri: image.url }} style={styles.imageThumbnail} contentFit="cover" />
            {image.is_primary && (
              <View style={[styles.primaryBadge, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.primaryBadgeText}>Primary</Text>
              </View>
            )}
            <View style={styles.imageActions}>
              {!image.is_primary && (
                <TouchableOpacity
                  style={[styles.imageActionButton, { backgroundColor: themeColors.accent }]}
                  onPress={() => handleSetPrimaryImage(image.id)}
                >
                  <Feather name="star" size={14} color="#ffffff" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.imageActionButton, { backgroundColor: colors.error }]}
                onPress={() => handleRemoveImage(image.id)}
              >
                <Feather name="trash-2" size={14} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity
          style={[styles.addImageButton, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}
          onPress={handleAddImage}
        >
          <Feather name="plus" size={32} color={themeColors.textLight} />
          <Text style={[styles.addImageText, { color: themeColors.textMuted }]}>Add Photo</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.infoCard, { backgroundColor: themeColors.sand }]}>
        <Feather name="info" size={16} color={themeColors.textMuted} />
        <Text style={[styles.infoText, { color: themeColors.textMuted }]}>
          Add multiple photos to showcase your equipment. The primary image will be shown in search results.
        </Text>
      </View>
    </View>
  );

  const renderPaymentSection = () => (
    <View style={styles.sectionContent}>
      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Payment Due (Days)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.payment_due_days}
          onChangeText={(v) => updateField('payment_due_days', v.replace(/[^0-9]/g, ''))}
          placeholder="7"
          placeholderTextColor={themeColors.textLight}
          keyboardType="number-pad"
        />
      </View>

      <Text style={[styles.label, { color: themeColors.textPrimary, marginBottom: spacing.md }]}>
        Accepted Payment Methods
      </Text>

      <View style={[styles.toggleRow, { borderBottomColor: themeColors.borderLight }]}>
        <View style={styles.toggleContent}>
          <Feather name="credit-card" size={18} color={themeColors.textMuted} />
          <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>Credit Card</Text>
        </View>
        <Switch
          value={formData.accepts_credit_card}
          onValueChange={(v) => updateField('accepts_credit_card', v)}
          trackColor={{ false: themeColors.border, true: themeColors.accent }}
          thumbColor="#ffffff"
        />
      </View>

      <View style={[styles.toggleRow, { borderBottomColor: themeColors.borderLight }]}>
        <View style={styles.toggleContent}>
          <Feather name="dollar-sign" size={18} color={themeColors.textMuted} />
          <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>ACH Transfer</Text>
        </View>
        <Switch
          value={formData.accepts_ach}
          onValueChange={(v) => updateField('accepts_ach', v)}
          trackColor={{ false: themeColors.border, true: themeColors.accent }}
          thumbColor="#ffffff"
        />
      </View>

      <View style={[styles.toggleRow, { borderBottomColor: themeColors.borderLight }]}>
        <View style={styles.toggleContent}>
          <Feather name="send" size={18} color={themeColors.textMuted} />
          <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>Wire Transfer</Text>
        </View>
        <Switch
          value={formData.accepts_wire}
          onValueChange={(v) => updateField('accepts_wire', v)}
          trackColor={{ false: themeColors.border, true: themeColors.accent }}
          thumbColor="#ffffff"
        />
      </View>

      <View style={[styles.toggleRow, { borderBottomColor: themeColors.borderLight }]}>
        <View style={styles.toggleContent}>
          <Feather name="file-text" size={18} color={themeColors.textMuted} />
          <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>Check</Text>
        </View>
        <Switch
          value={formData.accepts_check}
          onValueChange={(v) => updateField('accepts_check', v)}
          trackColor={{ false: themeColors.border, true: themeColors.accent }}
          thumbColor="#ffffff"
        />
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Section Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.sectionTabs, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderBottomColor: themeColors.borderLight }]}
        contentContainerStyle={styles.sectionTabsContent}
      >
        {renderSectionTab('basic', 'Basic', 'file-text')}
        {renderSectionTab('pricing', 'Pricing', 'dollar-sign')}
        {renderSectionTab('timing', 'Timing', 'clock')}
        {renderSectionTab('equipment', 'Equipment', 'tool')}
        {renderSectionTab('logistics', 'Logistics', 'truck')}
        {renderSectionTab('images', 'Images', 'image')}
        {renderSectionTab('payment', 'Payment', 'credit-card')}
      </ScrollView>

      {/* Form Content */}
      <ScrollView
        style={[styles.scrollView, { backgroundColor: themeColors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        {activeSection === 'basic' && renderBasicSection()}
        {activeSection === 'pricing' && renderPricingSection()}
        {activeSection === 'timing' && renderTimingSection()}
        {activeSection === 'equipment' && renderEquipmentSection()}
        {activeSection === 'logistics' && renderLogisticsSection()}
        {activeSection === 'images' && renderImagesSection()}
        {activeSection === 'payment' && renderPaymentSection()}
      </ScrollView>

      {/* Save Button */}
      <View style={[styles.footer, { backgroundColor: isDark ? themeColors.sand : '#ffffff', paddingBottom: insets.bottom + spacing.md, borderTopColor: themeColors.borderLight }]}>
        {(() => {
          const hasAuction = formData.listing_type === 'auction' || formData.listing_type === 'auction_with_offers';
          const isEnded = listing?.status === 'ended' || listing?.status === 'expired' ||
            (listing?.end_time && new Date(listing.end_time) < new Date());
          const isRelist = isEnded && hasAuction;
          const buttonText = isRelist
            ? formData.schedule_start === 'scheduled' ? 'Schedule Relist' : 'Relist Now'
            : 'Save Changes';
          const buttonIcon = isRelist ? 'refresh-cw' : 'check';

          return (
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: themeColors.accent }]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Feather name={buttonIcon as keyof typeof Feather.glyphMap} size={20} color="#ffffff" />
                  <Text style={styles.saveButtonText}>{buttonText}</Text>
                </>
              )}
            </TouchableOpacity>
          );
        })()}
      </View>
    </KeyboardAvoidingView>
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
  sectionTabs: {
    borderBottomWidth: 1,
    maxHeight: 52,
  },
  sectionTabsContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: 'transparent',
    height: 36,
  },
  sectionTabText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  scrollView: {
    flex: 1,
  },
  sectionContent: {
    padding: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.lg,
  },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  hint: {
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
  },
  subheading: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    minHeight: 100,
  },
  currencyInput: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    marginRight: spacing.sm,
  },
  currencyField: {
    flex: 1,
  },
  optionsGrid: {
    gap: spacing.sm,
  },
  optionCard: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  optionLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  optionDescription: {
    fontSize: fontSize.sm,
  },
  chipScroll: {
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  chip: {
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm,
  },
  chipText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  toggleHint: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  radioLabel: {
    fontSize: fontSize.base,
  },
  addressList: {
    gap: spacing.sm,
  },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  addressContent: {
    flex: 1,
  },
  addressLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  addressText: {
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  emptyAddresses: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  emptyAddressesText: {
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  imageItem: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
  },
  primaryBadge: {
    position: 'absolute',
    top: spacing.xs,
    left: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  primaryBadgeText: {
    color: '#ffffff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  imageActions: {
    position: 'absolute',
    bottom: spacing.xs,
    right: spacing.xs,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  imageActionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addImageText: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  statusBannerContent: {
    flex: 1,
  },
  statusBannerTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  statusBannerText: {
    fontSize: fontSize.sm,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
  },
  previewContent: {
    flex: 1,
  },
  previewLabel: {
    fontSize: fontSize.xs,
    marginBottom: spacing.xs,
  },
  previewValue: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
