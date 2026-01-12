import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { supabase } from '../../lib/supabase';
import { uploadAvatar } from '../../utils/avatarUpload';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap, successFeedback, errorFeedback, lightTap } from '../../utils/haptics';
import { API_URL } from '../../constants/config';

type OnboardingStep = 'welcome' | 'profile' | 'account_type' | 'phone' | 'notifications' | 'seller_terms' | 'seller_shipping' | 'seller_wire' | 'complete';
type AccountType = 'buyer' | 'seller' | 'both';

interface OnboardingScreenProps {
  onComplete: () => void;
  onSkip: () => void;
}

export default function OnboardingScreen({ onComplete, onSkip }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const { user, session, profile, refreshProfile } = useAuth();
  const { colors: themeColors, isDark } = useTheme();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);

  // Profile fields - pre-populate from existing profile if available
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [companyName, setCompanyName] = useState(profile?.company_name || '');
  // Don't pre-populate avatar - always show placeholder for onboarding
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Account type
  const [accountType, setAccountType] = useState<AccountType | null>(null);

  // Phone verification
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [showPhoneSuccess, setShowPhoneSuccess] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  // Seller-specific fields
  const [sellerTerms, setSellerTerms] = useState('');
  const [shippingInfo, setShippingInfo] = useState('');
  const [wireBankName, setWireBankName] = useState('');
  const [wireRoutingNumber, setWireRoutingNumber] = useState('');
  const [wireAccountNumber, setWireAccountNumber] = useState('');
  const [wireAccountName, setWireAccountName] = useState('');

  // Push notifications
  const [notificationPermission, setNotificationPermission] = useState<'undetermined' | 'granted' | 'denied'>('undetermined');
  const [requestingPermission, setRequestingPermission] = useState(false);

  // Determine if user is a seller
  const isSeller = accountType === 'seller' || accountType === 'both';

  // Check notification permission status on mount
  useEffect(() => {
    checkNotificationPermission();
  }, []);

  const checkNotificationPermission = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotificationPermission(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
  };

  // Animation
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const checkmarkOpacity = useRef(new Animated.Value(0)).current;

  // Animate checkmark when phone is verified
  useEffect(() => {
    if (showPhoneSuccess) {
      Animated.parallel([
        Animated.spring(checkmarkScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(checkmarkOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      checkmarkScale.setValue(0);
      checkmarkOpacity.setValue(0);
    }
  }, [showPhoneSuccess]);

  const animateTransition = (nextStep: OnboardingStep) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => setCurrentStep(nextStep), 150);
  };

  const pickImage = async () => {
    lightTap();

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow access to your photo library to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleAvatarUpload = async (): Promise<string | null> => {
    if (!avatarUri || !user) return null;

    setAvatarUploading(true);
    try {
      const result = await uploadAvatar(avatarUri, user.id);
      if (result.error) {
        console.error('Avatar upload error:', result.error);
        return null;
      }
      return result.url;
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim()) {
      errorFeedback();
      Alert.alert('Name Required', 'Please enter your name to continue.');
      return;
    }

    setIsLoading(true);
    mediumTap();

    try {
      // Upload avatar if selected
      let avatarUrl = null;
      if (avatarUri && !avatarUri.startsWith('http')) {
        // Only upload if it's a local file (not already a URL from profile)
        avatarUrl = await handleAvatarUpload();
      }

      // Update profile
      const updateData: Record<string, unknown> = {
        full_name: fullName.trim(),
        updated_at: new Date().toISOString(),
      };

      if (companyName.trim()) {
        updateData.company_name = companyName.trim();
      }

      if (avatarUrl) {
        updateData.avatar_url = avatarUrl;
      }

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user?.id);

      if (error) throw error;

      // Don't refresh profile here - it can cause the onboarding to reset
      // We'll refresh at the end when completing onboarding
      successFeedback();

      // Move to account type selection step
      animateTransition('account_type');
    } catch (error) {
      console.error('Error saving profile:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const formatPhoneNumber = (text: string) => {
    // Remove all non-digits
    const digits = text.replace(/\D/g, '');

    // Format as (XXX) XXX-XXXX
    if (digits.length <= 3) {
      return digits;
    } else if (digits.length <= 6) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
    }
  };

  const handlePhoneChange = (text: string) => {
    setPhoneNumber(formatPhoneNumber(text));
  };

  const sendVerificationCode = async () => {
    const digits = phoneNumber.replace(/\D/g, '');
    if (digits.length !== 10) {
      errorFeedback();
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number.');
      return;
    }

    if (!user?.id) {
      errorFeedback();
      Alert.alert('Error', 'You must be logged in to verify your phone.');
      return;
    }

    setSendingCode(true);
    mediumTap();

    try {
      const formattedPhone = `+1${digits}`;

      const response = await fetch(`${API_URL}/verification/send-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          phone: formattedPhone,
          userId: user.id, // Include userId for backward compatibility
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send code');
      }

      setCodeSent(true);
      successFeedback();
      Alert.alert('Code Sent', `A verification code has been sent to ${phoneNumber}`);
    } catch (error: any) {
      console.error('Error sending code:', error);
      errorFeedback();
      Alert.alert('Error', error.message || 'Failed to send verification code.');
    } finally {
      setSendingCode(false);
    }
  };

  const verifyCode = async () => {
    if (verificationCode.length !== 6) {
      errorFeedback();
      Alert.alert('Invalid Code', 'Please enter the 6-digit code.');
      return;
    }

    if (!user?.id) {
      errorFeedback();
      Alert.alert('Error', 'You must be logged in to verify your phone.');
      return;
    }

    setVerifying(true);
    mediumTap();

    try {
      const response = await fetch(`${API_URL}/verification/verify-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          code: verificationCode,
          userId: user.id, // Include userId for backward compatibility
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid code');
      }

      // Don't refresh profile here - we'll do it when completing onboarding
      // The API already updated the phone_verified status in the database
      setPhoneVerified(true);
      setShowPhoneSuccess(true);
      successFeedback();

      // Show success state briefly, then transition to notifications step
      setTimeout(() => {
        animateTransition('notifications');
      }, 1500);
    } catch (error: any) {
      console.error('Error verifying code:', error);
      errorFeedback();
      Alert.alert('Error', error.message || 'Failed to verify code.');
    } finally {
      setVerifying(false);
    }
  };

  const handleSkipPhone = () => {
    lightTap();
    // Go to notifications step
    animateTransition('notifications');
  };

  const handleRequestNotificationPermission = async () => {
    setRequestingPermission(true);
    mediumTap();

    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();

      if (existingStatus === 'denied') {
        // Permission was previously denied, need to go to settings
        Alert.alert(
          'Enable Notifications',
          'To enable push notifications, please go to Settings and allow notifications for PrintMailBids.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings()
            },
          ]
        );
        setRequestingPermission(false);
        return;
      }

      const { status } = await Notifications.requestPermissionsAsync();
      setNotificationPermission(status === 'granted' ? 'granted' : 'denied');

      if (status === 'granted') {
        successFeedback();
        // Continue to next step
        handleNotificationsContinue();
      } else {
        // User denied, but they can still continue
        lightTap();
      }
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      errorFeedback();
    } finally {
      setRequestingPermission(false);
    }
  };

  const handleNotificationsContinue = () => {
    lightTap();
    // If seller, go to seller steps, otherwise complete
    if (isSeller) {
      animateTransition('seller_terms');
    } else {
      animateTransition('complete');
    }
  };

  const handleAccountTypeSelect = async (type: AccountType) => {
    mediumTap();
    setAccountType(type);
    setIsLoading(true);

    try {
      // Update profile with is_seller flag
      const { error } = await supabase
        .from('profiles')
        .update({
          is_seller: type === 'seller' || type === 'both',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id);

      if (error) throw error;

      successFeedback();
      animateTransition('phone');
    } catch (error) {
      console.error('Error saving account type:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to save account type. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSellerTerms = async () => {
    mediumTap();
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          seller_terms: sellerTerms.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id);

      if (error) throw error;

      successFeedback();
      animateTransition('seller_shipping');
    } catch (error) {
      console.error('Error saving seller terms:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to save terms. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSellerShipping = async () => {
    mediumTap();
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          default_shipping_info: shippingInfo.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id);

      if (error) throw error;

      successFeedback();
      animateTransition('seller_wire');
    } catch (error) {
      console.error('Error saving shipping info:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to save shipping info. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveWireInfo = async () => {
    // Validate if any info entered
    const hasAnyInfo = wireBankName || wireRoutingNumber || wireAccountNumber || wireAccountName;
    if (hasAnyInfo) {
      if (!wireBankName.trim() || !wireRoutingNumber.trim() || !wireAccountNumber.trim() || !wireAccountName.trim()) {
        errorFeedback();
        Alert.alert('Incomplete Information', 'Please fill in all required bank fields or skip this step.');
        return;
      }
    }

    mediumTap();
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          wire_bank_name: wireBankName.trim() || null,
          wire_routing_number: wireRoutingNumber.trim() || null,
          wire_account_number: wireAccountNumber.trim() || null,
          wire_account_name: wireAccountName.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id);

      if (error) throw error;

      successFeedback();
      animateTransition('complete');
    } catch (error) {
      console.error('Error saving wire info:', error);
      errorFeedback();
      Alert.alert('Error', 'Failed to save wire information. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async () => {
    mediumTap();
    successFeedback();
    // The onComplete callback will handle marking onboarding complete and refreshing profile
    onComplete();
  };

  const handleSkipAll = () => {
    lightTap();
    Alert.alert(
      'Skip Setup?',
      'You can complete your profile later from the Profile tab. Some features may be limited until your profile is complete.',
      [
        { text: 'Continue Setup', style: 'cancel' },
        {
          text: 'Skip for Now',
          onPress: async () => {
            await supabase
              .from('profiles')
              .update({ onboarding_skipped: true })
              .eq('id', user?.id);
            onSkip();
          }
        },
      ]
    );
  };

  const renderWelcomeStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: themeColors.accentFaint }]}>
        <Feather name="user-check" size={48} color={themeColors.accent} />
      </View>

      <Text style={[styles.title, { color: themeColors.textPrimary }]}>
        Welcome to PrintMailBids!
      </Text>

      <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
        Let's set up your profile so sellers and buyers know who they're working with.
      </Text>

      <View style={styles.benefitsList}>
        <View style={styles.benefitItem}>
          <View style={[styles.benefitIcon, { backgroundColor: colors.successLight }]}>
            <Feather name="shield" size={20} color={colors.success} />
          </View>
          <View style={styles.benefitText}>
            <Text style={[styles.benefitTitle, { color: themeColors.textPrimary }]}>Build Trust</Text>
            <Text style={[styles.benefitDesc, { color: themeColors.textMuted }]}>
              Complete profiles get more responses
            </Text>
          </View>
        </View>

        <View style={styles.benefitItem}>
          <View style={[styles.benefitIcon, { backgroundColor: colors.accentFaint }]}>
            <Feather name="bell" size={20} color={colors.accent} />
          </View>
          <View style={styles.benefitText}>
            <Text style={[styles.benefitTitle, { color: themeColors.textPrimary }]}>Stay Informed</Text>
            <Text style={[styles.benefitDesc, { color: themeColors.textMuted }]}>
              Get SMS alerts for bids and offers
            </Text>
          </View>
        </View>

        <View style={styles.benefitItem}>
          <View style={[styles.benefitIcon, { backgroundColor: colors.warningLight }]}>
            <Feather name="zap" size={20} color={colors.warning} />
          </View>
          <View style={styles.benefitText}>
            <Text style={[styles.benefitTitle, { color: themeColors.textPrimary }]}>Quick Setup</Text>
            <Text style={[styles.benefitDesc, { color: themeColors.textMuted }]}>
              Takes less than 2 minutes
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: themeColors.accent }]}
          onPress={() => animateTransition('profile')}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
          <Feather name="arrow-right" size={20} color={colors.white} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipButton} onPress={handleSkipAll}>
          <Text style={[styles.skipButtonText, { color: themeColors.textMuted }]}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderProfileStep = () => (
    <View style={styles.stepContainer}>
      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>
        Your Profile
      </Text>
      <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
        Tell us a bit about yourself
      </Text>

      {/* Avatar */}
      <TouchableOpacity style={styles.avatarContainer} onPress={pickImage}>
        {avatarUri ? (
          <Image source={avatarUri} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Feather name="camera" size={40} color={themeColors.accent} />
            <Text style={[styles.avatarHintText, { color: themeColors.textSecondary }]}>Add Photo</Text>
          </View>
        )}
        <View style={[styles.avatarBadge, { backgroundColor: themeColors.accent }]}>
          <Feather name="edit-2" size={12} color={colors.white} />
        </View>
        {avatarUploading && (
          <View style={styles.avatarLoading}>
            <ActivityIndicator color={colors.white} />
          </View>
        )}
      </TouchableOpacity>

      {/* Name Input */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
          Full Name <Text style={{ color: colors.error }}>*</Text>
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark ? themeColors.sand : '#ffffff',
              color: themeColors.textPrimary,
              borderColor: themeColors.border,
            }
          ]}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Enter your full name"
          placeholderTextColor={themeColors.textLight}
          autoCapitalize="words"
        />
      </View>

      {/* Company Name Input */}
      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
          Company Name <Text style={{ color: themeColors.textLight }}>(optional)</Text>
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark ? themeColors.sand : '#ffffff',
              color: themeColors.textPrimary,
              borderColor: themeColors.border,
            }
          ]}
          value={companyName}
          onChangeText={setCompanyName}
          placeholder="Enter your company name"
          placeholderTextColor={themeColors.textLight}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: themeColors.accent },
            isLoading && styles.buttonDisabled,
          ]}
          onPress={handleSaveProfile}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Continue</Text>
              <Feather name="arrow-right" size={20} color={colors.white} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAccountTypeStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: themeColors.accentFaint }]}>
        <Feather name="users" size={48} color={themeColors.accent} />
      </View>

      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>
        How will you use PrintMailBids?
      </Text>
      <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
        Select your account type to customize your experience
      </Text>

      <View style={styles.accountTypeList}>
        <TouchableOpacity
          style={[
            styles.accountTypeCard,
            { backgroundColor: themeColors.surface, borderColor: themeColors.border },
          ]}
          onPress={() => handleAccountTypeSelect('buyer')}
          disabled={isLoading}
        >
          <View style={[styles.accountTypeIcon, { backgroundColor: colors.accentFaint }]}>
            <Feather name="shopping-cart" size={24} color={colors.accent} />
          </View>
          <View style={styles.accountTypeContent}>
            <Text style={[styles.accountTypeTitle, { color: themeColors.textPrimary }]}>
              Buyer Only
            </Text>
            <Text style={[styles.accountTypeDesc, { color: themeColors.textMuted }]}>
              Browse and purchase equipment from sellers
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={themeColors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.accountTypeCard,
            { backgroundColor: themeColors.surface, borderColor: themeColors.border },
          ]}
          onPress={() => handleAccountTypeSelect('seller')}
          disabled={isLoading}
        >
          <View style={[styles.accountTypeIcon, { backgroundColor: colors.successLight }]}>
            <Feather name="tag" size={24} color={colors.success} />
          </View>
          <View style={styles.accountTypeContent}>
            <Text style={[styles.accountTypeTitle, { color: themeColors.textPrimary }]}>
              Seller Only
            </Text>
            <Text style={[styles.accountTypeDesc, { color: themeColors.textMuted }]}>
              List and sell your equipment to buyers
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color={themeColors.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.accountTypeCard,
            { backgroundColor: themeColors.surface, borderColor: colors.accent, borderWidth: 2 },
          ]}
          onPress={() => handleAccountTypeSelect('both')}
          disabled={isLoading}
        >
          <View style={[styles.accountTypeIcon, { backgroundColor: colors.warningLight }]}>
            <Feather name="repeat" size={24} color={colors.warning} />
          </View>
          <View style={styles.accountTypeContent}>
            <Text style={[styles.accountTypeTitle, { color: themeColors.textPrimary }]}>
              Both
            </Text>
            <Text style={[styles.accountTypeDesc, { color: themeColors.textMuted }]}>
              Buy and sell equipment on the platform
            </Text>
            <View style={[styles.recommendedBadge, { backgroundColor: colors.accentFaint }]}>
              <Text style={[styles.recommendedText, { color: colors.accent }]}>Recommended</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={themeColors.textLight} />
        </TouchableOpacity>
      </View>

      {isLoading && (
        <ActivityIndicator size="large" color={themeColors.accent} style={{ marginTop: spacing.xl }} />
      )}
    </View>
  );

  const renderPhoneStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: colors.successLight }]}>
        <Feather name={showPhoneSuccess ? "check-circle" : "smartphone"} size={48} color={colors.success} />
      </View>

      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>
        {showPhoneSuccess ? 'Phone Verified!' : 'Verify Your Phone'}
      </Text>
      <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
        {showPhoneSuccess
          ? 'Your phone number has been verified successfully'
          : 'Get instant SMS notifications for bids, offers, and important updates'
        }
      </Text>

      {showPhoneSuccess ? (
        <Animated.View
          style={[
            styles.bigCheckContainer,
            {
              opacity: checkmarkOpacity,
              transform: [{ scale: checkmarkScale }],
            }
          ]}
        >
          <View style={[styles.bigCheckCircle, { backgroundColor: colors.success }]}>
            <Feather name="check" size={64} color={colors.white} />
          </View>
          <Text style={[styles.verifiedText, { color: colors.success }]}>
            Verified
          </Text>
        </Animated.View>
      ) : !codeSent ? (
        <>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
              Phone Number
            </Text>
            <View style={[
              styles.phoneInputContainer,
              {
                backgroundColor: isDark ? themeColors.sand : '#ffffff',
                borderColor: themeColors.border,
              }
            ]}>
              <Text style={[styles.countryCode, { color: themeColors.textPrimary }]}>+1</Text>
              <TextInput
                style={[styles.phoneInput, { color: themeColors.textPrimary }]}
                value={phoneNumber}
                onChangeText={handlePhoneChange}
                placeholder="(555) 555-5555"
                placeholderTextColor={themeColors.textLight}
                keyboardType="phone-pad"
                maxLength={14}
              />
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: themeColors.accent },
                sendingCode && styles.buttonDisabled,
              ]}
              onPress={sendVerificationCode}
              disabled={sendingCode}
            >
              {sendingCode ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Feather name="send" size={18} color={colors.white} />
                  <Text style={styles.primaryButtonText}>Send Code</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
              Enter 6-digit code
            </Text>
            <TextInput
              style={[
                styles.codeInput,
                {
                  backgroundColor: isDark ? themeColors.sand : '#ffffff',
                  color: themeColors.textPrimary,
                  borderColor: themeColors.border,
                }
              ]}
              value={verificationCode}
              onChangeText={(text) => setVerificationCode(text.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={themeColors.textLight}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: colors.success },
                verifying && styles.buttonDisabled,
              ]}
              onPress={verifyCode}
              disabled={verifying}
            >
              {verifying ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Feather name="check" size={18} color={colors.white} />
                  <Text style={styles.primaryButtonText}>Verify</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.resendButton}
            onPress={() => {
              setCodeSent(false);
              setVerificationCode('');
            }}
          >
            <Text style={[styles.resendButtonText, { color: themeColors.accent }]}>
              Change phone number
            </Text>
          </TouchableOpacity>
        </>
      )}

      {!showPhoneSuccess && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkipPhone}>
          <Text style={[styles.skipButtonText, { color: themeColors.textMuted }]}>
            Skip for now
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderNotificationsStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: colors.errorLight }]}>
        <Feather name="bell" size={48} color={colors.error} />
      </View>

      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>
        Stay in the Loop
      </Text>
      <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
        Enable push notifications so you never miss an outbid, new offer, or important update.
      </Text>

      <View style={styles.notificationBenefits}>
        <View style={styles.benefitItem}>
          <View style={[styles.benefitIcon, { backgroundColor: colors.errorLight }]}>
            <Feather name="trending-up" size={20} color={colors.error} />
          </View>
          <View style={styles.benefitText}>
            <Text style={[styles.benefitTitle, { color: themeColors.textPrimary }]}>Outbid Alerts</Text>
            <Text style={[styles.benefitDesc, { color: themeColors.textMuted }]}>
              Know instantly when someone outbids you
            </Text>
          </View>
        </View>

        <View style={styles.benefitItem}>
          <View style={[styles.benefitIcon, { backgroundColor: colors.successLight }]}>
            <Feather name="dollar-sign" size={20} color={colors.success} />
          </View>
          <View style={styles.benefitText}>
            <Text style={[styles.benefitTitle, { color: themeColors.textPrimary }]}>New Offers</Text>
            <Text style={[styles.benefitDesc, { color: themeColors.textMuted }]}>
              Get notified of offers on your listings
            </Text>
          </View>
        </View>

        <View style={styles.benefitItem}>
          <View style={[styles.benefitIcon, { backgroundColor: colors.accentFaint }]}>
            <Feather name="clock" size={20} color={colors.accent} />
          </View>
          <View style={styles.benefitText}>
            <Text style={[styles.benefitTitle, { color: themeColors.textPrimary }]}>Auction Ending</Text>
            <Text style={[styles.benefitDesc, { color: themeColors.textMuted }]}>
              Reminders before auctions you're watching end
            </Text>
          </View>
        </View>

        <View style={styles.benefitItem}>
          <View style={[styles.benefitIcon, { backgroundColor: colors.warningLight }]}>
            <Feather name="message-circle" size={20} color={colors.warning} />
          </View>
          <View style={styles.benefitText}>
            <Text style={[styles.benefitTitle, { color: themeColors.textPrimary }]}>Messages</Text>
            <Text style={[styles.benefitDesc, { color: themeColors.textMuted }]}>
              Never miss a message from buyers or sellers
            </Text>
          </View>
        </View>
      </View>

      {notificationPermission === 'granted' ? (
        <View style={[styles.permissionGranted, { backgroundColor: colors.successLight }]}>
          <Feather name="check-circle" size={24} color={colors.success} />
          <Text style={[styles.permissionGrantedText, { color: colors.success }]}>
            Notifications enabled!
          </Text>
        </View>
      ) : (
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: colors.error },
              requestingPermission && styles.buttonDisabled,
            ]}
            onPress={handleRequestNotificationPermission}
            disabled={requestingPermission}
          >
            {requestingPermission ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Feather name="bell" size={18} color={colors.white} />
                <Text style={styles.primaryButtonText}>Enable Notifications</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.skipButton}
        onPress={handleNotificationsContinue}
      >
        <Text style={[styles.skipButtonText, { color: themeColors.textMuted }]}>
          {notificationPermission === 'granted' ? 'Continue' : 'Skip for now'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSellerTermsStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: colors.accentFaint }]}>
        <Feather name="file-text" size={48} color={colors.accent} />
      </View>

      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>
        Seller Terms & Conditions
      </Text>
      <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
        Set default terms that apply to all your listings. Buyers must accept these before bidding.
      </Text>

      <View style={[styles.laterInfoCard, { backgroundColor: themeColors.accentFaint }]}>
        <Feather name="info" size={16} color={themeColors.accent} />
        <Text style={[styles.laterInfoText, { color: themeColors.accent }]}>
          You can update these anytime in Seller Settings
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
          Your Terms & Conditions
        </Text>
        <TextInput
          style={[
            styles.textArea,
            {
              backgroundColor: isDark ? themeColors.sand : '#ffffff',
              color: themeColors.textPrimary,
              borderColor: themeColors.border,
            }
          ]}
          value={sellerTerms}
          onChangeText={setSellerTerms}
          placeholder="e.g., All sales are final. Equipment sold as-is. Buyer responsible for pickup within 14 days..."
          placeholderTextColor={themeColors.textLight}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
        <Text style={[styles.inputHelp, { color: themeColors.textLight }]}>
          Leave blank to use platform default terms
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: themeColors.accent },
            isLoading && styles.buttonDisabled,
          ]}
          onPress={handleSaveSellerTerms}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Continue</Text>
              <Feather name="arrow-right" size={20} color={colors.white} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.skipButton} onPress={() => animateTransition('seller_shipping')}>
        <Text style={[styles.skipButtonText, { color: themeColors.textMuted }]}>
          Skip for now
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSellerShippingStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: colors.successLight }]}>
        <Feather name="truck" size={48} color={colors.success} />
      </View>

      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>
        Shipping & Pickup Details
      </Text>
      <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
        Default shipping information that will appear on all your listings.
      </Text>

      <View style={[styles.laterInfoCard, { backgroundColor: themeColors.accentFaint }]}>
        <Feather name="info" size={16} color={themeColors.accent} />
        <Text style={[styles.laterInfoText, { color: themeColors.accent }]}>
          You can update these anytime in Seller Settings
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
          Shipping & Pickup Information
        </Text>
        <TextInput
          style={[
            styles.textArea,
            {
              backgroundColor: isDark ? themeColors.sand : '#ffffff',
              color: themeColors.textPrimary,
              borderColor: themeColors.border,
            }
          ]}
          value={shippingInfo}
          onChangeText={setShippingInfo}
          placeholder="e.g., Equipment located at our warehouse in Dallas, TX. Forklift available for loading. Pickup by appointment M-F 8am-5pm..."
          placeholderTextColor={themeColors.textLight}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />
        <Text style={[styles.inputHelp, { color: themeColors.textLight }]}>
          You can customize this per listing later
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: themeColors.accent },
            isLoading && styles.buttonDisabled,
          ]}
          onPress={handleSaveSellerShipping}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Continue</Text>
              <Feather name="arrow-right" size={20} color={colors.white} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.skipButton} onPress={() => animateTransition('seller_wire')}>
        <Text style={[styles.skipButtonText, { color: themeColors.textMuted }]}>
          Skip for now
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderSellerWireStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: colors.warningLight }]}>
        <Feather name="credit-card" size={48} color={colors.warning} />
      </View>

      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>
        Wire Transfer Information
      </Text>
      <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
        Accept wire transfer payments from buyers. This info is only shown when buyers choose to pay via wire.
      </Text>

      <View style={[styles.laterInfoCard, { backgroundColor: themeColors.accentFaint }]}>
        <Feather name="info" size={16} color={themeColors.accent} />
        <Text style={[styles.laterInfoText, { color: themeColors.accent }]}>
          You can add this later in Seller Settings
        </Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
          Bank Name *
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark ? themeColors.sand : '#ffffff',
              color: themeColors.textPrimary,
              borderColor: themeColors.border,
            }
          ]}
          value={wireBankName}
          onChangeText={setWireBankName}
          placeholder="e.g., Chase Bank"
          placeholderTextColor={themeColors.textLight}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
          Routing Number (ABA) *
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark ? themeColors.sand : '#ffffff',
              color: themeColors.textPrimary,
              borderColor: themeColors.border,
            }
          ]}
          value={wireRoutingNumber}
          onChangeText={setWireRoutingNumber}
          placeholder="9-digit routing number"
          placeholderTextColor={themeColors.textLight}
          keyboardType="number-pad"
          maxLength={9}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
          Account Number *
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark ? themeColors.sand : '#ffffff',
              color: themeColors.textPrimary,
              borderColor: themeColors.border,
            }
          ]}
          value={wireAccountNumber}
          onChangeText={setWireAccountNumber}
          placeholder="Your bank account number"
          placeholderTextColor={themeColors.textLight}
          keyboardType="number-pad"
          secureTextEntry
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.inputLabel, { color: themeColors.textSecondary }]}>
          Account Holder Name *
        </Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: isDark ? themeColors.sand : '#ffffff',
              color: themeColors.textPrimary,
              borderColor: themeColors.border,
            }
          ]}
          value={wireAccountName}
          onChangeText={setWireAccountName}
          placeholder="Name on the account"
          placeholderTextColor={themeColors.textLight}
          autoCapitalize="words"
        />
      </View>

      <View style={[styles.infoCard, { backgroundColor: colors.warningLight }]}>
        <Feather name="shield" size={16} color={colors.warning} />
        <Text style={[styles.infoCardText, { color: colors.warning }]}>
          Your banking information is encrypted and only shown to buyers who select wire transfer.
        </Text>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: themeColors.accent },
            isLoading && styles.buttonDisabled,
          ]}
          onPress={handleSaveWireInfo}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Complete Setup</Text>
              <Feather name="check" size={20} color={colors.white} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.skipButton} onPress={() => animateTransition('complete')}>
        <Text style={[styles.skipButtonText, { color: themeColors.textMuted }]}>
          Skip for now
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderCompleteStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: colors.successLight }]}>
        <Feather name="check-circle" size={48} color={colors.success} />
      </View>

      <Text style={[styles.title, { color: themeColors.textPrimary }]}>
        You're All Set!
      </Text>

      <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
        Your profile is ready. Start browsing equipment or list your own items for sale.
      </Text>

      <View style={[styles.summaryCard, { backgroundColor: themeColors.surface }]}>
        <View style={styles.summaryRow}>
          <Feather
            name="user"
            size={20}
            color={fullName ? colors.success : themeColors.textMuted}
          />
          <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Name</Text>
          <Text style={[styles.summaryValue, { color: themeColors.textPrimary }]}>
            {fullName || 'Not set'}
          </Text>
        </View>

        {companyName && (
          <View style={styles.summaryRow}>
            <Feather name="briefcase" size={20} color={colors.success} />
            <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Company</Text>
            <Text style={[styles.summaryValue, { color: themeColors.textPrimary }]}>
              {companyName}
            </Text>
          </View>
        )}

        <View style={styles.summaryRow}>
          <Feather
            name="smartphone"
            size={20}
            color={phoneVerified ? colors.success : themeColors.textMuted}
          />
          <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Phone</Text>
          <Text style={[
            styles.summaryValue,
            { color: phoneVerified ? colors.success : themeColors.textMuted }
          ]}>
            {phoneVerified ? 'Verified' : 'Not verified'}
          </Text>
        </View>

        <View style={styles.summaryRow}>
          <Feather
            name="bell"
            size={20}
            color={notificationPermission === 'granted' ? colors.success : themeColors.textMuted}
          />
          <Text style={[styles.summaryLabel, { color: themeColors.textSecondary }]}>Notifications</Text>
          <Text style={[
            styles.summaryValue,
            { color: notificationPermission === 'granted' ? colors.success : themeColors.textMuted }
          ]}>
            {notificationPermission === 'granted' ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: themeColors.accent }]}
          onPress={handleComplete}
        >
          <Text style={styles.primaryButtonText}>Start Browsing</Text>
          <Feather name="arrow-right" size={20} color={colors.white} />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return renderWelcomeStep();
      case 'profile':
        return renderProfileStep();
      case 'account_type':
        return renderAccountTypeStep();
      case 'phone':
        return renderPhoneStep();
      case 'notifications':
        return renderNotificationsStep();
      case 'seller_terms':
        return renderSellerTermsStep();
      case 'seller_shipping':
        return renderSellerShippingStep();
      case 'seller_wire':
        return renderSellerWireStep();
      case 'complete':
        return renderCompleteStep();
    }
  };

  const getProgress = () => {
    // Buyer flow: welcome -> profile -> account_type -> phone -> notifications -> complete (5 steps)
    // Seller flow: welcome -> profile -> account_type -> phone -> notifications -> seller_terms -> seller_shipping -> seller_wire -> complete (8 steps)
    const buyerSteps = ['welcome', 'profile', 'account_type', 'phone', 'notifications', 'complete'];
    const sellerSteps = ['welcome', 'profile', 'account_type', 'phone', 'notifications', 'seller_terms', 'seller_shipping', 'seller_wire', 'complete'];

    const steps = isSeller ? sellerSteps : buyerSteps;
    const currentIndex = steps.indexOf(currentStep);
    return currentIndex / (steps.length - 1);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: themeColors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        {/* Progress bar */}
        <View style={[styles.progressContainer, { backgroundColor: themeColors.sand }]}>
          <View
            style={[
              styles.progressBar,
              { backgroundColor: themeColors.accent, width: `${getProgress() * 100}%` }
            ]}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xl }
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim }}>
          {renderStep()}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  progressContainer: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
  },
  stepContainer: {
    alignItems: 'center',
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  stepTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  stepSubtitle: {
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  benefitsList: {
    width: '100%',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: 2,
  },
  benefitDesc: {
    fontSize: fontSize.sm,
  },
  buttonContainer: {
    width: '100%',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 56,
    borderRadius: borderRadius.lg,
    ...shadows.md,
  },
  primaryButtonText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  skipButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  avatarContainer: {
    position: 'relative',
    width: 120,
    height: 120,
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#6b7280',
    backgroundColor: '#374151',
  },
  avatarHintText: {
    fontSize: 11,
    marginTop: 6,
    textAlign: 'center',
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.white,
  },
  avatarLoading: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 60,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inputGroup: {
    width: '100%',
    marginBottom: spacing.lg,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.sm,
  },
  input: {
    height: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    fontSize: fontSize.base,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
  },
  countryCode: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    marginRight: spacing.sm,
  },
  phoneInput: {
    flex: 1,
    fontSize: fontSize.base,
    height: '100%',
  },
  codeInput: {
    height: 64,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: 8,
  },
  resendButton: {
    paddingVertical: spacing.md,
  },
  resendButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  summaryCard: {
    width: '100%',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    gap: spacing.md,
    marginBottom: spacing.xl,
    ...shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    width: 80,
  },
  summaryValue: {
    flex: 1,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    textAlign: 'right',
  },
  // Account type styles
  accountTypeList: {
    width: '100%',
    gap: spacing.md,
  },
  accountTypeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    gap: spacing.md,
    ...shadows.sm,
  },
  accountTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountTypeContent: {
    flex: 1,
  },
  accountTypeTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: 4,
  },
  accountTypeDesc: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  recommendedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginTop: spacing.sm,
  },
  recommendedText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  // Seller steps styles
  textArea: {
    minHeight: 140,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    textAlignVertical: 'top',
  },
  inputHelp: {
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
  },
  infoCardText: {
    flex: 1,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  // Notifications step styles
  notificationBenefits: {
    width: '100%',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  permissionGranted: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.xl,
    marginBottom: spacing.md,
  },
  permissionGrantedText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  // "Add later" info card styles
  laterInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.lg,
    width: '100%',
  },
  laterInfoText: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  // Phone verification success styles
  bigCheckContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xl,
  },
  bigCheckCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  verifiedText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
  },
});
