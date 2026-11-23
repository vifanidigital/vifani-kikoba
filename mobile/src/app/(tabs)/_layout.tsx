import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
  const { isDark } = useTheme();
  const activeTint = isDark ? '#5eead4' : '#0f766e';
  const inactiveTint = isDark ? '#94a3b8' : '#64748b';

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: activeTint,
      tabBarInactiveTintColor: inactiveTint,
      tabBarStyle: {
        backgroundColor: isDark ? '#0f172a' : '#ffffff',
        borderTopColor: isDark ? '#1e293b' : '#e2e8f0',
      },
    }}>
      <Tabs.Screen name="index" options={{
        title: 'Nyumbani',
        tabBarIcon: ({ focused, size }) => <Ionicons name={focused ? 'home' : 'home-outline'} color={focused ? activeTint : inactiveTint} size={size} />,
      }} />
      <Tabs.Screen name="kikao" options={{
        title: 'Kikao & Akiba',
        tabBarIcon: ({ focused, size }) => <Ionicons name={focused ? 'people' : 'people-outline'} color={focused ? activeTint : inactiveTint} size={size} />,
      }} />
      <Tabs.Screen name="mikopo" options={{
        title: 'Mikopo & Papo',
        tabBarIcon: ({ focused, size }) => <Ionicons name={focused ? 'cash' : 'cash-outline'} color={focused ? activeTint : inactiveTint} size={size} />,
      }} />
      <Tabs.Screen name="ofisi" options={{
        title: 'Ofisi & Sheria',
        tabBarIcon: ({ focused, size }) => <Ionicons name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'} color={focused ? activeTint : inactiveTint} size={size} />,
      }} />
    </Tabs>
  );
}
