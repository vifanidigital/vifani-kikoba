import { FormTextInput, FormScrollView } from '../components/KeyboardForm';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,

  Alert,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTabData } from '../api/useTabData';
import TopTabs from '../components/TopTabs';
import TabDataNotice from '../components/TabDataNotice';
import { DeclineRequest, FundingQueuePanel, LoanPaymentPanel, LoanQueuePanel } from '../components/LoanWorkflows';
import { parsePapo, parseLoans, parseLoanQueue } from '../api/tabResponses';

export default function MikopoPapoScreen() {
  const insets = useSafeAreaInsets();
  const { user, role, group: activeGroup } = useAuth();
  const { isDark } = useTheme();
  const isLeader = role === 'CHAIRPERSON' || role === 'SECRETARY' || role === 'TREASURER';

  const [activeTab, setActiveTab] = useState<'PAPO' | 'LOANS'>('PAPO');


  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');

  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [selectedGuarantorId, setSelectedGuarantorId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const scope = `${activeGroup?.id}_${user?.id}_${role}`;
  const papo = useTabData('/papo/status', scope, parsePapo);
  const loans = useTabData('/loans', scope, parseLoans);
  const queue = useTabData('/loans/queue', scope, parseLoanQueue);
  const { reload: reloadLoans } = loans;
  const { reload: reloadQueue } = queue;
  const { reload: reloadPapo } = papo;
  useFocusEffect(useCallback(() => {
    const timer = setInterval(() => {
      if (activeTab === 'LOANS') void Promise.all([reloadLoans(), reloadQueue()]);
      else void reloadPapo();
    }, 25000);
    return () => clearInterval(timer);
  }, [activeTab, reloadLoans, reloadQueue, reloadPapo]));
  const canApply = queue.data?.next === user?.id && !!user?.id;
  const papoData: any = papo.data;
  const loansData: any = loans.data;
  const panel = activeTab === 'PAPO' ? papo : loans;


  const remainingTopUpCap = Number(papoData?.remainingTopUpCap ?? papoData?.maxTopUpPapoCap ?? 0);
  const minTopUp = Number(papoData?.minTopUpPapoCap || 0);
  const numericTopUp = Number(topUpAmount || 0);
  const isTopUpExceeding = numericTopUp > remainingTopUpCap;
  const isTopUpBelowMin = numericTopUp > 0 && minTopUp > 0 && numericTopUp < minTopUp;

  const effectiveMaxLoan = Number(loansData?.effectiveMaxLoan || 0);
  const fixedMonths = Math.max(1, Number(loansData?.maxRepaymentMonths || 1));
  const interestRatePct = Number(loansData?.interestRate ?? 10);
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
      void papo.reload();
    } catch (error: any) {
      Alert.alert('Imeshindikana', error.response?.data?.error || 'Hitilafu imetokea.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestRepayTopUp = async (id: string) => {
    try {
      const res = await apiClient.post(`/papo/request-repay-topup/${id}`);
      Alert.alert('Ombi Limetumwa', res.data?.message);
      void papo.reload();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kutuma ombi.');
    }
  };

  const handleConfirmRepayTopUp = async (id: string) => {
    try {
      const res = await apiClient.post(`/papo/confirm-repay-topup/${id}`);
      Alert.alert('Imethibitishwa', res.data?.message);
      void papo.reload();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuthibitisha.');
    }
  };
  const handleApplyLoan = async () => {
    if (!canApply) {
      return Alert.alert('Subiri zamu yako', 'Unaweza kuomba kubadilishana namba kwenye foleni. Zamu itabadilika mwenzako akikubali.');
    }
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
        guarantorId: selectedGuarantorId || null });
      Alert.alert('Imefanikiwa', res.data?.message);
      setShowLoanModal(false);
      setLoanAmount('');
      setSelectedGuarantorId('');
      void loans.reload();
      void queue.reload();
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
      void loans.reload();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kujibu udhamini.');
    }
  };

  const handleRequestRepayLoan = async (loanId: string) => {
    try {
      const res = await apiClient.post(`/loans/request-repay/${loanId}`);
      Alert.alert('Ombi Limetumwa', res.data?.message);
      void loans.reload();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kutuma ombi.');
    }
  };

  const handleConfirmRepayLoan = async (loanId: string) => {
    try {
      const res = await apiClient.post(`/loans/confirm-repay/${loanId}`);
      Alert.alert('Imethibitishwa', res.data?.message);
      void loans.reload();
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
  const activeLoansList = allLoans.filter((loan: any) => loan.status !== 'PENDING');
  const guarantorRequests = Array.isArray(loansData?.guarantorRequests) ? loansData.guarantorRequests : [];
  const potentialGuarantors = Array.isArray(loansData?.potentialGuarantors) ? loansData.potentialGuarantors : [];
  const topUps = Array.isArray(papoData?.topUps) ? papoData.topUps : [];
  const repayingTopUps = Array.isArray(papoData?.repayingTopUpRequests) ? papoData.repayingTopUpRequests : [];

  const monthlyLoanInterest = Math.round(numericLoan * interestRatePct) / 100;
  const topUpEstimatedInterest = Math.round(
    (numericTopUp * Number(papoData?.papoMeetingInterestRate || 0)) / 100
  );
  return (
    <View className={`flex-1 ${bgClass}`}>
      <View
        style={{ paddingTop: Math.max(insets.top + 10, 44) }}
        className="bg-teal-700 pb-6 px-6 rounded-b-3xl shadow-md"
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-1">
            <Text className="text-2xl font-extrabold text-white">Mikopo & Papo</Text>
            <Text className="text-teal-100 text-xs mt-1">
              Dhibiti Papo ya lazima, Papo ya hiari na mikopo mikubwa
            </Text>
          </View>
          {panel.loading && (
            <View className="flex-row items-center gap-1.5 bg-teal-900/70 px-3 py-1.5 rounded-full">
              <ActivityIndicator size="small" color="#5eead4" />
              <Text className="text-teal-100 text-[10px] font-bold">Inasasisha...</Text>
            </View>
          )}
        </View>

        <TopTabs selected={activeTab} onSelect={setActiveTab} tabs={[{ id: 'PAPO', label: 'Mfuko wa Papo' }, { id: 'LOANS', label: 'Mikopo Mikubwa' }]} />
      </View>
      <FormScrollView
        keyboardShouldPersistTaps="handled"
        className="flex-1 px-5 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={panel.loading && panel.data != null}
            onRefresh={() => { void panel.reload(); if (activeTab === 'LOANS') void queue.reload(); }}
          />
        }
      >
        <View>
          <TabDataNotice loading={panel.loading} error={panel.error} hasData={panel.data != null} retry={panel.reload} />
          {panel.data != null && <>
          {activeTab === 'PAPO' ? (
            <>
              {papo.data && (papo.data.hasPapo || !!papo.data.fundingQueue?.length) && (
                <FundingQueuePanel key={scope + 'papo-funding'} rows={papo.data.fundingQueue ?? []} leader={isLeader} kind="PAPO" reload={papo.reload} />
              )}
              {!papoData?.hasPapo ? (
                <View className={`p-6 rounded-2xl items-center border ${cardClass}`}>
                  <Ionicons name="information-circle-outline" size={36} color="#64748b" />
                  <Text className={`font-bold mt-2 ${textMain}`}>Papo Haijawashwa</Text>
                  <Text className={`text-xs text-center mt-1 ${textSub}`}>
                    Mwenyekiti anaweza kuwasha mfumo wa Papo kwenye Ofisi & Sheria.
                  </Text>
                </View>
              ) : (
                <>
                  <View className={`p-5 rounded-2xl border shadow-sm mb-4 ${cardClass}`}>
                    <View className="flex-row justify-between items-center mb-2">
                      <Text className={`text-xs font-bold uppercase ${textSub}`}>Muhtasari Wako wa Papo</Text>
                      <View className="bg-teal-600/15 px-2.5 py-1 rounded-full">
                        <Text className="text-[10px] font-extrabold text-teal-700">
                          Riba: {Number(papoData?.papoMeetingInterestRate || 0)}% / Kikao
                        </Text>
                      </View>
                    </View>

                    <View className="flex-row justify-between mt-2 pb-2.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Papo ya Lazima:</Text>
                      <Text className={`font-bold text-xs ${textMain}`}>
                        TZS {Number(papoData?.mandatoryBalance || 0).toLocaleString()}
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-2.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Papo za Hiari (Active):</Text>
                      <Text className="font-bold text-amber-600 text-xs">
                        TZS {Number(papoData?.activeTopUpPrincipal || 0).toLocaleString()}
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-2.5 border-b border-slate-200/20">
                      <Text className={`font-bold text-xs ${textMain}`}>Jumla Kuu ya Mtaji wa Papo:</Text>
                      <Text className="font-extrabold text-teal-600 text-sm">
                        TZS {Number(papoData?.combinedPapoCapital || 0).toLocaleString()}
                      </Text>
                    </View>
                    <View className="flex-row justify-between pt-2.5">
                      <Text className={`font-bold text-xs ${textMain}`}>Riba ya Kikao Kijacho:</Text>
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
                          <DeclineRequest path={'/papo/decline/' + rt.id + '/repayment'} reload={papo.reload} />
                        </View>
                      ))}
                    </View>
                  )}

                  {topUps.some((t: any) => t.status !== 'PENDING') && (
                    <>
                      <Text className={`font-bold text-xs uppercase mb-2 ${textSub}`}>
                        Papo Zako za Hiari
                      </Text>
                      {topUps.filter((t: any) => t.status !== 'PENDING').map((t: any) => (
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
                            {t.feedback ? <Text className={textMain}>Mrejesho: {t.feedback}</Text> : null}
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
              <FundingQueuePanel key={scope + 'loan-funding'} rows={loans.data?.fundingQueue ?? []} leader={isLeader} kind="LOANS" reload={loans.reload} />
              <LoanQueuePanel key={scope} data={queue.data} userId={user?.id} chair={role === 'CHAIRPERSON'} reload={queue.reload} error={queue.error} />
              <View className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-lg mb-4">
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-slate-400 text-xs font-bold uppercase">Ukomo Wako wa Mkopo</Text>
                  <View className="bg-emerald-500/20 px-2.5 py-1 rounded-full">
                    <Text className="text-[11px] font-extrabold text-emerald-400">
                      Faida Yako: TZS {Number(loansData?.myInterestProfit || 0).toLocaleString()}
                    </Text>
                  </View>
                </View>

                <Text className="text-3xl font-extrabold text-white mt-1">
                  TZS {effectiveMaxLoan.toLocaleString()}
                </Text>

                <View className="flex-row justify-between mt-3 pt-3 border-t border-slate-800">
                  <Text className="text-slate-400 text-[11px]">
                    Riba: <Text className="text-teal-300 font-bold">{interestRatePct}% / Mwezi</Text>
                  </Text>
                  <Text className="text-slate-400 text-[11px]">
                    Muda wa Juu: <Text className="text-teal-300 font-bold">Miezi {fixedMonths}</Text>
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => setShowLoanModal(true)}
                  disabled={effectiveMaxLoan <= 0 || !canApply}
                  className={`p-3.5 rounded-xl items-center mt-4 flex-row justify-center gap-2 ${
                    effectiveMaxLoan <= 0 || !canApply ? 'bg-slate-700' : 'bg-teal-600'
                  }`}
                >
                  <Ionicons name="cash-outline" size={20} color="#fff" />
                  <Text className="text-white font-bold text-sm">
                    {effectiveMaxLoan <= 0 ? 'Ongeza Hisa Ili Kukopa' : canApply ? 'Omba Mkopo Mkubwa' : 'Subiri zamu yako ya mkopo'}
                  </Text>
                </TouchableOpacity>
              </View>

              {loans.data?.guarantorRepaidNotices?.map(item => (
                <View key={item.id} className="mb-3 rounded-xl bg-teal-50 p-3">
                  <Text className="text-teal-900">{item.name} amekamilisha mkopo ulioudhamini.</Text>
                  <TouchableOpacity className="mt-2 self-start rounded-lg bg-teal-700 px-3 py-2" onPress={async () => {
                    try { await apiClient.post('/loans/dismiss-guarantor-notice/' + item.id); await loans.reload(); }
                    catch { Alert.alert('Hitilafu', 'Imeshindikana kusasisha taarifa za udhamini.'); }
                  }}><Text className="font-bold text-white">Nimesoma</Text></TouchableOpacity>
                </View>
              ))}
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
                {isLeader ? 'Orodha ya Mikopo ya Kikundi' : 'Mikopo Yangu'} ({activeLoansList.length})
              </Text>

              {activeLoansList.length === 0 ? (
                <View className={`p-6 rounded-2xl border items-center mb-4 ${cardClass}`}>
                  <Ionicons name="checkmark-done-circle-outline" size={34} color="#0f766e" />
                  <Text className={`font-bold text-sm mt-2 ${textMain}`}>Hakuna Mkopo Unaoendelea</Text>
                  <Text className={`text-xs text-center mt-1 ${textSub}`}>
                    Maombi na mrejesho wako utaonekana hapa.
                  </Text>
                </View>
              ) : (
                activeLoansList.map((l: any) => {
                  const totalMonths = Math.max(1, Number(l.repaymentMonths || 1));
                  const principal = Number(l.principalAmount || 0);
                  const totalRepayable = Number(l.totalRepayable || 0);
                  const paid = Number(l.amountPaid || 0);
                  const remaining = l.repaymentQuote?.dueBalance ?? Math.max(0, totalRepayable - paid);
                  const progressPct = l.repaymentPlan && principal > 0 ? Math.min(100, Math.round(l.repaymentPlan.principalPaid / principal * 100)) : totalRepayable > 0 ? Math.min(100, Math.round((paid / totalRepayable) * 100)) : 0;

                  const totalInt = Math.max(0, totalRepayable - principal);
                  const monthlyInt = Math.round(totalInt / totalMonths);
                  const monthsPaidCount = monthlyInt > 0 ? Math.min(totalMonths - 1, Math.floor(paid / monthlyInt)) : 0;
                  const nextMonth = l.nextInterestInstallment?.number ?? monthsPaidCount + 1;
                  const nextInterest = Number(l.nextInterestInstallment?.amount ?? monthlyInt);
                  const hasNextInterest = l.nextInterestInstallment !== null && nextInterest > 0;
                  const isFinalMonth = nextMonth >= totalMonths;

                  const statuses: Record<string, string> = { PENDING: 'Inasubiri idhini', DISBURSED: 'Imetolewa', OVERDUE: 'Imechelewa', REPAYMENT_PENDING: 'Inasubiri uhakiki', PAID: 'Imelipwa', REJECTED: 'Imekataliwa' };
                  return (
                    <View key={l.id} className={`p-4 rounded-2xl mb-3 border ${cardClass}`}>
                      <View className="flex-row justify-between items-start">
                        <View className="flex-1 pr-2">
                          <Text className={`font-bold ${textMain}`}>{l.user?.fullName}</Text>
                          <Text className={`text-xs ${textSub}`}>
                            Mdhamini: {l.guarantor?.fullName || 'Hakuna'} ({l.guarantorStatus})
                          </Text>
                        </View>
                        <View
                          className={`px-2.5 py-1 rounded-lg ${
                            l.status === 'OVERDUE' ? 'bg-rose-100' : 'bg-slate-200/80'
                          }`}
                        >
                          <Text
                            className={`text-xs font-bold ${
                              l.status === 'OVERDUE' ? 'text-rose-700' : 'text-slate-800'
                            }`}
                          >
                            {statuses[l.status] ?? l.status}
                          </Text>
                        </View>
                      </View>

                      {l.feedback ? <Text className={textMain}>Mrejesho: {l.feedback}</Text> : null}
                      {l.repaymentQuote && <LoanPaymentPanel id={l.id} quote={l.repaymentQuote} latest={l.repaymentPlan?.latest ?? null}
                        history={l.repaymentPlan?.history ?? []} mine={l.userId === user?.id} chair={role === 'CHAIRPERSON'} status={l.status} reload={loans.reload} />}
                      <View className="flex-row justify-between mt-3 pt-2 border-t border-slate-200/20">
                        <Text className={`text-xs ${textSub}`}>
                          Mkopo: <Text className={`font-bold ${textMain}`}>TZS {principal.toLocaleString()}</Text>
                        </Text>
                        <Text className={`text-xs ${textSub}`}>
                          Baki: <Text className="font-bold text-teal-600">TZS {remaining.toLocaleString()}</Text>
                        </Text>
                      </View>

                      <View className="mt-2.5">
                        <View className="flex-row justify-between mb-1">
                          <Text className={`text-[10px] ${textSub}`}>Maendeleo ya Malipo</Text>
                          <Text className="text-[10px] font-bold text-teal-600">{progressPct}% Imelipwa</Text>
                        </View>
                        <View className="h-1.5 bg-slate-200/60 rounded-full overflow-hidden">
                          <View style={{ width: `${progressPct}%` }} className="h-full bg-teal-600 rounded-full" />
                        </View>
                      </View>

                      {!l.repaymentPlan && (l.status === 'DISBURSED' || l.status === 'OVERDUE' || l.status === 'REPAYMENT_PENDING') && (
                        <View className="mt-2.5 pt-2 border-t border-slate-200/20">
                          <Text className={`text-[11px] font-bold ${textSub}`}>
                            Mwezi wa {nextMonth}/{totalMonths}:{' '}
                            <Text className="text-teal-600">
                              {isFinalMonth
                                ? `Riba (TZS ${monthlyInt.toLocaleString()}) + Mtaji (TZS ${principal.toLocaleString()})`
                                : `Riba Pekee (TZS ${monthlyInt.toLocaleString()})`}
                            </Text>
                          </Text>
                        </View>
                      )}

                      {!l.repaymentPlan && isLeader && hasNextInterest && !isFinalMonth && (l.status === 'DISBURSED' || l.status === 'OVERDUE') && (
                        <TouchableOpacity
                          onPress={async () => {
                            try {
                              const r = await apiClient.post(`/loans/pay-monthly-interest/${l.id}`, { expectedAmountPaid: l.amountPaid });
                              Alert.alert('Imelipwa', r.data?.message);
                              void loans.reload();
                            } catch (e: any) {
                              Alert.alert('Hitilafu', e.response?.data?.error || 'Imeshindikana.');
                            }
                          }}
                          className="bg-amber-600 py-2.5 rounded-xl items-center mt-2.5"
                        >
                          <Text className="text-white font-bold text-xs">
                            Thibitisha Riba Mwezi wa {nextMonth} (TZS {nextInterest.toLocaleString()})
                          </Text>
                        </TouchableOpacity>
                      )}

                      {!l.repaymentPlan && l.userId === user?.id && (l.status === 'DISBURSED' || l.status === 'OVERDUE') && (
                        <TouchableOpacity
                          onPress={() => handleRequestRepayLoan(l.id)}
                          className="bg-indigo-600 py-2.5 rounded-xl items-center mt-2.5"
                        >
                          <Text className="text-white font-bold text-xs">Omba Kurejesha Mkopo Wote</Text>
                        </TouchableOpacity>
                      )}

                      {!l.repaymentPlan && isLeader && l.status === 'REPAYMENT_PENDING' && (
                        <TouchableOpacity
                          onPress={() => handleConfirmRepayLoan(l.id)}
                          className="bg-emerald-700 py-2.5 rounded-xl items-center mt-2.5"
                        >
                          <Text className="text-white font-bold text-xs">Thibitisha Marejesho Kamili & Futa Deni</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </>
          )}
          {activeTab === 'LOANS' && (
            <View className="mb-4">
              <Text className={'mb-2 font-bold ' + textMain}>Historia ya Riba Iliyolipwa</Text>
              {!loans.data?.interestPayments?.length && (
                <Text className={'mb-2 text-sm ' + textSub}>Hakuna rekodi za malipo ya riba zilizoletwa.</Text>
              )}
              {loans.data?.interestPayments?.map(payment => {
                const timely = payment.timing === 'ON_TIME';
                const late = payment.timing === 'LATE';
                const label = timely ? 'Imelipwa kwa wakati' : late ? 'Imechelewa' : 'Wakati haujathibitishwa';
                return (
                  <View key={payment.id} className={'mb-2 rounded-xl border p-3 ' + cardClass}>
                    <View className="flex-row flex-wrap items-center justify-between gap-2">
                      <Text className={'font-bold ' + textMain}>TZS {payment.amount.toLocaleString()}</Text>
                      <Text className={'rounded-md px-2 py-1 text-xs font-bold ' + (timely ? 'bg-emerald-100 text-emerald-900' : late ? 'bg-rose-100 text-rose-900' : 'bg-slate-200 text-slate-700')}>{label}</Text>
                    </View>
                    {isLeader && <Text className={'mt-1 text-xs ' + textSub}>{payment.fullName}</Text>}
                    <Text className={'mt-1 text-xs ' + textSub}>Imelipwa {new Date(payment.paidAt).toLocaleString('sw-TZ')}</Text>
                    {payment.dueAt && <Text className={'text-xs ' + textSub}>Mwisho wa awamu {new Date(payment.dueAt).toLocaleString('sw-TZ')}</Text>}
                  </View>
                );
              })}
            </View>
          )}
          <View className="h-10" />
          </>}
        </View>
      </FormScrollView>
      {showTopUpModal && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'flex-end',
            zIndex: 999 }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              backgroundColor: '#ffffff',
              maxHeight: '100%',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Math.max(insets.bottom + 16, 24) }}
          >
            <FormScrollView keyboardShouldPersistTaps="handled">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-bold text-slate-900">Omba Papo ya Hiari</Text>
              <TouchableOpacity onPress={() => setShowTopUpModal(false)}>
                <Ionicons name="close-circle" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-xs text-slate-500 mb-2">
              Kiwango: TZS {minTopUp.toLocaleString()} - Baki Ukomo: TZS {remainingTopUpCap.toLocaleString()}
            </Text>

            {remainingTopUpCap > 0 && (
              <View className="flex-row gap-2 mb-2.5">
                <TouchableOpacity
                  onPress={() => setTopUpAmount(String(Math.floor(remainingTopUpCap / 2)))}
                  className="bg-teal-600/15 px-3 py-1.5 rounded-lg"
                >
                  <Text className="text-[11px] font-bold text-teal-800">50% (TZS {Math.floor(remainingTopUpCap / 2).toLocaleString()})</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setTopUpAmount(String(remainingTopUpCap))}
                  className="bg-teal-600/15 px-3 py-1.5 rounded-lg"
                >
                  <Text className="text-[11px] font-bold text-teal-800">Max (TZS {remainingTopUpCap.toLocaleString()})</Text>
                </TouchableOpacity>
              </View>
            )}

            <FormTextInput
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

            {numericTopUp > 0 && (
              <View className="bg-amber-50 p-3 rounded-xl border border-amber-200 mb-3">
                <Text className="text-xs text-amber-900">
                  Riba ya Kikao ({papoData?.papoMeetingInterestRate || 0}%):{' '}
                  <Text className="font-bold">TZS {topUpEstimatedInterest.toLocaleString()}</Text> / Kikao
                </Text>
              </View>
            )}

            <Text className="text-xs font-bold text-slate-500 mb-1">
              Muda wa Kurejesha (Sheria ya Kikoba - Imefungwa) 🔒
            </Text>
            <FormTextInput
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
            </FormScrollView>
          </KeyboardAvoidingView>
        </View>
      )}
      {showLoanModal && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'flex-end',
            zIndex: 999 }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{
              backgroundColor: '#ffffff',
              maxHeight: '95%',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: Math.max(insets.bottom + 16, 24) }}
          >
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-bold text-slate-900">Omba Mkopo Mkubwa</Text>
              <TouchableOpacity onPress={() => setShowLoanModal(false)}>
                <Ionicons name="close-circle" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>

            <FormScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text className="text-xs font-bold text-slate-700 mb-1.5">
                Kiasi cha Mkopo (Ukomo: TZS {effectiveMaxLoan.toLocaleString()})
              </Text>

              {effectiveMaxLoan > 0 && (
                <View className="flex-row gap-2 mb-2.5">
                  <TouchableOpacity
                    onPress={() => setLoanAmount(String(Math.floor(effectiveMaxLoan / 2)))}
                    className="bg-teal-600/15 px-3 py-1.5 rounded-lg"
                  >
                    <Text className="text-[11px] font-bold text-teal-800">
                      Nusu (TZS {Math.floor(effectiveMaxLoan / 2).toLocaleString()})
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setLoanAmount(String(effectiveMaxLoan))}
                    className="bg-teal-600/15 px-3 py-1.5 rounded-lg"
                  >
                    <Text className="text-[11px] font-bold text-teal-800">
                      Ukomo Wote (TZS {effectiveMaxLoan.toLocaleString()})
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <FormTextInput
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
              <FormTextInput
                editable={false}
                className="bg-slate-200/80 border border-slate-300 rounded-xl p-3.5 mb-3 text-base font-bold text-slate-600"
                value={`Miezi ${fixedMonths}`}
              />

              <View className="bg-teal-50 p-3.5 rounded-xl border border-teal-200 mb-4">
                <Text className="text-xs text-teal-900">
                  Riba ya kwanza ({interestRatePct}%): <Text className="font-bold">TZS {monthlyLoanInterest.toLocaleString()}</Text>
                </Text>
                <Text className="text-xs text-teal-900 mt-1">
                  Riba ya pili ni 10% ya mtaji uliobaki. Ni hiari kabla ya tarehe ya pili, na lazima tarehe hiyo ikifika.
                </Text>
                <Text className="text-xs text-teal-950 mt-1 pt-1 border-t border-teal-200">
                  Mtaji na riba ya kwanza: <Text className="font-extrabold">TZS {(numericLoan + monthlyLoanInterest).toLocaleString()}</Text>
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
                disabled={submitting || !canApply || numericLoan <= 0 || isLoanExceeding}
                className={`p-4 rounded-xl items-center mt-2 mb-4 ${
                  !canApply || isLoanExceeding || numericLoan <= 0 ? 'bg-slate-400' : 'bg-teal-700'
                }`}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">{canApply ? 'Tuma Ombi la Mkopo' : 'Subiri zamu yako'}</Text>}
              </TouchableOpacity>
            </FormScrollView>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
}
