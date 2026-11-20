require('./global.css');
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { AuthProvider, useAuth } from './src/context/AuthContext';

import LoginScreen from './src/screens/LoginScreen';
import RegisterGroupScreen from './src/screens/RegisterGroupScreen';
import GroupPickerScreen from './src/screens/GroupPickerScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import KikaoAkibaScreen from './src/screens/KikaoAkibaScreen';
import MikopoPapoScreen from './src/screens/MikopoPapoScreen';
import WanachamaSheriaScreen from './src/screens/WanachamaSheriaScreen';
import ChairmanSettingsScreen from './src/screens/ChairmanSettingsScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#0f766e',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
          backgroundColor: '#ffffff',
          borderTopColor: '#e2e8f0',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any = 'home';
          if (route.name === 'Nyumbani') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Kikao & Akiba') {
            iconName = focused ? 'wallet' : 'wallet-outline';
          } else if (route.name === 'Mikopo & Papo') {
            iconName = focused ? 'cash' : 'cash-outline';
          } else if (route.name === 'Wanachama') {
            iconName = focused ? 'people' : 'people-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Nyumbani" component={DashboardScreen} />
      <Tab.Screen name="Kikao & Akiba" component={KikaoAkibaScreen} />
      <Tab.Screen name="Mikopo & Papo" component={MikopoPapoScreen} />
      <Tab.Screen name="Wanachama" component={WanachamaSheriaScreen} />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { token, loading, needsGroupSelection } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50">
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {token ? (
          needsGroupSelection ? (
            <Stack.Screen
              name="GroupPicker"
              component={GroupPickerScreen}
              options={{ headerShown: false }}
            />
          ) : (
            <>
              <Stack.Screen
                name="MainTabs"
                component={MainTabs}
                options={{ headerShown: false }}
              />
              <Stack.Screen
                name="ChairmanSettings"
                component={ChairmanSettingsScreen}
                options={{ title: 'Mipangilio ya Mwenyekiti' }}
              />
            </>
          )
        ) : (
          <>
            <Stack.Screen
              name="Login"
              component={LoginScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="RegisterGroup"
              component={RegisterGroupScreen}
              options={{ title: 'Sajili Kikoba Kipya' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
