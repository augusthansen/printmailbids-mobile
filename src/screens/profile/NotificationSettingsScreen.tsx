import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ProfileStackParamList } from '../../navigation/types';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { mediumTap, successFeedback, errorFeedback } from '../../utils/haptics';
import { scheduleLocalNotification } from '../../utils/pushNotifications';
import { API_URL } from '../../constants/config';

interface NotificationPreferences {
  // Channels
  notify_email: boolean;
  notify_push: boolean;
  notify_sms: boolean;
}

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList>;

export default function NotificationSettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const { colors, isDark } = useTheme();

  const [isSaving, setIsSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    notify_email: true,
    notify_push: true,
    notify_sms: false,
  });

  useEffect(() => {
    if (profile) {
      setPreferences({
        notify_email: profile.notify_email,
        notify_push: profile.notify_push,
        notify_sms: profile.notify_sms,
      });
    }
  }, [profile]);

  const handleToggle = async (key: keyof NotificationPreferences) => {
    if (!profile) return;

    const newValue = !preferences[key];
    const newPreferences = { ...preferences, [key]: newValue };
    setPreferences(newPreferences);

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          [key]: newValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) throw error;
      await refreshProfile();
    } catch (error) {
      console.error('Error updating notification settings:', error);
      // Revert on error
      setPreferences(preferences);
      Alert.alert('Error', 'Failed to update notification settings. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderToggle = (
    label: string,
    description: string,
    key: keyof NotificationPreferences,
    icon: keyof typeof Feather.glyphMap,
    disabled?: boolean
  ) => (
    <View style={[styles.toggleRow, { borderBottomColor: colors.borderLight }]}>
      <View style={styles.toggleContent}>
        <View style={[styles.toggleIcon, { backgroundColor: colors.accentFaint }]}>
          <Feather name={icon} size={18} color={colors.accent} />
        </View>
        <View style={styles.toggleText}>
          <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{label}</Text>
          <Text style={[styles.toggleDescription, { color: colors.textMuted }]}>{description}</Text>
        </View>
      </View>
      <Switch
        value={preferences[key]}
        onValueChange={() => {
          mediumTap();
          handleToggle(key);
        }}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor="#ffffff"
        disabled={disabled || isSaving}
      />
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
    >
      {/* Notification Channels */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Notification Channels</Text>
        <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
          Choose how you want to receive notifications
        </Text>
        <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
          {renderToggle(
            'Push Notifications',
            'Get instant alerts on your device',
            'notify_push',
            'smartphone'
          )}
          {renderToggle(
            'Email Notifications',
            'Receive updates in your inbox',
            'notify_email',
            'mail'
          )}
          {renderToggle(
            'SMS Notifications',
            'Get text messages for important updates',
            'notify_sms',
            'message-square',
            !profile?.phone_verified
          )}
        </View>
        {!profile?.phone_verified && (
          <TouchableOpacity
            style={[styles.hintCard, { backgroundColor: colors.accentFaint, borderColor: colors.accent }]}
            onPress={() => {
              mediumTap();
              navigation.navigate('PhoneVerification');
            }}
          >
            <Feather name="smartphone" size={16} color={colors.accent} />
            <View style={styles.hintContent}>
              <Text style={[styles.hintTitle, { color: colors.accent }]}>
                Verify your phone number
              </Text>
              <Text style={[styles.hintText, { color: colors.textSecondary }]}>
                Required to enable SMS notifications
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      {/* Notification Types Info */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>What You'll Receive</Text>
        <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
          <NotificationTypeRow
            icon="trending-up"
            title="Bidding Activity"
            description="Outbid alerts, winning bids, auction endings"
            colors={colors}
          />
          <NotificationTypeRow
            icon="message-square"
            title="Offers"
            description="New offers, responses, expirations"
            colors={colors}
          />
          <NotificationTypeRow
            icon="dollar-sign"
            title="Payments"
            description="Payment confirmations, reminders, receipts"
            colors={colors}
          />
          <NotificationTypeRow
            icon="truck"
            title="Shipping"
            description="Shipping updates, delivery confirmations"
            colors={colors}
          />
          <NotificationTypeRow
            icon="message-circle"
            title="Messages"
            description="New messages from buyers and sellers"
            colors={colors}
            isLast
          />
        </View>
      </View>

      {/* Seller Notifications */}
      {profile?.is_seller && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Seller Notifications</Text>
          <View style={[styles.card, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
            <NotificationTypeRow
              icon="package"
              title="Listing Activity"
              description="New bids, watchers, questions"
              colors={colors}
            />
            <NotificationTypeRow
              icon="credit-card"
              title="Sales & Payouts"
              description="Sale confirmations, payout notifications"
              colors={colors}
              isLast
            />
          </View>
        </View>
      )}

      {/* Test Notification */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Test Notifications</Text>
        <TouchableOpacity
          style={[styles.testButton, { backgroundColor: colors.accent }]}
          onPress={async () => {
            mediumTap();
            try {
              await scheduleLocalNotification(
                'Test Notification',
                'Push notifications are working! 🎉',
                { type: 'test' }
              );
              successFeedback();
              Alert.alert('Sent!', 'Check your notification center.');
            } catch (error) {
              Alert.alert('Error', 'Failed to send test notification. Make sure notifications are enabled in your device settings.');
            }
          }}
        >
          <Feather name="bell" size={18} color="#ffffff" />
          <Text style={styles.testButtonText}>Send Local Test</Text>
        </TouchableOpacity>
        <Text style={[styles.testHint, { color: colors.textMuted }]}>
          Tests local notifications on your device.
        </Text>

        <TouchableOpacity
          style={[styles.testButton, { backgroundColor: colors.accent, marginTop: spacing.md }]}
          onPress={async () => {
            mediumTap();
            try {
              const { data: { session } } = await supabase.auth.getSession();
              if (!session?.access_token) {
                Alert.alert('Error', 'Not authenticated');
                return;
              }

              const response = await fetch(`${API_URL}/test/push-notification`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({ type: 'outbid', listingTitle: 'Test Equipment' }),
              });

              const result = await response.json();
              console.log('[Test Push] Response:', result);

              if (response.ok && result.success) {
                if (result.pushSent) {
                  successFeedback();
                  Alert.alert('Sent!', 'Push notification sent via Expo. Check your device.');
                } else {
                  errorFeedback();
                  Alert.alert(
                    'Push Not Sent',
                    `Notification created but push failed.\n\nReason: ${result.error || 'Unknown'}\n\nCheck that notify_push is enabled and expo_push_token is saved in your profile.`
                  );
                }
              } else {
                errorFeedback();
                Alert.alert('Error', result.error || 'Failed to send server push notification');
              }
            } catch (error) {
              console.error('[Test Push] Error:', error);
              errorFeedback();
              Alert.alert('Error', 'Failed to send server push notification');
            }
          }}
        >
          <Feather name="send" size={18} color="#ffffff" />
          <Text style={styles.testButtonText}>Send Server Push</Text>
        </TouchableOpacity>
        <Text style={[styles.testHint, { color: colors.textMuted }]}>
          Tests the full push notification flow via your server and Expo.
        </Text>
      </View>

      {/* Quiet Hours (Future Feature) */}
      <View style={styles.section}>
        <View style={[styles.comingSoonCard, { backgroundColor: isDark ? colors.sand : '#ffffff' }]}>
          <View style={[styles.comingSoonIcon, { backgroundColor: colors.accentFaint }]}>
            <Feather name="moon" size={20} color={colors.accent} />
          </View>
          <View style={styles.comingSoonContent}>
            <Text style={[styles.comingSoonTitle, { color: colors.textPrimary }]}>
              Quiet Hours
            </Text>
            <Text style={[styles.comingSoonText, { color: colors.textMuted }]}>
              Schedule times when you don't want to receive notifications. Coming soon!
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

interface NotificationTypeRowProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  colors: any;
  isLast?: boolean;
}

function NotificationTypeRow({ icon, title, description, colors, isLast }: NotificationTypeRowProps) {
  return (
    <View style={[styles.typeRow, !isLast && { borderBottomWidth: 1, borderBottomColor: colors.borderLight }]}>
      <View style={[styles.typeIcon, { backgroundColor: colors.sand }]}>
        <Feather name={icon} size={16} color={colors.textMuted} />
      </View>
      <View style={styles.typeContent}>
        <Text style={[styles.typeTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.typeDescription, { color: colors.textMuted }]}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  sectionHint: {
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    lineHeight: 16,
  },
  card: {
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  toggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
    marginRight: spacing.md,
  },
  toggleIcon: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
  toggleDescription: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
  },
  hintContent: {
    flex: 1,
  },
  hintTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  hintText: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeContent: {
    flex: 1,
  },
  typeTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  typeDescription: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  comingSoonCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  comingSoonIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  comingSoonContent: {
    flex: 1,
  },
  comingSoonTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs,
  },
  comingSoonText: {
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.sm,
  },
  testButtonText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.semibold,
    color: '#ffffff',
  },
  testHint: {
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
    lineHeight: 16,
  },
});
