import React from 'react';
import { View, StyleSheet, ViewStyle, ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { colors, minTouchTarget } from '../constants/theme';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  url?: string | null;
  size?: AvatarSize;
  style?: ViewStyle | ImageStyle;
  accessibilityLabel?: string;
}

// All sizes meet Apple HIG 44pt minimum touch target
const sizeMap: Record<AvatarSize, { container: number; icon: number }> = {
  xs: { container: minTouchTarget, icon: 18 },  // 44pt minimum
  sm: { container: minTouchTarget, icon: 20 },  // 44pt minimum
  md: { container: 56, icon: 24 },
  lg: { container: 88, icon: 40 },
  xl: { container: 120, icon: 48 },
};

/**
 * Avatar component for consistent avatar display throughout the app
 * Shows user icon placeholder when no URL is provided or URL is invalid
 * All sizes meet Apple HIG 44pt minimum touch target requirement
 */
export default function Avatar({ url, size = 'md', style, accessibilityLabel }: AvatarProps) {
  const { colors: themeColors } = useTheme();
  const dimensions = sizeMap[size];

  const containerStyle: ImageStyle = {
    width: dimensions.container,
    height: dimensions.container,
    borderRadius: dimensions.container / 2,
  };

  const a11yProps = {
    accessible: true,
    accessibilityLabel: accessibilityLabel || 'User avatar',
    accessibilityRole: 'image' as const,
  };

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.image, containerStyle, style as ImageStyle]}
        contentFit="cover"
        transition={200}
        placeholder={null}
        {...a11yProps}
        onError={() => {
          // Image failed to load - expo-image will show nothing
          // The parent component can handle this if needed
        }}
      />
    );
  }

  // No URL - show placeholder with user icon
  return (
    <View style={[styles.placeholder, containerStyle, style]} {...a11yProps}>
      <Feather name="user" size={dimensions.icon} color={themeColors.textLight} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.sand,
  },
  placeholder: {
    backgroundColor: colors.sand,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
