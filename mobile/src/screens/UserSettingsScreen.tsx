import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../api/client';

export default function UserSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, group, role, memberships, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  const handleUpdateProfile = async () => {
    if (fullName.trim().length < 2) {
      return Alert.alert('Angalia Jina', 'Weka jina kamili lenye angalau herufi 2.');
    }
    setSavingProfile(true);
    try {
      const res = await apiClient.put('/auth/update-profile', { fullName: fullName.trim() });
      Alert.alert('Imefanikiwa', res.data?.message || 'Jina lako limesasishwa!');
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kusasisha jina.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePin = async () => {
    if (!/^\d{4,6}$/.test(newPin)) {
      return Alert.alert('PIN Si Imara', 'PIN mpya lazima iwe tarakimu 4 hadi 6.');
    }
    if (newPin !== confirmPin) {
      return Alert.alert('PIN Hazifanani', 'Hakikisha PIN mpya na uthibitisho wake zinafanana.');
    }
    setSavingPin(true);
    try {
      const res = await apiClient.post('/auth/change-pin', { oldPin, newPin });
      Alert.alert('Imefanikiwa', res.data?.message || 'PIN yako imebadilishwa kikamilifu!');
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
    } catch (error: any) {
      Alert.alert('Imeshindikana', error.response?.data?.error || 'PIN ya zamani si sahihi.');
    } finally {
      setSavingPin(false);
    }
  };

  const handleClearCache = async () => {
    await AsyncStorage.removeItem('vifani_cache_dashboard');
    Alert.alert('Imekamilika', 'Kumbukumbu za muda (Cache) zimesafishwa.');
  };

  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputClass = isDark
    ? 'bg-slate-800 border-slate-700 text-white'
    : 'bg-slate-50 border-slate-300 text-slate-900';
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className={`flex-1 ${bgClass}`}
    >
      <View
        style={{ paddingTop: Math.max(insets.top + 10, 44) }}
        className="bg-teal-700 pb-5 px-5 rounded-b-3xl flex-row items-center gap-3"
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="bg-teal-800/80 p-2 rounded-xl"
        >
          <Ionicons name="arrow-back" size={22} color="#ffffff" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-bold text-white">Mipangilio Binafsi</Text>
          <Text className="text-teal-100 text-xs">Wasifu, Usalama wa PIN & Mwonekano</Text>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 30, 40) }}
      >
        <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
          <Text className="text-xs font-bold text-teal-600 uppercase mb-3">Mwonekano wa App</Text>
          <View className="flex-row justify-between items-center">
            <View className="flex-row items-center gap-3">
              <Ionicons name={isDark ? 'moon' : 'sunny'} size={22} color="#0f766e" />
              <View>
                <Text className={`font-bold text-sm ${textMain}`}>Hali ya Giza (Dark Mode)</Text>
                <Text className={`text-xs ${textSub}`}>Punguza mwanga wa skrini usiku</Text>
              </View>
            </View>
            <Switch value={isDark} onValueChange={toggleTheme} />
          </View>
        </View>

        <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
          <Text className="text-xs font-bold text-teal-600 uppercase mb-3">Taarifa Zangu</Text>
          <Text className={`text-xs mb-1 ${textSub}`}>Namba ya Simu (Kitambulisho):</Text>
          <Text className={`font-bold text-sm mb-3 ${textMain}`}>
            +{user?.phone} • Cheo: {role}
          </Text>

          <Text className={`text-xs font-bold mb-1 ${textMain}`}>Jina Kamili</Text>
          <TextInput
            className={`border rounded-xl p-3 mb-3 text-sm font-semibold ${inputClass}`}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Jina lako kamili"
            placeholderTextColor="#94a3b8"
          />
          <TouchableOpacity
            onPress={handleUpdateProfile}
            disabled={savingProfile}
            className="bg-teal-700 p-3.5 rounded-xl items-center"
          >
            {savingProfile ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-sm">Hifadhi Jina Langu</Text>
            )}
          </TouchableOpacity>
        </View>
        <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
          <Text className="text-xs font-bold text-teal-600 uppercase mb-3">Usalama wa Akaunti</Text>

          <View className="flex-row justify-between items-center mb-4 pb-3 border-b border-slate-200/20">
            <View className="flex-row items-center gap-3">
              <Ionicons name="finger-print" size={22} color="#0f766e" />
              <View>
                <Text className={`font-bold text-sm ${textMain}`}>Kufuli ya Alama ya Kidole</Text>
                <Text className={`text-xs ${textSub}`}>Linda akaunti yako unapofungua app</Text>
              </View>
            </View>
            <Switch value={biometricEnabled} onValueChange={setBiometricEnabled} />
          </View>

          <Text className={`text-xs font-bold mb-1 ${textMain}`}>PIN ya Zamani (Mf. 2580)</Text>
          <TextInput
            className={`border rounded-xl p-3 mb-2.5 text-sm ${inputClass}`}
            keyboardType="numeric"
            secureTextEntry
            maxLength={6}
            value={oldPin}
            onChangeText={(t) => setOldPin(t.replace(/[^0-9]/g, ''))}
            placeholder="Ingiza PIN ya sasa"
            placeholderTextColor="#94a3b8"
          />

          <Text className={`text-xs font-bold mb-1 ${textMain}`}>PIN Mpya (Tarakimu 4-6)</Text>
          <TextInput
            className={`border rounded-xl p-3 mb-2.5 text-sm ${inputClass}`}
            keyboardType="numeric"
            secureTextEntry
            maxLength={6}
            value={newPin}
            onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, ''))}
            placeholder="Ingiza PIN mpya"
            placeholderTextColor="#94a3b8"
          />

          <Text className={`text-xs font-bold mb-1 ${textMain}`}>Thibitisha PIN Mpya</Text>
          <TextInput
            className={`border rounded-xl p-3 mb-3 text-sm ${inputClass}`}
            keyboardType="numeric"
            secureTextEntry
            maxLength={6}
            value={confirmPin}
            onChangeText={(t) => setConfirmPin(t.replace(/[^0-9]/g, ''))}
            placeholder="Rudia PIN mpya"
            placeholderTextColor="#94a3b8"
          />

          <TouchableOpacity
            onPress={handleChangePin}
            disabled={savingPin}
            className="bg-slate-800 p-3.5 rounded-xl items-center"
          >
            {savingPin ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-sm">Badili PIN ya Siri</Text>
            )}
          </TouchableOpacity>
        </View>

        <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
          <Text className="text-xs font-bold text-teal-600 uppercase mb-2">
            Vikoba Nilivyosajiliwa ({memberships?.length || 1})
          </Text>
          <Text className={`text-xs mb-3 ${textSub}`}>
            Kikoba cha sasa: <Text className="font-bold">{group?.name}</Text>
          </Text>
          <TouchableOpacity
            onPress={handleClearCache}
            className="flex-row items-center justify-between py-3 border-t border-slate-200/20"
          >
            <Text className={`text-sm font-semibold ${textMain}`}>Safisha Kumbukumbu za Muda (Cache)</Text>
            <Ionicons name="trash-outline" size={18} color="#64748b" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={signOut}
          className="bg-rose-700 p-4 rounded-2xl items-center flex-row justify-center gap-2"
        >
          <Ionicons name="log-out-outline" size={20} color="#ffffff" />
          <Text className="text-white font-bold">Ondoka Kwenye Akaunti (Logout)</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
