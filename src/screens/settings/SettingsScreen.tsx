import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeMode } from '../../contexts/ThemeContext';
import { spacing, borderRadius, fontSize, fontWeight, shadows } from '../../constants/theme';
import { lightTap } from '../../utils/haptics';

const themeOptions: { mode: ThemeMode; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { mode: 'light', label: 'Light', icon: 'sun' },
  { mode: 'dark', label: 'Dark', icon: 'moon' },
  { mode: 'system', label: 'System', icon: 'smartphone' },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { themeMode, setThemeMode, colors } = useTheme();

  const handleThemeChange = async (mode: ThemeMode) => {
    lightTap();
    await setThemeMode(mode);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>Appearance</Text>
        <View style={[styles.card, { backgroundColor: colors.white }, shadows.sm]}>
          {themeOptions.map((option, index) => (
            <TouchableOpacity
              key={option.mode}
              style={[
                styles.optionRow,
                index < themeOptions.length - 1 && [styles.optionBorder, { borderBottomColor: colors.borderLight }],
              ]}
              onPress={() => handleThemeChange(option.mode)}
            >
              <View style={styles.optionLeft}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: themeMode === option.mode ? colors.accentFaint : colors.sand },
                  ]}
                >
                  <Feather
                    name={option.icon}
                    size={18}
                    color={themeMode === option.mode ? colors.accent : colors.textMuted}
                  />
                </View>
                <Text style={[styles.optionText, { color: colors.textPrimary }]}>{option.label}</Text>
              </View>
              {themeMode === option.mode && (
                <Feather name="check" size={20} color={colors.accent} />
              )}
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[styles.sectionHint, { color: colors.textMuted }]}>
          System will automatically switch between light and dark mode based on your device settings.
        </Text>
      </View>
    </ScrollView>
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
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  sectionHint: {
    fontSize: fontSize.xs,
    marginTop: spacing.sm,
    marginLeft: spacing.xs,
    lineHeight: 16,
  },
  card: {
    borderRadius: borderRadius.xl,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  optionBorder: {
    borderBottomWidth: 1,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});
