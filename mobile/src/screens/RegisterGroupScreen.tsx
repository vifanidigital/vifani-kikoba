import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as Application from 'expo-application';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function RegisterGroupScreen({ navigation }: any) {
  const { signIn } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Hatua A: Utambulisho
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState<'SHARES' | 'MCHEZO' | 'FIXED_SAVINGS' | 'WELFARE'>('SHARES');
  const [cycleMonths, setCycleMonths] = useState('12');

  // Hatua B: Akiba & Jamii
  const [shareValue, setShareValue] = useState('5000');
  const [contributionFreq, setContributionFreq] = useState('WEEKLY');
  const [latePenalty, setLatePenalty] = useState('1000');
  const [socialFundAmount, setSocialFundAmount] = useState('2000');

  // Hatua C: Mikopo & Papo
  const [interestRate, setInterestRate] = useState('10');
  const [loanLimitMultiplier, setLoanLimitMultiplier] = useState('3');
  const [maxRepaymentMonths, setMaxRepaymentMonths] = useState('3');
  const [hasPapo, setHasPapo] = useState(true);
  const [mandatoryPapoAmount, setMandatoryPapoAmount] = useState('50000');
  const [papoMeetingInterest, setPapoMeetingInterest] = useState('10');
  const [allowTopUpPapo, setAllowTopUpPapo] = useState(true);
  const [topUpPapoInterest, setTopUpPapoInterest] = useState('15');

  // Hatua D: Uongozi
  const [creatorRole] = useState<'CHAIRPERSON' | 'SECRETARY' | 'TREASURER'>('CHAIRPERSON');
  const [pin, setPin] = useState('');
  const [chairName, setChairName] = useState('');
  const [chairPhone, setChairPhone] = useState('');
  const [secName, setSecName] = useState('');
  const [secPhone, setSecPhone] = useState('');
  const [treasName, setTreasName] = useState('');
  const [treasPhone, setTreasPhone] = useState('');

  const handleSelectGroupType = (type: 'SHARES' | 'MCHEZO' | 'FIXED_SAVINGS' | 'WELFARE') => {
    setGroupType(type);
    if (type === 'MCHEZO' || type === 'WELFARE' || type === 'FIXED_SAVINGS') {
      setHasPapo(false);
    } else {
      setHasPapo(true);
    }
  };
  const handleCompleteRegistration = async () => {
    if (!chairName.trim() || chairPhone.trim().length < 10) {
      return Alert.alert('Taarifa za Mwenyekiti', 'Jina na namba sahihi ya Mwenyekiti ni lazima.');
    }
    if (pin.trim().length < 4) {
      return Alert.alert('Weka PIN Imara', 'Weka PIN ya siri yenye tarakimu 4 hadi 6 (mf. 2580).');
    }

    setLoading(true);
    try {
      const deviceId = Application.getAndroidId() || 'device-default-id';
      const payload = {
        groupName: groupName.trim(),
        groupType,
        cycleMonths: Number(cycleMonths) || 12,
        shareValue: Number(shareValue) || 5000,
        contributionFreq,
        latePenalty: Number(latePenalty) || 0,
        socialFundAmount: Number(socialFundAmount) || 0,
        interestRate: Number(interestRate) || 10,
        loanLimitMultiplier: Number(loanLimitMultiplier) || 3,
        maxRepaymentMonths: Number(maxRepaymentMonths) || 3,
        hasPapo,
        mandatoryPapoAmount: hasPapo ? Number(mandatoryPapoAmount) : 0,
        papoMeetingInterest: hasPapo ? Number(papoMeetingInterest) : 0,
        allowTopUpPapo: hasPapo ? allowTopUpPapo : false,
        topUpPapoInterest: hasPapo && allowTopUpPapo ? Number(topUpPapoInterest) : 0,
        creatorRole,
        pin: pin.trim(),
        deviceId,
        chairperson: { fullName: chairName.trim(), phone: chairPhone.trim() },
        secretary: secName.trim() || secPhone.trim() ? { fullName: secName.trim(), phone: secPhone.trim() } : undefined,
        treasurer: treasName.trim() || treasPhone.trim() ? { fullName: treasName.trim(), phone: treasPhone.trim() } : undefined,
      };

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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-950"
    >
      <ScrollView contentContainerClassName="flex-grow pb-10" keyboardShouldPersistTaps="handled">
        {/* Header ya Kisasa Inayolingana na LoginScreen */}
        <View className="bg-teal-900 pt-12 pb-14 px-6 rounded-b-[38px] border-b border-teal-700/50">
          {navigation?.canGoBack?.() && (
            <TouchableOpacity onPress={() => navigation.goBack()} className="flex-row items-center gap-1.5 mb-3">
              <Ionicons name="arrow-back" size={18} color="#5eead4" />
              <Text className="text-teal-200 font-bold text-xs">Rudi Kwenye Kuingia</Text>
            </TouchableOpacity>
          )}
          <Text className="text-2xl font-extrabold text-white">Sajili Kikundi Kipya</Text>
          <Text className="text-xs text-teal-200 mt-1">
            Hatua ya {step} kati ya 4 • Vifani Jamii
          </Text>

          <View className="flex-row justify-between mt-4">
            {[1, 2, 3, 4].map((num) => (
              <View
                key={num}
                className={`h-1.5 flex-1 mx-1 rounded-full ${step >= num ? 'bg-teal-300' : 'bg-teal-950/80'}`}
              />
            ))}
          </View>
        </View>

        <View className="mx-5 -mt-8 bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
          {step === 1 && (
            <View>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Utambulisho wa Kikundi</Text>
              <Text className="text-xs text-slate-500 mb-5">Chagua aina ya kikundi na muda wa mzunguko.</Text>

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase">Jina la Kikundi</Text>
              <TextInput
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
                  onPress={() => handleSelectGroupType(item.id as any)}
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
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-6 text-slate-900 font-bold"
                keyboardType="numeric"
                value={cycleMonths}
                onChangeText={(t) => setCycleMonths(t.replace(/[^0-9]/g, ''))}
              />

              <TouchableOpacity
                className="bg-teal-700 p-4 rounded-2xl items-center"
                onPress={() => (groupName.trim().length >= 3 ? setStep(2) : Alert.alert('Weka Jina', 'Weka jina la kikundi lenye herufi 3 au zaidi.'))}
              >
                <Text className="text-white font-extrabold text-sm">Endelea Hatua ya B</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === 2 && (
            <View>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Sheria za Akiba & Jamii</Text>
              <Text className="text-xs text-slate-500 mb-5">Weka viwango vya michango ya kawaida.</Text>

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase">Thamani ya Hisa / Mchango (TZS)</Text>
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 text-slate-900 font-bold"
                keyboardType="numeric"
                value={shareValue}
                onChangeText={(t) => setShareValue(t.replace(/[^0-9]/g, ''))}
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
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-4 text-slate-900 font-bold"
                keyboardType="numeric"
                value={socialFundAmount}
                onChangeText={(t) => setSocialFundAmount(t.replace(/[^0-9]/g, ''))}
              />

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase">Faini ya Kuchelewa Kikao (TZS)</Text>
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-6 text-slate-900 font-bold"
                keyboardType="numeric"
                value={latePenalty}
                onChangeText={(t) => setLatePenalty(t.replace(/[^0-9]/g, ''))}
              />

              <View className="flex-row gap-3">
                <TouchableOpacity className="flex-1 bg-slate-200 p-4 rounded-2xl items-center" onPress={() => setStep(1)}>
                  <Text className="font-bold text-slate-700 text-xs">Rudi</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-teal-700 p-4 rounded-2xl items-center" onPress={() => setStep(3)}>
                  <Text className="text-white font-bold text-xs">Endelea Hatua ya C</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {step === 3 && (
            <View>
              <Text className="text-lg font-extrabold text-slate-900 mb-1">Sheria za Mikopo & Papo</Text>
              <Text className="text-xs text-slate-500 mb-4">Sanidi mikopo mikubwa na mfumo wa Papo.</Text>

              <Text className="text-xs font-bold text-slate-700 mb-1.5 uppercase">Riba ya Mkopo Mkubwa (%)</Text>
              <TextInput
                className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 mb-3 text-slate-900 font-bold"
                keyboardType="numeric"
                value={interestRate}
                onChangeText={(t) => setInterestRate(t.replace(/[^0-9]/g, ''))}
              />

              <View className="flex-row gap-2 mb-4">
                <View className="flex-1">
                  <Text className="text-[11px] font-bold text-slate-700 mb-1">Kiwango (Mara ya Hisa)</Text>
                  <TextInput
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 font-bold"
                    keyboardType="numeric"
                    value={loanLimitMultiplier}
                    onChangeText={(t) => setLoanLimitMultiplier(t.replace(/[^0-9]/g, ''))}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[11px] font-bold text-slate-700 mb-1">Muda wa Mkopo (Miezi)</Text>
                  <TextInput
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-900 font-bold"
                    keyboardType="numeric"
                    value={maxRepaymentMonths}
                    onChangeText={(t) => setMaxRepaymentMonths(t.replace(/[^0-9]/g, ''))}
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
                    <TextInput
                      className="bg-white border border-slate-300 rounded-xl p-3 mb-3 font-bold text-slate-900"
                      keyboardType="numeric"
                      value={mandatoryPapoAmount}
                      onChangeText={(t) => setMandatoryPapoAmount(t.replace(/[^0-9]/g, ''))}
                    />

                    <Text className="text-xs font-bold text-slate-700 mb-1">Riba ya Papo Kila Kikao (%)</Text>
                    <TextInput
                      className="bg-white border border-slate-300 rounded-xl p-3 mb-3 font-bold text-slate-900"
                      keyboardType="numeric"
                      value={papoMeetingInterest}
                      onChangeText={(t) => setPapoMeetingInterest(t.replace(/[^0-9]/g, ''))}
                    />

                    <View className="flex-row justify-between items-center my-2">
                      <Text className="text-xs font-bold text-slate-800">Ruhusu Papo ya Hiari (Top-up)</Text>
                      <Switch value={allowTopUpPapo} onValueChange={setAllowTopUpPapo} />
                    </View>

                    {allowTopUpPapo && (
                      <View>
                        <Text className="text-xs font-bold text-slate-700 mb-1">Riba ya Papo ya Hiari (%)</Text>
                        <TextInput
                          className="bg-white border border-slate-300 rounded-xl p-3 font-bold text-slate-900"
                          keyboardType="numeric"
                          value={topUpPapoInterest}
                          onChangeText={(t) => setTopUpPapoInterest(t.replace(/[^0-9]/g, ''))}
                        />
                      </View>
                    )}
                  </View>
                )}
              </View>

              <View className="flex-row gap-3 mt-2">
                <TouchableOpacity className="flex-1 bg-slate-200 p-4 rounded-2xl items-center" onPress={() => setStep(2)}>
                  <Text className="font-bold text-slate-700 text-xs">Rudi</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-teal-700 p-4 rounded-2xl items-center" onPress={() => setStep(4)}>
                  <Text className="text-white font-bold text-xs">Endelea Hatua ya D</Text>
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
                <TextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 mb-2 text-slate-900"
                  placeholder="Jina Kamili la Mwenyekiti"
                  value={chairName}
                  onChangeText={setChairName}
                />
                <TextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 text-slate-900 font-semibold"
                  placeholder="Namba ya Simu (mf. 0712345678)"
                  keyboardType="numeric"
                  maxLength={12}
                  value={chairPhone}
                  onChangeText={(t) => setChairPhone(t.replace(/[^0-9]/g, ''))}
                />
              </View>

              <View className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-3">
                <Text className="font-bold text-slate-700 text-xs uppercase mb-2">2. Katibu (Hiari)</Text>
                <TextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 mb-2 text-slate-900"
                  placeholder="Jina Kamili la Katibu (au acha wazi)"
                  value={secName}
                  onChangeText={setSecName}
                />
                <TextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 text-slate-900"
                  placeholder="Namba ya Simu ya Katibu (au acha wazi)"
                  keyboardType="numeric"
                  maxLength={12}
                  value={secPhone}
                  onChangeText={(t) => setSecPhone(t.replace(/[^0-9]/g, ''))}
                />
              </View>

              <View className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-3">
                <Text className="font-bold text-slate-700 text-xs uppercase mb-2">3. Mweka Hazina (Hiari)</Text>
                <TextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 mb-2 text-slate-900"
                  placeholder="Jina Kamili la Mweka Hazina (au acha wazi)"
                  value={treasName}
                  onChangeText={setTreasName}
                />
                <TextInput
                  className="bg-white border border-slate-200 rounded-xl p-3 text-slate-900"
                  placeholder="Namba ya Simu ya Mweka Hazina (au acha wazi)"
                  keyboardType="numeric"
                  maxLength={12}
                  value={treasPhone}
                  onChangeText={(t) => setTreasPhone(t.replace(/[^0-9]/g, ''))}
                />
              </View>

              <View className="bg-amber-50 p-4 rounded-2xl border border-amber-200 mb-5">
                <Text className="font-extrabold text-amber-900 text-xs uppercase mb-1">Weka PIN Yako ya Siri (Tarakimu 4-6)</Text>
                <Text className="text-[11px] text-amber-700 mb-2">
                  Epuka PIN rahisi kama 1234 au 0000. Tumia namba imara kama 2580.
                </Text>
                <TextInput
                  className="bg-white border border-amber-300 rounded-xl p-3 text-base font-bold tracking-widest text-slate-900"
                  placeholder="Mf. 2580"
                  keyboardType="numeric"
                  secureTextEntry
                  maxLength={6}
                  value={pin}
                  onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ''))}
                />
              </View>

              <View className="flex-row gap-3">
                <TouchableOpacity className="flex-1 bg-slate-200 p-4 rounded-2xl items-center" onPress={() => setStep(3)}>
                  <Text className="font-bold text-slate-700 text-xs">Rudi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1 bg-teal-700 p-4 rounded-2xl items-center"
                  onPress={handleCompleteRegistration}
                  disabled={loading}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-extrabold text-xs">Kamilisha Usajili</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
