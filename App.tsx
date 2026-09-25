import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { RobotoMono_400Regular } from '@expo-google-fonts/roboto-mono';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { Oswald_400Regular, Oswald_500Medium, Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald';
import { Roboto_400Regular, Roboto_500Medium, Roboto_600SemiBold, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { AppNavigator } from './src/navigation/AppNavigator';
import { restoreTimerState } from './src/store';
import { initializeNotifications } from './src/services/notifications';
import { useTheme } from './src/theme';

/**
 * Root status bar follows the selected ReTimer theme so system icons stay
 * readable: dark icons on the Light theme, light icons on Dark/OLED.
 * Screens with their own StatusBar (ActiveTimer) keep overriding locally.
 */
function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function App() {
  // Load custom fonts
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    RobotoMono_400Regular,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
    Oswald_400Regular,
    Oswald_500Medium,
    Oswald_600SemiBold,
    Oswald_700Bold,
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_600SemiBold,
    Roboto_700Bold,
  });

  // Restore timer state on app launch, then start the completion
  // notification service (orphan sweep + store sync; no timer changes).
  useEffect(() => {
    if (fontsLoaded) {
      restoreTimerState();
      const cleanupNotifications = initializeNotifications();
      return cleanupNotifications;
    }
    return undefined;
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ThemedStatusBar />
      <AppNavigator />
    </SafeAreaProvider>
  );
}
