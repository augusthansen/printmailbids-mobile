import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { ProfileStackParamList } from '../../navigation/types';
import { uploadAvatar } from '../../utils/avatarUpload';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap } from '../../utils/haptics';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

export default function EditProfileScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setCompanyName(profile.company_name || '');
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library to change your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await handleAvatarUpload(result.assets[0].uri);
    }
  };

  const handleAvatarUpload = async (uri: string) => {
    if (!profile) return;

    setIsLoading(true);
    try {
      const result = await uploadAvatar(uri, profile.id);
      if (result.error) {
        Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
        return;
      }
      setAvatarUrl(result.url);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      Alert.alert('Error', 'Failed to upload profile picture. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    mediumTap();
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim() || null,
          company_name: companyName.trim() || null,
          bio: bio.trim() || null,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) throw error;

      await refreshProfile();
      navigation.goBack();
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges =
    fullName !== (profile?.full_name || '') ||
    companyName !== (profile?.company_name || '') ||
    bio !== (profile?.bio || '') ||
    avatarUrl !== profile?.avatar_url;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar Section */}
        <View style={[styles.avatarSection, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
          <TouchableOpacity style={styles.avatarContainer} onPress={pickImage} disabled={isLoading}>
            {isLoading ? (
              <View style={[styles.avatar, { backgroundColor: colors.sand }]}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            ) : (
              <Image
                source={avatarUrl ? { uri: avatarUrl } : require('../../../assets/avatar-placeholder.png')}
                style={[styles.avatar, { backgroundColor: colors.sand }]}
                contentFit="cover"
              />
            )}
            <View style={[styles.editAvatarButton, { backgroundColor: colors.accent }]}>
              <Feather name="camera" size={16} color="#ffffff" />
            </View>
          </TouchableOpacity>
          <Text style={[styles.changePhotoText, { color: colors.accent }]}>Change Photo</Text>
        </View>

        {/* Form Fields */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Personal Information</Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Full Name</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full name"
                placeholderTextColor={colors.textLight}
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Company Name</Text>
              <TextInput
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border }]}
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="Enter company name (optional)"
                placeholderTextColor={colors.textLight}
                autoCapitalize="words"
              />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Phone Number</Text>
              {profile?.phone_verified ? (
                <View style={styles.verifiedPhoneRow}>
                  <Text style={[styles.verifiedPhoneText, { color: colors.textPrimary }]}>
                    {profile.phone}
                  </Text>
                  <View style={[styles.verifiedBadge, { backgroundColor: colors.successLight }]}>
                    <Feather name="check-circle" size={12} color={colors.success} />
                    <Text style={[styles.verifiedBadgeText, { color: colors.success }]}>Verified</Text>
                  </View>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.verifyButton, { backgroundColor: colors.accentFaint, borderColor: colors.accent }]}
                    onPress={() => {
                      mediumTap();
                      navigation.navigate('PhoneVerification');
                    }}
                  >
                    <Feather name="smartphone" size={16} color={colors.accent} />
                    <Text style={[styles.verifyButtonText, { color: colors.accent }]}>
                      Verify Phone Number
                    </Text>
                  </TouchableOpacity>
                  <Text style={[styles.verifyHint, { color: colors.textMuted }]}>
                    Required to place bids and enable SMS notifications
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>About</Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Bio</Text>
              <TextInput
                style={[styles.textArea, { color: colors.textPrimary, borderColor: colors.border }]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell others about yourself or your business..."
                placeholderTextColor={colors.textLight}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>

        {/* Save Button */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: hasChanges ? colors.accent : colors.textLight },
            ]}
            onPress={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing['2xl'],
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  changePhotoText: {
    marginTop: spacing.md,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
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
  card: {
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  inputGroup: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inputLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    marginBottom: spacing.xs,
  },
  input: {
    fontSize: fontSize.base,
    paddingVertical: spacing.sm,
  },
  textArea: {
    fontSize: fontSize.base,
    paddingVertical: spacing.sm,
    minHeight: 100,
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg,
  },
  verifiedPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  verifiedPhoneText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  verifiedBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  verifyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  verifyButtonText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  verifyHint: {
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    lineHeight: 16,
  },
  saveButton: {
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.sm,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
  },
});
