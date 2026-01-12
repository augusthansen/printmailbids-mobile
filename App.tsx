import React, { useRef, useState, useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme, NavigationContainerRef } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider } from './src/contexts/AuthContext';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { NotificationProvider, setNavigationRef } from './src/contexts/NotificationContext';
import RootNavigator from './src/navigation/RootNavigator';
import AnimatedSplashScreen from './src/components/AnimatedSplashScreen';
import { STRIPE_PUBLISHABLE_KEY } from './src/constants/config';

// Keep the native splash screen visible while we prepare the app
SplashScreen.preventAutoHideAsync();

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 2,
    },
  },
});

// Inner component that can access theme context
function AppContent() {
  const { isDark, colors } = useTheme();
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const [showAnimatedSplash, setShowAnimatedSplash] = useState(true);
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    // Hide the native splash screen once our component mounts
    const hideSplash = async () => {
      await SplashScreen.hideAsync();
      setAppIsReady(true);
    };
    hideSplash();
  }, []);

  const handleAnimationComplete = useCallback(() => {
    setShowAnimatedSplash(false);
  }, []);

  const navigationTheme = isDark
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: colors.accent,
          background: colors.background,
          card: colors.sand,
          text: colors.textPrimary,
          border: colors.border,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.accent,
          background: colors.background,
          card: '#ffffff',
          text: colors.textPrimary,
          border: colors.border,
        },
      };

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        theme={navigationTheme}
        onReady={() => setNavigationRef(navigationRef.current)}
      >
        <NotificationProvider>
          <RootNavigator />
        </NotificationProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </NavigationContainer>
      {appIsReady && showAnimatedSplash && (
        <AnimatedSplashScreen onAnimationComplete={handleAnimationComplete} />
      )}
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </StripeProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
