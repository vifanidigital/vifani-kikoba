import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getCachedData, setCachedData } from '../utils/cache';

export default function MikopoPapoScreen() {
  const insets = useSafeAreaInsets();
  const { user, role } = useAuth();
  const { isDark } = useTheme();
  const isLeader = role === 'CHAIRPERSON' || role === 'SECRETARY' || role === 'TREASURER';

  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'PAPO' | 'LOANS'>('PAPO');

  const [papoData, setPapoData] = useState<any>(null);
  const [loansData, setLoansData] = useState<any>(null);

  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');

  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [selectedGuarantorId, setSelectedGuarantorId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const loadAll = async () => {
  const cacheKey = `mikopo_papo_${user?.id || 'u'}_${role || 'M'}`;

  const cached = await getCachedData<any>(cacheKey);
  if (cached) {
    setPapoData(cached.papoData || null);
    setLoansData(cached.loansData || null);
  }

  setSyncing(true);
  try {
    const [papoRes, loansRes] = await Promise.all([
      apiClient.get('/papo/status'),
      apiClient.get('/loans'),
    ]);
    const fresh = {
      papoData: papoRes.data || null,
      loansData: loansRes.data || null,
    };
    setPapoData(fresh.papoData);
    setLoansData(fresh.loansData);
    await setCachedData(cacheKey, fresh);
  } catch (error: any) {
    console.log('Inatumia cache ya mikopo:', error?.message);
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
  const remainingTopUpCap = Number(papoData?.remainingTopUpCap ?? papoData?.maxTopUpPapoCap ?? 0);
  const minTopUp = Number(papoData?.minTopUpPapoCap || 0);
  const numericTopUp = Number(topUpAmount || 0);
  const isTopUpExceeding = numericTopUp > remainingTopUpCap;
  const isTopUpBelowMin = numericTopUp > 0 && minTopUp > 0 && numericTopUp < minTopUp;

  const effectiveMaxLoan = Number(loansData?.effectiveMaxLoan || 0);
  const fixedMonths = Math.max(1, Number(loansData?.maxRepaymentMonths || 1));
  const numericLoan = Number(loanAmount || 0);
  const isLoanExceeding = numericLoan > effectiveMaxLoan;

  const handleRequestTopUp = async () => {
    if (!numericTopUp || numericTopUp <= 0) {
      return Alert.alert('Angalia Kiasi', 'Ingiza kiasi sahihi cha Papo ya hiari.');
    }
    if (isTopUpExceeding) {
      return Alert.alert('Ukomo Umezidi', `Ukomo wako uliobaki ni TZS ${remainingTopUpCap.toLocaleString()}.`);
    }
    if (isTopUpBelowMin) {
      return Alert.alert('Kiasi Kidogo', `Kiasi cha chini ni TZS ${minTopUp.toLocaleString()}.`);
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/papo/request-topup', { amount: numericTopUp });
      Alert.alert('Imefanikiwa', res.data?.message);
      setShowTopUpModal(false);
      setTopUpAmount('');
      loadAll();
    } catch (error: any) {
      Alert.alert('Imeshindikana', error.response?.data?.error || 'Hitilafu imetokea.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveTopUp = async (id: string) => {
    try {
      const res = await apiClient.post(`/papo/approve-topup/${id}`);
      Alert.alert('Imeidhinishwa', res.data?.message);
      loadAll();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuidhinisha.');
    }
  };

  const handleRequestRepayTopUp = async (id: string) => {
    try {
      const res = await apiClient.post(`/papo/request-repay-topup/${id}`);
      Alert.alert('Ombi Limetumwa', res.data?.message);
      loadAll();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kutuma ombi.');
    }
  };

  const handleConfirmRepayTopUp = async (id: string) => {
    try {
      const res = await apiClient.post(`/papo/confirm-repay-topup/${id}`);
      Alert.alert('Imethibitishwa', res.data?.message);
      loadAll();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuthibitisha.');
    }
  };
  const handleApplyLoan = async () => {
    if (!numericLoan || numericLoan <= 0) {
      return Alert.alert('Angalia Kiasi', 'Ingiza kiasi sahihi cha mkopo.');
    }
    if (isLoanExceeding) {
      return Alert.alert('Ukomo Umezidi', `Ukomo wako wa mkopo ni TZS ${effectiveMaxLoan.toLocaleString()}.`);
    }
    if (loansData?.requireGuarantor && !selectedGuarantorId) {
      return Alert.alert('Chagua Mdhamini', 'Lazima uchague mwanachama mdhamini.');
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post('/loans/apply', {
        amount: numericLoan,
        months: fixedMonths,
        guarantorId: selectedGuarantorId || null,
      });
      Alert.alert('Imefanikiwa', res.data?.message);
      setShowLoanModal(false);
      setLoanAmount('');
      setSelectedGuarantorId('');
      loadAll();
    } catch (error: any) {
      Alert.alert('Imeshindikana', error.response?.data?.error || 'Hitilafu imetokea.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuarantorRespond = async (loanId: string, decision: 'ACCEPT' | 'REJECT') => {
    try {
      const res = await apiClient.post(`/loans/guarantor-respond/${loanId}`, { decision });
      Alert.alert('Taarifa', res.data?.message);
      loadAll();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kujibu udhamini.');
    }
  };

  const handleApproveLoan = async (loanId: string) => {
    try {
      const res = await apiClient.post(`/loans/approve/${loanId}`);
      Alert.alert('Imeidhinishwa', res.data?.message);
      loadAll();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuidhinisha mkopo.');
    }
  };

  const handleRequestRepayLoan = async (loanId: string) => {
    try {
      const res = await apiClient.post(`/loans/request-repay/${loanId}`);
      Alert.alert('Ombi Limetumwa', res.data?.message);
      loadAll();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kutuma ombi.');
    }
  };

  const handleConfirmRepayLoan = async (loanId: string) => {
    try {
      const res = await apiClient.post(`/loans/confirm-repay/${loanId}`);
      Alert.alert('Imethibitishwa', res.data?.message);
      loadAll();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuthibitisha.');
    }
  };
  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';

  const rawLoans = Array.isArray(loansData?.loans) ? loansData.loans : [];
  const allLoans = isLeader ? rawLoans : rawLoans.filter((l: any) => l.userId === user?.id);
  const guarantorRequests = Array.isArray(loansData?.guarantorRequests) ? loansData.guarantorRequests : [];
  const potentialGuarantors = Array.isArray(loansData?.potentialGuarantors) ? loansData.potentialGuarantors : [];
  const topUps = Array.isArray(papoData?.topUps) ? papoData.topUps : [];
  const pendingTopUps = Array.isArray(papoData?.pendingTopUpRequests) ? papoData.pendingTopUpRequests : [];
  const repayingTopUps = Array.isArray(papoData?.repayingTopUpRequests) ? papoData.repayingTopUpRequests : [];

  const calculatedLoanInterest = Math.round(
    (numericLoan * Number(loansData?.interestRate || 10) * fixedMonths) / 100
  );

  return (
    <View className={`flex-1 ${bgClass}`}>
      <View
        style={{ paddingTop: Math.max(insets.top + 10, 44) }}
        className="bg-teal-700 pb-5 px-6 rounded-b-3xl"
      >
        <Text className="text-2xl font-bold text-white">Mikopo & Papo</Text>
        <Text className="text-teal-100 text-xs mt-1">
          Dhibiti Papo ya lazima, Papo ya hiari na mikopo mikubwa
        </Text>
             {syncing && (
       <View className="flex-row items-center gap-1.5 mt-2 bg-teal-900/60 self-start px-3 py-1 rounded-full">
         <ActivityIndicator size="small" color="#5eead4" />
         <Text className="text-teal-100 text-[10px] font-bold">Inasasisha mikopo...</Text>
       </View>
     )}


        <View className="flex-row bg-teal-800/70 p-1 rounded-xl mt-4">
          <TouchableOpacity
            onPress={() => setActiveTab('PAPO')}
            className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'PAPO' ? 'bg-white' : ''}`}
          >
            <Text className={`font-bold text-xs ${activeTab === 'PAPO' ? 'text-teal-800' : 'text-teal-100'}`}>
              Mfuko wa Papo
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('LOANS')}
            className={`flex-1 py-2.5 rounded-lg items-center ${activeTab === 'LOANS' ? 'bg-white' : ''}`}
          >
            <Text className={`font-bold text-xs ${activeTab === 'LOANS' ? 'text-teal-800' : 'text-teal-100'}`}>
              Mikopo Mikubwa ({allLoans.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadAll(); }} />}
      >
        {activeTab === 'PAPO' ? (
          <>
            {!papoData?.hasPapo ? (
              <View className={`p-6 rounded-2xl items-center border ${cardClass}`}>
                <Ionicons name="information-circle-outline" size={36} color="#64748b" />
                <Text className={`font-bold mt-2 ${textMain}`}>Papo Haijawashwa</Text>
              </View>
            ) : (
              <>
                <View className={`p-5 rounded-2xl border shadow-sm mb-4 ${cardClass}`}>
                  <Text className={`text-xs font-bold uppercase ${textSub}`}>Muhtasari Wako wa Papo</Text>
                  <View className="flex-row justify-between mt-3 pb-2.5 border-b border-slate-200/20">
                    <Text className={`text-xs ${textSub}`}>Papo ya Lazima:</Text>
                    <Text className={`font-bold text-xs ${textMain}`}>
                      TZS {Number(papoData?.mandatoryBalance || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-2.5 border-b border-slate-200/20">
                    <Text className={`text-xs ${textSub}`}>Jumla ya Papo za Hiari (Active):</Text>
                    <Text className="font-bold text-amber-600 text-xs">
                      TZS {Number(papoData?.activeTopUpPrincipal || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-2.5 border-b border-slate-200/20">
                    <Text className={`font-bold text-xs ${textMain}`}>Jumla Kuu ya Papo Yako:</Text>
                    <Text className="font-extrabold text-teal-600 text-sm">
                      TZS {Number(papoData?.combinedPapoCapital || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between pt-2.5">
                    <Text className={`font-bold text-xs ${textMain}`}>
                      Jumla ya Riba ya Kikao ({Number(papoData?.papoMeetingInterestRate || 0)}%):
                    </Text>
                    <Text className="font-extrabold text-rose-600 text-sm">
                      TZS {Number(papoData?.combinedMeetingInterest || 0).toLocaleString()}
                    </Text>
                  </View>

                  {papoData?.allowTopUpPapo && (
                    <TouchableOpacity
                      onPress={() => setShowTopUpModal(true)}
                      disabled={remainingTopUpCap <= 0}
                      className={`p-3.5 rounded-xl items-center mt-4 flex-row justify-center gap-2 ${
                        remainingTopUpCap <= 0 ? 'bg-slate-400' : 'bg-teal-700'
                      }`}
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#fff" />
                      <Text className="text-white font-bold text-xs">
                        {remainingTopUpCap <= 0
                          ? 'Umefikia Ukomo wa Papo Hiari'
                          : `Omba Papo ya Hiari (Baki: TZS ${remainingTopUpCap.toLocaleString()})`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                {isLeader && pendingTopUps.length > 0 && (
                  <View className="bg-amber-50 border border-amber-300 p-4 rounded-2xl mb-4">
                    <Text className="font-extrabold text-amber-950 text-xs uppercase mb-2">
                      Maombi Mapya ya Papo Hiari ({pendingTopUps.length})
                    </Text>
                    {pendingTopUps.map((pt: any) => (
                      <View key={pt.id} className="bg-white p-3 rounded-xl border border-amber-200 mb-2">
                        <Text className="font-bold text-slate-900 text-xs">{pt.user?.fullName}</Text>
                        <Text className="text-xs text-slate-600 mt-0.5">
                          Anaomba: <Text className="font-bold">TZS {Number(pt.principalAmount || 0).toLocaleString()}</Text> (Majuma {papoData?.topUpPapoWeeks})
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleApproveTopUp(pt.id)}
                          className="bg-emerald-600 py-2 rounded-lg items-center mt-2"
                        >
                          <Text className="text-white font-bold text-xs">Idhinisha & Anza Hesabu ya Majuma</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {isLeader && repayingTopUps.length > 0 && (
                  <View className="bg-teal-50 border border-teal-300 p-4 rounded-2xl mb-4">
                    <Text className="font-extrabold text-teal-950 text-xs uppercase mb-2">
                      Papo za Hiari Zinazorejeshwa ({repayingTopUps.length})
                    </Text>
                    {repayingTopUps.map((rt: any) => (
                      <View key={rt.id} className="bg-white p-3 rounded-xl border border-teal-200 mb-2">
                        <Text className="font-bold text-slate-900 text-xs">{rt.user?.fullName}</Text>
                        <Text className="text-xs text-slate-600 mt-0.5">
                          Anarejesha Mtaji: <Text className="font-bold">TZS {Number(rt.principalAmount || 0).toLocaleString()}</Text>
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleConfirmRepayTopUp(rt.id)}
                          className="bg-teal-700 py-2 rounded-lg items-center mt-2"
                        >
                          <Text className="text-white font-bold text-xs">Thibitisha Marejesho & Futa Deni</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {topUps.filter((t: any) => t.status !== 'PAID').length > 0 && (
                  <>
                    <Text className={`font-bold text-xs uppercase mb-2 ${textSub}`}>
                      Papo Zako za Hiari Zinazoendelea
                    </Text>
                    {topUps
                      .filter((t: any) => t.status !== 'PAID')
                      .map((t: any) => (
                        <View key={t.id} className={`p-4 rounded-2xl mb-3 border ${cardClass}`}>
                          <View className="flex-row justify-between items-center">
                            <Text className={`font-extrabold text-sm ${textMain}`}>
                              TZS {Number(t.principalAmount || 0).toLocaleString()}
                            </Text>
                            <View className="bg-amber-100 px-2.5 py-1 rounded-lg">
                              <Text className="text-[11px] font-bold text-amber-800">
                                {t.status === 'REPAYMENT_PENDING' ? 'INASUBIRI UHAKIKI' : t.status}
                              </Text>
                            </View>
                          </View>
                          <Text className={`text-xs mt-1 ${textSub}`}>
                            Riba ya Kikao: <Text className="font-bold text-rose-600">TZS {Number(t.interestPerMeeting || 0).toLocaleString()}</Text>
                          </Text>
                          {t.dueDate && (
                            <Text className={`text-xs mt-0.5 ${textSub}`}>
                              Tarehe ya Kurejesha: <Text className="font-bold">{new Date(t.dueDate).toLocaleDateString('sw-TZ')}</Text> •{' '}
                              <Text className="text-teal-600 font-bold">Yamebaki Majuma {t.weeksRemaining}</Text>
                            </Text>
                          )}
                          {t.status === 'ACTIVE' && (
                            <TouchableOpacity
                              onPress={() => handleRequestRepayTopUp(t.id)}
                              className="bg-indigo-600 py-2.5 rounded-xl items-center mt-3"
                            >
                              <Text className="text-white font-bold text-xs">Omba Kurejesha Papo Hii</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                  </>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <View className={`p-5 rounded-2xl border shadow-sm mb-4 ${cardClass}`}>
              <View className="flex-row justify-between items-center mb-2">
                <Text className={`text-xs font-bold uppercase ${textSub}`}>Ukomo Wako wa Mkopo</Text>
                <Text className="text-xs font-bold text-emerald-600">
                  Faida Yako: TZS {Number(loansData?.myInterestProfit || 0).toLocaleString()}
                </Text>
              </View>
              <Text className="text-2xl font-bold text-teal-600">
                TZS {effectiveMaxLoan.toLocaleString()}
              </Text>
              <TouchableOpacity
                onPress={() => setShowLoanModal(true)}
                className="bg-teal-700 p-3.5 rounded-xl items-center mt-4 flex-row justify-center gap-2"
              >
                <Ionicons name="cash-outline" size={20} color="#fff" />
                <Text className="text-white font-bold text-sm">Omba Mkopo Mkubwa</Text>
              </TouchableOpacity>
            </View>

            {guarantorRequests.length > 0 && (
              <View className="bg-amber-50 border border-amber-300 p-4 rounded-2xl mb-4">
                <Text className="font-bold text-amber-900 mb-2">
                  Maombi ya Udhamini ({guarantorRequests.length})
                </Text>
                {guarantorRequests.map((reqLoan: any) => (
                  <View key={reqLoan.id} className="bg-white p-3.5 rounded-xl mb-2 border border-amber-200">
                    <Text className="font-bold text-slate-900">{reqLoan.user?.fullName}</Text>
                    <Text className="text-xs text-slate-600 mt-0.5">
                      Anaomba mkopo wa TZS {Number(reqLoan.principalAmount || 0).toLocaleString()}.
                    </Text>
                    <View className="flex-row gap-2 mt-3">
                      <TouchableOpacity
                        onPress={() => handleGuarantorRespond(reqLoan.id, 'ACCEPT')}
                        className="flex-1 bg-emerald-600 py-2 rounded-lg items-center"
                      >
                        <Text className="text-white font-bold text-xs">Kubali</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleGuarantorRespond(reqLoan.id, 'REJECT')}
                        className="flex-1 bg-rose-600 py-2 rounded-lg items-center"
                      >
                        <Text className="text-white font-bold text-xs">Kataa</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text className={`font-bold mb-2 ${textMain}`}>
              {isLeader ? 'Orodha ya Mikopo ya Kikundi' : 'Mikopo Yangu'}
            </Text>
            {allLoans.filter((l: any) => l.status !== 'PAID').map((l: any) => {
              const totalMonths = Math.max(1, Number(l.repaymentMonths || 1));
              const totalInt = Math.max(0, Number(l.totalRepayable || 0) - Number(l.principalAmount || 0));
              const monthlyInt = Math.round(totalInt / totalMonths);
              const monthsPaidCount = monthlyInt > 0 ? Math.min(totalMonths - 1, Math.floor(Number(l.amountPaid || 0) / monthlyInt)) : 0;
              const nextMonth = monthsPaidCount + 1;
              const isFinalMonth = nextMonth >= totalMonths;

              return (
                <View key={l.id} className={`p-4 rounded-2xl mb-3 border ${cardClass}`}>
                  <View className="flex-row justify-between items-start">
                    <View>
                      <Text className={`font-bold ${textMain}`}>{l.user?.fullName}</Text>
                      <Text className={`text-xs ${textSub}`}>
                        Mdhamini: {l.guarantor?.fullName || 'Hakuna'} ({l.guarantorStatus})
                      </Text>
                    </View>
                    <View className="bg-slate-200/70 px-2.5 py-1 rounded-lg">
                      <Text className="text-xs font-bold text-slate-800">{l.status}</Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between mt-3 pt-2 border-t border-slate-200/20">
                    <Text className={`text-xs ${textSub}`}>
                      Mkopo: <Text className={`font-bold ${textMain}`}>TZS {Number(l.principalAmount || 0).toLocaleString()}</Text>
                    </Text>
                    <Text className={`text-xs ${textSub}`}>
                      Baki: <Text className="font-bold text-teal-600">TZS {Math.max(0, Number(l.totalRepayable || 0) - Number(l.amountPaid || 0)).toLocaleString()}</Text>
                    </Text>
                  </View>

                  {(l.status === 'DISBURSED' || l.status === 'OVERDUE' || l.status === 'REPAYMENT_PENDING') && (
                    <View className="mt-2 pt-2 border-t border-slate-200/20">
                      <Text className={`text-[11px] font-bold ${textSub}`}>
                        Mwezi wa {nextMonth}/{totalMonths}:{' '}
                        <Text className="text-teal-600">
                          {isFinalMonth
                            ? `Riba (TZS ${monthlyInt.toLocaleString()}) + Mtaji (TZS ${Number(l.principalAmount || 0).toLocaleString()})`
                            : `Riba Pekee (TZS ${monthlyInt.toLocaleString()})`}
                        </Text>
                      </Text>
                    </View>
                  )}

                  {isLeader && l.status === 'PENDING' && (
                    <TouchableOpacity
                      onPress={() => handleApproveLoan(l.id)}
                      className="bg-teal-700 py-2.5 rounded-xl items-center mt-3"
                    >
                      <Text className="text-white font-bold text-xs">Idhinisha & Toa Mkopo</Text>
                    </TouchableOpacity>
                  )}

                  {isLeader && !isFinalMonth && (l.status === 'DISBURSED' || l.status === 'OVERDUE') && (
                    <TouchableOpacity
                      onPress={async () => {
                        try {
                          const r = await apiClient.post(`/loans/pay-monthly-interest/${l.id}`);
                          Alert.alert('Imelipwa', r.data?.message);
                          loadAll();
                        } catch (e: any) {
                          Alert.alert('Hitilafu', e.response?.data?.error || 'Imeshindikana.');
                        }
                      }}
                      className="bg-amber-600 py-2.5 rounded-xl items-center mt-2.5"
                    >
                      <Text className="text-white font-bold text-xs">
                        Thibitisha Riba Mwezi wa {nextMonth} (TZS {monthlyInt.toLocaleString()})
                      </Text>
                    </TouchableOpacity>
                  )}

                  {l.userId === user?.id && (l.status === 'DISBURSED' || l.status === 'OVERDUE') && (
                    <TouchableOpacity
                      onPress={() => handleRequestRepayLoan(l.id)}
                      className="bg-indigo-600 py-2.5 rounded-xl items-center mt-2.5"
                    >
                      <Text className="text-white font-bold text-xs">Omba Kurejesha Mkopo Wote</Text>
                    </TouchableOpacity>
                  )}

                  {isLeader && l.status === 'REPAYMENT_PENDING' && (
                    <TouchableOpacity
                      onPress={() => handleConfirmRepayLoan(l.id)}
                      className="bg-emerald-700 py-2.5 rounded-xl items-center mt-2.5"
                    >
                      <Text className="text-white font-bold text-xs">Thibitisha Marejesho Kamili & Futa Deni</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </>
        )}
        <View className="h-10" />
      </ScrollView>
      <Modal visible={showTopUpModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 bg-black/50 justify-end"
        >
          <View style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }} className="bg-white rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-900">Omba Papo ya Hiari</Text>
              <TouchableOpacity onPress={() => setShowTopUpModal(false)}>
                <Ionicons name="close-circle" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-xs text-slate-500 mb-2">
              Kiwango: TZS {minTopUp.toLocaleString()} - Baki Ukomo: TZS {remainingTopUpCap.toLocaleString()}
            </Text>
            <TextInput
              className={`border rounded-xl p-3.5 mb-3 text-base font-bold text-slate-900 ${
                isTopUpExceeding || isTopUpBelowMin ? 'bg-rose-50 border-rose-500' : 'bg-slate-50 border-slate-300'
              }`}
              placeholder="Weka kiasi (TZS)"
              keyboardType="numeric"
              value={topUpAmount}
              onChangeText={(t) => {
                const clean = t.replace(/[^0-9]/g, '');
                if (remainingTopUpCap > 0 && Number(clean) > remainingTopUpCap) {
                  Alert.alert('Ukomo Umezidi', `Huwezi kuomba zaidi ya TZS ${remainingTopUpCap.toLocaleString()}.`);
                  return;
                }
                setTopUpAmount(clean);
              }}
            />

            <Text className="text-xs font-bold text-slate-500 mb-1">
              Muda wa Kurejesha (Sheria ya Kikoba - Imefungwa) 🔒
            </Text>
            <TextInput
              editable={false}
              className="bg-slate-200/80 border border-slate-300 rounded-xl p-3 mb-3 font-bold text-slate-600"
              value={`Majuma ${papoData?.topUpPapoWeeks || 4}`}
            />

            <TouchableOpacity
              onPress={handleRequestTopUp}
              disabled={submitting || numericTopUp <= 0 || isTopUpExceeding || isTopUpBelowMin}
              className={`p-4 rounded-xl items-center mt-1 ${
                isTopUpExceeding || isTopUpBelowMin || numericTopUp <= 0 ? 'bg-slate-400' : 'bg-teal-700'
              }`}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Tuma Ombi</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showLoanModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1 bg-black/50 justify-end"
        >
          <View style={{ paddingBottom: Math.max(insets.bottom + 16, 24) }} className="bg-white rounded-t-3xl p-6 max-h-[88%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-900">Omba Mkopo Mkubwa</Text>
              <TouchableOpacity onPress={() => setShowLoanModal(false)}>
                <Ionicons name="close-circle" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text className="text-xs font-bold text-slate-700 mb-1">
                Kiasi cha Mkopo (Ukomo: TZS {effectiveMaxLoan.toLocaleString()})
              </Text>
              <TextInput
                className={`border rounded-xl p-3.5 mb-3 text-base font-bold text-slate-900 ${
                  isLoanExceeding ? 'bg-rose-50 border-rose-500' : 'bg-slate-50 border-slate-300'
                }`}
                placeholder="Weka kiasi cha mkopo"
                keyboardType="numeric"
                value={loanAmount}
                onChangeText={(t) => {
                  const clean = t.replace(/[^0-9]/g, '');
                  if (Number(clean) > effectiveMaxLoan) {
                    Alert.alert('Ukomo Umezidi', `Ukomo wako wa mkopo ni TZS ${effectiveMaxLoan.toLocaleString()}.`);
                    return;
                  }
                  setLoanAmount(clean);
                }}
              />

              <Text className="text-xs font-bold text-slate-500 mb-1">
                Muda wa Kurejesha (Sheria ya Kikoba - Imefungwa) 🔒
              </Text>
              <TextInput
                editable={false}
                className="bg-slate-200/80 border border-slate-300 rounded-xl p-3.5 mb-3 text-base font-bold text-slate-600"
                value={`Miezi ${fixedMonths}`}
              />

              <View className="bg-teal-50 p-3.5 rounded-xl border border-teal-200 mb-4">
                <Text className="text-xs text-teal-900">
                  Riba ({loansData?.interestRate || 10}% x Miezi {fixedMonths}): <Text className="font-bold">TZS {calculatedLoanInterest.toLocaleString()}</Text>
                </Text>
                <Text className="text-xs text-teal-900 mt-1">
                  Jumla ya Kurejesha: <Text className="font-bold">TZS {(numericLoan + calculatedLoanInterest).toLocaleString()}</Text>
                </Text>
              </View>

              {loansData?.requireGuarantor && (
                <>
                  <Text className="text-xs font-bold text-slate-700 mb-2">Chagua Mwanachama Mdhamini:</Text>
                  {potentialGuarantors.map((g: any) => (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => setSelectedGuarantorId(g.id)}
                      className={`p-3 rounded-xl mb-2 border flex-row justify-between items-center ${
                        selectedGuarantorId === g.id ? 'bg-teal-50 border-teal-600' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <View>
                        <Text className="font-bold text-slate-800 text-xs">{g.fullName}</Text>
                        <Text className="text-[11px] text-slate-500">{g.phone}</Text>
                      </View>
                      <Ionicons
                        name={selectedGuarantorId === g.id ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={selectedGuarantorId === g.id ? '#0f766e' : '#94a3b8'}
                      />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              <TouchableOpacity
                onPress={handleApplyLoan}
                disabled={submitting || numericLoan <= 0 || isLoanExceeding}
                className={`p-4 rounded-xl items-center mt-2 mb-4 ${
                  isLoanExceeding || numericLoan <= 0 ? 'bg-slate-400' : 'bg-teal-700'
                }`}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Tuma Ombi la Mkopo</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
