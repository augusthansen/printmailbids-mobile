import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  useColorScheme,
} from 'react-native';

interface AnimatedSplashScreenProps {
  onAnimationComplete: () => void;
}

export default function AnimatedSplashScreen({
  onAnimationComplete,
}: AnimatedSplashScreenProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const textFadeAnim = useRef(new Animated.Value(0)).current;
  const fadeOutAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Sequence: fade in + scale up, text fade in, hold 4 seconds, then fade out
    Animated.sequence([
      // Fade in and scale up logo
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]),
      // Fade in the text
      Animated.timing(textFadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      // Hold for 4 seconds
      Animated.delay(4000),
      // Fade out the entire screen
      Animated.timing(fadeOutAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onAnimationComplete();
    });
  }, [fadeAnim, scaleAnim, textFadeAnim, fadeOutAnim, onAnimationComplete]);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          opacity: fadeOutAnim,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.logoContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.logoBox}>
          <Text style={styles.logoText}>PMB</Text>
        </View>
      </Animated.View>
      <Animated.View style={[styles.brandTextContainer, { opacity: textFadeAnim }]}>
        <Text style={styles.brandTextPrintMail}>PrintMail</Text>
        <Text style={styles.brandTextBids}>Bids</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBox: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  logoText: {
    color: '#ffffff',
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brandTextContainer: {
    flexDirection: 'row',
    marginTop: 24,
  },
  brandTextPrintMail: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
  },
  brandTextBids: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2563eb',
  },
});
