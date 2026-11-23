import { useUserPreference } from '../utils/useUserPreference';
import { router } from 'expo-router';
import React, { useState, useEffect, useCallback } from 'react';
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
  Share,
  Linking,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiClient } from '../api/client';

const WEAK_PINS = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '12345', '123456', '000000'];

export default function UserSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, group, role, memberships, updateUser, chooseGroup, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [fullName, setFullName] = useState(user?.fullName || '');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [showOldPin, setShowOldPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [privacyMode, setPrivacyMode] = useUserPreference(user?.id, 'hide_balances', false);
  const [meetingAlerts, setMeetingAlerts] = useUserPreference(user?.id, 'meeting_alerts', true);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPin, setSavingPin] = useState(false);

  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(16));

  const loadDevicePreferences = useCallback(async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricSupported(compatible && enrolled);

      const savedBio = await AsyncStorage.getItem('vifani_bio_creds');
      setBiometricEnabled(Boolean(savedBio));


    } catch {
      // Ignore storage read errors
    }
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    void Promise.resolve().then(loadDevicePreferences);
  }, [fadeAnim, slideAnim, loadDevicePreferences]);

  const handleToggleBiometric = async (val: boolean) => {
    if (!biometricSupported) {
      return Alert.alert(
        'Haipatikani',
        'Simu yako haijawezeshwa alama ya kidole au uso kwenye mipangilio ya simu.'
      );
    }

    if (!val) {
      await AsyncStorage.removeItem('vifani_bio_creds');
      setBiometricEnabled(false);
      Alert.alert('Imezimwa', 'Kuingia kwa alama ya kidole kumezimwa kwenye simu hii.');
      return;
    }

    const authResult = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Thibitisha kuwasha kufuli ya alama ya kidole',
      fallbackLabel: 'Ghairi',
    });

    if (authResult.success) {
      setBiometricEnabled(true);
      Alert.alert(
        'Imewashwa',
        'Alama ya kidole imewashwa! Utakapoingia na PIN yako mara ijayo itahifadhiwa kwa usalama.'
      );
    }
  };

  const handleTogglePrivacy = setPrivacyMode;
  const handleToggleAlerts = setMeetingAlerts;

  const handleUpdateProfile = async () => {
    if (fullName.trim().length < 2) {
      return Alert.alert('Angalia Jina', 'Weka jina kamili lenye angalau herufi 2.');
    }
    setSavingProfile(true);
    try {
      const res = await apiClient.put('/auth/update-profile', { fullName: fullName.trim() });
      await updateUser(res.data.user);
      Alert.alert('Imefanikiwa', res.data?.message || 'Jina lako limesasishwa!');
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kusasisha jina.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePin = async () => {
    if (!/^\d{4,6}$/.test(oldPin)) {
      return Alert.alert('PIN ya Zamani', 'Ingiza PIN yako ya sasa yenye tarakimu 4 hadi 6.');
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      return Alert.alert('PIN Si Imara', 'PIN mpya lazima iwe tarakimu 4 hadi 6.');
    }
    if (WEAK_PINS.includes(newPin)) {
      return Alert.alert('PIN Dhaifu', 'Epuka PIN rahisi kama 1234 au 0000. Chagua namba imara.');
    }
    if (newPin !== confirmPin) {
      return Alert.alert('PIN Hazifanani', 'Hakikisha PIN mpya na uthibitisho wake zinafanana.');
    }

    setSavingPin(true);
    try {
      const res = await apiClient.post('/auth/change-pin', { oldPin, newPin });
      const savedBio = await AsyncStorage.getItem('vifani_bio_creds');
      if (savedBio && user?.phone) {
        await AsyncStorage.setItem(
          'vifani_bio_creds',
          JSON.stringify({ savedPhone: user.phone, savedPin: newPin })
        );
      }
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
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const cacheKeys = allKeys.filter(
        (k) =>
          k.startsWith('dashboard_') ||
          k.startsWith('session_') ||
          k.startsWith('mikopo_papo_') ||
          k.startsWith('transparency_') ||
          k.startsWith('vifani_cache_')
      );
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }
      Alert.alert('Imekamilika', 'Kumbukumbu zote za muda (Cache) zimesafishwa kikamilifu.');
    } catch {
      Alert.alert('Imekamilika', 'Cache imesafishwa.');
    }
  };

  const handleInviteMembers = async () => {
    try {
      await Share.share({
        message: `Karibu kwenye kikundi chetu cha *${group?.name || 'Vifani Jamii'}*! Pakua app ya Vifani Jamii ufuatilie hisa, mikopo na mgawo wako kwa uwazi.`,
      });
    } catch {
      // User cancelled share
    }
  };

  const getRoleTitle = (r?: string | null) => {
    if (r === 'CHAIRPERSON') return 'Mwenyekiti';
    if (r === 'SECRETARY') return 'Katibu';
    if (r === 'TREASURER') return 'Mweka Hazina';
    return 'Mwanachama';
  };
  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputClass = isDark
    ? 'bg-slate-800 border-slate-700 text-white'
    : 'bg-slate-50 border-slate-300 text-slate-900';

  const initials = String(user?.fullName || 'VJ')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className={`flex-1 ${bgClass}`}
    >
      <View
        style={{ paddingTop: Math.max(insets.top + 10, 44) }}
        className="bg-teal-700 pb-6 px-5 rounded-b-3xl shadow-md"
      >
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
            className="bg-teal-800/80 p-2 rounded-xl"
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-xl font-extrabold text-white">Mipangilio Binafsi</Text>
            <Text className="text-teal-100 text-xs">Wasifu, Usalama wa PIN & Uhuru Wako</Text>
          </View>
        </View>

        {/* Kadi ya Utambulisho wa Mwanachama */}
        <View className="flex-row items-center gap-3.5 mt-4 bg-teal-800/60 p-3.5 rounded-2xl border border-teal-600/40">
          <View className="w-12 h-12 rounded-2xl bg-teal-500/30 border border-teal-300/40 items-center justify-center">
            <Text className="text-white font-extrabold text-base">{initials}</Text>
          </View>
          <View className="flex-1">
            <Text className="text-white font-extrabold text-sm" numberOfLines={1}>
              {user?.fullName || 'Mwanachama'}
            </Text>
            <Text className="text-teal-200 text-xs mt-0.5">
              +{user?.phone} • {getRoleTitle(role)}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 30, 44) }}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {/* 1. MWONEKANO & FARAGHA */}
          <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
            <Text className="text-xs font-extrabold text-teal-600 uppercase mb-3">
              Mwonekano & Faragha Yako
            </Text>

            <View className="flex-row justify-between items-center pb-3 mb-3 border-b border-slate-200/20">
              <View className="flex-row items-center gap-3 flex-1 pr-2">
                <Ionicons name={isDark ? 'moon' : 'sunny'} size={22} color="#0f766e" />
                <View className="flex-1">
                  <Text className={`font-bold text-sm ${textMain}`}>Hali ya Giza (Dark Mode)</Text>
                  <Text className={`text-xs ${textSub}`}>Punguza mwanga wa skrini usiku</Text>
                </View>
              </View>
              <Switch value={isDark} onValueChange={toggleTheme} trackColor={{ true: '#0f766e' }} />
            </View>

            <View className="flex-row justify-between items-center pb-3 mb-3 border-b border-slate-200/20">
              <View className="flex-row items-center gap-3 flex-1 pr-2">
                <Ionicons name="eye-off-outline" size={22} color="#0f766e" />
                <View className="flex-1">
                  <Text className={`font-bold text-sm ${textMain}`}>Ficha Salio la Nyumbani</Text>
                  <Text className={`text-xs ${textSub}`}>Hifadhi chaguo hili kwa akaunti yako kwenye simu</Text>
                </View>
              </View>
              <Switch value={privacyMode} onValueChange={handleTogglePrivacy} trackColor={{ true: '#0f766e' }} />
            </View>

            <View className="flex-row justify-between items-center">
              <View className="flex-row items-center gap-3 flex-1 pr-2">
                <Ionicons name="notifications-outline" size={22} color="#0f766e" />
                <View className="flex-1">
                  <Text className={`font-bold text-sm ${textMain}`}>Kumbusho la Kikao</Text>
                  <Text className={`text-xs ${textSub}`}>Onyesha siku na saa ya kikao kwenye Nyumbani</Text>
                </View>
              </View>
              <Switch value={meetingAlerts} onValueChange={handleToggleAlerts} trackColor={{ true: '#0f766e' }} />
            </View>
          </View>

          {/* 2. TAARIFA ZA WASIFU */}
          <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
            <Text className="text-xs font-extrabold text-teal-600 uppercase mb-3">Taarifa Zangu</Text>

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
          {/* 3. USALAMA WA AKAUNTI & PIN */}
          <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
            <Text className="text-xs font-extrabold text-teal-600 uppercase mb-3">Usalama wa Akaunti</Text>

            <View className="flex-row justify-between items-center mb-4 pb-3 border-b border-slate-200/20">
              <View className="flex-row items-center gap-3 flex-1 pr-2">
                <Ionicons name="finger-print" size={22} color="#0f766e" />
                <View className="flex-1">
                  <Text className={`font-bold text-sm ${textMain}`}>Kufuli ya Alama ya Kidole / Uso</Text>
                  <Text className={`text-xs ${textSub}`}>
                    {biometricSupported ? 'Ingia haraka bila kuandika PIN' : 'Haipatikani kwenye simu hii'}
                  </Text>
                </View>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                trackColor={{ true: '#0f766e' }}
              />
            </View>

            <Text className={`text-xs font-bold mb-1 ${textMain}`}>PIN ya Zamani</Text>
            <View className={`flex-row items-center border rounded-xl px-3 mb-2.5 ${inputClass}`}>
              <TextInput
                className={`flex-1 py-3 text-sm font-bold tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}
                keyboardType="numeric"
                secureTextEntry={!showOldPin}
                maxLength={6}
                value={oldPin}
                onChangeText={(t) => setOldPin(t.replace(/[^0-9]/g, ''))}
                placeholder="Ingiza PIN ya sasa"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity onPress={() => setShowOldPin(!showOldPin)} className="p-1">
                <Ionicons name={showOldPin ? 'eye-off-outline' : 'eye-outline'} size={19} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text className={`text-xs font-bold mb-1 ${textMain}`}>PIN Mpya (Tarakimu 4-6)</Text>
            <View className={`flex-row items-center border rounded-xl px-3 mb-2.5 ${inputClass}`}>
              <TextInput
                className={`flex-1 py-3 text-sm font-bold tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}
                keyboardType="numeric"
                secureTextEntry={!showNewPin}
                maxLength={6}
                value={newPin}
                onChangeText={(t) => setNewPin(t.replace(/[^0-9]/g, ''))}
                placeholder="Ingiza PIN mpya"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity onPress={() => setShowNewPin(!showNewPin)} className="p-1">
                <Ionicons name={showNewPin ? 'eye-off-outline' : 'eye-outline'} size={19} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text className={`text-xs font-bold mb-1 ${textMain}`}>Thibitisha PIN Mpya</Text>
            <View className={`flex-row items-center border rounded-xl px-3 mb-3.5 ${inputClass}`}>
              <TextInput
                className={`flex-1 py-3 text-sm font-bold tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}
                keyboardType="numeric"
                secureTextEntry={!showConfirmPin}
                maxLength={6}
                value={confirmPin}
                onChangeText={(t) => setConfirmPin(t.replace(/[^0-9]/g, ''))}
                placeholder="Rudia PIN mpya"
                placeholderTextColor="#94a3b8"
              />
              <TouchableOpacity onPress={() => setShowConfirmPin(!showConfirmPin)} className="p-1">
                <Ionicons name={showConfirmPin ? 'eye-off-outline' : 'eye-outline'} size={19} color="#64748b" />
              </TouchableOpacity>
            </View>

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

          {/* 4. KIKUNDI, KUSHIRIKISHA & MSAADA */}
          <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
            <Text className="text-xs font-extrabold text-teal-600 uppercase mb-2">
              Kikundi & Usimamizi wa App
            </Text>
            <Text className={`text-xs mb-3 ${textSub}`}>
              Kikundi cha sasa: <Text className="font-bold">{group?.name || 'Vifani Jamii'}</Text> (Vikundi:{' '}
              {memberships.length})
            </Text>
            {memberships.length > 1 && (
              <TouchableOpacity onPress={chooseGroup} className="mt-3 self-start rounded-lg bg-teal-700 px-4 py-2">
                <Text className="font-bold text-white">Badili kikundi</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleInviteMembers}
              className="flex-row items-center justify-between py-3 border-t border-slate-200/20"
            >
              <View className="flex-row items-center gap-2.5">
                <Ionicons name="share-social-outline" size={19} color="#0f766e" />
                <Text className={`text-sm font-semibold ${textMain}`}>Alika Wanachama Wenzako</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                Linking.openURL(
                  `https://wa.me/?text=${encodeURIComponent(
                    'Habari Vifani Digital, nahitaji msaada kwenye app ya Vifani Jamii.'
                  )}`
                ).catch(() => Alert.alert('Msaada', 'WhatsApp haipatikani kwenye simu hii.'))
              }
              className="flex-row items-center justify-between py-3 border-t border-slate-200/20"
            >
              <View className="flex-row items-center gap-2.5">
                <Ionicons name="help-buoy-outline" size={19} color="#059669" />
                <Text className={`text-sm font-semibold ${textMain}`}>Wasiliana na Msaada (WhatsApp)</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleClearCache}
              className="flex-row items-center justify-between py-3 border-t border-slate-200/20"
            >
              <View className="flex-row items-center gap-2.5">
                <Ionicons name="trash-outline" size={19} color="#64748b" />
                <Text className={`text-sm font-semibold ${textMain}`}>Safisha Kumbukumbu za Muda (Cache)</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            onPress={signOut}
            className="bg-rose-700 p-4 rounded-2xl items-center flex-row justify-center gap-2 shadow-sm"
          >
            <Ionicons name="log-out-outline" size={20} color="#ffffff" />
            <Text className="text-white font-bold">Ondoka Kwenye Akaunti (Logout)</Text>
          </TouchableOpacity>

          <Text className={`text-center text-[11px] mt-4 ${textSub}`}>
            Vifani Jamii • Toleo la 1.0.0
          </Text>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
