import React, { useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from './types';
import { useAuth } from '../contexts/AuthContext';
import { colors } from '../constants/theme';

import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Loading screen shown while checking auth state
function LoadingScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}

export default function RootNavigator() {
  const { isAuthenticated, isLoading, needsOnboarding, profile, completeOnboarding, skipOnboarding } = useAuth();
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Show loading screen while checking auth state OR waiting for profile to load
  // This prevents the "cutting in" effect where main screen shows briefly before onboarding
  if (isLoading || (isAuthenticated && !profile)) {
    return <LoadingScreen />;
  }

  // Show onboarding for new users who need to complete their profile
  if (isAuthenticated && needsOnboarding && !onboardingDismissed) {
    return (
      <OnboardingScreen
        onComplete={async () => {
          await completeOnboarding();
          setOnboardingDismissed(true);
        }}
        onSkip={async () => {
          await skipOnboarding();
          setOnboardingDismissed(true);
        }}
      />
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
});
