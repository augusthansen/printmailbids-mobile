import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { uploadAvatar } from '../../utils/avatarUpload';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap, successFeedback, errorFeedback, lightTap } from '../../utils/haptics';
import { API_URL } from '../../constants/config';

type OnboardingStep = 'welcome' | 'profile' | 'phone' | 'complete';

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

  // Phone verification
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);

  // Animation
  const fadeAnim = useRef(new Animated.Value(1)).current;

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

      // Move to phone verification step
      animateTransition('phone');
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
      successFeedback();
      animateTransition('complete');
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
    animateTransition('complete');
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

  const renderPhoneStep = () => (
    <View style={styles.stepContainer}>
      <View style={[styles.iconContainer, { backgroundColor: colors.successLight }]}>
        <Feather name="smartphone" size={48} color={colors.success} />
      </View>

      <Text style={[styles.stepTitle, { color: themeColors.textPrimary }]}>
        Verify Your Phone
      </Text>
      <Text style={[styles.stepSubtitle, { color: themeColors.textMuted }]}>
        Get instant SMS notifications for bids, offers, and important updates
      </Text>

      {!codeSent ? (
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

      <TouchableOpacity style={styles.skipButton} onPress={handleSkipPhone}>
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
      case 'phone':
        return renderPhoneStep();
      case 'complete':
        return renderCompleteStep();
    }
  };

  const getProgress = () => {
    switch (currentStep) {
      case 'welcome':
        return 0;
      case 'profile':
        return 0.33;
      case 'phone':
        return 0.66;
      case 'complete':
        return 1;
    }
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
});
