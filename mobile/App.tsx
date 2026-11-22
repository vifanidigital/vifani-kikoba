require("./global.css");
import React from 'react';
import { ActivityIndicator, View, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

import LoginScreen from './src/screens/LoginScreen';
import RegisterGroupScreen from './src/screens/RegisterGroupScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import KikaoAkibaScreen from './src/screens/KikaoAkibaScreen';
import MikopoPapoScreen from './src/screens/MikopoPapoScreen';
import WanachamaSheriaScreen from './src/screens/WanachamaSheriaScreen';
import UserSettingsScreen from './src/screens/UserSettingsScreen';
import TransparencyScreen from './src/screens/TransparencyScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 8);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#0f766e',
        tabBarInactiveTintColor: isDark ? '#94a3b8' : '#64748b',
        tabBarStyle: {
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          borderTopColor: isDark ? '#1e293b' : '#e2e8f0',
          borderTopWidth: 1,
          height: 58 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 6,
          elevation: 12,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any = 'home-outline';
          if (route.name === 'Nyumbani') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Kikao & Akiba') iconName = focused ? 'people' : 'people-outline';
          else if (route.name === 'Mikopo & Papo') iconName = focused ? 'cash' : 'cash-outline';
          else if (route.name === 'Ofisi & Sheria') iconName = focused ? 'shield-checkmark' : 'shield-checkmark-outline';
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Nyumbani" component={DashboardScreen} />
      <Tab.Screen name="Kikao & Akiba" component={KikaoAkibaScreen} />
      <Tab.Screen name="Mikopo & Papo" component={MikopoPapoScreen} />
      <Tab.Screen name="Ofisi & Sheria" component={WanachamaSheriaScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { token, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-teal-800">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    );
  }

  return (
    <Stack.Navigator key={token ? 'auth' : 'guest'} screenOptions={{ headerShown: false }}>
      {token ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="UserSettings" component={UserSettingsScreen} />
          <Stack.Screen name="Transparency" component={TransparencyScreen} />
        </>
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="RegisterGroup" component={RegisterGroupScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationContainer>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </NavigationContainer>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}