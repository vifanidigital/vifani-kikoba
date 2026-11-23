import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useTheme } from '../context/ThemeContext';

export default function ChairmanSettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 1. Utambulisho & Ratiba ya Kikundi
  const [groupName, setGroupName] = useState('');
  const [meetingFrequency, setMeetingFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('WEEKLY');
  const [meetingDay, setMeetingDay] = useState('Jumamosi');
  const [meetingTime, setMeetingTime] = useState('10:00 Asubuhi');
  const [cycleMonths, setCycleMonths] = useState('12');
  const [maxMembers, setMaxMembers] = useState('30');
  const [entryFee, setEntryFee] = useState('10000');
  const [paymentAccount, setPaymentAccount] = useState('');

  // 2. Hisa & Mfuko wa Jamii
  const [shareValue, setShareValue] = useState('5000');
  const [minShares, setMinShares] = useState('1');
  const [maxShares, setMaxShares] = useState('10');
  const [socialMin, setSocialMin] = useState('1000');
  const [socialMax, setSocialMax] = useState('5000');

  // 3. Sheria za Papo
  const [hasPapo, setHasPapo] = useState(true);
  const [mandatoryPapo, setMandatoryPapo] = useState('50000');
  const [papoInterest, setPapoInterest] = useState('10');
  const [allowTopUp, setAllowTopUp] = useState(true);
  const [minTopUpCap, setMinTopUpCap] = useState('50000');
  const [maxTopUpCap, setMaxTopUpCap] = useState('100000');
  const [topUpWeeks, setTopUpWeeks] = useState('4');

  // 4. Sheria za Mkopo Mkubwa & Udhibiti wa Madeni
  const [interestRate, setInterestRate] = useState('10');
  const [loanMultiplier, setLoanMultiplier] = useState('3');
  const [maxBigLoanCap, setMaxBigLoanCap] = useState('1000000');
  const [maxMonths, setMaxMonths] = useState('3');
  const [gracePeriodDays, setGracePeriodDays] = useState('3');
  const [requireGuarantor, setRequireGuarantor] = useState(true);
  const [minGuarantorsCount, setMinGuarantorsCount] = useState('1');
  const [blockLoanIfUnpaidFines, setBlockLoanIfUnpaidFines] = useState(true);
  const [autoSmsReminders, setAutoSmsReminders] = useState(true);

  // 5. Viwango vya Faini Zote 9
  const [fineLate, setFineLate] = useState('1000');
  const [fineAbsent, setFineAbsent] = useState('2000');
  const [fineNoShares, setFineNoShares] = useState('5000');
  const [fineNoSocial, setFineNoSocial] = useState('1000');
  const [fineNoPapoInt, setFineNoPapoInt] = useState('5000');
  const [fineLateTopUp, setFineLateTopUp] = useState('3000');
  const [fineLateBigLoan, setFineLateBigLoan] = useState('5000');
  const [fineDiscipline, setFineDiscipline] = useState('2000');
  const [fineOther, setFineOther] = useState('1000');
  const loadSettings = useCallback(async () => {
    try {
      const res = await apiClient.get('/group/settings');
      const g = res.data?.group;
      if (g) {
        setGroupName(String(g.name ?? ''));
        setMeetingFrequency(g.meetingFrequency || 'WEEKLY');
        setMeetingDay(String(g.meetingDay ?? 'Jumamosi'));
        setMeetingTime(String(g.meetingTime ?? '10:00 Asubuhi'));
        setCycleMonths(String(g.cycleMonths ?? 12));
        setMaxMembers(String(g.maxMembers ?? 30));
        setEntryFee(String(g.entryFee ?? 10000));
        setPaymentAccount(String(g.paymentAccount ?? ''));

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
        setGracePeriodDays(String(g.gracePeriodDays ?? 3));
        setRequireGuarantor(Boolean(g.requireGuarantor));
        setMinGuarantorsCount(String(g.minGuarantorsCount ?? 1));
        setBlockLoanIfUnpaidFines(g.blockLoanIfUnpaidFines !== false);
        setAutoSmsReminders(g.autoSmsReminders !== false);

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
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadSettings);
  }, [loadSettings]);

  const handleSave = async () => {
    if (!groupName.trim()) {
      return Alert.alert('Angalia Jina', 'Jina la kikundi haliwezi kuwa wazi.');
    }
    if (Number(minShares) > Number(maxShares)) {
      return Alert.alert('Angalia Hisa', 'Kianzio cha hisa hakiwezi kuzidi ukomo wa hisa.');
    }
    if (Number(socialMin) > Number(socialMax)) {
      return Alert.alert('Angalia Jamii', 'Kianzio cha jamii hakiwezi kuzidi ukomo wa jamii.');
    }

    setSaving(true);
    try {
      const res = await apiClient.put('/group/settings', {
        name: groupName.trim(),
        meetingFrequency,
        meetingDay: meetingDay.trim(),
        meetingTime: meetingTime.trim(),
        cycleMonths: Number(cycleMonths),
        maxMembers: Number(maxMembers),
        entryFee: Number(entryFee),
        paymentAccount: paymentAccount.trim(),
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
        gracePeriodDays: Number(gracePeriodDays),
        requireGuarantor,
        minGuarantorsCount: Number(minGuarantorsCount),
        blockLoanIfUnpaidFines,
        autoSmsReminders,
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
      Alert.alert('Imefanikiwa', res.data?.message || 'Sheria zote zimehifadhiwa kikamilifu!');
      navigation.goBack();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuhifadhi.');
    } finally {
      setSaving(false);
    }
  };
  const num = (v: string) => v.replace(/[^0-9]/g, '');

  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const inputClass = isDark
    ? 'bg-slate-800 border-slate-700 text-white'
    : 'bg-slate-50 border-slate-300 text-slate-900';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-600';

  if (loading) {
    return (
      <View className={`flex-1 justify-center items-center ${bgClass}`}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className={`flex-1 ${bgClass}`}
    >
      <View
        style={{ paddingTop: Math.max(insets.top + 10, 48) }}
        className="bg-teal-700 pb-5 px-5 flex-row items-center gap-3 rounded-b-3xl"
      >
        <TouchableOpacity onPress={() => navigation.goBack()} className="p-1">
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-xl font-bold text-white">Ofisi ya Mwenyekiti</Text>
          <Text className="text-teal-100 text-xs">Sheria, ratiba, udhibiti wa mikopo na faini zote</Text>
        </View>
      </View>

      <ScrollView className="flex-1 px-5 pt-4" showsVerticalScrollIndicator={false}>
        {/* 1. UTAMBULISHO & RATIBA YA KIKUNDI */}
        <View className={`p-4 rounded-2xl mb-4 border ${cardClass}`}>
          <Text className="font-bold text-teal-600 text-base mb-3">1. Utambulisho & Ratiba ya Kikundi</Text>

          <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Jina la Kikundi / Kikoba</Text>
          <TextInput
            className={`border rounded-xl p-3 mb-3 font-bold ${inputClass}`}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Mfano: Upendo Vikoba Group"
            placeholderTextColor="#94a3b8"
          />

          <Text className={`text-xs font-semibold mb-1.5 ${textSub}`}>Mzunguko wa Vikao</Text>
          <View className="flex-row gap-2 mb-3">
            {[
              { key: 'WEEKLY', label: 'Kila Wiki' },
              { key: 'BIWEEKLY', label: 'Kila Wiki 2' },
              { key: 'MONTHLY', label: 'Kila Mwezi' },
            ].map((freq) => (
              <TouchableOpacity
                key={freq.key}
                onPress={() => setMeetingFrequency(freq.key as any)}
                className={`flex-1 py-2.5 rounded-xl border items-center ${
                  meetingFrequency === freq.key
                    ? 'bg-teal-700 border-teal-700'
                    : isDark
                    ? 'bg-slate-800 border-slate-700'
                    : 'bg-slate-50 border-slate-300'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    meetingFrequency === freq.key ? 'text-white' : textMain
                  }`}
                >
                  {freq.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row gap-3 mb-3">
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Siku ya Kikao</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                value={meetingDay}
                onChangeText={setMeetingDay}
                placeholder="Jumamosi"
                placeholderTextColor="#94a3b8"
              />
            </View>
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Muda wa Kikao</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                value={meetingTime}
                onChangeText={setMeetingTime}
                placeholder="10:00 Asubuhi"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>

          <View className="flex-row gap-3 mb-3">
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Mzunguko wa Gawio (Miezi)</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={cycleMonths}
                onChangeText={(t) => setCycleMonths(num(t))}
              />
            </View>
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Ukomo wa Wanachama</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={maxMembers}
                onChangeText={(t) => setMaxMembers(num(t))}
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Ada ya Kiingilio (TZS)</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={entryFee}
                onChangeText={(t) => setEntryFee(num(t))}
              />
            </View>
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Lipa Namba / Akaunti</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                value={paymentAccount}
                onChangeText={setPaymentAccount}
                placeholder="Mfano: M-Koba 554433"
                placeholderTextColor="#94a3b8"
              />
            </View>
          </View>
        </View>

        {/* 2. HISA & MFUKO WA JAMII */}
        <View className={`p-4 rounded-2xl mb-4 border ${cardClass}`}>
          <Text className="font-bold text-teal-600 text-base mb-3">2. Hisa & Mfuko wa Jamii</Text>
          <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Thamani ya Hisa Moja (TZS)</Text>
          <TextInput
            className={`border rounded-xl p-3 mb-3 font-bold ${inputClass}`}
            keyboardType="numeric"
            value={shareValue}
            onChangeText={(t) => setShareValue(num(t))}
          />

          <View className="flex-row gap-3 mb-3">
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Kianzio cha Hisa (Idadi)</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={minShares}
                onChangeText={(t) => setMinShares(num(t))}
              />
            </View>
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Ukomo wa Hisa (Idadi)</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={maxShares}
                onChangeText={(t) => setMaxShares(num(t))}
              />
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Jamii Kianzio (TZS)</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={socialMin}
                onChangeText={(t) => setSocialMin(num(t))}
              />
            </View>
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Jamii Ukomo (TZS)</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={socialMax}
                onChangeText={(t) => setSocialMax(num(t))}
              />
            </View>
          </View>
        </View>
        {/* 3. SHERIA ZA PAPO */}
        <View className={`p-4 rounded-2xl mb-4 border ${cardClass}`}>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="font-bold text-teal-600 text-base">3. Sheria za Papo (Lazima & Hiari)</Text>
            <Switch value={hasPapo} onValueChange={setHasPapo} trackColor={{ true: '#0f766e' }} />
          </View>
          {hasPapo && (
            <>
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Kiasi cha Papo ya Lazima (TZS)</Text>
              <TextInput
                className={`border rounded-xl p-3 mb-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={mandatoryPapo}
                onChangeText={(t) => setMandatoryPapo(num(t))}
              />

              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Riba ya Papo Kila Kikao (% ya Jumla ya Papo)</Text>
              <TextInput
                className={`border rounded-xl p-3 mb-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={papoInterest}
                onChangeText={(t) => setPapoInterest(num(t))}
              />

              <View className="flex-row justify-between items-center mb-2">
                <Text className={`text-xs font-bold ${textMain}`}>Ruhusu Papo ya Hiari (Top-Up)?</Text>
                <Switch value={allowTopUp} onValueChange={setAllowTopUp} trackColor={{ true: '#0f766e' }} />
              </View>

              {allowTopUp && (
                <>
                  <View className="flex-row gap-3 mb-3">
                    <View className="flex-1">
                      <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Kianzio Hiari (TZS)</Text>
                      <TextInput
                        className={`border rounded-xl p-3 font-bold ${inputClass}`}
                        keyboardType="numeric"
                        value={minTopUpCap}
                        onChangeText={(t) => setMinTopUpCap(num(t))}
                      />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Ukomo Hiari (TZS)</Text>
                      <TextInput
                        className={`border rounded-xl p-3 font-bold ${inputClass}`}
                        keyboardType="numeric"
                        value={maxTopUpCap}
                        onChangeText={(t) => setMaxTopUpCap(num(t))}
                      />
                    </View>
                  </View>
                  <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Muda wa Kurejesha Papo ya Hiari (Majuma)</Text>
                  <TextInput
                    className={`border rounded-xl p-3 font-bold ${inputClass}`}
                    keyboardType="numeric"
                    value={topUpWeeks}
                    onChangeText={(t) => setTopUpWeeks(num(t))}
                  />
                </>
              )}
            </>
          )}
        </View>

        {/* 4. SHERIA ZA MKOPO MKUBWA & UDHIBITI WA MADENI */}
        <View className={`p-4 rounded-2xl mb-4 border ${cardClass}`}>
          <Text className="font-bold text-teal-600 text-base mb-3">4. Mkopo Mkubwa, Wadhamini & Arifa</Text>
          <View className="flex-row gap-3 mb-3">
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Mara Ngapi ya Hisa</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={loanMultiplier}
                onChangeText={(t) => setLoanMultiplier(num(t))}
              />
            </View>
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Riba ya Mkopo (%)</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={interestRate}
                onChangeText={(t) => setInterestRate(num(t))}
              />
            </View>
          </View>

          <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Ukomo wa Juu wa Mkopo Mkubwa (TZS - Weka 0 kama hakuna)</Text>
          <TextInput
            className={`border rounded-xl p-3 mb-3 font-bold ${inputClass}`}
            keyboardType="numeric"
            value={maxBigLoanCap}
            onChangeText={(t) => setMaxBigLoanCap(num(t))}
          />

          <View className="flex-row gap-3 mb-3">
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Muda wa Juu (Miezi)</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={maxMonths}
                onChangeText={(t) => setMaxMonths(num(t))}
              />
            </View>
            <View className="flex-1">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Siku za Neema (Grace)</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={gracePeriodDays}
                onChangeText={(t) => setGracePeriodDays(num(t))}
              />
            </View>
          </View>

          <View className="flex-row justify-between items-center mb-3">
            <Text className={`text-xs font-bold flex-1 pr-2 ${textMain}`}>Lazima Awe na Mdhamini (Mwanachama)?</Text>
            <Switch value={requireGuarantor} onValueChange={setRequireGuarantor} trackColor={{ true: '#0f766e' }} />
          </View>

          {requireGuarantor && (
            <View className="mb-3">
              <Text className={`text-xs font-semibold mb-1 ${textSub}`}>Idadi ya Wadhamini Wanaohitajika</Text>
              <TextInput
                className={`border rounded-xl p-3 font-bold ${inputClass}`}
                keyboardType="numeric"
                value={minGuarantorsCount}
                onChangeText={(t) => setMinGuarantorsCount(num(t))}
              />
            </View>
          )}

          <View className="flex-row justify-between items-center mb-3 pt-2 border-t border-slate-200/20">
            <View className="flex-1 pr-2">
              <Text className={`text-xs font-bold ${textMain}`}>Zuia Mkopo Akiwa na Deni la Faini?</Text>
              <Text className={`text-[11px] ${textSub}`}>Mwanachama alipe faini kwanza kabla ya kukopa</Text>
            </View>
            <Switch value={blockLoanIfUnpaidFines} onValueChange={setBlockLoanIfUnpaidFines} trackColor={{ true: '#0f766e' }} />
          </View>

          <View className="flex-row justify-between items-center pt-2 border-t border-slate-200/20">
            <View className="flex-1 pr-2">
              <Text className={`text-xs font-bold ${textMain}`}>Vikumbusho vya SMS Kiotomatiki</Text>
              <Text className={`text-[11px] ${textSub}`}>Tuma SMS siku 1 kabla ya kikao au marejesho</Text>
            </View>
            <Switch value={autoSmsReminders} onValueChange={setAutoSmsReminders} trackColor={{ true: '#0f766e' }} />
          </View>
        </View>

        {/* 5. VIWANGO VYA FAINI ZOTE */}
        <View className={`p-4 rounded-2xl mb-6 border ${cardClass}`}>
          <Text className="font-bold text-rose-600 text-base mb-3">5. Viwango vya Faini Zote (TZS)</Text>
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
              <Text className={`text-xs font-semibold flex-1 ${textMain}`}>{item.label}</Text>
              <TextInput
                className={`border rounded-xl px-3 py-2 w-32 text-right font-bold ${inputClass}`}
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
          style={{ marginBottom: Math.max(insets.bottom + 24, 40) }}
          className="bg-teal-700 p-4 rounded-2xl items-center shadow-sm"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-bold text-base">Hifadhi Sheria Zote za Kikoba</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
