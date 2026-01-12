import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Dimensions,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  ListingType,
  EquipmentStatus,
  DeinstallResponsibility,
  OnsiteAssistance,
  UserAddress,
  Category,
  Profile,
} from '../../types/database';
import { DashboardStackParamList } from '../../navigation/types';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { lightTap, mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';

type Props = NativeStackScreenProps<DashboardStackParamList, 'CreateListing'>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Step definitions
const STEPS = [
  { key: 'photos', title: 'Photos', icon: 'camera' as const },
  { key: 'details', title: 'Details', icon: 'file-text' as const },
  { key: 'specs', title: 'Specs', icon: 'cpu' as const },
  { key: 'condition', title: 'Condition', icon: 'clipboard' as const },
  { key: 'pricing', title: 'Pricing', icon: 'dollar-sign' as const },
  { key: 'review', title: 'Review', icon: 'check-circle' as const },
];

// Image type for local state
interface LocalImage {
  uri: string;
  width: number;
  height: number;
  isUploading?: boolean;
  uploadedUrl?: string;
}

// Form data interface
interface ListingFormData {
  // Step 1: Photos
  images: LocalImage[];
  videoUrl: string;

  // Step 2: Equipment Details
  title: string;
  categoryId: string;
  description: string;
  make: string;
  model: string;
  year: string;
  serialNumber: string;
  sellerTerms: string;
  shippingInfo: string;

  // Step 3: Machine Specs
  softwareNa: boolean;
  softwareVersion: string;
  operatingSystem: string;
  controllerType: string;
  configurationNa: boolean;
  numberOfHeads: string;
  maxSpeed: string;
  feederCount: string;
  outputStackerCount: string;
  capabilitiesNa: boolean;
  capabilities: string[];
  materialNa: boolean;
  materialTypes: string;
  maxMaterialWidth: string;
  maxMaterialLength: string;
  materialWeight: string;
  powerRequirements: string;
  networkConnectivity: string;
  lastServiceDate: string;
  includedAccessories: string;
  maintenanceHistory: string;

  // Step 4: Condition & Logistics
  condition: string;
  hoursCount: string;
  equipmentStatus: EquipmentStatus | '';
  onsiteAssistance: OnsiteAssistance | '';
  weightLbs: string;
  floorLength: string;
  floorWidth: string;
  removalDeadline: string;
  pickupNotes: string;
  locationId: string;
  deinstallResponsibility: DeinstallResponsibility;
  deinstallFee: string;
  electricalRequirements: string;
  airRequirementsPsi: string;

  // Step 5: Pricing & Auction
  listingType: ListingType;
  startingPrice: string;
  reservePrice: string;
  buyNowPrice: string;
  acceptOffers: boolean;
  autoAcceptPrice: string;
  autoDeclinePrice: string;
  auctionDuration: string;
  scheduleType: 'immediate' | 'scheduled';
  scheduledStartDate: string;
  scheduledEndTime: string; // HH:MM format for end time (e.g., "14:00" for 2 PM)
  paymentDueDays: string;
  acceptsCreditCard: boolean;
  acceptsAch: boolean;
  acceptsWire: boolean;
  acceptsCheck: boolean;
}

// Constants
const LISTING_TYPES: { key: ListingType; label: string; description: string }[] = [
  { key: 'auction', label: 'Auction Only', description: 'Competitive bidding with 2-min soft close' },
  { key: 'make_offer', label: 'Make An Offer Only', description: 'Accept offers from buyers' },
  { key: 'auction_with_offers', label: 'Auction + Make An Offer', description: 'Bidding plus direct offers' },
];

const EQUIPMENT_STATUSES: { key: EquipmentStatus; label: string; description: string }[] = [
  { key: 'in_production', label: 'In Production', description: 'Currently in use' },
  { key: 'installed_idle', label: 'Installed (Idle)', description: 'Installed but not running' },
  { key: 'needs_deinstall', label: 'Needs De-installation', description: 'Requires professional removal' },
  { key: 'deinstalled', label: 'De-installed', description: 'Ready for pickup' },
  { key: 'broken_down', label: 'Broken Down', description: 'Disassembled into components' },
  { key: 'palletized', label: 'Palletized', description: 'On pallets, ready to ship' },
  { key: 'crated', label: 'Crated', description: 'Crated for shipping' },
];

const CONDITIONS = [
  { key: 'excellent', label: 'Excellent', description: 'Like new condition' },
  { key: 'good', label: 'Good', description: 'Normal wear, fully functional' },
  { key: 'fair', label: 'Fair', description: 'Shows wear, works properly' },
  { key: 'poor', label: 'Poor', description: 'Heavy wear, may need work' },
  { key: 'parts', label: 'For Parts', description: 'Non-functional, for parts only' },
];

const ASSISTANCE_OPTIONS: { key: OnsiteAssistance; label: string; description: string }[] = [
  { key: 'full_assistance', label: 'Full Assistance', description: 'We will help load with our equipment' },
  { key: 'forklift_available', label: 'Forklift Available', description: 'Forklift on-site for loading' },
  { key: 'limited_assistance', label: 'Limited Assistance', description: 'Some help available' },
  { key: 'no_assistance', label: 'No Assistance', description: 'Buyer must arrange all loading' },
];

const DEINSTALL_OPTIONS: { key: DeinstallResponsibility; label: string }[] = [
  { key: 'buyer', label: 'Buyer Responsible' },
  { key: 'seller_included', label: 'Seller Will Handle (Included)' },
  { key: 'seller_additional_fee', label: 'Seller Available (Additional Fee)' },
];

const AUCTION_DURATIONS = [
  { key: '3', label: '3 Days' },
  { key: '5', label: '5 Days' },
  { key: '7', label: '7 Days' },
  { key: '10', label: '10 Days' },
  { key: '14', label: '14 Days' },
];

// End time options (in 30-min increments from 6 AM to 11 PM)
const END_TIME_OPTIONS = [
  { key: '06:00', label: '6:00 AM' },
  { key: '06:30', label: '6:30 AM' },
  { key: '07:00', label: '7:00 AM' },
  { key: '07:30', label: '7:30 AM' },
  { key: '08:00', label: '8:00 AM' },
  { key: '08:30', label: '8:30 AM' },
  { key: '09:00', label: '9:00 AM' },
  { key: '09:30', label: '9:30 AM' },
  { key: '10:00', label: '10:00 AM' },
  { key: '10:30', label: '10:30 AM' },
  { key: '11:00', label: '11:00 AM' },
  { key: '11:30', label: '11:30 AM' },
  { key: '12:00', label: '12:00 PM' },
  { key: '12:30', label: '12:30 PM' },
  { key: '13:00', label: '1:00 PM' },
  { key: '13:30', label: '1:30 PM' },
  { key: '14:00', label: '2:00 PM' },
  { key: '14:30', label: '2:30 PM' },
  { key: '15:00', label: '3:00 PM' },
  { key: '15:30', label: '3:30 PM' },
  { key: '16:00', label: '4:00 PM' },
  { key: '16:30', label: '4:30 PM' },
  { key: '17:00', label: '5:00 PM' },
  { key: '17:30', label: '5:30 PM' },
  { key: '18:00', label: '6:00 PM' },
  { key: '18:30', label: '6:30 PM' },
  { key: '19:00', label: '7:00 PM' },
  { key: '19:30', label: '7:30 PM' },
  { key: '20:00', label: '8:00 PM' },
  { key: '20:30', label: '8:30 PM' },
  { key: '21:00', label: '9:00 PM' },
  { key: '21:30', label: '9:30 PM' },
  { key: '22:00', label: '10:00 PM' },
  { key: '22:30', label: '10:30 PM' },
  { key: '23:00', label: '11:00 PM' },
];

const OPERATING_SYSTEMS = [
  'Windows 11',
  'Windows 10',
  'Windows 7',
  'Windows XP',
  'Linux',
  'macOS',
  'Proprietary/Embedded',
  'DOS-based',
  'Other',
];

const CONTROLLER_TYPES = [
  'PC-based Controller',
  'PLC (Programmable Logic)',
  'Proprietary Controller',
  'Touchscreen HMI',
  'Remote/Network Control',
  'Manual/Mechanical',
  'Other',
];

// Category-specific capabilities
const CAPABILITIES_BY_CATEGORY: Record<string, string[]> = {
  'mailing-fulfillment': [
    'Intelligent Mail Barcode (IMb)',
    'Address Quality (CASS)',
    'NCOA Processing',
    'Inkjet Addressing',
    'Tabbing',
    'Inserting',
    'Metering',
    'Poly Wrapping',
  ],
  'printing': [
    'Variable Data Printing',
    'Spot Color',
    'UV Coating',
    'Aqueous Coating',
    'Duplex Printing',
    'Wide Format',
    'Die Cutting',
    'Embossing',
  ],
  'bindery-finishing': [
    'Saddle Stitching',
    'Perfect Binding',
    'Coil/Spiral Binding',
    'Laminating',
    'Folding',
    'Scoring',
    'Perforating',
    'Collating',
  ],
  'packaging': [
    'Box Making',
    'Carton Erecting',
    'Case Packing',
    'Shrink Wrapping',
    'Stretch Wrapping',
    'Labeling',
    'Sealing',
    'Palletizing',
  ],
  default: [
    'Automated Operation',
    'Remote Monitoring',
    'Data Integration',
    'Quality Control',
    'Counter/Tracking',
    'Safety Features',
  ],
};

const initialFormData: ListingFormData = {
  images: [],
  videoUrl: '',
  title: '',
  categoryId: '',
  description: '',
  make: '',
  model: '',
  year: '',
  serialNumber: '',
  sellerTerms: '',
  shippingInfo: '',
  softwareNa: false,
  softwareVersion: '',
  operatingSystem: '',
  controllerType: '',
  configurationNa: false,
  numberOfHeads: '',
  maxSpeed: '',
  feederCount: '',
  outputStackerCount: '',
  capabilitiesNa: false,
  capabilities: [],
  materialNa: false,
  materialTypes: '',
  maxMaterialWidth: '',
  maxMaterialLength: '',
  materialWeight: '',
  powerRequirements: '',
  networkConnectivity: '',
  lastServiceDate: '',
  includedAccessories: '',
  maintenanceHistory: '',
  condition: '',
  hoursCount: '',
  equipmentStatus: '',
  onsiteAssistance: '',
  weightLbs: '',
  floorLength: '',
  floorWidth: '',
  removalDeadline: '',
  pickupNotes: '',
  locationId: '',
  deinstallResponsibility: 'buyer',
  deinstallFee: '',
  electricalRequirements: '',
  airRequirementsPsi: '',
  listingType: 'auction',
  startingPrice: '',
  reservePrice: '',
  buyNowPrice: '',
  acceptOffers: false,
  autoAcceptPrice: '',
  autoDeclinePrice: '',
  auctionDuration: '7',
  scheduleType: 'immediate',
  scheduledStartDate: '',
  scheduledEndTime: '17:00', // Default to 5 PM
  paymentDueDays: '7',
  acceptsCreditCard: true,
  acceptsAch: true,
  acceptsWire: true,
  acceptsCheck: false,
};

export default function CreateListingScreen({ navigation, route }: Props) {
  const listingId = route.params?.listingId;
  const isEditMode = !!listingId;

  const insets = useSafeAreaInsets();
  const { user, profile, refreshProfile } = useAuth();
  const { colors: themeColors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<ListingFormData>(initialFormData);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showOsPicker, setShowOsPicker] = useState(false);
  const [showControllerPicker, setShowControllerPicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [isLoadingListing, setIsLoadingListing] = useState(isEditMode);

  // Fetch categories
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data as Category[];
    },
  });

  // Fetch user addresses
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

  // Fetch seller profile for default terms
  const { data: sellerProfile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!user,
  });

  // Fetch existing listing when editing
  const { data: existingListing } = useQuery({
    queryKey: ['editListing', listingId],
    queryFn: async () => {
      if (!listingId) return null;
      const { data, error } = await supabase
        .from('listings')
        .select(`
          *,
          images:listing_images(*)
        `)
        .eq('id', listingId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!listingId,
  });

  // Populate form with existing listing data
  useEffect(() => {
    if (existingListing && isEditMode) {
      const listing = existingListing;
      const existingImages: LocalImage[] = (listing.images || [])
        .sort((a: { sort_order: number }, b: { sort_order: number }) => (a.sort_order || 0) - (b.sort_order || 0))
        .map((img: { url: string }) => ({
          uri: img.url,
          width: 800,
          height: 600,
          uploadedUrl: img.url,
        }));

      setFormData({
        images: existingImages,
        videoUrl: listing.video_url || '',
        title: listing.title || '',
        categoryId: listing.primary_category_id || '',
        description: listing.description || '',
        make: listing.make || '',
        model: listing.model || '',
        year: listing.year?.toString() || '',
        serialNumber: listing.serial_number || '',
        sellerTerms: listing.seller_terms || '',
        shippingInfo: listing.shipping_info || '',
        softwareNa: listing.software_na || false,
        softwareVersion: listing.software_version || '',
        operatingSystem: listing.operating_system || '',
        controllerType: listing.controller_type || '',
        configurationNa: listing.configuration_na || false,
        numberOfHeads: listing.number_of_heads?.toString() || '',
        maxSpeed: listing.max_speed || '',
        feederCount: listing.feeder_count?.toString() || '',
        outputStackerCount: listing.output_stacker_count?.toString() || '',
        capabilitiesNa: listing.capabilities_na || false,
        capabilities: listing.capabilities || [],
        materialNa: listing.dimensions_na || false,
        materialTypes: listing.material_types || '',
        maxMaterialWidth: listing.max_material_width || '',
        maxMaterialLength: listing.max_material_length || '',
        materialWeight: listing.material_weight || '',
        powerRequirements: listing.power_requirements || '',
        networkConnectivity: listing.network_connectivity || '',
        lastServiceDate: listing.last_service_date || '',
        includedAccessories: listing.included_accessories || '',
        maintenanceHistory: listing.maintenance_history || '',
        condition: listing.condition || '',
        hoursCount: listing.hours_count?.toString() || '',
        equipmentStatus: listing.equipment_status || '',
        onsiteAssistance: listing.onsite_assistance || '',
        weightLbs: listing.weight_lbs?.toString() || '',
        floorLength: listing.floor_length_ft?.toString() || '',
        floorWidth: listing.floor_width_ft?.toString() || '',
        removalDeadline: listing.removal_deadline || '',
        pickupNotes: listing.pickup_notes || '',
        locationId: listing.location_id || '',
        deinstallResponsibility: listing.deinstall_responsibility || 'buyer',
        deinstallFee: listing.deinstall_fee?.toString() || '',
        electricalRequirements: listing.electrical_requirements || '',
        airRequirementsPsi: listing.air_requirements_psi?.toString() || '',
        listingType: listing.listing_type || 'auction',
        startingPrice: listing.starting_price?.toString() || '',
        reservePrice: listing.reserve_price?.toString() || '',
        buyNowPrice: listing.buy_now_price?.toString() || '',
        acceptOffers: listing.accept_offers || false,
        autoAcceptPrice: listing.auto_accept_price?.toString() || '',
        autoDeclinePrice: listing.auto_decline_price?.toString() || '',
        auctionDuration: '7',
        scheduleType: 'immediate',
        scheduledStartDate: '',
        scheduledEndTime: listing.end_time ? new Date(listing.end_time).toTimeString().slice(0, 5) : '17:00',
        paymentDueDays: listing.payment_due_days?.toString() || '7',
        acceptsCreditCard: listing.accepts_credit_card ?? true,
        acceptsAch: listing.accepts_ach ?? true,
        acceptsWire: listing.accepts_wire ?? true,
        acceptsCheck: listing.accepts_check ?? false,
      });

      // Restore the step the user was on when they saved the draft
      if (listing.status === 'draft' && typeof listing.draft_step === 'number') {
        setCurrentStep(listing.draft_step);
      }

      setIsLoadingListing(false);
    }
  }, [existingListing, isEditMode]);

  // Pre-fill seller defaults (only for new listings)
  useEffect(() => {
    if (sellerProfile && !isEditMode) {
      setFormData(prev => ({
        ...prev,
        sellerTerms: prev.sellerTerms || sellerProfile.seller_terms || '',
        shippingInfo: prev.shippingInfo || sellerProfile.default_shipping_info || '',
      }));
    }
  }, [sellerProfile, isEditMode]);

  // Set default address
  useEffect(() => {
    if (addresses && addresses.length > 0 && !formData.locationId) {
      const defaultAddr = addresses.find(a => a.is_default) || addresses[0];
      setFormData(prev => ({ ...prev, locationId: defaultAddr.id }));
    }
  }, [addresses, formData.locationId]);

  const updateField = useCallback((field: keyof ListingFormData, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handlePickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant photo library access to add images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: 25 - formData.images.length,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newImages: LocalImage[] = result.assets.map(asset => ({
        uri: asset.uri,
        width: asset.width || 800,
        height: asset.height || 600,
      }));
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...newImages].slice(0, 25),
      }));
      lightTap();
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera access to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      const newImage: LocalImage = {
        uri: asset.uri,
        width: asset.width || 800,
        height: asset.height || 600,
      };
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, newImage].slice(0, 25),
      }));
      lightTap();
    }
  };

  const handleRemoveImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index),
    }));
    lightTap();
  };

  const handleMoveImage = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= formData.images.length) return;
    const newImages = [...formData.images];
    const [removed] = newImages.splice(fromIndex, 1);
    newImages.splice(toIndex, 0, removed);
    setFormData(prev => ({ ...prev, images: newImages }));
    lightTap();
  };

  const toggleCapability = (capability: string) => {
    setFormData(prev => ({
      ...prev,
      capabilities: prev.capabilities.includes(capability)
        ? prev.capabilities.filter(c => c !== capability)
        : [...prev.capabilities, capability],
    }));
    lightTap();
  };

  const getSelectedCategory = () => {
    return categories?.find(c => c.id === formData.categoryId);
  };

  const getCapabilitiesForCategory = () => {
    const category = getSelectedCategory();
    if (category?.slug && CAPABILITIES_BY_CATEGORY[category.slug]) {
      return CAPABILITIES_BY_CATEGORY[category.slug];
    }
    return CAPABILITIES_BY_CATEGORY.default;
  };

  const validateStep = (step: number): { valid: boolean; message?: string } => {
    switch (step) {
      case 0: // Photos
        if (formData.images.length === 0) {
          return { valid: false, message: 'Please add at least one photo' };
        }
        return { valid: true };

      case 1: // Details
        if (!formData.title.trim()) {
          return { valid: false, message: 'Please enter a title' };
        }
        if (!formData.categoryId) {
          return { valid: false, message: 'Please select a category' };
        }
        if (!formData.description.trim()) {
          return { valid: false, message: 'Please enter a description' };
        }
        return { valid: true };

      case 2: // Specs - optional, always valid
        return { valid: true };

      case 3: // Condition
        if (!formData.condition) {
          return { valid: false, message: 'Please select a condition' };
        }
        if (!formData.equipmentStatus) {
          return { valid: false, message: 'Please select equipment status' };
        }
        if (!formData.onsiteAssistance) {
          return { valid: false, message: 'Please select on-site assistance level' };
        }
        return { valid: true };

      case 4: // Pricing
        const hasAuction = formData.listingType === 'auction' || formData.listingType === 'auction_with_offers';
        if (hasAuction && !formData.startingPrice) {
          return { valid: false, message: 'Please enter a starting price' };
        }
        if (formData.listingType === 'make_offer' && !formData.buyNowPrice) {
          return { valid: false, message: 'Please enter an asking price' };
        }
        return { valid: true };

      case 5: // Review - check all previous steps
        for (let i = 0; i < 5; i++) {
          const result = validateStep(i);
          if (!result.valid) return result;
        }
        return { valid: true };

      default:
        return { valid: true };
    }
  };

  const handleNext = () => {
    const validation = validateStep(currentStep);
    if (!validation.valid) {
      Alert.alert('Missing Information', validation.message);
      errorFeedback();
      return;
    }

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      mediumTap();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      lightTap();
    }
  };

  const uploadImages = async (listingId: string, imagesToUpload?: LocalImage[]): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    const images = imagesToUpload || formData.images;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];

      // Skip already uploaded images
      if (image.uploadedUrl) {
        uploadedUrls.push(image.uploadedUrl);
        continue;
      }

      try {
        // Resize image for upload
        const manipulated = await ImageManipulator.manipulateAsync(
          image.uri,
          [{ resize: { width: 1200 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );

        // Get file extension and create filename
        const ext = 'jpg';
        const filename = `${listingId}/${Date.now()}-${i}.${ext}`;

        // Read image as blob then convert to base64
        // (Blob uploads create 0-byte files in React Native)
        const response = await fetch(manipulated.uri);
        const blob = await response.blob();

        // Convert blob to base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64Data = (reader.result as string).split(',')[1];
            resolve(base64Data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });

        // Decode base64 to Uint8Array
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let j = 0; j < binaryString.length; j++) {
          bytes[j] = binaryString.charCodeAt(j);
        }

        // Upload to Supabase storage
        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(filename, bytes, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          continue;
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('listing-images')
          .getPublicUrl(filename);

        uploadedUrls.push(urlData.publicUrl);
      } catch (error) {
        console.error('Error uploading image:', error);
      }
    }

    return uploadedUrls;
  };

  const handleSaveDraft = async () => {
    if (!user) {
      Alert.alert('Error', 'Please sign in to save a draft');
      return;
    }

    setIsSavingDraft(true);
    mediumTap();

    try {
      // Create or update listing with draft status
      const listingData = buildListingData('draft');
      let finalListingId: string;

      if (isEditMode && listingId) {
        // Update existing listing
        const { error } = await supabase
          .from('listings')
          .update(listingData)
          .eq('id', listingId);

        if (error) throw error;
        finalListingId = listingId;

        // Handle images for edit mode
        // Get list of images that are already uploaded (have uploadedUrl)
        const existingUrls = formData.images
          .filter(img => img.uploadedUrl)
          .map(img => img.uploadedUrl as string);

        // Delete images that were removed
        await supabase
          .from('listing_images')
          .delete()
          .eq('listing_id', listingId)
          .not('url', 'in', `(${existingUrls.map(u => `"${u}"`).join(',')})`);

        // Upload new images (those without uploadedUrl)
        const newImages = formData.images.filter(img => !img.uploadedUrl);
        if (newImages.length > 0) {
          const newUploadedUrls = await uploadImages(listingId, newImages);
          const currentMaxOrder = formData.images.filter(img => img.uploadedUrl).length;
          for (let i = 0; i < newUploadedUrls.length; i++) {
            await supabase.from('listing_images').insert({
              listing_id: listingId,
              url: newUploadedUrls[i],
              sort_order: currentMaxOrder + i,
              is_primary: currentMaxOrder === 0 && i === 0,
            });
          }
        }

        // Update sort order for all images
        for (let i = 0; i < formData.images.length; i++) {
          const img = formData.images[i];
          if (img.uploadedUrl) {
            await supabase
              .from('listing_images')
              .update({ sort_order: i, is_primary: i === 0 })
              .eq('listing_id', listingId)
              .eq('url', img.uploadedUrl);
          }
        }
      } else {
        // Create new listing
        const { data: listing, error } = await supabase
          .from('listings')
          .insert(listingData)
          .select()
          .single();

        if (error) throw error;
        finalListingId = listing.id;

        // Upload images if any
        if (formData.images.length > 0) {
          const uploadedUrls = await uploadImages(finalListingId);

          // Insert image records
          for (let i = 0; i < uploadedUrls.length; i++) {
            await supabase.from('listing_images').insert({
              listing_id: finalListingId,
              url: uploadedUrls[i],
              sort_order: i,
              is_primary: i === 0,
            });
          }
        }
      }

      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['myListings'] });
      queryClient.invalidateQueries({ queryKey: ['editListing', listingId] });

      Alert.alert('Draft Saved', 'Your listing has been saved as a draft.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error: any) {
      console.error('Error saving draft:', error);
      errorFeedback();
      const errorMessage = error?.message || error?.details || 'Failed to save draft. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    const validation = validateStep(5);
    if (!validation.valid) {
      Alert.alert('Missing Information', validation.message);
      errorFeedback();
      return;
    }

    if (!user) {
      Alert.alert('Error', 'Please sign in to publish a listing');
      return;
    }

    setIsPublishing(true);
    mediumTap();

    try {
      const status = formData.scheduleType === 'scheduled' ? 'scheduled' : 'active';
      const listingData = buildListingData(status);
      let finalListingId: string;

      if (isEditMode && listingId) {
        // Update existing listing
        const { error } = await supabase
          .from('listings')
          .update(listingData)
          .eq('id', listingId);

        if (error) throw error;
        finalListingId = listingId;

        // Handle images for edit mode
        const existingUrls = formData.images
          .filter(img => img.uploadedUrl)
          .map(img => img.uploadedUrl as string);

        // Delete removed images
        if (existingUrls.length > 0) {
          await supabase
            .from('listing_images')
            .delete()
            .eq('listing_id', listingId)
            .not('url', 'in', `(${existingUrls.map(u => `"${u}"`).join(',')})`);
        } else {
          // Delete all old images if none kept
          await supabase
            .from('listing_images')
            .delete()
            .eq('listing_id', listingId);
        }

        // Upload new images
        const newImages = formData.images.filter(img => !img.uploadedUrl);
        if (newImages.length > 0) {
          const newUploadedUrls = await uploadImages(listingId, newImages);
          const currentMaxOrder = formData.images.filter(img => img.uploadedUrl).length;
          for (let i = 0; i < newUploadedUrls.length; i++) {
            await supabase.from('listing_images').insert({
              listing_id: listingId,
              url: newUploadedUrls[i],
              sort_order: currentMaxOrder + i,
              is_primary: currentMaxOrder === 0 && i === 0,
            });
          }
        }

        // Update sort order
        for (let i = 0; i < formData.images.length; i++) {
          const img = formData.images[i];
          if (img.uploadedUrl) {
            await supabase
              .from('listing_images')
              .update({ sort_order: i, is_primary: i === 0 })
              .eq('listing_id', listingId)
              .eq('url', img.uploadedUrl);
          }
        }
      } else {
        // Create new listing
        const { data: listing, error } = await supabase
          .from('listings')
          .insert(listingData)
          .select()
          .single();

        if (error) throw error;
        finalListingId = listing.id;

        // Auto-set is_seller = true when user creates their first listing
        if (!profile?.is_seller) {
          await supabase
            .from('profiles')
            .update({ is_seller: true, updated_at: new Date().toISOString() })
            .eq('id', user!.id);
          // Refresh profile to update local state
          refreshProfile?.();
        }

        // Upload images
        if (formData.images.length > 0) {
          const uploadedUrls = await uploadImages(finalListingId);

          // Insert image records
          for (let i = 0; i < uploadedUrls.length; i++) {
            await supabase.from('listing_images').insert({
              listing_id: finalListingId,
              url: uploadedUrls[i],
              sort_order: i,
              is_primary: i === 0,
            });
          }
        }
      }

      successFeedback();
      queryClient.invalidateQueries({ queryKey: ['myListings'] });
      queryClient.invalidateQueries({ queryKey: ['activeListings'] });
      queryClient.invalidateQueries({ queryKey: ['editListing', listingId] });

      Alert.alert(
        'Listing Published!',
        status === 'scheduled'
          ? 'Your listing has been scheduled and will go live at the specified time.'
          : 'Your listing is now live!',
        [{ text: 'View Listing', onPress: () => {
          navigation.replace('ListingDetail', { listingId: finalListingId });
        }}]
      );
    } catch (error) {
      console.error('Error publishing listing:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to publish listing. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  const buildListingData = (status: string) => {
    const hasAuction = formData.listingType === 'auction' || formData.listingType === 'auction_with_offers';

    // Calculate timing
    let startTime = new Date();
    let endTime = new Date();

    if (formData.scheduleType === 'scheduled' && formData.scheduledStartDate) {
      startTime = new Date(formData.scheduledStartDate);
    }

    const durationDays = parseInt(formData.auctionDuration) || 7;
    endTime = new Date(startTime);
    endTime.setDate(endTime.getDate() + durationDays);

    // Apply selected end time (hour and minute) to the end date
    if (formData.scheduledEndTime) {
      const [hours, minutes] = formData.scheduledEndTime.split(':').map(Number);
      endTime.setHours(hours, minutes, 0, 0);
    }

    return {
      seller_id: user!.id,
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      primary_category_id: formData.categoryId || null,
      listing_type: formData.listingType,
      status,

      // Pricing
      starting_price: formData.startingPrice ? parseFloat(formData.startingPrice) : null,
      reserve_price: formData.reservePrice ? parseFloat(formData.reservePrice) : null,
      buy_now_price: formData.buyNowPrice ? parseFloat(formData.buyNowPrice) : null,
      fixed_price: formData.listingType === 'make_offer' && formData.buyNowPrice
        ? parseFloat(formData.buyNowPrice) : null,
      accept_offers: formData.acceptOffers || formData.listingType === 'auction_with_offers' || formData.listingType === 'make_offer',

      // Timing
      start_time: status !== 'draft' ? startTime.toISOString() : null,
      end_time: status !== 'draft' && hasAuction ? endTime.toISOString() : null,

      // Equipment Details
      make: formData.make.trim() || null,
      model: formData.model.trim() || null,
      year: formData.year ? parseInt(formData.year) : null,
      serial_number: formData.serialNumber.trim() || null,
      condition: formData.condition || null,
      hours_count: formData.hoursCount ? parseInt(formData.hoursCount) : null,

      // Machine Specs (Step 3)
      software_na: formData.softwareNa,
      software_version: formData.softwareVersion.trim() || null,
      operating_system: formData.operatingSystem || null,
      controller_type: formData.controllerType || null,
      configuration_na: formData.configurationNa,
      number_of_heads: formData.numberOfHeads ? parseInt(formData.numberOfHeads) : null,
      max_speed: formData.maxSpeed.trim() || null,
      feeder_count: formData.feederCount ? parseInt(formData.feederCount) : null,
      output_stacker_count: formData.outputStackerCount ? parseInt(formData.outputStackerCount) : null,
      capabilities_na: formData.capabilitiesNa,
      capabilities: formData.capabilities.length > 0 ? formData.capabilities : null,
      dimensions_na: formData.materialNa,
      material_types: formData.materialTypes.trim() || null,
      max_material_width: formData.maxMaterialWidth.trim() || null,
      max_material_length: formData.maxMaterialLength.trim() || null,
      material_weight: formData.materialWeight.trim() || null,
      power_requirements: formData.powerRequirements.trim() || null,
      network_connectivity: formData.networkConnectivity.trim() || null,
      last_service_date: formData.lastServiceDate || null,
      included_accessories: formData.includedAccessories.trim() || null,
      maintenance_history: formData.maintenanceHistory.trim() || null,

      // Condition & Logistics (Step 4)
      equipment_status: formData.equipmentStatus || null,
      onsite_assistance: formData.onsiteAssistance || null,
      weight_lbs: formData.weightLbs ? parseFloat(formData.weightLbs) : null,
      floor_length_ft: formData.floorLength ? parseFloat(formData.floorLength) : null,
      floor_width_ft: formData.floorWidth ? parseFloat(formData.floorWidth) : null,
      removal_deadline: formData.removalDeadline || null,
      pickup_notes: formData.pickupNotes.trim() || null,
      location_id: formData.locationId || null,
      deinstall_responsibility: formData.deinstallResponsibility || null,
      deinstall_fee: formData.deinstallFee ? parseFloat(formData.deinstallFee) : null,
      electrical_requirements: formData.electricalRequirements.trim() || null,
      air_requirements_psi: formData.airRequirementsPsi ? parseFloat(formData.airRequirementsPsi) : null,

      // Terms & Shipping
      seller_terms: formData.sellerTerms.trim() || null,
      shipping_info: formData.shippingInfo.trim() || null,
      video_url: formData.videoUrl.trim() || null,

      // Payment
      payment_due_days: parseInt(formData.paymentDueDays) || 7,
      accepts_credit_card: formData.acceptsCreditCard,
      accepts_ach: formData.acceptsAch,
      accepts_wire: formData.acceptsWire,
      accepts_check: formData.acceptsCheck,

      // Draft tracking
      draft_step: status === 'draft' ? currentStep : null,
    };
  };

  // Render step indicator
  const renderStepIndicator = () => (
    <View style={[styles.stepIndicator, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderBottomColor: themeColors.borderLight }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.stepIndicatorContent}
      >
        {STEPS.map((step, index) => {
          const isActive = index === currentStep;
          const isCompleted = index < currentStep;
          const validation = validateStep(index);
          const hasError = index < currentStep && !validation.valid;

          return (
            <TouchableOpacity
              key={step.key}
              style={[
                styles.stepItem,
                isActive && styles.stepItemActive,
              ]}
              onPress={() => {
                if (index !== currentStep) {
                  setCurrentStep(index);
                  scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                  lightTap();
                }
              }}
              accessibilityLabel={`Go to step ${index + 1}: ${step.title}`}
              accessibilityRole="button"
            >
              <View style={[
                styles.stepCircle,
                {
                  backgroundColor: isActive ? themeColors.accent : isCompleted ? themeColors.accent : themeColors.sand,
                  borderColor: isActive ? themeColors.accent : hasError ? colors.error : themeColors.border,
                },
              ]}>
                {isCompleted ? (
                  <Feather name="check" size={18} color="#ffffff" />
                ) : hasError ? (
                  <Feather name="alert-circle" size={18} color={colors.error} />
                ) : (
                  <Text style={[
                    styles.stepNumber,
                    { color: isActive ? '#ffffff' : themeColors.textMuted }
                  ]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text style={[
                styles.stepLabel,
                { color: isActive ? themeColors.accent : themeColors.textMuted }
              ]}>
                {step.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );

  // Step 1: Photos & Videos
  const renderPhotosStep = () => (
    <View style={styles.stepContent}>
      <View style={styles.stepTitleRow}>
        <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>Photos & Videos</Text>
        {formData.images.length > 0 && (
          <View style={[styles.photoCountBadge, { backgroundColor: themeColors.accentFaint }]}>
            <Text style={[styles.photoCountText, { color: themeColors.accent }]}>
              {formData.images.length} of 25
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.stepDescription, { color: themeColors.textMuted }]}>
        Add up to 25 photos of your equipment. The first image will be the primary photo. Portrait orientation is recommended for better mobile viewing.
      </Text>

      <View style={styles.imagesGrid}>
        {formData.images.map((image, index) => (
          <View key={index} style={styles.imageItem}>
            <Image source={{ uri: image.uri }} style={styles.imageThumbnail} contentFit="cover" />
            {index === 0 && (
              <View style={[styles.primaryBadge, { backgroundColor: themeColors.accent }]}>
                <Text style={styles.primaryBadgeText}>Primary</Text>
              </View>
            )}
            <View style={styles.imageActions}>
              {index > 0 && (
                <TouchableOpacity
                  style={[styles.imageActionBtn, { backgroundColor: 'rgba(255,255,255,0.95)' }]}
                  onPress={() => handleMoveImage(index, index - 1)}
                >
                  <Feather name="arrow-left" size={16} color="#1e293b" />
                </TouchableOpacity>
              )}
              {index < formData.images.length - 1 && (
                <TouchableOpacity
                  style={[styles.imageActionBtn, { backgroundColor: 'rgba(255,255,255,0.95)' }]}
                  onPress={() => handleMoveImage(index, index + 1)}
                >
                  <Feather name="arrow-right" size={16} color="#1e293b" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.imageActionBtn, { backgroundColor: colors.error }]}
                onPress={() => handleRemoveImage(index)}
              >
                <Feather name="trash-2" size={16} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </View>

      {formData.images.length < 25 && (
        <View style={styles.addImageButtons}>
          <TouchableOpacity
            style={[styles.addImageButton, { backgroundColor: isDark ? themeColors.sand : themeColors.background, borderColor: themeColors.border }]}
            onPress={handlePickImages}
          >
            <View style={[styles.addImageIconCircle, { backgroundColor: themeColors.accentFaint }]}>
              <Feather name="image" size={28} color={themeColors.accent} />
            </View>
            <Text style={[styles.addImageText, { color: themeColors.textPrimary }]}>Gallery</Text>
            <Text style={[styles.addImageHint, { color: themeColors.textMuted }]}>Choose existing photos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addImageButton, { backgroundColor: isDark ? themeColors.sand : themeColors.background, borderColor: themeColors.border }]}
            onPress={handleTakePhoto}
          >
            <View style={[styles.addImageIconCircle, { backgroundColor: themeColors.accentFaint }]}>
              <Feather name="camera" size={28} color={themeColors.accent} />
            </View>
            <Text style={[styles.addImageText, { color: themeColors.textPrimary }]}>Camera</Text>
            <Text style={[styles.addImageHint, { color: themeColors.textMuted }]}>Take a new photo</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Video URL (Optional)</Text>
        <Text style={[styles.hint, { color: themeColors.textMuted }]}>
          Add a YouTube or Vimeo video link
        </Text>
        <TextInput
          style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.videoUrl}
          onChangeText={(v) => updateField('videoUrl', v)}
          placeholder="https://youtube.com/watch?v=..."
          placeholderTextColor={themeColors.textLight}
          autoCapitalize="none"
          keyboardType="url"
        />
      </View>
    </View>
  );

  // Step 2: Equipment Details
  const renderDetailsStep = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>Equipment Details</Text>
      <Text style={[styles.stepDescription, { color: themeColors.textMuted }]}>
        Provide basic information about your equipment.
      </Text>

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
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Category *</Text>
        <TouchableOpacity
          style={[styles.pickerButton, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}
          onPress={() => setShowCategoryPicker(true)}
        >
          <Text style={[
            styles.pickerButtonText,
            { color: formData.categoryId ? themeColors.textPrimary : themeColors.textLight }
          ]}>
            {getSelectedCategory()?.name || 'Select a category'}
          </Text>
          <Feather name="chevron-down" size={20} color={themeColors.textMuted} />
        </TouchableOpacity>
      </View>

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
            placeholder="e.g., Speedmaster"
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
            value={formData.serialNumber}
            onChangeText={(v) => updateField('serialNumber', v)}
            placeholder="Optional"
            placeholderTextColor={themeColors.textLight}
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Description *</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.description}
          onChangeText={(v) => updateField('description', v)}
          placeholder="Describe the equipment, its features, history, and any important details buyers should know..."
          placeholderTextColor={themeColors.textLight}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Seller Terms</Text>
        <Text style={[styles.hint, { color: themeColors.textMuted }]}>
          Listing-specific terms (overrides your default terms)
        </Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.sellerTerms}
          onChangeText={(v) => updateField('sellerTerms', v)}
          placeholder="Any specific terms or conditions for this listing..."
          placeholderTextColor={themeColors.textLight}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Shipping Information</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.shippingInfo}
          onChangeText={(v) => updateField('shippingInfo', v)}
          placeholder="Shipping options, freight details, crating requirements..."
          placeholderTextColor={themeColors.textLight}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>
    </View>
  );

  // Step 3: Machine Specs
  const renderSpecsStep = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>Machine Specifications</Text>
      <Text style={[styles.stepDescription, { color: themeColors.textMuted }]}>
        Technical details help buyers find the right equipment. Mark sections as N/A if not applicable.
      </Text>

      {/* Software & System */}
      <View style={[styles.specSection, { borderColor: themeColors.borderLight }]}>
        <View style={styles.specSectionHeader}>
          <Text style={[styles.specSectionTitle, { color: themeColors.textPrimary }]}>Software & System</Text>
          <View style={styles.naToggle}>
            <Text style={[styles.naLabel, { color: themeColors.textMuted }]}>N/A</Text>
            <Switch
              value={formData.softwareNa}
              onValueChange={(v) => updateField('softwareNa', v)}
              trackColor={{ false: themeColors.border, true: themeColors.accent }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {!formData.softwareNa && (
          <>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Software Version</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                value={formData.softwareVersion}
                onChangeText={(v) => updateField('softwareVersion', v)}
                placeholder="e.g., v4.2.1"
                placeholderTextColor={themeColors.textLight}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Operating System</Text>
              <TouchableOpacity
                style={[styles.pickerButton, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}
                onPress={() => setShowOsPicker(true)}
              >
                <Text style={[
                  styles.pickerButtonText,
                  { color: formData.operatingSystem ? themeColors.textPrimary : themeColors.textLight }
                ]}>
                  {formData.operatingSystem || 'Select operating system'}
                </Text>
                <Feather name="chevron-down" size={20} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Controller Type</Text>
              <TouchableOpacity
                style={[styles.pickerButton, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}
                onPress={() => setShowControllerPicker(true)}
              >
                <Text style={[
                  styles.pickerButtonText,
                  { color: formData.controllerType ? themeColors.textPrimary : themeColors.textLight }
                ]}>
                  {formData.controllerType || 'Select controller type'}
                </Text>
                <Feather name="chevron-down" size={20} color={themeColors.textMuted} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Configuration */}
      <View style={[styles.specSection, { borderColor: themeColors.borderLight }]}>
        <View style={styles.specSectionHeader}>
          <Text style={[styles.specSectionTitle, { color: themeColors.textPrimary }]}>Machine Configuration</Text>
          <View style={styles.naToggle}>
            <Text style={[styles.naLabel, { color: themeColors.textMuted }]}>N/A</Text>
            <Switch
              value={formData.configurationNa}
              onValueChange={(v) => updateField('configurationNa', v)}
              trackColor={{ false: themeColors.border, true: themeColors.accent }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {!formData.configurationNa && (
          <>
            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.textPrimary }]}>Print Heads</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.numberOfHeads}
                  onChangeText={(v) => updateField('numberOfHeads', v.replace(/[^0-9]/g, ''))}
                  placeholder="e.g., 4"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.textPrimary }]}>Max Speed</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.maxSpeed}
                  onChangeText={(v) => updateField('maxSpeed', v)}
                  placeholder="e.g., 18,000/hr"
                  placeholderTextColor={themeColors.textLight}
                />
              </View>
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.textPrimary }]}>Feeders</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.feederCount}
                  onChangeText={(v) => updateField('feederCount', v.replace(/[^0-9]/g, ''))}
                  placeholder="e.g., 2"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.textPrimary }]}>Stackers</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.outputStackerCount}
                  onChangeText={(v) => updateField('outputStackerCount', v.replace(/[^0-9]/g, ''))}
                  placeholder="e.g., 1"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="number-pad"
                />
              </View>
            </View>
          </>
        )}
      </View>

      {/* Capabilities */}
      <View style={[styles.specSection, { borderColor: themeColors.borderLight }]}>
        <View style={styles.specSectionHeader}>
          <Text style={[styles.specSectionTitle, { color: themeColors.textPrimary }]}>Capabilities</Text>
          <View style={styles.naToggle}>
            <Text style={[styles.naLabel, { color: themeColors.textMuted }]}>N/A</Text>
            <Switch
              value={formData.capabilitiesNa}
              onValueChange={(v) => updateField('capabilitiesNa', v)}
              trackColor={{ false: themeColors.border, true: themeColors.accent }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {!formData.capabilitiesNa && (
          <View style={styles.capabilitiesGrid}>
            {getCapabilitiesForCategory().map((capability) => (
              <TouchableOpacity
                key={capability}
                style={[
                  styles.capabilityChip,
                  {
                    backgroundColor: formData.capabilities.includes(capability)
                      ? themeColors.accentFaint
                      : isDark ? themeColors.sand : '#ffffff',
                    borderColor: formData.capabilities.includes(capability)
                      ? themeColors.accent
                      : themeColors.border,
                  }
                ]}
                onPress={() => toggleCapability(capability)}
              >
                {formData.capabilities.includes(capability) && (
                  <Feather name="check" size={14} color={themeColors.accent} style={{ marginRight: 4 }} />
                )}
                <Text style={[
                  styles.capabilityText,
                  { color: formData.capabilities.includes(capability) ? themeColors.accent : themeColors.textSecondary }
                ]}>
                  {capability}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Material Specifications */}
      <View style={[styles.specSection, { borderColor: themeColors.borderLight }]}>
        <View style={styles.specSectionHeader}>
          <Text style={[styles.specSectionTitle, { color: themeColors.textPrimary }]}>Material Specifications</Text>
          <View style={styles.naToggle}>
            <Text style={[styles.naLabel, { color: themeColors.textMuted }]}>N/A</Text>
            <Switch
              value={formData.materialNa}
              onValueChange={(v) => updateField('materialNa', v)}
              trackColor={{ false: themeColors.border, true: themeColors.accent }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {!formData.materialNa && (
          <>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Material Types</Text>
              <TextInput
                style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                value={formData.materialTypes}
                onChangeText={(v) => updateField('materialTypes', v)}
                placeholder="e.g., Paper, cardstock, envelopes"
                placeholderTextColor={themeColors.textLight}
              />
            </View>

            <View style={styles.inputRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.textPrimary }]}>Max Width</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.maxMaterialWidth}
                  onChangeText={(v) => updateField('maxMaterialWidth', v)}
                  placeholder='e.g., 12"'
                  placeholderTextColor={themeColors.textLight}
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: themeColors.textPrimary }]}>Max Length</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.maxMaterialLength}
                  onChangeText={(v) => updateField('maxMaterialLength', v)}
                  placeholder='e.g., 18"'
                  placeholderTextColor={themeColors.textLight}
                />
              </View>
            </View>
          </>
        )}
      </View>

      {/* Additional Technical */}
      <View style={[styles.specSection, { borderColor: themeColors.borderLight }]}>
        <Text style={[styles.specSectionTitle, { color: themeColors.textPrimary, marginBottom: spacing.md }]}>
          Additional Technical Details
        </Text>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Power Requirements</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.powerRequirements}
            onChangeText={(v) => updateField('powerRequirements', v)}
            placeholder="e.g., 208V 3-phase, 30A"
            placeholderTextColor={themeColors.textLight}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Network Connectivity</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.networkConnectivity}
            onChangeText={(v) => updateField('networkConnectivity', v)}
            placeholder="e.g., Ethernet, Wi-Fi, USB"
            placeholderTextColor={themeColors.textLight}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Included Accessories</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.includedAccessories}
            onChangeText={(v) => updateField('includedAccessories', v)}
            placeholder="List any accessories, spare parts, or extras included..."
            placeholderTextColor={themeColors.textLight}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Maintenance History</Text>
          <TextInput
            style={[styles.textArea, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.maintenanceHistory}
            onChangeText={(v) => updateField('maintenanceHistory', v)}
            placeholder="Recent service, repairs, or maintenance performed..."
            placeholderTextColor={themeColors.textLight}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      </View>
    </View>
  );

  // Step 4: Condition & Logistics
  const renderConditionStep = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>Condition & Logistics</Text>
      <Text style={[styles.stepDescription, { color: themeColors.textMuted }]}>
        Help buyers understand the equipment condition and pickup requirements.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Condition *</Text>
        <View style={styles.optionsGrid}>
          {CONDITIONS.map((condition) => (
            <TouchableOpacity
              key={condition.key}
              style={[
                styles.optionCard,
                { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                formData.condition === condition.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                lightTap();
                updateField('condition', condition.key);
              }}
            >
              <Text style={[
                styles.optionLabel,
                { color: formData.condition === condition.key ? themeColors.accent : themeColors.textPrimary }
              ]}>
                {condition.label}
              </Text>
              <Text style={[styles.optionDescription, { color: themeColors.textMuted }]}>
                {condition.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Hours/Impression Count</Text>
        <TextInput
          style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.hoursCount}
          onChangeText={(v) => updateField('hoursCount', v.replace(/[^0-9]/g, ''))}
          placeholder="e.g., 125000"
          placeholderTextColor={themeColors.textLight}
          keyboardType="number-pad"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Equipment Status *</Text>
        <View style={styles.optionsGrid}>
          {EQUIPMENT_STATUSES.map((status) => (
            <TouchableOpacity
              key={status.key}
              style={[
                styles.optionCard,
                { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                formData.equipmentStatus === status.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                lightTap();
                updateField('equipmentStatus', status.key);
              }}
            >
              <Text style={[
                styles.optionLabel,
                { color: formData.equipmentStatus === status.key ? themeColors.accent : themeColors.textPrimary }
              ]}>
                {status.label}
              </Text>
              <Text style={[styles.optionDescription, { color: themeColors.textMuted }]}>
                {status.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>On-site Assistance *</Text>
        <View style={styles.optionsGrid}>
          {ASSISTANCE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.optionCard,
                { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                formData.onsiteAssistance === option.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                lightTap();
                updateField('onsiteAssistance', option.key);
              }}
            >
              <Text style={[
                styles.optionLabel,
                { color: formData.onsiteAssistance === option.key ? themeColors.accent : themeColors.textPrimary }
              ]}>
                {option.label}
              </Text>
              <Text style={[styles.optionDescription, { color: themeColors.textMuted }]}>
                {option.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>De-installation</Text>
        {DEINSTALL_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.radioOption,
              { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
              formData.deinstallResponsibility === option.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
            ]}
            onPress={() => {
              lightTap();
              updateField('deinstallResponsibility', option.key);
            }}
          >
            <View style={[
              styles.radio,
              { borderColor: formData.deinstallResponsibility === option.key ? themeColors.accent : themeColors.border },
            ]}>
              {formData.deinstallResponsibility === option.key && (
                <View style={[styles.radioInner, { backgroundColor: themeColors.accent }]} />
              )}
            </View>
            <Text style={[styles.radioLabel, { color: themeColors.textPrimary }]}>{option.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {formData.deinstallResponsibility === 'seller_additional_fee' && (
        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>De-installation Fee</Text>
          <View style={styles.currencyInput}>
            <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
            <TextInput
              style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
              value={formData.deinstallFee}
              onChangeText={(v) => updateField('deinstallFee', v.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              placeholderTextColor={themeColors.textLight}
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      )}

      <View style={styles.inputRow}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Weight (lbs)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.weightLbs}
            onChangeText={(v) => updateField('weightLbs', v.replace(/[^0-9]/g, ''))}
            placeholder="e.g., 5000"
            placeholderTextColor={themeColors.textLight}
            keyboardType="number-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Air (PSI)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.airRequirementsPsi}
            onChangeText={(v) => updateField('airRequirementsPsi', v.replace(/[^0-9.]/g, ''))}
            placeholder="e.g., 80"
            placeholderTextColor={themeColors.textLight}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <Text style={[styles.subheading, { color: themeColors.textPrimary }]}>Floor Space (feet)</Text>
      <View style={styles.inputRow}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textMuted }]}>Length</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.floorLength}
            onChangeText={(v) => updateField('floorLength', v.replace(/[^0-9.]/g, ''))}
            placeholder="ft"
            placeholderTextColor={themeColors.textLight}
            keyboardType="decimal-pad"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={[styles.label, { color: themeColors.textMuted }]}>Width</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
            value={formData.floorWidth}
            onChangeText={(v) => updateField('floorWidth', v.replace(/[^0-9.]/g, ''))}
            placeholder="ft"
            placeholderTextColor={themeColors.textLight}
            keyboardType="decimal-pad"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Electrical Requirements</Text>
        <TextInput
          style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.electricalRequirements}
          onChangeText={(v) => updateField('electricalRequirements', v)}
          placeholder="e.g., 480V 3-Phase, 60A"
          placeholderTextColor={themeColors.textLight}
        />
      </View>

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
                  formData.locationId === address.id && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                ]}
                onPress={() => {
                  lightTap();
                  updateField('locationId', address.id);
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
                {formData.locationId === address.id && (
                  <Feather name="check-circle" size={20} color={themeColors.accent} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}>
            <Feather name="map-pin" size={24} color={themeColors.textLight} />
            <Text style={[styles.emptyText, { color: themeColors.textMuted }]}>
              No addresses found. Add one in your profile.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: themeColors.textPrimary }]}>Pickup Notes</Text>
        <TextInput
          style={[styles.textArea, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
          value={formData.pickupNotes}
          onChangeText={(v) => updateField('pickupNotes', v)}
          placeholder="Loading dock access, forklift requirements, scheduling constraints..."
          placeholderTextColor={themeColors.textLight}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>
    </View>
  );

  // Step 5: Pricing & Auction
  const renderPricingStep = () => {
    const hasAuction = formData.listingType === 'auction' || formData.listingType === 'auction_with_offers';
    const hasOffers = formData.listingType === 'make_offer' || formData.listingType === 'auction_with_offers';

    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>Pricing & Auction</Text>
        <Text style={[styles.stepDescription, { color: themeColors.textMuted }]}>
          Set your listing type, pricing, and payment options.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Listing Type *</Text>
          <View style={styles.optionsGrid}>
            {LISTING_TYPES.map((type) => (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.optionCard,
                  { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                  formData.listingType === type.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                ]}
                onPress={() => {
                  lightTap();
                  updateField('listingType', type.key);
                }}
              >
                <Text style={[
                  styles.optionLabel,
                  { color: formData.listingType === type.key ? themeColors.accent : themeColors.textPrimary }
                ]}>
                  {type.label}
                </Text>
                <Text style={[styles.optionDescription, { color: themeColors.textMuted }]}>
                  {type.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {hasAuction && (
          <>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Starting Price *</Text>
              <View style={styles.currencyInput}>
                <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
                <TextInput
                  style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.startingPrice}
                  onChangeText={(v) => updateField('startingPrice', v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Reserve Price (Optional)</Text>
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                Hidden minimum price. Auction won't complete below this.
              </Text>
              <View style={styles.currencyInput}>
                <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
                <TextInput
                  style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.reservePrice}
                  onChangeText={(v) => updateField('reservePrice', v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </>
        )}

        {formData.listingType === 'make_offer' && (
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: themeColors.textPrimary }]}>Asking Price *</Text>
            <Text style={[styles.hint, { color: themeColors.textMuted }]}>
              Set a price to guide buyers on what you're looking for.
            </Text>
            <View style={styles.currencyInput}>
              <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
              <TextInput
                style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                value={formData.buyNowPrice}
                onChangeText={(v) => updateField('buyNowPrice', v.replace(/[^0-9.]/g, ''))}
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
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Auto-Accept Price (Optional)</Text>
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                Automatically accept offers at or above this amount
              </Text>
              <View style={styles.currencyInput}>
                <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
                <TextInput
                  style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.autoAcceptPrice}
                  onChangeText={(v) => updateField('autoAcceptPrice', v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Auto-Decline Price (Optional)</Text>
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                Automatically decline offers below this amount
              </Text>
              <View style={styles.currencyInput}>
                <Text style={[styles.currencySymbol, { color: themeColors.textMuted }]}>$</Text>
                <TextInput
                  style={[styles.input, styles.currencyField, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border }]}
                  value={formData.autoDeclinePrice}
                  onChangeText={(v) => updateField('autoDeclinePrice', v.replace(/[^0-9.]/g, ''))}
                  placeholder="0.00"
                  placeholderTextColor={themeColors.textLight}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </>
        )}

        {hasAuction && (
          <>
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Auction Duration</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                {AUCTION_DURATIONS.map((duration) => (
                  <TouchableOpacity
                    key={duration.key}
                    style={[
                      styles.chip,
                      { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                      formData.auctionDuration === duration.key && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                    ]}
                    onPress={() => {
                      lightTap();
                      updateField('auctionDuration', duration.key);
                    }}
                  >
                    <Text style={[
                      styles.chipText,
                      { color: formData.auctionDuration === duration.key ? themeColors.accent : themeColors.textSecondary }
                    ]}>
                      {duration.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>When to Start</Text>
              <View style={styles.optionsRow}>
                <TouchableOpacity
                  style={[
                    styles.optionCardSmall,
                    { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                    formData.scheduleType === 'immediate' && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                  ]}
                  onPress={() => {
                    lightTap();
                    updateField('scheduleType', 'immediate');
                  }}
                >
                  <Feather
                    name="zap"
                    size={20}
                    color={formData.scheduleType === 'immediate' ? themeColors.accent : themeColors.textMuted}
                  />
                  <Text style={[
                    styles.optionLabelSmall,
                    { color: formData.scheduleType === 'immediate' ? themeColors.accent : themeColors.textPrimary }
                  ]}>
                    Start Now
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.optionCardSmall,
                    { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border },
                    formData.scheduleType === 'scheduled' && { borderColor: themeColors.accent, backgroundColor: themeColors.accentFaint },
                  ]}
                  onPress={() => {
                    lightTap();
                    updateField('scheduleType', 'scheduled');
                  }}
                >
                  <Feather
                    name="calendar"
                    size={20}
                    color={formData.scheduleType === 'scheduled' ? themeColors.accent : themeColors.textMuted}
                  />
                  <Text style={[
                    styles.optionLabelSmall,
                    { color: formData.scheduleType === 'scheduled' ? themeColors.accent : themeColors.textPrimary }
                  ]}>
                    Schedule
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: themeColors.textPrimary }]}>Auction End Time</Text>
              <Text style={[styles.hint, { color: themeColors.textMuted }]}>
                Choose what time of day the auction should end (in your local timezone)
              </Text>
              <TouchableOpacity
                style={[
                  styles.input,
                  styles.pickerButton,
                  { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }
                ]}
                onPress={() => {
                  lightTap();
                  setShowEndTimePicker(true);
                }}
              >
                <Feather name="clock" size={18} color={themeColors.textMuted} />
                <Text style={[styles.pickerButtonText, { color: themeColors.textPrimary }]}>
                  {END_TIME_OPTIONS.find(t => t.key === formData.scheduledEndTime)?.label || '5:00 PM'}
                </Text>
                <Feather name="chevron-down" size={18} color={themeColors.textMuted} />
              </TouchableOpacity>
              <Text style={[styles.hint, { color: themeColors.textMuted, marginTop: spacing.xs }]}>
                Tip: Peak bidding hours are typically 5-8 PM local time
              </Text>
            </View>
          </>
        )}

        <View style={[styles.infoCard, { backgroundColor: themeColors.accentFaint }]}>
          <Feather name="info" size={16} color={themeColors.accent} />
          <Text style={[styles.infoText, { color: themeColors.accent }]}>
            An 8% buyer premium will be added to the final sale price. Seller commission is 8-12% of sale price.
          </Text>
        </View>

        <Text style={[styles.subheading, { color: themeColors.textPrimary, marginTop: spacing.xl }]}>
          Payment Options
        </Text>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: themeColors.textPrimary }]}>Payment Due (Days)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: isDark ? themeColors.sand : '#ffffff', color: themeColors.textPrimary, borderColor: themeColors.border, width: 100 }]}
            value={formData.paymentDueDays}
            onChangeText={(v) => updateField('paymentDueDays', v.replace(/[^0-9]/g, ''))}
            placeholder="7"
            placeholderTextColor={themeColors.textLight}
            keyboardType="number-pad"
          />
        </View>

        <View style={[styles.toggleRow, { borderBottomColor: themeColors.borderLight }]}>
          <View style={styles.toggleContent}>
            <Feather name="credit-card" size={18} color={themeColors.textMuted} />
            <View>
              <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>Credit Card</Text>
              <Text style={[styles.toggleHint, { color: themeColors.textMuted }]}>2.9% + $0.30 fee</Text>
            </View>
          </View>
          <Switch
            value={formData.acceptsCreditCard}
            onValueChange={(v) => updateField('acceptsCreditCard', v)}
            trackColor={{ false: themeColors.border, true: themeColors.accent }}
            thumbColor="#ffffff"
          />
        </View>

        <View style={[styles.toggleRow, { borderBottomColor: themeColors.borderLight }]}>
          <View style={styles.toggleContent}>
            <Feather name="dollar-sign" size={18} color={themeColors.textMuted} />
            <View>
              <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>ACH Transfer</Text>
              <Text style={[styles.toggleHint, { color: themeColors.textMuted }]}>0.8% fee (max $5)</Text>
            </View>
          </View>
          <Switch
            value={formData.acceptsAch}
            onValueChange={(v) => updateField('acceptsAch', v)}
            trackColor={{ false: themeColors.border, true: themeColors.accent }}
            thumbColor="#ffffff"
          />
        </View>

        <View style={[styles.toggleRow, { borderBottomColor: themeColors.borderLight }]}>
          <View style={styles.toggleContent}>
            <Feather name="send" size={18} color={themeColors.textMuted} />
            <View>
              <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>Wire Transfer</Text>
              <Text style={[styles.toggleHint, { color: themeColors.textMuted }]}>Flat fee</Text>
            </View>
          </View>
          <Switch
            value={formData.acceptsWire}
            onValueChange={(v) => updateField('acceptsWire', v)}
            trackColor={{ false: themeColors.border, true: themeColors.accent }}
            thumbColor="#ffffff"
          />
        </View>

        <View style={[styles.toggleRow, { borderBottomColor: themeColors.borderLight }]}>
          <View style={styles.toggleContent}>
            <Feather name="file-text" size={18} color={themeColors.textMuted} />
            <View>
              <Text style={[styles.toggleLabel, { color: themeColors.textPrimary }]}>Check</Text>
              <Text style={[styles.toggleHint, { color: themeColors.textMuted }]}>Manual processing</Text>
            </View>
          </View>
          <Switch
            value={formData.acceptsCheck}
            onValueChange={(v) => updateField('acceptsCheck', v)}
            trackColor={{ false: themeColors.border, true: themeColors.accent }}
            thumbColor="#ffffff"
          />
        </View>
      </View>
    );
  };

  // Step 6: Review
  const renderReviewStep = () => {
    const category = getSelectedCategory();
    const location = addresses?.find(a => a.id === formData.locationId);
    const hasAuction = formData.listingType === 'auction' || formData.listingType === 'auction_with_offers';

    return (
      <View style={styles.stepContent}>
        <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>Review & Publish</Text>
        <Text style={[styles.stepDescription, { color: themeColors.textMuted }]}>
          Review your listing before publishing.
        </Text>

        {/* Preview Card */}
        <View style={[styles.previewCard, { backgroundColor: isDark ? themeColors.sand : '#ffffff', borderColor: themeColors.border }]}>
          {formData.images.length > 0 && (
            <Image
              source={{ uri: formData.images[0].uri }}
              style={styles.previewImage}
              contentFit="cover"
            />
          )}
          <View style={styles.previewContent}>
            <Text style={[styles.previewTitle, { color: themeColors.textPrimary }]}>
              {formData.title || 'Untitled Listing'}
            </Text>
            <Text style={[styles.previewMeta, { color: themeColors.textMuted }]}>
              {[formData.make, formData.model, formData.year].filter(Boolean).join(' · ') || 'No details'}
            </Text>
            {category && (
              <View style={[styles.previewBadge, { backgroundColor: themeColors.accentFaint }]}>
                <Text style={[styles.previewBadgeText, { color: themeColors.accent }]}>
                  {category.name}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Summary Sections */}
        <View style={[styles.summarySection, { borderColor: themeColors.borderLight }]}>
          <Text style={[styles.summarySectionTitle, { color: themeColors.textPrimary }]}>
            <Feather name="camera" size={16} /> Photos
          </Text>
          <Text style={[styles.summarySectionValue, { color: themeColors.textSecondary }]}>
            {formData.images.length} photo{formData.images.length !== 1 ? 's' : ''}
            {formData.videoUrl ? ' + video' : ''}
          </Text>
        </View>

        <View style={[styles.summarySection, { borderColor: themeColors.borderLight }]}>
          <Text style={[styles.summarySectionTitle, { color: themeColors.textPrimary }]}>
            <Feather name="clipboard" size={16} /> Condition
          </Text>
          <Text style={[styles.summarySectionValue, { color: themeColors.textSecondary }]}>
            {CONDITIONS.find(c => c.key === formData.condition)?.label || 'Not specified'}
            {formData.hoursCount ? ` · ${parseInt(formData.hoursCount).toLocaleString()} hrs` : ''}
          </Text>
        </View>

        <View style={[styles.summarySection, { borderColor: themeColors.borderLight }]}>
          <Text style={[styles.summarySectionTitle, { color: themeColors.textPrimary }]}>
            <Feather name="dollar-sign" size={16} /> Pricing
          </Text>
          <Text style={[styles.summarySectionValue, { color: themeColors.textSecondary }]}>
            {LISTING_TYPES.find(t => t.key === formData.listingType)?.label}
            {hasAuction && formData.startingPrice && ` · Starting at $${parseFloat(formData.startingPrice).toLocaleString()}`}
            {formData.listingType === 'make_offer' && formData.buyNowPrice && ` · Asking $${parseFloat(formData.buyNowPrice).toLocaleString()}`}
          </Text>
        </View>

        {hasAuction && (
          <View style={[styles.summarySection, { borderColor: themeColors.borderLight }]}>
            <Text style={[styles.summarySectionTitle, { color: themeColors.textPrimary }]}>
              <Feather name="clock" size={16} /> Duration
            </Text>
            <Text style={[styles.summarySectionValue, { color: themeColors.textSecondary }]}>
              {AUCTION_DURATIONS.find(d => d.key === formData.auctionDuration)?.label || '7 Days'}
              {formData.scheduleType === 'scheduled' ? ' (Scheduled)' : ' (Starts immediately)'}
            </Text>
          </View>
        )}

        <View style={[styles.summarySection, { borderColor: themeColors.borderLight }]}>
          <Text style={[styles.summarySectionTitle, { color: themeColors.textPrimary }]}>
            <Feather name="map-pin" size={16} /> Location
          </Text>
          <Text style={[styles.summarySectionValue, { color: themeColors.textSecondary }]}>
            {location ? `${location.city}, ${location.state}` : 'Not specified'}
          </Text>
        </View>

        <View style={[styles.summarySection, { borderColor: themeColors.borderLight }]}>
          <Text style={[styles.summarySectionTitle, { color: themeColors.textPrimary }]}>
            <Feather name="credit-card" size={16} /> Payment Methods
          </Text>
          <Text style={[styles.summarySectionValue, { color: themeColors.textSecondary }]}>
            {[
              formData.acceptsCreditCard && 'Credit Card',
              formData.acceptsAch && 'ACH',
              formData.acceptsWire && 'Wire',
              formData.acceptsCheck && 'Check',
            ].filter(Boolean).join(', ') || 'None selected'}
          </Text>
        </View>

        {/* Validation Check */}
        {(() => {
          const validation = validateStep(5);
          if (!validation.valid) {
            return (
              <View style={[styles.warningCard, { backgroundColor: colors.warningLight }]}>
                <Feather name="alert-triangle" size={20} color={colors.warning} />
                <Text style={[styles.warningText, { color: colors.warning }]}>
                  {validation.message}
                </Text>
              </View>
            );
          }
          return null;
        })()}
      </View>
    );
  };

  // Render category picker modal
  const renderCategoryPicker = () => (
    <Modal
      visible={showCategoryPicker}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowCategoryPicker(false)}
    >
      <View style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: themeColors.borderLight }]}>
          <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Select Category</Text>
          <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
            <Feather name="x" size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContent}>
          {categories?.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[
                styles.modalOption,
                { borderBottomColor: themeColors.borderLight },
                formData.categoryId === category.id && { backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                updateField('categoryId', category.id);
                setShowCategoryPicker(false);
                lightTap();
              }}
            >
              <Text style={[styles.modalOptionText, { color: themeColors.textPrimary }]}>
                {category.name}
              </Text>
              {formData.categoryId === category.id && (
                <Feather name="check" size={20} color={themeColors.accent} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  // Render OS picker modal
  const renderOsPicker = () => (
    <Modal
      visible={showOsPicker}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowOsPicker(false)}
    >
      <View style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: themeColors.borderLight }]}>
          <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Operating System</Text>
          <TouchableOpacity onPress={() => setShowOsPicker(false)}>
            <Feather name="x" size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContent}>
          {OPERATING_SYSTEMS.map((os) => (
            <TouchableOpacity
              key={os}
              style={[
                styles.modalOption,
                { borderBottomColor: themeColors.borderLight },
                formData.operatingSystem === os && { backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                updateField('operatingSystem', os);
                setShowOsPicker(false);
                lightTap();
              }}
            >
              <Text style={[styles.modalOptionText, { color: themeColors.textPrimary }]}>{os}</Text>
              {formData.operatingSystem === os && (
                <Feather name="check" size={20} color={themeColors.accent} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  // Render controller picker modal
  const renderControllerPicker = () => (
    <Modal
      visible={showControllerPicker}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowControllerPicker(false)}
    >
      <View style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: themeColors.borderLight }]}>
          <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Controller Type</Text>
          <TouchableOpacity onPress={() => setShowControllerPicker(false)}>
            <Feather name="x" size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContent}>
          {CONTROLLER_TYPES.map((controller) => (
            <TouchableOpacity
              key={controller}
              style={[
                styles.modalOption,
                { borderBottomColor: themeColors.borderLight },
                formData.controllerType === controller && { backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                updateField('controllerType', controller);
                setShowControllerPicker(false);
                lightTap();
              }}
            >
              <Text style={[styles.modalOptionText, { color: themeColors.textPrimary }]}>{controller}</Text>
              {formData.controllerType === controller && (
                <Feather name="check" size={20} color={themeColors.accent} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  // Render end time picker modal
  const renderEndTimePicker = () => (
    <Modal
      visible={showEndTimePicker}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowEndTimePicker(false)}
    >
      <View style={[styles.modalContainer, { backgroundColor: themeColors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: themeColors.borderLight }]}>
          <Text style={[styles.modalTitle, { color: themeColors.textPrimary }]}>Auction End Time</Text>
          <TouchableOpacity onPress={() => setShowEndTimePicker(false)}>
            <Feather name="x" size={24} color={themeColors.textPrimary} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.modalContent}>
          {END_TIME_OPTIONS.map((time) => (
            <TouchableOpacity
              key={time.key}
              style={[
                styles.modalOption,
                { borderBottomColor: themeColors.borderLight },
                formData.scheduledEndTime === time.key && { backgroundColor: themeColors.accentFaint },
              ]}
              onPress={() => {
                updateField('scheduledEndTime', time.key);
                setShowEndTimePicker(false);
                lightTap();
              }}
            >
              <Text style={[styles.modalOptionText, { color: themeColors.textPrimary }]}>{time.label}</Text>
              {formData.scheduledEndTime === time.key && (
                <Feather name="check" size={20} color={themeColors.accent} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );

  // Render current step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0: return renderPhotosStep();
      case 1: return renderDetailsStep();
      case 2: return renderSpecsStep();
      case 3: return renderConditionStep();
      case 4: return renderPricingStep();
      case 5: return renderReviewStep();
      default: return null;
    }
  };

  // Show loading spinner when loading existing listing
  if (isLoadingListing) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: themeColors.background }]}>
        <ActivityIndicator size="large" color={themeColors.accent} />
        <Text style={[styles.loadingText, { color: themeColors.textSecondary }]}>Loading listing...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: isDark ? themeColors.sand : '#ffffff' }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDark ? themeColors.sand : '#ffffff', marginTop: insets.top }]}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {
            if (formData.title || formData.images.length > 0) {
              Alert.alert(
                'Discard Changes?',
                'You have unsaved changes. Do you want to save as draft or discard?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
                  { text: 'Save Draft', onPress: handleSaveDraft },
                ]
              );
            } else {
              navigation.goBack();
            }
          }}
        >
          <Feather name="x" size={24} color={themeColors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: themeColors.textPrimary }]}>{isEditMode ? 'Edit Listing' : 'Create Listing'}</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={handleSaveDraft}
          disabled={isSavingDraft}
        >
          {isSavingDraft ? (
            <ActivityIndicator size="small" color={themeColors.accent} />
          ) : (
            <Text style={[styles.headerButtonText, { color: themeColors.accent }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Step Indicator */}
      {renderStepIndicator()}

      {/* Form Content */}
      <ScrollView
        ref={scrollViewRef}
        style={[styles.scrollView, { backgroundColor: themeColors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderStepContent()}
      </ScrollView>

      {/* Footer Navigation */}
      <View style={[styles.footer, { backgroundColor: isDark ? themeColors.sand : '#ffffff', paddingBottom: insets.bottom + spacing.md, borderTopColor: themeColors.borderLight }]}>
        <View style={styles.footerButtons}>
          {currentStep > 0 && (
            <TouchableOpacity
              style={[styles.footerButtonSecondary, { borderColor: themeColors.border }]}
              onPress={handlePrevious}
            >
              <Feather name="arrow-left" size={20} color={themeColors.textPrimary} />
              <Text style={[styles.footerButtonSecondaryText, { color: themeColors.textPrimary }]}>Back</Text>
            </TouchableOpacity>
          )}

          {currentStep < STEPS.length - 1 ? (
            <TouchableOpacity
              style={[styles.footerButtonPrimary, { backgroundColor: themeColors.accent, flex: currentStep === 0 ? 1 : undefined }]}
              onPress={handleNext}
            >
              <Text style={styles.footerButtonPrimaryText}>Continue</Text>
              <Feather name="arrow-right" size={20} color="#ffffff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.footerButtonPrimary, { backgroundColor: themeColors.accent }]}
              onPress={handlePublish}
              disabled={isPublishing}
            >
              {isPublishing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Feather name="send" size={20} color="#ffffff" />
                  <Text style={styles.footerButtonPrimaryText}>Publish Listing</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Modals */}
      {renderCategoryPicker()}
      {renderOsPicker()}
      {renderControllerPicker()}
      {renderEndTimePicker()}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fontSize.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  headerButton: {
    padding: spacing.sm,
    minWidth: 60,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  headerButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  stepIndicator: {
    borderBottomWidth: 1,
  },
  stepIndicatorContent: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xl,
  },
  stepItem: {
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 50,
  },
  stepItemActive: {},
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumber: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  stepLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  scrollView: {
    flex: 1,
  },
  stepContent: {
    padding: spacing.lg,
  },
  stepTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  stepTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
  photoCountBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  photoCountText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  stepDescription: {
    fontSize: fontSize.base,
    marginBottom: spacing.xl,
    lineHeight: 22,
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
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  pickerButtonText: {
    fontSize: fontSize.base,
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
  optionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  optionCardSmall: {
    flex: 1,
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  optionLabelSmall: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
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
    marginTop: 2,
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
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginTop: spacing.lg,
  },
  warningText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  // Images
  imagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  imageItem: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    position: 'relative',
  },
  imageThumbnail: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  primaryBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  primaryBadgeText: {
    color: '#ffffff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  imageActions: {
    position: 'absolute',
    bottom: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  imageActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  addImageButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  addImageButton: {
    width: (SCREEN_WIDTH - spacing.lg * 2 - spacing.md) / 2,
    aspectRatio: 4 / 3,
    borderRadius: borderRadius.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  addImageIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  addImageText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  addImageHint: {
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  // Specs
  specSection: {
    borderBottomWidth: 1,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
  },
  specSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  specSectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  naToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  naLabel: {
    fontSize: fontSize.sm,
  },
  capabilitiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  capabilityChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  capabilityText: {
    fontSize: fontSize.sm,
  },
  // Addresses
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
  emptyCard: {
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: borderRadius.lg,
  },
  emptyText: {
    fontSize: fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  // Review
  previewCard: {
    borderWidth: 1,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  previewImage: {
    width: '100%',
    height: 200,
  },
  previewContent: {
    padding: spacing.lg,
  },
  previewTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  previewMeta: {
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  previewBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
  },
  previewBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  summarySection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  summarySectionTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  summarySectionValue: {
    fontSize: fontSize.sm,
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  footerButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  footerButtonSecondaryText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  footerButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  footerButtonPrimaryText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  // Modals
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  modalContent: {
    flex: 1,
  },
  modalOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  modalOptionText: {
    fontSize: fontSize.base,
  },
});
