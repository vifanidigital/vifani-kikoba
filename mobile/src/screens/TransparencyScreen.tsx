import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getCachedData, setCachedData } from '../utils/cache';

export default function TransparencyScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, group, role } = useAuth();
  const { isDark } = useTheme();
  const isLeader = role === 'CHAIRPERSON' || role === 'SECRETARY' || role === 'TREASURER';

  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'SHAREOUT' | 'EXPENSES' | 'KATIBA'>('SHAREOUT');

  const [shareOutData, setShareOutData] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expCategory, setExpCategory] = useState<'SOCIAL_FUND' | 'OPERATIONS'>('SOCIAL_FUND');
  const [expTitle, setExpTitle] = useState('');
  const [expBeneficiary, setExpBeneficiary] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [savingExpense, setSavingExpense] = useState(false);

    const loadAll = async () => {
    const cacheKey = `transparency_${group?.id || 'g'}_${user?.id || 'u'}`;

    const cached = await getCachedData<any>(cacheKey);
    if (cached) {
      if (cached.shareOutData) setShareOutData(cached.shareOutData);
      if (cached.expenses) setExpenses(cached.expenses);
      if (cached.auditLogs) setAuditLogs(cached.auditLogs);
    }

    setSyncing(true);
    try {
      const [shRes, expRes, audRes] = await Promise.all([
        apiClient.get('/transparency/shareout'),
        apiClient.get('/transparency/expenses'),
        apiClient.get('/transparency/audit-logs'),
      ]);

      const fresh = {
        shareOutData: shRes.data || null,
        expenses: Array.isArray(expRes.data?.expenses) ? expRes.data.expenses : [],
        auditLogs: Array.isArray(audRes.data?.logs) ? audRes.data.logs : [],
      };

      setShareOutData(fresh.shareOutData);
      setExpenses(fresh.expenses);
      setAuditLogs(fresh.auditLogs);
      await setCachedData(cacheKey, fresh);
    } catch (error: any) {
      console.log('Inatumia cache ya mgawo:', error?.message);
    } finally {
      setSyncing(false);
      setRefreshing(false);
    }
  };



  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

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
      loadAll();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kurekodi matumizi.');
    } finally {
      setSavingExpense(false);
    }
  };

  const handleShareWhatsAppReceipt = (memberItem: any) => {
    const msg =
      `*RISITI BINAFSI YA MGAWO - ${group?.name || 'KIKOBA'}*\n` +
      `Mwanachama: *${memberItem.fullName}*\n` +
      `Hisa Zako: ${memberItem.mySharesCount} (TZS ${Number(memberItem.myCapital || 0).toLocaleString()})\n` +
      `Mfuko wa Papo: TZS ${Number(memberItem.myPapoMandatory || 0).toLocaleString()}\n` +
      `Gawio la Faida: TZS ${Number(memberItem.estimatedProfitDividend || 0).toLocaleString()}\n` +
      `Makato ya Madeni: TZS ${Number(memberItem.totalDeductions || 0).toLocaleString()}\n` +
      `----------------------------------\n` +
      `*MGAWO SAFI WA LEO: TZS ${Number(memberItem.netPayout || 0).toLocaleString()}*\n` +
      `_Imetolewa kupitia Vifani Kikoba App_`;

    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('WhatsApp Haipatikani', 'Hakikisha WhatsApp imewekwa kwenye simu yako.');
    });
  };
  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';

  const myEst = shareOutData?.myEstimate;

  return (
    <View className={`flex-1 ${bgClass}`}>
      <View
        style={{ paddingTop: Math.max(insets.top + 10, 44) }}
        className="bg-teal-700 pb-5 px-5 rounded-b-3xl"
      >
        <View className="flex-row items-center gap-3 mb-4">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="bg-teal-800/80 p-2 rounded-xl"
          >
            <Ionicons name="arrow-back" size={22} color="#ffffff" />
          </TouchableOpacity>
          <View>
            <Text className="text-xl font-bold text-white">Mgawo Wangu & Uwazi</Text>
            <Text className="text-teal-100 text-xs">Mgawo Binafsi, Matumizi & Katiba Log</Text>
          </View>
        </View>

        <View className="flex-row bg-teal-800/70 p-1 rounded-xl">
          {[
            { id: 'SHAREOUT', label: 'Mgawo Wangu' },
            { id: 'EXPENSES', label: `Matumizi (${expenses.length})` },
            { id: 'KATIBA', label: 'Katiba Log' },
          ].map((t) => (
            <TouchableOpacity
              key={t.id}
              onPress={() => setActiveTab(t.id as any)}
              className={`flex-1 py-2 rounded-lg items-center ${activeTab === t.id ? 'bg-white' : ''}`}
            >
              <Text className={`font-bold text-[11px] ${activeTab === t.id ? 'text-teal-800' : 'text-teal-100'}`}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
      >
        {activeTab === 'SHAREOUT' && (
          <>
            {myEst ? (
              <View className="bg-slate-900 p-5 rounded-3xl mb-4 border border-slate-800">
                <View className="flex-row justify-between items-center">
                  <Text className="text-teal-300 text-xs font-bold uppercase">
                    Makadirio Yako Kikoba Kikivunjwa Leo
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleShareWhatsAppReceipt(myEst)}
                    className="bg-emerald-600 px-3 py-1.5 rounded-xl flex-row items-center gap-1"
                  >
                    <Ionicons name="logo-whatsapp" size={14} color="#fff" />
                    <Text className="text-white font-bold text-[11px]">Risiti Yangu</Text>
                  </TouchableOpacity>
                </View>

                <Text className="text-white text-3xl font-extrabold mt-2">
                  TZS {Number(myEst.netPayout || 0).toLocaleString()}
                </Text>
                <Text className="text-slate-400 text-[11px] mt-0.5">
                  Kiasi safi utakachopokea mkononi (Taarifa hii ni siri yako pekee)
                </Text>

                <View className="mt-4 pt-3 border-t border-slate-800 space-y-2">
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">Mtaji wa Hisa Zako ({myEst.mySharesCount}):</Text>
                    <Text className="text-white font-bold text-xs">
                      + TZS {Number(myEst.myCapital || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">Mfuko Wako wa Papo:</Text>
                    <Text className="text-white font-bold text-xs">
                      + TZS {Number(myEst.myPapoMandatory || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">Gawio Lako la Faida (Riba + Faini):</Text>
                    <Text className="text-emerald-400 font-bold text-xs">
                      + TZS {Number(myEst.estimatedProfitDividend || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-slate-400 text-xs">Makato ya Madeni Yako:</Text>
                    <Text className="text-rose-400 font-bold text-xs">
                      - TZS {Number(myEst.totalDeductions || 0).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View className={`p-6 rounded-2xl border items-center ${cardClass}`}>
                <Text className={`text-xs ${textSub}`}>Hakuna makadirio ya mgawo kwa sasa.</Text>
              </View>
            )}
          </>
        )}
        {activeTab === 'EXPENSES' && (
          <>
            {isLeader && (
              <TouchableOpacity
                onPress={() => setShowExpenseModal(true)}
                className="bg-teal-700 p-4 rounded-2xl items-center flex-row justify-center gap-2 mb-4"
              >
                <Ionicons name="add-circle" size={20} color="#fff" />
                <Text className="text-white font-bold">Rekodi Matumizi / Msaada wa Jamii</Text>
              </TouchableOpacity>
            )}

            {expenses.length === 0 ? (
              <View className={`p-6 rounded-2xl border items-center ${cardClass}`}>
                <Text className={`text-xs ${textSub}`}>Hakuna matumizi yaliyorekodiwa bado.</Text>
              </View>
            ) : (
              expenses.map((e: any) => (
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
      </ScrollView>

      <Modal visible={showExpenseModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 bg-black/50 justify-end"
        >
          <View style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }} className="bg-white rounded-t-3xl p-6">
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
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
