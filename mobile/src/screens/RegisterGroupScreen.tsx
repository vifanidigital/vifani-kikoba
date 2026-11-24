import { FormTextInput, FormScrollView } from '../components/KeyboardForm';
import { router } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,

  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  LayoutAnimation,
  UIManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Application from 'expo-application';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const WEAK_PINS = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '12345', '123456', '000000'];

export default function RegisterGroupScreen() {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Hatua A: Utambulisho
  const [groupName, setGroupName] = useState('');
  const groupType: string = 'SHARES';
  const [cycleMonths, setCycleMonths] = useState('12');

  // Hatua B: Akiba & Jamii
  const [shareValue, setShareValue] = useState('5000');
  const [contributionFreq, setContributionFreq] = useState('WEEKLY');
  const [latePenalty, setLatePenalty] = useState('1000');
  const [socialFundAmount, setSocialFundAmount] = useState('2000');

  // Hatua C: Mikopo & Papo
  const [loanLimitMultiplier, setLoanLimitMultiplier] = useState('3');
  const [hasPapo, setHasPapo] = useState(true);
  const [mandatoryPapoAmount, setMandatoryPapoAmount] = useState('50000');
  const [papoMeetingInterest, setPapoMeetingInterest] = useState('10');
  const [allowTopUpPapo, setAllowTopUpPapo] = useState(true);
  const [topUpPapoInterest, setTopUpPapoInterest] = useState('15');

  // Hatua D: Uongozi
  const [creatorRole] = useState<'CHAIRPERSON' | 'SECRETARY' | 'TREASURER'>('CHAIRPERSON');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [chairName, setChairName] = useState('');
  const [chairPhone, setChairPhone] = useState('');
  const [secName, setSecName] = useState('');
  const [secPhone, setSecPhone] = useState('');
  const [treasName, setTreasName] = useState('');
  const [treasPhone, setTreasPhone] = useState('');

  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(18));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();

    apiClient.get('/health').catch(() => {});
  }, [fadeAnim, slideAnim]);

  const goToStep = (nextStep: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStep(nextStep);
  };
  const onlyDigits = (v: string) => v.replace(/[^0-9]/g, '');
  const isValidTzPhone = (p: string) => /^(0[67]\d{8}|255[67]\d{8})$/.test(p);

  const handleSelectGroupType = (type: string) => {
    if (type !== groupType) Alert.alert('Inakuja hivi punde', 'Kwa sasa unaweza kusajili kikoba pekee.');
  };

  const getSafeDeviceId = () => {
    try {
      return Application.getAndroidId() || 'device-default-id';
    } catch {
      return 'device-default-id';
    }
  };

  const handleCompleteRegistration = async () => {
    const cleanChairPhone = onlyDigits(chairPhone);
    const cleanSecPhone = onlyDigits(secPhone);
    const cleanTreasPhone = onlyDigits(treasPhone);
    const cleanPin = onlyDigits(pin);

    if (!chairName.trim() || chairName.trim().length < 3) {
      return Alert.alert('Jina la Mwenyekiti', 'Weka jina kamili la Mwenyekiti (angalau herufi 3).');
    }
    if (!isValidTzPhone(cleanChairPhone)) {
      return Alert.alert('Namba ya Mwenyekiti', 'Weka namba sahihi ya simu ya Tanzania (mf. 0712345678).');
    }

    if (secName.trim() || cleanSecPhone) {
      if (!secName.trim() || !isValidTzPhone(cleanSecPhone)) {
        return Alert.alert('Taarifa za Katibu', 'Kama unajaza Katibu, weka jina lake na namba sahihi ya simu (tarakimu 10).');
      }
      if (cleanSecPhone === cleanChairPhone) {
        return Alert.alert('Namba Zinafanana', 'Namba ya Katibu haiwezi kufanana na ya Mwenyekiti.');
      }
    }

    if (treasName.trim() || cleanTreasPhone) {
      if (!treasName.trim() || !isValidTzPhone(cleanTreasPhone)) {
        return Alert.alert('Taarifa za Mweka Hazina', 'Kama unajaza Mweka Hazina, weka jina lake na namba sahihi ya simu (tarakimu 10).');
      }
      if (cleanTreasPhone === cleanChairPhone || (cleanSecPhone && cleanTreasPhone === cleanSecPhone)) {
        return Alert.alert('Namba Zinafanana', 'Namba ya Mweka Hazina lazima iwe tofauti na viongozi wengine.');
      }
    }

    if (cleanPin.length < 4 || cleanPin.length > 6) {
      return Alert.alert('Weka PIN Imara', 'Weka PIN ya siri yenye tarakimu 4 hadi 6 (mf. 2580).');
    }
    if (WEAK_PINS.includes(cleanPin)) {
      return Alert.alert('PIN Dhaifu', 'Epuka PIN rahisi kama 1234 au 0000. Chagua namba nyingine ya siri.');
    }

    setLoading(true);
    try {
      const deviceId = getSafeDeviceId();
      const payload = {
        groupName: groupName.trim(),
        groupType,
        cycleMonths: Math.max(1, Number(cycleMonths) || 12),
        shareValue: Math.max(500, Number(shareValue) || 5000),
        contributionFreq,
        latePenalty: Number(latePenalty) || 0,
        socialFundAmount: Number(socialFundAmount) || 0,
        loanLimitMultiplier: Math.max(1, Number(loanLimitMultiplier) || 3),
        hasPapo,
        mandatoryPapoAmount: hasPapo ? Number(mandatoryPapoAmount) : 0,
        papoMeetingInterest: hasPapo ? Number(papoMeetingInterest) : 0,
        allowTopUpPapo: hasPapo ? allowTopUpPapo : false,
        topUpPapoInterest: hasPapo && allowTopUpPapo ? Number(topUpPapoInterest) : 0,
        creatorRole,
        pin: cleanPin,
        deviceId,
        chairperson: { fullName: chairName.trim(), phone: cleanChairPhone },
        secretary: secName.trim() && cleanSecPhone ? { fullName: secName.trim(), phone: cleanSecPhone } : undefined,
        treasurer: treasName.trim() && cleanTreasPhone ? { fullName: treasName.trim(), phone: cleanTreasPhone } : undefined };

      const res = await apiClient.post('/auth/register-group', payload);
      const data = res.data;

      Alert.alert('Hongera!', data.message || 'Kikundi kimesajiliwa kikamilifu!');
      await signIn(data.token, data.user, data.activeGroup, data.activeRole, data.memberships, false);
    } catch (error: any) {
      const msg = error.response?.data?.error || error.message || 'Imeshindikana kusajili kikundi.';
      Alert.alert('Imeshindikana', msg);
    } finally {
      setLoading(false);
    }
  };
  const stepLabels = ['Utambulisho', 'Akiba', 'Mikopo', 'Uongozi'];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-slate-950"
    >
      <FormScrollView
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 40) }}
        contentContainerClassName="flex-grow"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{ paddingTop: Math.max(insets.top + 12, 48) }}
          className="bg-teal-900 pb-14 px-6 rounded-b-[38px] border-b border-teal-700/50"
        >
          <TouchableOpacity
            onPress={() => router.canGoBack() ? router.back() : router.replace('/login')}
            className="flex-row items-center gap-1.5 mb-3 self-start"
          >
            <Ionicons name="arrow-back" size={18} color="#5eead4" />
            <Text className="text-teal-200 font-bold text-xs">Rudi Kwenye Kuingia</Text>
          </TouchableOpacity>

          <Text className="text-2xl font-extrabold text-white">Sajili Kikundi Kipya</Text>
          <Text className="text-xs text-teal-200 mt-1">
            Hatua ya {step} kati ya 4 ({stepLabels[step - 1]}) • Vifani Jamii
          </Text>

          <View className="flex-row justify-between mt-4 gap-1.5">
            {stepLabels.map((label, index) => {
              const stepNum = index + 1;
              const active = step >= stepNum;
              return (
                <View key={label} className="flex-1">
                  <View className={`h-1.5 rounded-full ${active ? 'bg-teal-300' : 'bg-teal-950/80'}`} />
                  <Text
                    className={`text-[9px] font-bold mt-1 text-center ${
                      active ? 'text-teal-200' : 'text-teal-500'
                    }`}
                  >
                    {stepNum}. {label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
          className="mx-5 -mt-8 bg-white p-6 rounded-3xl shadow-xl border border-slate-100"
        >
          {step === 1 && (
            <View>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Utambulisho wa Kikundi</Text>
              <Text className="text-xs text-slate-500 mb-5">Chagua aina ya kikundi na muda wa mzunguko.</Text>

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase">Jina la Kikundi</Text>
              <FormTextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 text-slate-900 font-semibold"
                placeholder="Mf. Umoja Women Group"
                placeholderTextColor="#94a3b8"
                value={groupName}
                onChangeText={setGroupName}
              />

              <Text className="text-xs font-bold text-slate-700 mb-2 uppercase">Aina ya Kikundi</Text>
              {[
                { id: 'SHARES', label: 'VICOBA (Hisa, Jamii & Mikopo)', icon: 'trending-up' },
                { id: 'MCHEZO', label: 'Mchezo / Upatu (Mzunguko)', icon: 'repeat' },
                { id: 'FIXED_SAVINGS', label: 'Kikoba cha Akiba ya Kawaida', icon: 'wallet-outline' },
                { id: 'WELFARE', label: 'Mfuko wa Jamii / Maafa', icon: 'heart-outline' },
              ].map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleSelectGroupType(item.id)}
                  className={`p-3.5 rounded-2xl border mb-2 flex-row items-center gap-3 ${
                    groupType === item.id ? 'bg-teal-50 border-teal-700' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <Ionicons
                    name={item.icon as any}
                    size={20}
                    color={groupType === item.id ? '#0f766e' : '#64748b'}
                  />
                  <Text className={`font-bold text-xs ${groupType === item.id ? 'text-teal-900' : 'text-slate-700'}`}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}

              <Text className="text-xs font-bold text-slate-700 mt-3 mb-1.5 uppercase">Muda wa Mzunguko (Miezi)</Text>
              <FormTextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-6 text-slate-900 font-bold"
                keyboardType="numeric"
                value={cycleMonths}
                onChangeText={(t) => setCycleMonths(onlyDigits(t))}
              />

              <TouchableOpacity
                className="bg-teal-700 p-4 rounded-2xl items-center"
                onPress={() =>
                  groupName.trim().length >= 3
                    ? goToStep(2)
                    : Alert.alert('Weka Jina', 'Weka jina la kikundi lenye herufi 3 au zaidi.')
                }
              >
                <Text className="text-white font-extrabold text-sm">Endelea Hatua ya 2</Text>
              </TouchableOpacity>
            </View>
          )}
          {step === 2 && (
            <View>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Sheria za Akiba & Jamii</Text>
              <Text className="text-xs text-slate-500 mb-5">Weka viwango vya michango ya kawaida.</Text>

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase">Thamani ya Hisa / Mchango (TZS)</Text>
              <FormTextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 text-slate-900 font-bold"
                keyboardType="numeric"
                value={shareValue}
                onChangeText={(t) => setShareValue(onlyDigits(t))}
              />

              <Text className="text-xs font-bold text-slate-700 mb-2 uppercase">Mzunguko wa Vikao</Text>
              <View className="flex-row gap-2 mb-4">
                {[
                  { id: 'WEEKLY', label: 'Kila Wiki' },
                  { id: 'BIWEEKLY', label: 'Wiki 2' },
                  { id: 'MONTHLY', label: 'Mwezi' },
                ].map((freq) => (
                  <TouchableOpacity
                    key={freq.id}
                    onPress={() => setContributionFreq(freq.id)}
                    className={`flex-1 p-3 rounded-xl border items-center ${
                      contributionFreq === freq.id ? 'bg-teal-700 border-teal-700' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${contributionFreq === freq.id ? 'text-white' : 'text-slate-700'}`}>
                      {freq.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase">Mchango wa Mfuko wa Jamii (TZS)</Text>
              <FormTextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 text-slate-900 font-bold"
                keyboardType="numeric"
                value={socialFundAmount}
                onChangeText={(t) => setSocialFundAmount(onlyDigits(t))}
              />

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase">Faini ya Kuchelewa Kikao (TZS)</Text>
              <FormTextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-6 text-slate-900 font-bold"
                keyboardType="numeric"
                value={latePenalty}
                onChangeText={(t) => setLatePenalty(onlyDigits(t))}
              />

              <View className="flex-row gap-3">
                <TouchableOpacity className="flex-1 bg-slate-200 p-4 rounded-2xl items-center" onPress={() => goToStep(1)}>
                  <Text className="font-bold text-slate-700 text-xs">Rudi</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-teal-700 p-4 rounded-2xl items-center" onPress={() => goToStep(3)}>
                  <Text className="text-white font-bold text-xs">Endelea Hatua ya 3</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Sheria za Mikopo & Papo</Text>
              <Text className="text-xs text-slate-500 mb-4">Sanidi mikopo mikubwa na mfumo wa Papo.</Text>

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase">Riba ya Mkopo Mkubwa (%)</Text>
              <FormTextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-3 text-slate-900 font-bold"
                editable={false}
                value="10%"
              />

              <View className="flex-row gap-2 mb-4">
                <View className="flex-1">
                  <Text className="text-[11px] font-bold text-slate-700 mb-1">Kiwango (Mara ya Hisa)</Text>
                  <FormTextInput
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 font-bold"
                    keyboardType="numeric"
                    value={loanLimitMultiplier}
                    onChangeText={(t) => setLoanLimitMultiplier(onlyDigits(t))}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] font-bold text-slate-700 mb-1">Muda wa Mkopo (Miezi)</Text>
                  <FormTextInput
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 font-bold"
                    editable={false}
                    value="Miezi 2"
                  />
                </View>
              </View>

              <View className="bg-teal-50 p-4 rounded-2xl border border-teal-200 mb-4">
                <View className="flex-row justify-between items-center mb-1.5">
                  <Text className="text-sm font-extrabold text-teal-900">Washa Mfumo wa Papo</Text>
                  <Switch value={hasPapo} onValueChange={setHasPapo} trackColor={{ true: '#0f766e' }} />
                </View>
                <Text className="text-[11px] text-teal-700 mb-3">
                  Kila mwanachama anapewa kianzio cha Papo ambacho riba yake hulipwa kila kikao.
                </Text>

                {hasPapo && (
                  <View>
                    <Text className="text-xs font-bold text-slate-700 mb-1">Kiasi cha Papo ya Lazima (TZS)</Text>
                    <FormTextInput
                      className="bg-white border border-slate-300 rounded-xl p-3 mb-3 font-bold text-slate-900"
                      keyboardType="numeric"
                      value={mandatoryPapoAmount}
                      onChangeText={(t) => setMandatoryPapoAmount(onlyDigits(t))}
                    />

                    <Text className="text-xs font-bold text-slate-700 mb-1">Riba ya Papo Kila Kikao (%)</Text>
                    <FormTextInput
                      className="bg-white border border-slate-300 rounded-xl p-3 mb-3 font-bold text-slate-900"
                      keyboardType="numeric"
                      value={papoMeetingInterest}
                      onChangeText={(t) => setPapoMeetingInterest(onlyDigits(t))}
                    />

                    <View className="flex-row justify-between items-center my-2">
                      <Text className="text-xs font-bold text-slate-800">Ruhusu Papo ya Hiari (Top-up)</Text>
                      <Switch value={allowTopUpPapo} onValueChange={setAllowTopUpPapo} trackColor={{ true: '#0f766e' }} />
                    </View>

                    {allowTopUpPapo && (
                      <View>
                        <Text className="text-xs font-bold text-slate-700 mb-1">Riba ya Papo ya Hiari (%)</Text>
                        <FormTextInput
                          className="bg-white border border-slate-300 rounded-xl p-3 font-bold text-slate-900"
                          keyboardType="numeric"
                          value={topUpPapoInterest}
                          onChangeText={(t) => setTopUpPapoInterest(onlyDigits(t))}
                        />
                      </View>
                    )}
                  </View>
                )}
              </View>

              <View className="flex-row gap-3 mt-2">
                <TouchableOpacity className="flex-1 bg-slate-200 p-4 rounded-2xl items-center" onPress={() => goToStep(2)}>
                  <Text className="font-bold text-slate-700 text-xs">Rudi</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-teal-700 p-4 rounded-2xl items-center" onPress={() => goToStep(4)}>
                  <Text className="text-white font-bold text-xs">Endelea Hatua ya 4</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {step === 4 && (
            <View>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Uongozi wa Kikundi</Text>
              <Text className="text-xs text-slate-500 mb-4">
                Mwenyekiti ni lazima. Katibu na Mweka Hazina ni hiari (unaweza kuwaongeza baadaye).
              </Text>

              <View className="bg-slate-50 p-4 rounded-2xl border-2 border-teal-600 mb-3">
                <Text className="font-extrabold text-teal-800 text-xs uppercase mb-2">1. Mwenyekiti (Lazima)</Text>
                <FormTextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 mb-2 text-slate-900 font-semibold"
                  placeholder="Jina Kamili la Mwenyekiti"
                  value={chairName}
                  onChangeText={setChairName}
                />
                <FormTextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 text-slate-900 font-semibold"
                  placeholder="Namba ya Simu (mf. 0712345678)"
                  keyboardType="numeric"
                  maxLength={12}
                  value={chairPhone}
                  onChangeText={(t) => setChairPhone(onlyDigits(t))}
                />
              </View>

              <View className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-3">
                <Text className="font-bold text-slate-700 text-xs uppercase mb-2">2. Katibu (Hiari)</Text>
                <FormTextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 mb-2 text-slate-900"
                  placeholder="Jina Kamili la Katibu (au acha wazi)"
                  value={secName}
                  onChangeText={setSecName}
                />
                <FormTextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 text-slate-900"
                  placeholder="Namba ya Simu ya Katibu (au acha wazi)"
                  keyboardType="numeric"
                  maxLength={12}
                  value={secPhone}
                  onChangeText={(t) => setSecPhone(onlyDigits(t))}
                />
              </View>

              <View className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-3">
                <Text className="font-bold text-slate-700 text-xs uppercase mb-2">3. Mweka Hazina (Hiari)</Text>
                <FormTextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 mb-2 text-slate-900"
                  placeholder="Jina Kamili la Mweka Hazina (au acha wazi)"
                  value={treasName}
                  onChangeText={setTreasName}
                />
                <FormTextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 text-slate-900"
                  placeholder="Namba ya Simu ya Mweka Hazina (au acha wazi)"
                  keyboardType="numeric"
                  maxLength={12}
                  value={treasPhone}
                  onChangeText={(t) => setTreasPhone(onlyDigits(t))}
                />
              </View>

              <View className="bg-amber-50 p-4 rounded-2xl border border-amber-200 mb-4">
                <Text className="font-extrabold text-amber-900 text-xs uppercase mb-1">
                  Weka PIN Yako ya Siri (Tarakimu 4-6)
                </Text>
                <Text className="text-[11px] text-amber-700 mb-2">
                  Epuka PIN rahisi kama 1234 au 0000. Tumia namba imara kama 2580.
                </Text>
                <View className="flex-row items-center bg-white border border-amber-300 rounded-xl px-3">
                  <FormTextInput
                    className="flex-1 py-3 text-base font-bold tracking-widest text-slate-900"
                    placeholder="Mf. 2580"
                    keyboardType="numeric"
                    secureTextEntry={!showPin}
                    maxLength={6}
                    value={pin}
                    onChangeText={(t) => setPin(onlyDigits(t))}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPin(!showPin)}
                    className="flex-row items-center gap-1 bg-amber-100 px-2.5 py-1.5 rounded-lg"
                  >
                    <Ionicons name={showPin ? 'eye-off-outline' : 'eye-outline'} size={17} color="#92400e" />
                    <Text className="text-[10px] font-bold text-amber-900">
                      {showPin ? 'Ficha' : 'Ona'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Muhtasari Mfupi wa Uhakiki */}
              <View className="bg-teal-950 p-3.5 rounded-2xl mb-4">
                <Text className="text-teal-300 text-[10px] font-extrabold uppercase mb-1">
                  Muhtasari wa Kikundi Chako
                </Text>
                <Text className="text-white text-xs font-bold">
                  {groupName.trim()} • Hisa: TZS {Number(shareValue || 0).toLocaleString()} • Miezi {cycleMonths || 12}
                </Text>
              </View>

              <View className="flex-row gap-3">
                <TouchableOpacity className="flex-1 bg-slate-200 p-4 rounded-2xl items-center" onPress={() => goToStep(3)}>
                  <Text className="font-bold text-slate-700 text-xs">Rudi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-teal-700 p-4 rounded-2xl items-center"
                  onPress={handleCompleteRegistration}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text className="text-white font-extrabold text-xs">Kamilisha Usajili</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      </FormScrollView>
    </KeyboardAvoidingView>
  );
}
