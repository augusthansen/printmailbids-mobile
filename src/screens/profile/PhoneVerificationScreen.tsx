import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { API_URL } from '../../constants/config';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';

type Step = 'phone' | 'code' | 'success';

export default function PhoneVerificationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [canResend, setCanResend] = useState(false);

  const codeInputRefs = useRef<(TextInput | null)[]>([]);

  // Initialize with current phone if exists
  useEffect(() => {
    if (profile?.phone && !profile.phone_verified) {
      // Format existing phone for display
      const cleaned = profile.phone.replace(/\D/g, '').replace(/^1/, '');
      if (cleaned.length === 10) {
        setPhone(formatPhoneInput(cleaned));
      }
    }
  }, [profile]);

  // Countdown timer for code expiry
  useEffect(() => {
    if (!expiresAt) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setCanResend(true);
        clearInterval(interval);
      }
    }, 1000);

    // Allow resend after 30 seconds
    const resendTimer = setTimeout(() => {
      setCanResend(true);
    }, 30000);

    return () => {
      clearInterval(interval);
      clearTimeout(resendTimer);
    };
  }, [expiresAt]);

  // Format phone number as user types
  const formatPhoneInput = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    let formatted = '';

    if (cleaned.length > 0) {
      formatted = '(' + cleaned.substring(0, 3);
    }
    if (cleaned.length >= 3) {
      formatted += ') ' + cleaned.substring(3, 6);
    }
    if (cleaned.length >= 6) {
      formatted += '-' + cleaned.substring(6, 10);
    }

    return formatted;
  };

  const handlePhoneChange = (text: string) => {
    const formatted = formatPhoneInput(text);
    setPhone(formatted);
    setError('');
  };

  const sendVerificationCode = async () => {
    if (!profile) return;

    const cleanedPhone = phone.replace(/\D/g, '');
    if (cleanedPhone.length < 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    mediumTap();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/verification/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, userId: profile.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send verification code');
        errorFeedback();
        return;
      }

      setExpiresAt(new Date(data.expiresAt));
      setCanResend(false);
      setStep('code');
      setCode(['', '', '', '', '', '']);
      successFeedback();

      // Focus first code input
      setTimeout(() => {
        codeInputRefs.current[0]?.focus();
      }, 100);
    } catch (err) {
      setError('An error occurred. Please try again.');
      errorFeedback();
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodeInput = (index: number, value: string) => {
    if (value.length > 1) {
      // Handle paste
      const digits = value.replace(/\D/g, '').split('').slice(0, 6);
      const newCode = [...code];
      digits.forEach((digit, i) => {
        if (index + i < 6) {
          newCode[index + i] = digit;
        }
      });
      setCode(newCode);

      // Focus the next empty input or last input
      const nextIndex = Math.min(index + digits.length, 5);
      codeInputRefs.current[nextIndex]?.focus();

      // Auto-submit if all filled
      if (newCode.every(d => d !== '')) {
        verifyCode(newCode.join(''));
      }
      return;
    }

    const newCode = [...code];
    newCode[index] = value.replace(/\D/g, '');
    setCode(newCode);
    setError('');

    // Auto-advance to next input
    if (value && index < 5) {
      codeInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (value && index === 5 && newCode.every(d => d !== '')) {
      verifyCode(newCode.join(''));
    }
  };

  const handleCodeKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      codeInputRefs.current[index - 1]?.focus();
    }
  };

  const verifyCode = async (codeString?: string) => {
    if (!profile) return;

    const verificationCode = codeString || code.join('');

    if (verificationCode.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    mediumTap();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/verification/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode, userId: profile.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Invalid verification code');
        errorFeedback();
        return;
      }

      successFeedback();
      setStep('success');
      await refreshProfile();
    } catch (err) {
      setError('An error occurred. Please try again.');
      errorFeedback();
    } finally {
      setIsLoading(false);
    }
  };

  const formatTimeLeft = () => {
    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDone = () => {
    navigation.goBack();
  };

  const openSmsTerms = () => {
    Linking.openURL('https://printmailbids.com/sms-terms');
  };

  const openPrivacy = () => {
    Linking.openURL('https://printmailbids.com/privacy');
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={[styles.container, { backgroundColor: colors.background }]}
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
          keyboardShouldPersistTaps="handled"
        >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
          <View style={[styles.iconContainer, { backgroundColor: colors.accentFaint }]}>
            <Feather
              name={step === 'success' ? 'check-circle' : 'smartphone'}
              size={32}
              color={step === 'success' ? colors.success : colors.accent}
            />
          </View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {step === 'success' ? 'Phone Verified!' : 'Verify Your Phone'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
            {step === 'success'
              ? 'You can now receive SMS notifications'
              : 'Required to place bids and enable SMS notifications'}
          </Text>
        </View>

        {/* Error Display */}
        {error ? (
          <View style={[styles.errorCard, { backgroundColor: colors.errorLight }]}>
            <Feather name="alert-circle" size={18} color={colors.error} />
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        ) : null}

        {/* Step: Phone Number Input */}
        {step === 'phone' && (
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Phone Number</Text>
                <TextInput
                  style={[styles.phoneInput, { color: colors.textPrimary, borderColor: colors.border }]}
                  value={phone}
                  onChangeText={handlePhoneChange}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={colors.textLight}
                  keyboardType="phone-pad"
                  maxLength={14}
                  editable={!isLoading}
                />
                <Text style={[styles.inputHint, { color: colors.textMuted }]}>
                  US phone numbers only
                </Text>
              </View>
            </View>

            {/* SMS Consent */}
            <View style={[styles.consentCard, { backgroundColor: colors.accentFaint, borderColor: colors.accent }]}>
              <Text style={[styles.consentTitle, { color: colors.accent }]}>
                SMS Messaging Consent
              </Text>
              <Text style={[styles.consentText, { color: colors.textSecondary }]}>
                By tapping "Send Verification Code" below, I consent to receive SMS text messages from PrintMailBids.com at the phone number provided, including verification codes, transaction alerts, bid notifications, and account updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.
              </Text>
              <Text style={[styles.consentLinks, { color: colors.textMuted }]}>
                Consent is not a condition of purchase. View our{' '}
                <Text style={{ color: colors.accent }} onPress={openSmsTerms}>
                  SMS Terms & Conditions
                </Text>
                {' '}and{' '}
                <Text style={{ color: colors.accent }} onPress={openPrivacy}>
                  Privacy Policy
                </Text>
                .
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: phone.replace(/\D/g, '').length >= 10 ? colors.accent : colors.textLight },
              ]}
              onPress={sendVerificationCode}
              disabled={isLoading || phone.replace(/\D/g, '').length < 10}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Feather name="send" size={18} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>Send Verification Code</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Step: Code Verification */}
        {step === 'code' && (
          <View style={styles.section}>
            <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
              <Text style={[styles.codeInstructions, { color: colors.textSecondary }]}>
                Enter the 6-digit code sent to your phone
              </Text>
              {timeLeft > 0 && (
                <Text style={[styles.codeExpiry, { color: colors.textMuted }]}>
                  Code expires in {formatTimeLeft()}
                </Text>
              )}

              {/* Code Input */}
              <View style={styles.codeInputRow}>
                {code.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(el) => { codeInputRefs.current[index] = el; }}
                    style={[
                      styles.codeInput,
                      {
                        color: colors.textPrimary,
                        borderColor: digit ? colors.accent : colors.border,
                        backgroundColor: isDark ? colors.background : '#ffffff',
                      },
                    ]}
                    value={digit}
                    onChangeText={(value) => handleCodeInput(index, value)}
                    onKeyPress={({ nativeEvent }) => handleCodeKeyPress(index, nativeEvent.key)}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!isLoading}
                    selectTextOnFocus
                  />
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: code.every(d => d) ? colors.accent : colors.textLight },
              ]}
              onPress={() => verifyCode()}
              disabled={isLoading || code.some(d => !d)}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Feather name="check" size={18} color="#ffffff" />
                  <Text style={styles.primaryButtonText}>Verify Code</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.codeActions}>
              <TouchableOpacity
                style={styles.textButton}
                onPress={() => {
                  setStep('phone');
                  setCode(['', '', '', '', '', '']);
                  setError('');
                }}
              >
                <Text style={[styles.textButtonText, { color: colors.textMuted }]}>
                  Change number
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.textButton}
                onPress={sendVerificationCode}
                disabled={!canResend || isLoading}
              >
                <Text
                  style={[
                    styles.textButtonText,
                    { color: canResend ? colors.accent : colors.textLight },
                  ]}
                >
                  {canResend ? 'Resend code' : 'Resend in 30s'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step: Success */}
        {step === 'success' && (
          <View style={styles.section}>
            <View style={[styles.successCard, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
              <View style={[styles.successIcon, { backgroundColor: colors.successLight }]}>
                <Feather name="check-circle" size={48} color={colors.success} />
              </View>
              <Text style={[styles.successTitle, { color: colors.textPrimary }]}>
                Phone Verified!
              </Text>
              <Text style={[styles.successText, { color: colors.textMuted }]}>
                You can now place bids, make offers, and receive SMS notifications for important updates.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.accent }]}
              onPress={handleDone}
            >
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.sm,
    marginBottom: spacing.lg,
  },
  inputGroup: {
    gap: spacing.xs,
  },
  inputLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  phoneInput: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    paddingVertical: spacing.md,
    borderBottomWidth: 2,
    textAlign: 'center',
    letterSpacing: 1,
  },
  inputHint: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  consentCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    marginBottom: spacing.lg,
  },
  consentTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.sm,
  },
  consentText: {
    fontSize: fontSize.xs,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  consentLinks: {
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  errorText: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  codeInstructions: {
    fontSize: fontSize.base,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  codeExpiry: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  codeInputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  codeInput: {
    width: 44,
    height: 56,
    borderWidth: 2,
    borderRadius: borderRadius.lg,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    textAlign: 'center',
  },
  codeActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.lg,
  },
  textButton: {
    padding: spacing.sm,
  },
  textButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  successCard: {
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    ...shadows.sm,
    marginBottom: spacing.xl,
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  successTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    marginBottom: spacing.sm,
  },
  successText: {
    fontSize: fontSize.base,
    textAlign: 'center',
    lineHeight: 22,
  },
});
