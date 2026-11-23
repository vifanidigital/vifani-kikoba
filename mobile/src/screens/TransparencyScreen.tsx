import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTabData } from '../api/useTabData';
import TopTabs from '../components/TopTabs';
import TabDataNotice from '../components/TabDataNotice';
import { parseShareOut, parseExpenses, parseAuditLogs } from '../api/tabResponses';

export default function TransparencyScreen() {
  const insets = useSafeAreaInsets();
  const { user, group, role } = useAuth();
  const { isDark } = useTheme();
  const isLeader = role === 'CHAIRPERSON' || role === 'SECRETARY' || role === 'TREASURER';

  const [activeTab, setActiveTab] = useState<'SHAREOUT' | 'EXPENSES' | 'KATIBA'>('SHAREOUT');
  const [expenseFilter, setExpenseFilter] = useState<'ALL' | 'SOCIAL_FUND' | 'OPERATIONS'>('ALL');


  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expCategory, setExpCategory] = useState<'SOCIAL_FUND' | 'OPERATIONS'>('SOCIAL_FUND');
  const [expTitle, setExpTitle] = useState('');
  const [expBeneficiary, setExpBeneficiary] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

  const scope = `${group?.id}_${user?.id}_${role}`;
  const shareOut = useTabData('/transparency/share-out', scope, parseShareOut);
  const expenseData = useTabData('/transparency/expenses', scope, parseExpenses);
  const history = useTabData('/transparency/audit-logs', scope, parseAuditLogs);
  const shareOutData: any = shareOut.data;
  const expenses = expenseData.data?.expenses ?? [];
  const auditLogs = history.data?.logs ?? [];
  const panel = activeTab === 'SHAREOUT' ? shareOut : activeTab === 'EXPENSES' ? expenseData : history;


  const handleSaveExpense = async () => {
    const amt = Number(expAmount);
    if (expTitle.trim().length < 2 || !amt || amt <= 0) {
      return Alert.alert('Angalia Taarifa', 'Weka maelezo ya matumizi na kiasi sahihi.');
    }
    setSavingExpense(true);
    try {
      const res = await apiClient.post('/transparency/expenses', {
        category: expCategory,
        title: expTitle.trim(),
        beneficiary: expBeneficiary.trim(),
        amount: amt,
      });
      Alert.alert('Imefanikiwa', res.data?.message);
      setShowExpenseModal(false);
      setExpTitle('');
      setExpBeneficiary('');
      setExpAmount('');
      void expenseData.reload();
      void shareOut.reload();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kurekodi matumizi.');
    } finally {
      setSavingExpense(false);
    }
  };
  const myEst = shareOutData?.myEstimate;
  const pool = shareOutData?.groupPool;
  const currentFormula = shareOutData?.calculation === 'KIKOBA_EQUAL_V1';
  const formatMoney = (value: number | undefined) => 'TZS ' + Number(value ?? 0).toLocaleString();
  const breakdown: [string, number][] = myEst ? [
    ['Hisa ulizochangia', myEst.myCapital],
    ['Michango yako ya Jamii', myEst.mySocialFund],
    ['Mtaji wako wa Papo ya lazima', myEst.myPapoMandatory],
    ['Riba yako ya mkopo iliyolipwa kwa wakati', myEst.myOnTimeLoanInterest],
    ['Nusu ya riba ya Papo uliyolipa', myEst.myPapoInterestRefund],
    ['Sehemu yako sawa ya faida ya kikundi', myEst.estimatedProfitDividend],
    ['Makato ya madeni na faini zako', -myEst.totalDeductions],
  ] : [];

  const handleShareWhatsAppReceipt = async () => {
    if (!myEst || !currentFormula) return;
    const lines = [
      'Makadirio ya mgawo wa ' + (group?.name || 'Vifani Jamii'),
      myEst.fullName || user?.fullName,
      ...breakdown.map(([label, amount]) => label + ' — ' + formatMoney(amount)),
      'Jumla baada ya makato — ' + formatMoney(myEst.netPayout),
    ];
    try {
      await Share.share({ message: lines.filter(Boolean).join('\n') });
    } catch {
      Alert.alert('Hitilafu', 'Imeshindikana kushiriki makadirio ya mgawo.');
    }
  };

  const socialExpensesTotal = expenses
    .filter((e) => e.category === 'SOCIAL_FUND')
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const opsExpensesTotal = expenses
    .filter((e) => e.category !== 'SOCIAL_FUND')
    .reduce((s, e) => s + Number(e.amount || 0), 0);

  const filteredExpenses = expenses.filter((e) => {
    if (expenseFilter === 'ALL') return true;
    return e.category === expenseFilter;
  });

  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';
  return (
    <View className={`flex-1 ${bgClass}`}>
      <View
        style={{ paddingTop: Math.max(insets.top + 10, 44) }}
        className="bg-teal-700 pb-5 px-5 rounded-b-3xl shadow-md"
      >
        <View className="flex-row items-center justify-between mb-4">
          <View className="flex-row items-center gap-3 flex-1">
            <TouchableOpacity
              onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
              className="bg-teal-800/80 p-2 rounded-xl"
            >
              <Ionicons name="arrow-back" size={22} color="#ffffff" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-xl font-extrabold text-white">Mgawo Wangu & Uwazi</Text>
              <Text className="text-teal-100 text-xs">Gawio Binafsi, Matumizi & Kumbukumbu</Text>
            </View>
          </View>
          {panel.loading && <ActivityIndicator size="small" color="#5eead4" />}
        </View>

        <TopTabs selected={activeTab} onSelect={setActiveTab} tabs={[{ id: 'SHAREOUT', label: 'Mgawo Wangu' }, { id: 'EXPENSES', label: 'Matumizi' }, { id: 'KATIBA', label: 'Historia ya Katiba' }]} />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        className="flex-1 px-5 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={panel.loading && panel.data != null}
            onRefresh={panel.reload}
          />
        }
      >
        <View>
          <TabDataNotice loading={panel.loading} error={panel.error} hasData={panel.data != null} retry={panel.reload} />
          {panel.data != null && <>
          {activeTab === 'SHAREOUT' && (
            <>
              {!currentFormula ? (
                <View className={'mb-4 rounded-2xl border p-4 ' + cardClass}>
                  <Text className={textMain}>Seva inayotumika bado haina hesabu mpya ya mgawo sawa wa Kikoba.</Text>
                </View>
              ) : myEst ? (
                <>
                  <View className="mb-4 rounded-3xl bg-slate-900 p-5">
                    <Text className="text-sm font-bold text-teal-300">Makadirio ya mgawo wako</Text>
                    <Text className="mt-1 text-3xl font-bold text-white">{formatMoney(myEst.netPayout)}</Text>
                    <Text className="mb-3 mt-1 text-xs text-slate-300">Kiasi baada ya makato ikiwa kikoba kitavunjwa sasa.</Text>
                    {breakdown.map(([label, amount]) => (
                      <View key={label} className="flex-row justify-between gap-3 border-t border-slate-700 py-2">
                        <Text className="flex-1 text-xs text-slate-300">{label}</Text>
                        <Text className="text-xs font-bold text-white">{formatMoney(amount)}</Text>
                      </View>
                    ))}
                    <Text className="mt-2 text-xs text-slate-300">
                      Jumla ya riba ya Papo uliyolipa ni {formatMoney(myEst.myPapoInterestPaid)}.
                    </Text>
                    <TouchableOpacity onPress={handleShareWhatsAppReceipt} className="mt-3 self-start rounded-xl bg-teal-700 px-4 py-3">
                      <Text className="font-bold text-white">Shiriki makadirio</Text>
                    </TouchableOpacity>
                  </View>
                  <View className={'mb-4 rounded-2xl border p-4 ' + cardClass}>
                    <Text className={'font-bold ' + textMain}>Faida inayogawanywa sawa</Text>
                    <Text className={'mb-3 mt-1 text-xs ' + textSub}>
                      Hisa, Jamii na riba ya mkopo iliyolipwa kwa wakati hurudi kwa aliyechangia. Nusu ya riba ya Papo hurudi kwake. Nusu nyingine huingia kwenye mfuko wa kikundi.
                    </Text>
                    {([
                      ['Nusu ya riba za Papo za kikundi', pool.papoInterestPool],
                      ['Riba za mikopo zilizocheleweshwa', pool.lateLoanInterestPool],
                      ['Faini zilizolipwa', pool.finesPool],
                      ['Matumizi yaliyorekodiwa', -pool.expenses],
                      ['Jumla ya kugawa', pool.totalDistributableProfit],
                    ] as [string, number][]).map(([label, amount]) => (
                      <View key={label} className="flex-row justify-between gap-3 border-t border-slate-200/40 py-2">
                        <Text className={'flex-1 text-xs ' + textSub}>{label}</Text>
                        <Text className={'text-xs font-bold ' + textMain}>{formatMoney(amount)}</Text>
                      </View>
                    ))}
                    <Text className={'mt-2 text-xs ' + textSub}>
                      Jumla inagawanywa sawa kwa wanachama hai {pool.memberCount}.
                    </Text>
                    {pool.unclassifiedLoanInterest > 0 && (
                      <Text className="mt-2 text-xs text-amber-700">
                        Riba ya zamani ya {formatMoney(pool.unclassifiedLoanInterest)} bado inasubiri uthibitisho wa muda wa malipo kabla ya kuhesabiwa kwenye mgawo.
                      </Text>
                    )}
                    {pool.expenseShortfall > 0 && (
                      <Text className="mt-2 text-xs text-amber-700">
                        Matumizi yamezidi faida ya pamoja kwa {formatMoney(pool.expenseShortfall)}.
                      </Text>
                    )}
                  </View>
                </>
              ) : (
                <Text className={'py-6 text-center ' + textSub}>Hakuna makadirio ya mgawo kwa sasa.</Text>
              )}
            </>
          )}

          {activeTab === 'EXPENSES' && (
            <>
              {/* MUHTASARI WA MATUMIZI YA JAMII VS UENDESHAJI */}
              <View className="flex-row gap-3 mb-3">
                <View className={`flex-1 p-3.5 rounded-2xl border ${cardClass}`}>
                  <Text className={`text-[10px] font-bold uppercase ${textSub}`}>Matumizi ya Jamii</Text>
                  <Text className="text-sm font-extrabold text-rose-600 mt-1">
                    TZS {socialExpensesTotal.toLocaleString()}
                  </Text>
                </View>
                <View className={`flex-1 p-3.5 rounded-2xl border ${cardClass}`}>
                  <Text className={`text-[10px] font-bold uppercase ${textSub}`}>Gharama za Uendeshaji</Text>
                  <Text className="text-sm font-extrabold text-amber-600 mt-1">
                    TZS {opsExpensesTotal.toLocaleString()}
                  </Text>
                </View>
              </View>

              {isLeader && (
                <TouchableOpacity
                  onPress={() => setShowExpenseModal(true)}
                  className="bg-teal-700 p-4 rounded-2xl items-center flex-row justify-center gap-2 mb-3 shadow-sm"
                >
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text className="text-white font-bold text-xs">Rekodi Matumizi / Msaada wa Jamii</Text>
                </TouchableOpacity>
              )}

              <View className="flex-row gap-2 mb-3">
                {[
                  { id: 'ALL', label: `Yote (${expenses.length})` },
                  { id: 'SOCIAL_FUND', label: 'Mfuko wa Jamii' },
                  { id: 'OPERATIONS', label: 'Uendeshaji' },
                ].map((f) => (
                  <TouchableOpacity
                    key={f.id}
                    onPress={() => setExpenseFilter(f.id as any)}
                    className={`flex-1 py-2 rounded-xl border items-center ${
                      expenseFilter === f.id
                        ? 'bg-teal-700 border-teal-700'
                        : isDark
                        ? 'bg-slate-900 border-slate-800'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <Text className={`text-[11px] font-bold ${expenseFilter === f.id ? 'text-white' : textSub}`}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {filteredExpenses.length === 0 ? (
                <View className={`p-6 rounded-2xl border items-center ${cardClass}`}>
                  <Text className={`text-xs ${textSub}`}>Hakuna matumizi yaliyorekodiwa kwenye kipengele hiki.</Text>
                </View>
              ) : (
                filteredExpenses.map((e: any) => (
                  <View key={e.id} className={`p-4 rounded-2xl border mb-2.5 ${cardClass}`}>
                    <View className="flex-row justify-between items-start">
                      <View className="flex-1 pr-2">
                        <Text className={`font-bold text-sm ${textMain}`}>{e.title}</Text>
                        <Text className={`text-xs mt-0.5 ${textSub}`}>
                          {e.category === 'SOCIAL_FUND' ? 'Mfuko wa Jamii' : 'Uendeshaji'}
                          {e.beneficiary ? ` • Mpokeaji: ${e.beneficiary}` : ''}
                        </Text>
                        <Text className={`text-[11px] mt-1 ${textSub}`}>
                          Imerekodiwa na {e.recordedBy} • {new Date(e.createdAt).toLocaleDateString('sw-TZ')}
                        </Text>
                      </View>
                      <Text className="font-extrabold text-rose-600 text-sm">
                        - TZS {Number(e.amount || 0).toLocaleString()}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {activeTab === 'KATIBA' && (
            <>
              {auditLogs.length === 0 ? (
                <View className={`p-6 rounded-2xl border items-center ${cardClass}`}>
                  <Text className={`text-xs ${textSub}`}>Hakuna mabadiliko ya sheria yaliyofanyika bado.</Text>
                </View>
              ) : (
                auditLogs.map((log: any) => (
                  <View key={log.id} className={`p-4 rounded-2xl border mb-2.5 ${cardClass}`}>
                    <Text className={`font-bold text-xs ${textMain}`}>{log.summary}</Text>
                    <Text className={`text-[11px] mt-1 ${textSub}`}>
                      Na: {log.changedBy} • {new Date(log.createdAt).toLocaleString('sw-TZ')}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}
          <View className="h-10" />
          </>}
        </View>
      </ScrollView>

      {showExpenseModal && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'flex-end',
            zIndex: 999,
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              backgroundColor: '#ffffff',
              maxHeight: '100%',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Math.max(insets.bottom + 16, 24),
            }}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-900">Rekodi Matumizi ya Kikundi</Text>
              <TouchableOpacity onPress={() => setShowExpenseModal(false)}>
                <Ionicons name="close-circle" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>

            <View className="flex-row gap-2 mb-3">
              {[
                { id: 'SOCIAL_FUND', label: 'Mfuko wa Jamii' },
                { id: 'OPERATIONS', label: 'Uendeshaji' },
              ].map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setExpCategory(c.id as any)}
                  className={`flex-1 py-2.5 rounded-xl border items-center ${
                    expCategory === c.id ? 'bg-teal-700 border-teal-700' : 'bg-slate-50 border-slate-300'
                  }`}
                >
                  <Text className={`text-xs font-bold ${expCategory === c.id ? 'text-white' : 'text-slate-700'}`}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-2.5 text-slate-900"
              placeholder="Sababu (mf. Msaada wa msiba / Shajala)"
              value={expTitle}
              onChangeText={setExpTitle}
            />
            <TextInput
              className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-2.5 text-slate-900"
              placeholder="Jina la aliyepokea pesa (Hiari)"
              value={expBeneficiary}
              onChangeText={setExpBeneficiary}
            />
            <TextInput
              className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-4 text-slate-900 font-bold"
              placeholder="Kiasi kilichotoka (TZS)"
              keyboardType="numeric"
              value={expAmount}
              onChangeText={(t) => setExpAmount(t.replace(/[^0-9]/g, ''))}
            />

            <TouchableOpacity
              onPress={handleSaveExpense}
              disabled={savingExpense}
              className="bg-teal-700 p-4 rounded-xl items-center"
            >
              {savingExpense ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Hifadhi Kwenye Daftari</Text>}
            </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}
