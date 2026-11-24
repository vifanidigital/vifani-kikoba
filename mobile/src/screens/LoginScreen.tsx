import { FormTextInput, FormScrollView } from '../components/KeyboardForm';
import { router } from 'expo-router';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,

  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Animated,
  LayoutAnimation,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { isAxiosError } from 'axios';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const [serverReady, setServerReady] = useState<'WARMING' | 'ONLINE' | 'OFFLINE'>('WARMING');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showNewPin, setShowNewPin] = useState(false);
  const [mode, setMode] = useState<'LOGIN' | 'OTP' | 'FORGOT' | 'RESET'>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [hasSavedBiometrics, setHasSavedBiometrics] = useState(false);
  const [showSocials, setShowSocials] = useState(false);
  const loginScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(20));

  const checkBiometricAvailability = useCallback(async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const savedCreds = await AsyncStorage.getItem('vifani_bio_creds');
      if (compatible && enrolled && savedCreds) {
        setHasSavedBiometrics(true);
      }
    } catch {
      setHasSavedBiometrics(false);
    }
  }, []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 480, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 480, useNativeDriver: true }),
    ]).start();

    apiClient
      .get('/health')
      .then(() => setServerReady('ONLINE'))
      .catch(() => setServerReady('OFFLINE'));

    void Promise.resolve().then(checkBiometricAvailability);
  }, [fadeAnim, slideAnim, checkBiometricAvailability]);

  const switchMode = (nextMode: 'LOGIN' | 'OTP' | 'FORGOT' | 'RESET') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMode(nextMode);
  };

  const onlyDigits = (text: string) => text.replace(/[^0-9]/g, '');
  const handlePhoneChange = (text: string) => setPhone(onlyDigits(text));
  const handlePinChange = (text: string) => setPin(onlyDigits(text));
  const handleOtpChange = (text: string) => setOtp(onlyDigits(text));
  const handleNewPinChange = (text: string) => setNewPin(onlyDigits(text));

  const isValidTzPhone = (p: string) => /^((00)?255[67]\d{8}|[67]\d{8}|0[67]\d{8})$/.test(p);
  const isValidPin = (p: string) => /^\d{4,6}$/.test(p);
  const isLoginReady = isValidTzPhone(phone) && isValidPin(pin) && !loading;
  const getDeviceId = async () => {
    try {
      return Application.getAndroidId() || 'device-default-id';
    } catch {
      return 'device-default-id';
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Thibitisha kwa Alama ya Kidole au Uso',
        fallbackLabel: 'Tumia PIN',
      });
      if (!result.success) return;
      const saved = await AsyncStorage.getItem('vifani_bio_creds');
      const credentials = saved ? JSON.parse(saved) : null;
      if (typeof credentials?.savedPhone !== 'string' || typeof credentials?.savedPin !== 'string') {
        setHasSavedBiometrics(false);
        Alert.alert('Tumia PIN', 'Ingiza namba ya simu na PIN yako.');
        return;
      }
      await executeLogin(credentials.savedPhone, credentials.savedPin);
    } catch {
      Alert.alert('Tumia PIN', 'Alama ya kidole haikuweza kuthibitishwa. Ingiza PIN yako.');
    }
  };

  const executeLogin = async (loginPhone: string, loginPin: string) => {
    const cleanPhone = onlyDigits(loginPhone);
    const cleanPin = onlyDigits(loginPin);

    if (!isValidTzPhone(cleanPhone)) {
      return Alert.alert(
        'Namba ya Simu Si Sahihi',
        'Weka tarakimu 10 halisi za Tanzania zinazoanza na 06 au 07 (mf. 0712345678).'
      );
    }

    if (!isValidPin(cleanPin)) {
      return Alert.alert('PIN Si Sahihi', 'PIN lazima iwe tarakimu 4 hadi 6 pekee.');
    }

    Keyboard.dismiss();
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const res = await apiClient.post('/auth/login', {
        phone: cleanPhone,
        pin: cleanPin,
        deviceId });

      setServerReady('ONLINE');
      const data = res.data;

      if (res.status === 202 && data?.requireOtp) {
        Alert.alert('Uhakiki wa Simu Mpya', `${data.message}`);
        switchMode('OTP');
        return;
      }

      await signIn(data?.token, data?.user, data?.activeGroup, data?.activeRole, data?.memberships, true);
      void AsyncStorage.setItem('vifani_bio_creds', JSON.stringify({ savedPhone: cleanPhone, savedPin: cleanPin })).catch(() => {});
    } catch (error) {
      let message = 'Majibu ya kuingia hayakuweza kutumika kwenye simu hii.';
      if (isAxiosError(error)) {
        const detail = error.response?.data?.error;
        const code = error.response?.data?.code;
        if (typeof detail === 'string') message = detail;
        else if (!error.response) message = 'Simu imeshindwa kuwasiliana na seva. Hakiki mtandao kisha ujaribu tena.';
        else message = 'Seva imeshindwa kushughulikia ombi la kuingia.';
        if (typeof code === 'string' && /^[A-Z0-9_]{1,35}$/.test(code)) message += ' (' + code + ')';
        else if (error.response && error.response.status >= 500) message += ' (HTTP ' + error.response.status + ')';
      } else if (error instanceof Error) {
        message = error.message;
      }
      Alert.alert('Imeshindikana Kuingia', message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!/^\d{6}$/.test(otp)) {
      return Alert.alert('OTP Si Sahihi', 'Weka kodi ya OTP yenye tarakimu 6 pekee.');
    }
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const res = await apiClient.post('/auth/verify-otp', { phone, otp, deviceId });
      const data = res.data;
      await signIn(data.token, data.user, data.activeGroup, data.activeRole, data.memberships, true);
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'OTP si sahihi.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPin = () => {
    if (!isValidTzPhone(phone)) {
      return Alert.alert('Weka Namba Sahihi', 'Ingiza tarakimu 10 za namba yako ya simu iliyosajiliwa.');
    }
    switchMode('RESET');
  };

  const handleResetPin = async () => {
    if (!isValidTzPhone(phone) || !/^\d{6}$/.test(otp) || !isValidPin(newPin)) {
      return Alert.alert('Angalia Taarifa', 'Weka OTP ya tarakimu 6 na PIN mpya ya tarakimu 4 hadi 6.');
    }
    setLoading(true);
    try {
      const res = await apiClient.post('/auth/reset-pin', { phone, otp, newPin });
      await AsyncStorage.removeItem('vifani_bio_creds').catch(() => {});
      setHasSavedBiometrics(false);
      Alert.alert('Imefanikiwa', res.data?.message);
      setOtp('');
      setPin('');
      setNewPin('');
      switchMode('LOGIN');
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kubadili PIN.');
    } finally {
      setLoading(false);
    }
  };

  const openSupportWhatsApp = () => {
    const message = encodeURIComponent('Habari Vifani Digital, nahitaji msaada kuhusu mfumo wa Vifani Jamii.');
    Linking.openURL(`https://wa.me/?text=${message}`).catch(() =>
      Alert.alert('Msaada', 'Imeshindwa kufungua WhatsApp kwenye simu hii.')
    );
  };

  const openSocialLink = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert('Hitilafu', 'Imeshindwa kufungua kiungo hiki.'));
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-slate-950"
    >
      <FormScrollView
        ref={loginScroll}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 40) }}
        contentContainerClassName="flex-grow"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header ya Kisasa */}
        <View
          style={{ paddingTop: Math.max(insets.top + 16, 52) }}
          className="bg-teal-900 pb-20 px-6 rounded-b-[42px] items-center border-b border-teal-700/50"
        >
          <View className="w-16 h-16 bg-teal-500/20 rounded-2xl items-center justify-center mb-3 border border-teal-400/40">
            <Ionicons name="shield-checkmark" size={32} color="#5eead4" />
          </View>
          <Text className="text-3xl font-extrabold text-white tracking-tight">
            Vifani Jamii
          </Text>
          <Text className="text-xs text-teal-200 mt-1.5 text-center font-medium px-4">
            Jukwaa la Kisasa la Vikoba • Michezo • Akiba & Mifuko ya Jamii
          </Text>

          {/* Kiashiria cha Hali ya Mtandao */}
          <View className="flex-row items-center gap-1.5 mt-3 bg-teal-950/70 px-3 py-1 rounded-full border border-teal-700/50">
            <View
              className={`w-2 h-2 rounded-full ${
                serverReady === 'ONLINE' ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <Text className="text-[10px] font-bold text-teal-100">
              {serverReady === 'ONLINE' ? 'Mfumo Uko Tayari' : serverReady === 'OFFLINE' ? 'Muunganisho haupatikani' : 'Inaandaa muunganisho...'}
            </Text>
          </View>
        </View>

        {/* Kadi Kuu Inayoelea */}
        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
          className="mx-5 -mt-12 bg-white p-6 rounded-3xl shadow-xl border border-slate-100"
        >
          {mode === 'LOGIN' && (
            <>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Karibu Tena</Text>
              <Text className="text-xs text-slate-500 mb-5">
                Ingiza taarifa zako kufikia akaunti ya kikundi chako
              </Text>

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                Namba ya Simu
              </Text>
              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-3.5 mb-4">
                <Ionicons name="call-outline" size={20} color="#0f766e" />
                <FormTextInput
                  className="flex-1 py-3.5 px-3 text-base font-semibold text-slate-900"
                  placeholder="Mf. 0712345678"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  maxLength={14}
                  value={phone}
                  onChangeText={handlePhoneChange}
                />
                {phone.length > 0 && (
                  <TouchableOpacity onPress={() => setPhone('')}>
                    <Ionicons name="close-circle" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                PIN ya Siri
              </Text>
              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-3.5 mb-2.5">
                <Ionicons name="lock-closed-outline" size={20} color="#0f766e" />
                <FormTextInput
                  className="flex-1 py-3.5 px-3 text-base font-bold text-slate-900 tracking-widest"
                  placeholder="••••"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  secureTextEntry={!showPin}
                  maxLength={6}
                  value={pin}
                  onChangeText={handlePinChange}
                />
                <TouchableOpacity
                  onPress={() => setShowPin(!showPin)}
                  className="flex-row items-center gap-1 bg-slate-200/70 px-2.5 py-1.5 rounded-xl"
                >
                  <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={18} color="#0f766e" />
                  <Text className="text-[10px] font-bold text-slate-700">
                    {showPin ? 'Ficha' : 'Ona'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => Alert.alert('Umesahau PIN?', 'Wasiliana na uongozi wa kikundi au tumia Msaada wa Haraka. Urejeshaji wa PIN kwa SMS bado haujaunganishwa.')} className="self-end mb-6">
                <Text className="text-teal-700 font-bold text-xs">Umesahau PIN?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`p-4 rounded-2xl items-center flex-row justify-center shadow-sm ${
                  isLoginReady ? 'bg-teal-700' : 'bg-slate-200'
                }`}
                onPress={() => executeLogin(phone, pin)}
                disabled={!isLoginReady}
              >
                {loading ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator color="#ffffff" size="small" />
                    <Text className="text-white text-base font-bold">Inaingia...</Text>
                  </View>
                ) : (
                  <Text className={`text-base font-extrabold ${isLoginReady ? 'text-white' : 'text-slate-400'}`}>
                    Ingia Kwenye Akaunti
                  </Text>
                )}
              </TouchableOpacity>

              {hasSavedBiometrics && (
                <TouchableOpacity
                  onPress={handleBiometricLogin}
                  disabled={loading}
                  className="mt-3.5 border border-teal-600/40 p-3.5 rounded-2xl flex-row items-center justify-center gap-2 bg-teal-50/80"
                >
                  <Ionicons name="finger-print" size={22} color="#0f766e" />
                  <Text className="text-teal-900 font-bold text-xs">Ingia kwa Alama ya Kidole / Uso</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => switchMode('FORGOT')} disabled={loading} className="mt-4 items-center">
                <Text className="font-bold text-teal-700">Nimesahau PIN</Text>
              </TouchableOpacity>
              <View className="mt-6 pt-5 border-t border-slate-100 items-center">
                <Text className="text-slate-500 text-xs mb-2">Huna kikundi kilichosajiliwa bado?</Text>
                <TouchableOpacity
                  onPress={() => router.push('/register')}
                  className="bg-slate-900 px-5 py-3 rounded-xl flex-row items-center gap-2"
                >
                  <Ionicons name="add-circle-outline" size={18} color="#5eead4" />
                  <Text className="text-white font-bold text-xs">Sajili Kikundi Kipya Sasa</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          {mode === 'OTP' && (
            <>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Thibitisha Simu Mpya</Text>
              <Text className="text-xs text-slate-500 mb-4">
                Ingiza kodi ya OTP yenye tarakimu 6 iliyotumwa kwenda {phone}
              </Text>
              <FormTextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 text-center text-xl font-bold tracking-widest text-slate-900"
                placeholder="000000"
                keyboardType="numeric"
                maxLength={6}
                value={otp}
                onChangeText={handleOtpChange}
              />
              <TouchableOpacity
                className="bg-teal-700 p-4 rounded-2xl items-center mb-3"
                onPress={handleVerifyOtp}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Thibitisha Simu</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => switchMode('LOGIN')} className="items-center py-1">
                <Text className="text-slate-500 font-bold text-xs">Rudi Nyuma</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'FORGOT' && (
            <>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Rejesha PIN Yako</Text>
              <Text className="text-xs text-slate-500 mb-4">
                Omba kodi ya muda kwa mwenyekiti wa kikundi chako. Ukiipata, andika namba yako iliyosajiliwa.
              </Text>
              <FormTextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 text-base font-semibold text-slate-900"
                placeholder="Mf. 0712345678"
                keyboardType="numeric"
                maxLength={14}
                value={phone}
                onChangeText={handlePhoneChange}
              />
              <TouchableOpacity
                className="bg-teal-700 p-4 rounded-2xl items-center mb-4"
                onPress={handleForgotPin}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Nina kodi ya mwenyekiti</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => switchMode('LOGIN')} className="items-center">
                <Text className="text-slate-500 font-bold text-xs">Rudi Kwenye Kuingia</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'RESET' && (
            <>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Weka PIN Mpya</Text>
              <Text className="text-xs text-slate-500 mb-4">
                Ingiza kodi uliyopewa na mwenyekiti na uchague PIN yako mpya ya siri.
              </Text>
              <Text className="text-xs font-bold text-slate-700 mb-1.5">Kodi ya mwenyekiti (Tarakimu 6)</Text>
              <FormTextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 text-base font-bold text-slate-900 tracking-widest"
                placeholder="000000"
                keyboardType="numeric"
                maxLength={6}
                value={otp}
                onChangeText={handleOtpChange}
              />

              <Text className="text-xs font-bold text-slate-700 mb-1.5">PIN Mpya (Tarakimu 4 hadi 6)</Text>
              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-2xl px-3.5 mb-5">
                <Ionicons name="lock-closed-outline" size={20} color="#0f766e" />
                <FormTextInput
                  className="flex-1 py-3.5 px-3 text-base font-bold text-slate-900 tracking-widest"
                  placeholder="Weka PIN mpya"
                  keyboardType="numeric"
                  secureTextEntry={!showNewPin}
                  maxLength={6}
                  value={newPin}
                  onChangeText={handleNewPinChange}
                />
                <TouchableOpacity
                  onPress={() => setShowNewPin(!showNewPin)}
                  className="flex-row items-center gap-1 bg-slate-200/70 px-2.5 py-1.5 rounded-xl"
                >
                  <Ionicons name={showNewPin ? 'eye-off-outline' : 'eye-outline'} size={18} color="#0f766e" />
                  <Text className="text-[10px] font-bold text-slate-700">
                    {showNewPin ? 'Ficha' : 'Ona'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                className="bg-teal-700 p-4 rounded-2xl items-center mb-3"
                onPress={handleResetPin}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Hifadhi PIN Mpya</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => switchMode('LOGIN')} className="items-center py-1">
                <Text className="text-slate-500 font-bold text-xs">Rudi Kwenye Kuingia</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        {/* Sehemu ya Msaada & Kadi ya Mitandao ya Kijamii Iliyofichwa */}
        <View className="mt-7 px-6 items-center">
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={openSupportWhatsApp}
              className="flex-row items-center gap-2 bg-emerald-600 px-4 py-2.5 rounded-full shadow-sm"
            >
              <FontAwesome5 name="whatsapp" size={16} color="#ffffff" />
              <Text className="text-white font-bold text-xs">Msaada wa Haraka</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setShowSocials(!showSocials);
              }}
              className="flex-row items-center gap-1.5 bg-slate-800 border border-slate-700 px-4 py-2.5 rounded-full"
            >
              <Ionicons name="share-social-outline" size={16} color="#5eead4" />
              <Text className="text-teal-200 font-bold text-xs">
                {showSocials ? 'Funga Kurasa' : 'Tufuate Vifani'}
              </Text>
            </TouchableOpacity>
          </View>

          {showSocials && (
            <View onLayout={() => loginScroll.current?.scrollToEnd({ animated: true })} className="mt-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl w-full items-center">
              <Text className="text-[11px] text-slate-400 mb-3 font-medium">
                Ungana nasi Vifani Digital kwa elimu na huduma za kidijitali
              </Text>
              <View className="flex-row flex-wrap justify-center gap-3">
                <TouchableOpacity
                  onPress={() => openSocialLink('https://facebook.com')}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-full items-center justify-center"
                >
                  <FontAwesome5 name="facebook-f" size={15} color="#3b82f6" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => openSocialLink('https://instagram.com')}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-full items-center justify-center"
                >
                  <FontAwesome5 name="instagram" size={17} color="#f43f5e" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => openSocialLink('https://whatsapp.com')}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-full items-center justify-center"
                >
                  <FontAwesome5 name="whatsapp" size={17} color="#10b981" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => openSocialLink('https://tiktok.com')}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-full items-center justify-center"
                >
                  <FontAwesome5 name="tiktok" size={15} color="#ffffff" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => openSocialLink('https://x.com')}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-full items-center justify-center"
                >
                  <FontAwesome6 name="x-twitter" size={15} color="#e2e8f0" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => openSocialLink('https://linkedin.com')}
                  className="w-10 h-10 bg-slate-800 border border-slate-700 rounded-full items-center justify-center"
                >
                  <FontAwesome5 name="linkedin-in" size={15} color="#38bdf8" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </FormScrollView>
    </KeyboardAvoidingView>
  );
}
