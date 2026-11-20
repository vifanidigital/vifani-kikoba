import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';

export default function ChairmanSettingsScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [shareValue, setShareValue] = useState('5000');
  const [minShares, setMinShares] = useState('1');
  const [maxShares, setMaxShares] = useState('10');
  const [socialMin, setSocialMin] = useState('1000');
  const [socialMax, setSocialMax] = useState('5000');

  const [hasPapo, setHasPapo] = useState(true);
  const [mandatoryPapo, setMandatoryPapo] = useState('50000');
  const [papoInterest, setPapoInterest] = useState('10');
  const [allowTopUp, setAllowTopUp] = useState(true);
  const [minTopUpCap, setMinTopUpCap] = useState('50000');
  const [maxTopUpCap, setMaxTopUpCap] = useState('100000');
  const [topUpWeeks, setTopUpWeeks] = useState('4');

  const [interestRate, setInterestRate] = useState('10');
  const [loanMultiplier, setLoanMultiplier] = useState('3');
  const [maxBigLoanCap, setMaxBigLoanCap] = useState('1000000');
  const [maxMonths, setMaxMonths] = useState('3');
  const [requireGuarantor, setRequireGuarantor] = useState(true);

  const [fineLate, setFineLate] = useState('1000');
  const [fineAbsent, setFineAbsent] = useState('2000');
  const [fineNoShares, setFineNoShares] = useState('5000');
  const [fineNoSocial, setFineNoSocial] = useState('1000');
  const [fineNoPapoInt, setFineNoPapoInt] = useState('5000');
  const [fineLateTopUp, setFineLateTopUp] = useState('3000');
  const [fineLateBigLoan, setFineLateBigLoan] = useState('5000');
  const [fineDiscipline, setFineDiscipline] = useState('2000');
  const [fineOther, setFineOther] = useState('1000');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await apiClient.get('/group/settings');
      const g = res.data?.group;
      if (g) {
        setShareValue(String(g.shareValue ?? 5000));
        setMinShares(String(g.minSharesPerMeeting ?? 1));
        setMaxShares(String(g.maxSharesPerMeeting ?? 10));
        setSocialMin(String(g.socialFundMin ?? 1000));
        setSocialMax(String(g.socialFundMax ?? 5000));
        setHasPapo(Boolean(g.hasPapo));
        setMandatoryPapo(String(g.mandatoryPapoAmount ?? 50000));
        setPapoInterest(String(g.papoMeetingInterest ?? 10));
        setAllowTopUp(Boolean(g.allowTopUpPapo));
        setMinTopUpCap(String(g.minTopUpPapoCap ?? 50000));
        setMaxTopUpCap(String(g.maxTopUpPapoCap ?? 100000));
        setTopUpWeeks(String(g.topUpPapoWeeks ?? 4));
        setInterestRate(String(g.interestRate ?? 10));
        setLoanMultiplier(String(g.loanLimitMultiplier ?? 3));
        setMaxBigLoanCap(String(g.maxBigLoanCap ?? 0));
        setMaxMonths(String(g.maxRepaymentMonths ?? 3));
        setRequireGuarantor(Boolean(g.requireGuarantor));
        setFineLate(String(g.fineLate ?? 1000));
        setFineAbsent(String(g.fineAbsent ?? 2000));
        setFineNoShares(String(g.fineNoShares ?? 1000));
        setFineNoSocial(String(g.fineNoSocialFund ?? 1000));
        setFineNoPapoInt(String(g.fineNoPapoInterest ?? 5000));
        setFineLateTopUp(String(g.fineLateTopUpPapo ?? 3000));
        setFineLateBigLoan(String(g.fineLateBigLoan ?? 5000));
        setFineDiscipline(String(g.fineDiscipline ?? 2000));
        setFineOther(String(g.fineOther ?? 1000));
      }
    } catch {
      Alert.alert('Hitilafu', 'Imeshindikana kupakia sheria za kikundi.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put('/group/settings', {
        shareValue: Number(shareValue),
        minSharesPerMeeting: Number(minShares),
        maxSharesPerMeeting: Number(maxShares),
        socialFundMin: Number(socialMin),
        socialFundMax: Number(socialMax),
        hasPapo,
        mandatoryPapoAmount: Number(mandatoryPapo),
        papoMeetingInterest: Number(papoInterest),
        allowTopUpPapo: allowTopUp,
        minTopUpPapoCap: Number(minTopUpCap),
        maxTopUpPapoCap: Number(maxTopUpCap),
        topUpPapoWeeks: Number(topUpWeeks),
        interestRate: Number(interestRate),
        loanLimitMultiplier: Number(loanMultiplier),
        maxBigLoanCap: Number(maxBigLoanCap),
        maxRepaymentMonths: Number(maxMonths),
        requireGuarantor,
        fineLate: Number(fineLate),
        fineAbsent: Number(fineAbsent),
        fineNoShares: Number(fineNoShares),
        fineNoSocialFund: Number(fineNoSocial),
        fineNoPapoInterest: Number(fineNoPapoInt),
        fineLateTopUpPapo: Number(fineLateTopUp),
        fineLateBigLoan: Number(fineLateBigLoan),
        fineDiscipline: Number(fineDiscipline),
        fineOther: Number(fineOther),
      });
      Alert.alert('Imefanikiwa', res.data?.message || 'Sheria zimehifadhiwa!');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuhifadhi.');
    } finally {
      setSaving(false);
    }
  };

  const num = (v: string) => v.replace(/[^0-9]/g, '');

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-100">
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-100">
      <View className="bg-teal-700 pt-14 pb-5 px-5 flex-row items-center gap-3">
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View>
          <Text className="text-xl font-bold text-white">Sheria & Faini za Kikoba</Text>
          <Text className="text-teal-100 text-xs">Weka viwango ili mfumo ukokotoe bila makosa</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-5 pt-4">
        <View className="bg-white p-4 rounded-2xl mb-4 border border-slate-200">
          <Text className="font-bold text-teal-800 text-base mb-3">1. Hisa & Mfuko wa Jamii</Text>
          <Text className="text-xs font-semibold text-slate-600 mb-1">Thamani ya Hisa Moja (TZS)</Text>
          <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 font-bold" keyboardType="numeric" value={shareValue} onChangeText={(t) => setShareValue(num(t))} />

          <View className="flex-row gap-3 mb-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-slate-600 mb-1">Kianzio cha Hisa (Idadi)</Text>
              <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 font-bold" keyboardType="numeric" value={minShares} onChangeText={(t) => setMinShares(num(t))} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-slate-600 mb-1">Ukomo wa Hisa (Idadi)</Text>
              <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 font-bold" keyboardType="numeric" value={maxShares} onChangeText={(t) => setMaxShares(num(t))} />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-slate-600 mb-1">Jamii Kianzio (TZS)</Text>
              <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 font-bold" keyboardType="numeric" value={socialMin} onChangeText={(t) => setSocialMin(num(t))} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-slate-600 mb-1">Jamii Ukomo (TZS)</Text>
              <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 font-bold" keyboardType="numeric" value={socialMax} onChangeText={(t) => setSocialMax(num(t))} />
            </View>
          </View>
        </View>

        <View className="bg-white p-4 rounded-2xl mb-4 border border-slate-200">
          <View className="flex-row justify-between items-center mb-3">
            <Text className="font-bold text-teal-800 text-base">2. Sheria za Papo (Lazima & Hiari)</Text>
            <Switch value={hasPapo} onValueChange={setHasPapo} trackColor={{ true: '#0f766e' }} />
          </View>
          {hasPapo && (
            <>
              <Text className="text-xs font-semibold text-slate-600 mb-1">Kiasi cha Papo ya Lazima (TZS)</Text>
              <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 font-bold" keyboardType="numeric" value={mandatoryPapo} onChangeText={(t) => setMandatoryPapo(num(t))} />

              <Text className="text-xs font-semibold text-slate-600 mb-1">Riba ya Papo Kila Kikao (% ya Jumla ya Papo)</Text>
              <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 font-bold" keyboardType="numeric" value={papoInterest} onChangeText={(t) => setPapoInterest(num(t))} />

              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs font-bold text-slate-700">Ruhusu Papo ya Hiari (Top-Up)?</Text>
                <Switch value={allowTopUp} onValueChange={setAllowTopUp} trackColor={{ true: '#0f766e' }} />
              </View>

              {allowTopUp && (
                <>
                  <View className="flex-row gap-3 mb-3">
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-slate-600 mb-1">Kianzio Hiari (TZS)</Text>
                      <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 font-bold" keyboardType="numeric" value={minTopUpCap} onChangeText={(t) => setMinTopUpCap(num(t))} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-slate-600 mb-1">Ukomo Hiari (TZS)</Text>
                      <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 font-bold" keyboardType="numeric" value={maxTopUpCap} onChangeText={(t) => setMaxTopUpCap(num(t))} />
                    </View>
                  </View>
                  <Text className="text-xs font-semibold text-slate-600 mb-1">Muda wa Kurejesha Papo ya Hiari (Majuma)</Text>
                  <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 font-bold" keyboardType="numeric" value={topUpWeeks} onChangeText={(t) => setTopUpWeeks(num(t))} />
                </>
              )}
            </>
          )}
        </View>

        <View className="bg-white p-4 rounded-2xl mb-4 border border-slate-200">
          <Text className="font-bold text-teal-800 text-base mb-3">3. Sheria za Mkopo Mkubwa & Mdhamini</Text>
          <View className="flex-row gap-3 mb-3">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-slate-600 mb-1">Mara Ngapi ya Hisa</Text>
              <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 font-bold" keyboardType="numeric" value={loanMultiplier} onChangeText={(t) => setLoanMultiplier(num(t))} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-semibold text-slate-600 mb-1">Riba ya Mkopo (%)</Text>
              <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 font-bold" keyboardType="numeric" value={interestRate} onChangeText={(t) => setInterestRate(num(t))} />
            </View>
          </View>

          <Text className="text-xs font-semibold text-slate-600 mb-1">Ukomo wa Juu wa Mkopo Mkubwa (TZS - Weka 0 kama hakuna)</Text>
          <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 font-bold" keyboardType="numeric" value={maxBigLoanCap} onChangeText={(t) => setMaxBigLoanCap(num(t))} />

          <Text className="text-xs font-semibold text-slate-600 mb-1">Muda wa Juu wa Marejesho (Miezi)</Text>
          <TextInput className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 font-bold" keyboardType="numeric" value={maxMonths} onChangeText={(t) => setMaxMonths(num(t))} />

          <View className="flex-row justify-between items-center">
            <Text className="text-xs font-bold text-slate-700">Lazima Awe na Mdhamini (Mwanachama)?</Text>
            <Switch value={requireGuarantor} onValueChange={setRequireGuarantor} trackColor={{ true: '#0f766e' }} />
          </View>
        </View>

        <View className="bg-white p-4 rounded-2xl mb-6 border border-slate-200">
          <Text className="font-bold text-rose-800 text-base mb-3">4. Viwango vya Faini Zote (TZS)</Text>
          {[
            { label: 'Kuchelewa Kikaoni', val: fineLate, set: setFineLate },
            { label: 'Kutofika Kikaoni', val: fineAbsent, set: setFineAbsent },
            { label: 'Kutonunua Hisa', val: fineNoShares, set: setFineNoShares },
            { label: 'Kutonunua Jamii', val: fineNoSocial, set: setFineNoSocial },
            { label: 'Kutotoa Riba ya Papo', val: fineNoPapoInt, set: setFineNoPapoInt },
            { label: 'Kuchelewesha Papo ya Hiari', val: fineLateTopUp, set: setFineLateTopUp },
            { label: 'Kuchelewesha Riba ya Mkopo Mkubwa', val: fineLateBigLoan, set: setFineLateBigLoan },
            { label: 'Utovu wa Nidhamu', val: fineDiscipline, set: setFineDiscipline },
            { label: 'Faini Nyinginezo', val: fineOther, set: setFineOther },
          ].map((item, idx) => (
            <View key={idx} className="flex-row justify-between items-center mb-2.5">
              <Text className="text-xs font-semibold text-slate-700 flex-1">{item.label}</Text>
              <TextInput
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 w-32 text-right font-bold text-slate-900"
                keyboardType="numeric"
                value={item.val}
                onChangeText={(t) => item.set(num(t))}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          className="bg-teal-700 p-4 rounded-2xl items-center mb-10"
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-base">Hifadhi Sheria Zote za Kikoba</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
