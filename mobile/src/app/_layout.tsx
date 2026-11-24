import '../../global.css';
import { FormKeyboardProvider } from '../components/KeyboardForm';
import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';

function Routes() {
  const { token, group, loading, needsGroupSelection } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-teal-800">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <Stack key={group?.id ?? 'guest'} screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!token}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(token) && needsGroupSelection}>
        <Stack.Screen name="groups" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(token) && !needsGroupSelection}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="transparency" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <FormKeyboardProvider>
            <Routes />
          </FormKeyboardProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
