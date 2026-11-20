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
} from 'react-native';
import * as Application from 'expo-application';
import { API_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function RegisterGroupScreen() {
  const { signIn } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Hatua A: Utambulisho
  const [groupName, setGroupName] = useState('');
  const [groupType, setGroupType] = useState('SHARES');
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

  // Hatua D: Uongozi (Mwenyekiti Lazima, Katibu & Mweka Hazina Optional)
  const [creatorRole, setCreatorRole] = useState<'CHAIRPERSON' | 'SECRETARY' | 'TREASURER'>('CHAIRPERSON');
  const [pin, setPin] = useState('');
  const [chairName, setChairName] = useState('');
  const [chairPhone, setChairPhone] = useState('');
  const [secName, setSecName] = useState('');
  const [secPhone, setSecPhone] = useState('');
  const [treasName, setTreasName] = useState('');
  const [treasPhone, setTreasPhone] = useState('');

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

      const response = await fetch(`${API_URL}/auth/register-group`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        return Alert.alert('Ujumbe wa Server', data.error || 'Imeshindikana kusajili kikoba.');
      }

      Alert.alert('Hongera!', data.message);
      await signIn(data.token, data.user, data.activeGroup, data.activeRole, data.memberships, false);
    } catch (error: any) {
      Alert.alert('Hitilafu ya Mtandao', `Maelezo: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerClassName="flex-grow bg-slate-50 p-6">
      <View className="flex-row justify-between mb-6 mt-2">
        {[1, 2, 3, 4].map((num) => (
          <View
            key={num}
            className={`h-2 flex-1 mx-1 rounded-full ${step >= num ? 'bg-teal-700' : 'bg-slate-200'}`}
          />
        ))}
      </View>

      {step === 1 && (
        <View>
          <Text className="text-xl font-bold text-slate-900 mb-1">Hatua A: Utambulisho wa Kikoba</Text>
          <Text className="text-sm text-slate-500 mb-6">Weka jina na muda wa mzunguko wa kikundi.</Text>

          <Text className="text-sm font-semibold text-slate-700 mb-1">Jina la Kikoba</Text>
          <TextInput
            className="bg-white border border-slate-300 rounded-xl p-4 mb-4"
            placeholder="Mf. Umoja Women Group"
            value={groupName}
            onChangeText={setGroupName}
          />

          <Text className="text-sm font-semibold text-slate-700 mb-2">Aina ya Kikundi</Text>
          {[
            { id: 'SHARES', label: 'VICOBA vya Hisa' },
            { id: 'FIXED_SAVINGS', label: 'Kikoba cha Akiba ya Kawaida' },
            { id: 'WELFARE', label: 'Mfuko wa Jamii / Maafa' },
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => setGroupType(item.id)}
              className={`p-4 rounded-xl border mb-2 ${
                groupType === item.id ? 'bg-teal-50 border-teal-700' : 'bg-white border-slate-200'
              }`}
            >
              <Text className="font-semibold text-slate-800">{item.label}</Text>
            </TouchableOpacity>
          ))}

          <Text className="text-sm font-semibold text-slate-700 mt-4 mb-1">Muda wa Mzunguko (Miezi)</Text>
          <TextInput
            className="bg-white border border-slate-300 rounded-xl p-4 mb-6"
            keyboardType="numeric"
            value={cycleMonths}
            onChangeText={(t) => setCycleMonths(t.replace(/[^0-9]/g, ''))}
          />

          <TouchableOpacity
            className="bg-teal-700 p-4 rounded-xl items-center"
            onPress={() => (groupName.trim().length >= 3 ? setStep(2) : Alert.alert('Weka Jina la Kikoba'))}
          >
            <Text className="text-white font-bold">Endelea Hatua ya B</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 2 && (
        <View>
          <Text className="text-xl font-bold text-slate-900 mb-1">Hatua B: Sheria za Akiba & Jamii</Text>
          <Text className="text-sm text-slate-500 mb-6">Weka viwango vya michango ya kawaida.</Text>

          <Text className="text-sm font-semibold text-slate-700 mb-1">Thamani ya Hisa Moja (TZS)</Text>
          <TextInput
            className="bg-white border border-slate-300 rounded-xl p-4 mb-4"
            keyboardType="numeric"
            value={shareValue}
            onChangeText={(t) => setShareValue(t.replace(/[^0-9]/g, ''))}
          />

          <Text className="text-sm font-semibold text-slate-700 mb-2">Mzunguko wa Vikao</Text>
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
                  contributionFreq === freq.id ? 'bg-teal-700 border-teal-700' : 'bg-white border-slate-300'
                }`}
              >
                <Text className={contributionFreq === freq.id ? 'text-white font-bold' : 'text-slate-700'}>
                  {freq.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text className="text-sm font-semibold text-slate-700 mb-1">Mchango wa Mfuko wa Jamii (TZS)</Text>
          <TextInput
            className="bg-white border border-slate-300 rounded-xl p-4 mb-4"
            keyboardType="numeric"
            value={socialFundAmount}
            onChangeText={(t) => setSocialFundAmount(t.replace(/[^0-9]/g, ''))}
          />

          <Text className="text-sm font-semibold text-slate-700 mb-1">Faini ya Kuchelewa Kikao (TZS)</Text>
          <TextInput
            className="bg-white border border-slate-300 rounded-xl p-4 mb-6"
            keyboardType="numeric"
            value={latePenalty}
            onChangeText={(t) => setLatePenalty(t.replace(/[^0-9]/g, ''))}
          />

          <View className="flex-row gap-3">
            <TouchableOpacity className="flex-1 bg-slate-200 p-4 rounded-xl items-center" onPress={() => setStep(1)}>
              <Text className="font-bold text-slate-700">Rudi</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 bg-teal-700 p-4 rounded-xl items-center" onPress={() => setStep(3)}>
              <Text className="text-white font-bold">Endelea Hatua ya C</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 3 && (
        <View>
          <Text className="text-xl font-bold text-slate-900 mb-1">Hatua C: Sheria za Mikopo & Papo</Text>
          <Text className="text-sm text-slate-500 mb-4">Sanidi mikopo mikubwa na mfumo wa Papo.</Text>

          <Text className="text-sm font-semibold text-slate-700 mb-1">Riba ya Mkopo Mkubwa (%)</Text>
          <TextInput
            className="bg-white border border-slate-300 rounded-xl p-4 mb-4"
            keyboardType="numeric"
            value={interestRate}
            onChangeText={(t) => setInterestRate(t.replace(/[^0-9]/g, ''))}
          />

          <View className="bg-teal-50 p-4 rounded-2xl border border-teal-200 mb-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-base font-bold text-teal-900">Washa Mfumo wa Papo</Text>
              <Switch value={hasPapo} onValueChange={setHasPapo} trackColor={{ true: '#0f766e' }} />
            </View>
            <Text className="text-xs text-teal-700 mb-3">
              Kila mwanachama anapewa kianzio cha Papo ambacho riba yake hulipwa kila kikao.
            </Text>

            {hasPapo && (
              <View>
                <Text className="text-xs font-semibold text-slate-700 mb-1">Kiasi cha Papo ya Lazima (TZS)</Text>
                <TextInput
                  className="bg-white border border-slate-300 rounded-xl p-3 mb-3"
                  keyboardType="numeric"
                  value={mandatoryPapoAmount}
                  onChangeText={(t) => setMandatoryPapoAmount(t.replace(/[^0-9]/g, ''))}
                />

                <Text className="text-xs font-semibold text-slate-700 mb-1">Riba ya Papo Kila Kikao (%)</Text>
                <TextInput
                  className="bg-white border border-slate-300 rounded-xl p-3 mb-3"
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
                    <Text className="text-xs font-semibold text-slate-700 mb-1">Riba ya Papo ya Hiari (%)</Text>
                    <TextInput
                      className="bg-white border border-slate-300 rounded-xl p-3"
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
            <TouchableOpacity className="flex-1 bg-slate-200 p-4 rounded-xl items-center" onPress={() => setStep(2)}>
              <Text className="font-bold text-slate-700">Rudi</Text>
            </TouchableOpacity>
            <TouchableOpacity className="flex-1 bg-teal-700 p-4 rounded-xl items-center" onPress={() => setStep(4)}>
              <Text className="text-white font-bold">Endelea Hatua ya D</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {step === 4 && (
        <View>
          <Text className="text-xl font-bold text-slate-900 mb-1">Hatua D: Uongozi wa Kikoba</Text>
          <Text className="text-sm text-slate-500 mb-4">
            Mwenyekiti ni lazima. Katibu na Mweka Hazina ni hiari (unaweza kuwaongeza baadaye).
          </Text>

          {/* MWENYEKITI - LAZIMA */}
          <View className="bg-white p-4 rounded-2xl border-2 border-teal-600 mb-4">
            <Text className="font-bold text-teal-800 mb-2">1. Mwenyekiti (Lazima)</Text>
            <TextInput
              className="border border-slate-200 rounded-xl p-3 mb-2"
              placeholder="Jina Kamili la Mwenyekiti"
              value={chairName}
              onChangeText={setChairName}
            />
            <TextInput
              className="border border-slate-200 rounded-xl p-3"
              placeholder="Namba ya Simu (mf. 0712345678)"
              keyboardType="numeric"
              maxLength={12}
              value={chairPhone}
              onChangeText={(t) => setChairPhone(t.replace(/[^0-9]/g, ''))}
            />
          </View>

          {/* KATIBU - OPTIONAL */}
          <View className="bg-white p-4 rounded-2xl border border-slate-200 mb-3">
            <Text className="font-bold text-slate-700 mb-2">2. Katibu (Hiari / Optional)</Text>
            <TextInput
              className="border border-slate-200 rounded-xl p-3 mb-2"
              placeholder="Jina Kamili la Katibu (au acha wazi)"
              value={secName}
              onChangeText={setSecName}
            />
            <TextInput
              className="border border-slate-200 rounded-xl p-3"
              placeholder="Namba ya Simu ya Katibu (au acha wazi)"
              keyboardType="numeric"
              maxLength={12}
              value={secPhone}
              onChangeText={(t) => setSecPhone(t.replace(/[^0-9]/g, ''))}
            />
          </View>

          {/* MWEKA HAZINA - OPTIONAL */}
          <View className="bg-white p-4 rounded-2xl border border-slate-200 mb-4">
            <Text className="font-bold text-slate-700 mb-2">3. Mweka Hazina (Hiari / Optional)</Text>
            <TextInput
              className="border border-slate-200 rounded-xl p-3 mb-2"
              placeholder="Jina Kamili la Mweka Hazina (au acha wazi)"
              value={treasName}
              onChangeText={setTreasName}
            />
            <TextInput
              className="border border-slate-200 rounded-xl p-3"
              placeholder="Namba ya Simu ya Mweka Hazina (au acha wazi)"
              keyboardType="numeric"
              maxLength={12}
              value={treasPhone}
              onChangeText={(t) => setTreasPhone(t.replace(/[^0-9]/g, ''))}
            />
          </View>

          {/* WEKA PIN YAKO YA KUINGIA */}
          <View className="bg-amber-50 p-4 rounded-2xl border border-amber-200 mb-6">
            <Text className="font-bold text-amber-900 mb-1">Weka PIN Yako ya Siri (Tarakimu 4-6)</Text>
            <Text className="text-xs text-amber-700 mb-2">
              Epuka PIN rahisi kama 1234 au 0000. Tumia namba imara kama 2580.
            </Text>
            <TextInput
              className="bg-white border border-amber-300 rounded-xl p-3 text-base tracking-widest"
              placeholder="Mf. 2580"
              keyboardType="numeric"
              secureTextEntry
              maxLength={6}
              value={pin}
              onChangeText={(t) => setPin(t.replace(/[^0-9]/g, ''))}
            />
          </View>

          <View className="flex-row gap-3 mb-6">
            <TouchableOpacity className="flex-1 bg-slate-200 p-4 rounded-xl items-center" onPress={() => setStep(3)}>
              <Text className="font-bold text-slate-700">Rudi</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 bg-teal-700 p-4 rounded-xl items-center"
              onPress={handleCompleteRegistration}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Kamilisha Usajili</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
