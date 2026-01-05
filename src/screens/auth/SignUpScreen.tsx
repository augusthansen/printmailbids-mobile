import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import { AuthStackParamList } from '../../navigation/types';
import { colors, spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  const handleSignUp = async () => {
    if (!fullName || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);
    const { error } = await signUp(email, password, fullName);
    setIsLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert(
        'Check Your Email',
        'We sent you a verification link to complete your registration.',
        [{ text: 'OK', onPress: () => navigation.navigate('SignIn') }]
      );
    }
  };

  const renderInput = (
    icon: keyof typeof Feather.glyphMap,
    placeholder: string,
    value: string,
    onChangeText: (text: string) => void,
    inputKey: string,
    options?: {
      secureTextEntry?: boolean;
      keyboardType?: 'email-address' | 'default';
      autoCapitalize?: 'none' | 'sentences' | 'words';
    }
  ) => (
    <View style={[
      styles.inputWrapper,
      focusedInput === inputKey && styles.inputWrapperFocused
    ]}>
      <Feather name={icon} size={18} color={colors.textMuted} style={styles.inputIcon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.textLight}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={options?.secureTextEntry && !showPassword}
        keyboardType={options?.keyboardType || 'default'}
        autoCapitalize={options?.autoCapitalize || 'sentences'}
        onFocus={() => setFocusedInput(inputKey)}
        onBlur={() => setFocusedInput(null)}
      />
      {options?.secureTextEntry && (
        <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
          <Feather
            name={showPassword ? 'eye-off' : 'eye'}
            size={18}
            color={colors.textMuted}
          />
        </Pressable>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Feather name="arrow-left" size={24} color={colors.accent} />
            </TouchableOpacity>
            <View style={styles.logoRow}>
              <View style={styles.logoContainer}>
                <Text style={styles.logoText}>PMB</Text>
              </View>
              <View style={styles.titleColumn}>
                <View style={styles.titleRow}>
                  <Text style={styles.titlePrimary}>PrintMail</Text>
                  <Text style={styles.titleAccent}>Bids</Text>
                </View>
                <Text style={styles.subtitle}>Create your account</Text>
              </View>
            </View>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Full Name</Text>
              {renderInput('user', 'Enter your full name', fullName, setFullName, 'name', {
                autoCapitalize: 'words',
              })}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Email</Text>
              {renderInput('mail', 'Enter your email', email, setEmail, 'email', {
                keyboardType: 'email-address',
                autoCapitalize: 'none',
              })}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              {renderInput('lock', 'Create a password', password, setPassword, 'password', {
                secureTextEntry: true,
              })}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Confirm Password</Text>
              {renderInput('lock', 'Confirm your password', confirmPassword, setConfirmPassword, 'confirm', {
                secureTextEntry: true,
              })}
            </View>

            {/* Password Requirements */}
            <View style={styles.requirements}>
              <View style={styles.requirementRow}>
                <Feather
                  name={password.length >= 6 ? 'check-circle' : 'circle'}
                  size={14}
                  color={password.length >= 6 ? colors.success : colors.textLight}
                />
                <Text style={[
                  styles.requirementText,
                  password.length >= 6 && styles.requirementMet
                ]}>
                  At least 6 characters
                </Text>
              </View>
              <View style={styles.requirementRow}>
                <Feather
                  name={password === confirmPassword && password.length > 0 ? 'check-circle' : 'circle'}
                  size={14}
                  color={password === confirmPassword && password.length > 0 ? colors.success : colors.textLight}
                />
                <Text style={[
                  styles.requirementText,
                  password === confirmPassword && password.length > 0 && styles.requirementMet
                ]}>
                  Passwords match
                </Text>
              </View>
            </View>

            {/* Sign Up Button */}
            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSignUp}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Text style={styles.buttonText}>Create Account</Text>
                  <Feather name="arrow-right" size={18} color={colors.white} />
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Sign In Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
              <Text style={styles.footerLink}> Sign in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['5xl'],
    paddingBottom: spacing['3xl'],
  },
  header: {
    marginBottom: spacing['3xl'],
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accentFaint,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  logoContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.3,
  },
  titleColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titlePrimary: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.primary,
    letterSpacing: -0.5,
  },
  titleAccent: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.accent,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  form: {
    gap: spacing.lg,
  },
  inputContainer: {
    gap: spacing.sm,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.textPrimary,
    marginLeft: spacing.xs,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    height: 52,
    ...shadows.sm,
  },
  inputWrapperFocused: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  inputIcon: {
    marginRight: spacing.md,
  },
  input: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.foreground,
  },
  eyeButton: {
    padding: spacing.sm,
    marginRight: -spacing.sm,
  },
  requirements: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  requirementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requirementText: {
    fontSize: fontSize.sm,
    color: colors.textLight,
  },
  requirementMet: {
    color: colors.success,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 52,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    marginTop: spacing.md,
    ...shadows.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing['3xl'],
  },
  footerText: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  footerLink: {
    fontSize: fontSize.base,
    color: colors.accent,
    fontWeight: fontWeight.semibold,
  },
});
