import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, FontAwesome5, FontAwesome6 } from '@expo/vector-icons';
import { API_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function LoginScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [mode, setMode] = useState<'LOGIN' | 'OTP' | 'FORGOT' | 'RESET'>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [hasSavedBiometrics, setHasSavedBiometrics] = useState(false);

  // Kichujio kikali: Kinaruhusu tarakimu (0-9) pekee hata mtu akibandika (Paste) herufi
  const onlyDigits = (text: string) => text.replace(/[^0-9]/g, '');

  const handlePhoneChange = (text: string) => setPhone(onlyDigits(text));
  const handlePinChange = (text: string) => setPin(onlyDigits(text));
  const handleOtpChange = (text: string) => setOtp(onlyDigits(text));
  const handleNewPinChange = (text: string) => setNewPin(onlyDigits(text));

  // Uhakiki wa muundo wa namba ya Tanzania (06... au 07... yenye tarakimu 10, au 255... yenye 12)
  const isValidTzPhone = (p: string) => /^(0[67]\d{8}|255[67]\d{8})$/.test(p);
  const isValidPin = (p: string) => /^\d{4,6}$/.test(p);

  const isLoginReady = isValidTzPhone(phone) && isValidPin(pin) && !loading;

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const getDeviceId = async () => {
    try {
      return Application.getAndroidId() || 'device-default-id';
    } catch {
      return 'device-default-id';
    }
  };

  const checkBiometricAvailability = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    const savedCreds = await AsyncStorage.getItem('vifani_bio_creds');
    if (compatible && enrolled && savedCreds) {
      setHasSavedBiometrics(true);
    }
  };

  const handleBiometricLogin = async () => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Thibitisha kwa Alama ya Kidole au Uso',
      fallbackLabel: 'Tumia PIN',
    });

    if (result.success) {
      const savedCreds = await AsyncStorage.getItem('vifani_bio_creds');
      if (savedCreds) {
        const { savedPhone, savedPin } = JSON.parse(savedCreds);
        await executeLogin(savedPhone, savedPin);
      }
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
      return Alert.alert('PIN Si Sahihi', 'PIN lazima iwe tarakimu (namba) 4 hadi 6 pekee.');
    }

    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, pin: cleanPin, deviceId }),
      });

      const data = await response.json();

      if (response.status === 202 && data.requireOtp) {
        Alert.alert('Uhakiki wa Simu Mpya', `${data.message}\n(Kodi ya Majaribio: ${data.devOtp})`);
        setMode('OTP');
        return;
      }

      if (!response.ok) {
        return Alert.alert('Imeshindikana', data.error || 'Namba ya simu au PIN si sahihi.');
      }

      await AsyncStorage.setItem('vifani_bio_creds', JSON.stringify({ savedPhone: cleanPhone, savedPin: cleanPin }));
      await signIn(data.token, data.user, data.activeGroup, data.activeRole, data.memberships, true);
    } catch (error: any) {
      Alert.alert('Hitilafu ya Mtandao', `Imeshindwa kuunganisha: ${error.message}`);
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
      const response = await fetch(`${API_URL}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, deviceId }),
      });
      const data = await response.json();
      if (!response.ok) return Alert.alert('Hitilafu', data.error || 'OTP si sahihi.');

      await signIn(data.token, data.user, data.activeGroup, data.activeRole, data.memberships, true);
    } catch (error: any) {
      Alert.alert('Hitilafu', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPin = async () => {
    if (!isValidTzPhone(phone)) {
      return Alert.alert('Weka Namba Sahihi', 'Ingiza tarakimu 10 za namba yako ya simu iliyosajiliwa.');
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/forgot-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json();
      if (!response.ok) return Alert.alert('Hitilafu', data.error || 'Namba haijapatikana.');

      Alert.alert('OTP Imetumwa', `${data.message}\n(Kodi ya Majaribio: ${data.devOtp})`);
      setMode('RESET');
    } catch (error: any) {
      Alert.alert('Hitilafu', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (!/^\d{6}$/.test(otp) || !isValidPin(newPin)) {
      return Alert.alert('Angalia Taarifa', 'Weka OTP ya tarakimu 6 na PIN mpya ya tarakimu 4 hadi 6.');
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, newPin }),
      });
      const data = await response.json();
      if (!response.ok) return Alert.alert('Hitilafu', data.error || 'Imeshindikana kubadili PIN.');

      Alert.alert('Imefanikiwa', data.message);
      setOtp('');
      setPin('');
      setNewPin('');
      setMode('LOGIN');
    } catch (error: any) {
      Alert.alert('Hitilafu', error.message);
    } finally {
      setLoading(false);
    }
  };

  const openSupportWhatsApp = () => {
    const message = encodeURIComponent('Habari Vifani Digital, nahitaji msaada kuhusu app ya Vifani Kikoba.');
    Linking.openURL(`https://wa.me/255750333572?text=${message}`).catch(() =>
      Alert.alert('Msaada', 'Imeshindwa kufungua WhatsApp kwenye simu hii.')
    );
  };

  const openSocialLink = (url: string) => {
    Linking.openURL(url).catch(() => Alert.alert('Hitilafu', 'Imeshindwa kufungua kiungo hiki.'));
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-100"
    >
      <ScrollView contentContainerClassName="flex-grow pb-8" keyboardShouldPersistTaps="handled">
        {/* Sehemu ya Juu ya Kijani */}
        <View className="bg-teal-700 pt-14 pb-16 px-6 rounded-b-[36px] items-center">
          <View className="w-16 h-16 bg-white/15 rounded-2xl items-center justify-center mb-3 border border-white/25">
            <Ionicons name="wallet" size={32} color="#ffffff" />
          </View>
          <Text style={{ fontFamily: 'sans-serif-medium' }} className="text-3xl font-bold text-white tracking-tight">
            Vifani Kikoba
          </Text>
          <Text className="text-sm text-teal-100 mt-1 text-center">
            {mode === 'LOGIN' && 'Simamia hisa, mikopo na mfuko wa kikoba kwa uwazi'}
            {mode === 'OTP' && 'Thibitisha umiliki wa namba yako ya simu'}
            {mode === 'FORGOT' && 'Rudisha PIN yako iliyosahaulika'}
            {mode === 'RESET' && 'Weka OTP na PIN yako mpya'}
          </Text>
        </View>

        {/* Kadi Inayoelea Katikati */}
        <View className="mx-5 -mt-10 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          {mode === 'LOGIN' && (
            <>
              <Text style={{ fontFamily: 'sans-serif-medium' }} className="text-sm font-semibold text-slate-700 mb-1.5">
                Namba ya Simu
              </Text>
              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 mb-4">
                <Ionicons name="call-outline" size={20} color="#64748b" />
                <TextInput
                  className="flex-1 py-3.5 px-3 text-base text-slate-900"
                  placeholder="Mf. 0712345678"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  maxLength={12}
                  value={phone}
                  onChangeText={handlePhoneChange}
                />
              </View>

              <Text style={{ fontFamily: 'sans-serif-medium' }} className="text-sm font-semibold text-slate-700 mb-1.5">
                PIN ya Siri
              </Text>
              <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3.5 mb-2.5">
                <Ionicons name="lock-closed-outline" size={20} color="#64748b" />
                <TextInput
                  className="flex-1 py-3.5 px-3 text-base text-slate-900 tracking-widest"
                  placeholder="Tarakimu 4 hadi 6"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  secureTextEntry={!showPin}
                  maxLength={6}
                  value={pin}
                  onChangeText={handlePinChange}
                />
                <TouchableOpacity onPress={() => setShowPin(!showPin)} className="p-1.5">
                  <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={22} color="#64748b" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={() => setMode('FORGOT')} className="self-end mb-6">
                <Text className="text-teal-700 font-semibold text-sm">Umesahau PIN?</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`p-4 rounded-xl items-center flex-row justify-center ${
                  isLoginReady ? 'bg-teal-700' : 'bg-slate-300'
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
                  <Text className={`text-base font-bold ${isLoginReady ? 'text-white' : 'text-slate-500'}`}>
                    Ingia Kwenye Kikoba
                  </Text>
                )}
              </TouchableOpacity>

              {hasSavedBiometrics && (
                <TouchableOpacity
                  onPress={handleBiometricLogin}
                  disabled={loading}
                  className="mt-4 border border-teal-600 p-3.5 rounded-xl flex-row items-center justify-center gap-2 bg-teal-50/70"
                >
                  <Ionicons name="finger-print" size={22} color="#0f766e" />
                  <Text className="text-teal-800 font-bold text-sm">Ingia kwa Alama ya Kidole / Uso</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={() => navigation.navigate('RegisterGroup')} className="mt-6 items-center">
                <Text className="text-slate-600 text-sm">
                  Kikoba hakijasajiliwa?{' '}
                  <Text className="text-teal-700 font-bold">Sajili Kikoba Kipya</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'OTP' && (
            <>
              <Text className="text-sm font-semibold text-slate-700 mb-1.5">Kodi ya Uthibitisho (OTP)</Text>
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-center text-xl tracking-widest text-slate-900"
                placeholder="000000"
                keyboardType="numeric"
                maxLength={6}
                value={otp}
                onChangeText={handleOtpChange}
              />
              <TouchableOpacity
                className="bg-teal-700 p-4 rounded-xl items-center"
                onPress={handleVerifyOtp}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Thibitisha Simu</Text>}
              </TouchableOpacity>
            </>
          )}

          {mode === 'FORGOT' && (
            <>
              <Text className="text-sm font-semibold text-slate-700 mb-1.5">Namba ya Simu Iliyosajiliwa</Text>
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-base text-slate-900"
                placeholder="Mf. 0712345678"
                keyboardType="numeric"
                maxLength={12}
                value={phone}
                onChangeText={handlePhoneChange}
              />
              <TouchableOpacity
                className="bg-teal-700 p-4 rounded-xl items-center mb-4"
                onPress={handleForgotPin}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Tuma Kodi ya OTP</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setMode('LOGIN')} className="items-center">
                <Text className="text-slate-500 font-semibold">Rudi Kwenye Kuingia</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'RESET' && (
            <>
              <Text className="text-sm font-semibold text-slate-700 mb-1.5">Kodi ya OTP (Tarakimu 6)</Text>
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-base text-slate-900"
                placeholder="000000"
                keyboardType="numeric"
                maxLength={6}
                value={otp}
                onChangeText={handleOtpChange}
              />
              <Text className="text-sm font-semibold text-slate-700 mb-1.5">PIN Mpya (Tarakimu 4 hadi 6)</Text>
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-4 text-base text-slate-900"
                placeholder="Weka PIN mpya"
                keyboardType="numeric"
                secureTextEntry
                maxLength={6}
                value={newPin}
                onChangeText={handleNewPinChange}
              />
              <TouchableOpacity
                className="bg-teal-700 p-4 rounded-xl items-center"
                onPress={handleResetPin}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Hifadhi PIN Mpya</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Sehemu ya Msaada wa Haraka & Mitandao ya Kijamii */}
        <View className="mt-8 px-6 items-center">
          <TouchableOpacity
            onPress={openSupportWhatsApp}
            className="flex-row items-center gap-2 bg-emerald-600 px-5 py-3 rounded-full mb-5 shadow-sm"
          >
            <FontAwesome5 name="whatsapp" size={18} color="#ffffff" />
            <Text className="text-white font-bold text-sm">Msaada wa Haraka</Text>
          </TouchableOpacity>

          <Text className="text-xs text-slate-400 mb-3">Tufuate Vifani Digital kwa elimu na huduma zetu</Text>

          <View className="flex-row justify-center gap-3">
            <TouchableOpacity
              onPress={() => openSocialLink('https://www.facebook.com/share/19YSoskjZi/')}
              className="w-10 h-10 bg-white border border-slate-200 rounded-full items-center justify-center shadow-sm"
            >
              <FontAwesome5 name="facebook-f" size={15} color="#1877F2" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => openSocialLink('https://www.instagram.com/vifanidigital')}
              className="w-10 h-10 bg-white border border-slate-200 rounded-full items-center justify-center shadow-sm"
            >
              <FontAwesome5 name="instagram" size={17} color="#E4405F" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => openSocialLink('https://whatsapp.com/channel/0029VbDjx5IHrDZkEarLHo3p')}
              className="w-10 h-10 bg-white border border-slate-200 rounded-full items-center justify-center shadow-sm"
            >
              <FontAwesome5 name="whatsapp" size={17} color="#25D366" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => openSocialLink('https://www.tiktok.com/@vifanidigital?_r=1&_t=ZS-9BRyZlbzrjG')}
              className="w-10 h-10 bg-white border border-slate-200 rounded-full items-center justify-center shadow-sm"
            >
              <FontAwesome5 name="tiktok" size={15} color="#000000" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => openSocialLink('https://x.com/vifanidigital')}
              className="w-10 h-10 bg-white border border-slate-200 rounded-full items-center justify-center shadow-sm"
            >
              <FontAwesome6 name="x-twitter" size={15} color="#0f172a" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => openSocialLink('https://www.linkedin.com/in/vifanidigital')}
              className="w-10 h-10 bg-white border border-slate-200 rounded-full items-center justify-center shadow-sm"
            >
              <FontAwesome5 name="linkedin-in" size={15} color="#0A66C2" />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
