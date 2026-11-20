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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function MikopoPapoScreen() {
  const { role } = useAuth();
  const isLeader = role === 'CHAIRPERSON' || role === 'SECRETARY' || role === 'TREASURER';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'PAPO' | 'LOANS'>('PAPO');

  const [papoData, setPapoData] = useState<any>(null);
  const [loansData, setLoansData] = useState<any>(null);

  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');

  const [showLoanModal, setShowLoanModal] = useState(false);
  const [loanAmount, setLoanAmount] = useState('');
  const [loanMonths, setLoanMonths] = useState('1');
  const [selectedGuarantorId, setSelectedGuarantorId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const loadAll = async () => {
    try {
      const [papoRes, loansRes] = await Promise.all([
        apiClient.get('/papo/status'),
        apiClient.get('/loans'),
      ]);
      setPapoData(papoRes.data || null);
      setLoansData(loansRes.data || null);
    } catch (error: any) {
      console.log('Hitilafu kupakia Mikopo & Papo:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [])
  );

  const handleRequestTopUp = async () => {
    const amt = Number(topUpAmount);
    if (!amt || amt <= 0) {
      return Alert.alert('Angalia Kiasi', 'Ingiza kiasi sahihi cha Papo ya hiari.');
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/papo/request-topup', { amount: amt });
      Alert.alert('Imefanikiwa', res.data?.message || 'Ombi limetumwa!');
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
      Alert.alert('Imeidhinishwa', res.data?.message || 'Papo ya hiari imeidhinishwa!');
      loadAll();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuidhinisha.');
    }
  };

  const handleApplyLoan = async () => {
    const amt = Number(loanAmount);
    const mths = Number(loanMonths) || 1;
    if (!amt || amt <= 0) {
      return Alert.alert('Angalia Kiasi', 'Ingiza kiasi sahihi cha mkopo.');
    }
    if (loansData?.requireGuarantor && !selectedGuarantorId) {
      return Alert.alert('Chagua Mdhamini', 'Lazima uchague mwanachama mdhamini kabla ya kuomba mkopo.');
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post('/loans/apply', {
        amount: amt,
        months: mths,
        guarantorId: selectedGuarantorId || null,
      });
      Alert.alert('Imefanikiwa', res.data?.message || 'Ombi la mkopo limetumwa!');
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

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-100">
        <ActivityIndicator size="large" color="#0f766e" />
        <Text className="text-slate-600 mt-3">Inapakia mikopo na Papo...</Text>
      </View>
    );
  }

  const allLoans = Array.isArray(loansData?.loans) ? loansData.loans : [];
  const guarantorRequests = Array.isArray(loansData?.guarantorRequests) ? loansData.guarantorRequests : [];
  const potentialGuarantors = Array.isArray(loansData?.potentialGuarantors) ? loansData.potentialGuarantors : [];
  const topUps = Array.isArray(papoData?.topUps) ? papoData.topUps : [];

  const calculatedLoanInterest = Math.round(
    ((Number(loanAmount) || 0) * Number(loansData?.interestRate || 10) * (Number(loanMonths) || 1)) / 100
  );

  return (
    <View className="flex-1 bg-slate-100">
      <View className="bg-teal-700 pt-14 pb-5 px-6 rounded-b-3xl">
        <Text className="text-2xl font-bold text-white">Mikopo & Papo</Text>
        <Text className="text-teal-100 text-xs mt-1">
          Dhibiti Papo ya lazima, Papo ya hiari na mikopo yenye wadhamini
        </Text>

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
              <View className="bg-white p-6 rounded-2xl items-center border border-slate-200">
                <Ionicons name="information-circle-outline" size={36} color="#64748b" />
                <Text className="text-slate-700 font-bold mt-2">Papo Haijawashwa</Text>
                <Text className="text-slate-500 text-xs text-center mt-1">
                  Kikoba hiki hakijaweka mfumo wa Papo kwenye mipangilio ya Mwenyekiti.
                </Text>
              </View>
            ) : (
              <>
                <View className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4">
                  <Text className="text-xs font-bold text-slate-500 uppercase">Muhtasari Wako wa Papo</Text>
                  <View className="flex-row justify-between mt-3 pb-3 border-b border-slate-100">
                    <Text className="text-slate-600 text-sm">Papo ya Lazima:</Text>
                    <Text className="font-bold text-slate-900">
                      TZS {Number(papoData?.mandatoryBalance || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-3 border-b border-slate-100">
                    <Text className="text-slate-600 text-sm">Papo ya Hiari (Active):</Text>
                    <Text className="font-bold text-amber-700">
                      TZS {Number(papoData?.activeTopUpPrincipal || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between py-3 border-b border-slate-100">
                    <Text className="text-slate-700 font-bold text-sm">Jumla Kuu ya Papo Yako:</Text>
                    <Text className="font-bold text-teal-800 text-base">
                      TZS {Number(papoData?.combinedPapoCapital || 0).toLocaleString()}
                    </Text>
                  </View>
                  <View className="flex-row justify-between pt-3">
                    <Text className="text-slate-700 font-bold text-sm">
                      Riba ya Kikao ({Number(papoData?.papoMeetingInterestRate || 0)}%):
                    </Text>
                    <Text className="font-bold text-rose-700 text-base">
                      TZS {Number(papoData?.combinedMeetingInterest || 0).toLocaleString()}
                    </Text>
                  </View>

                  {papoData?.allowTopUpPapo && (
                    <TouchableOpacity
                      onPress={() => setShowTopUpModal(true)}
                      className="bg-teal-700 p-3.5 rounded-xl items-center mt-4 flex-row justify-center gap-2"
                    >
                      <Ionicons name="add-circle-outline" size={20} color="#fff" />
                      <Text className="text-white font-bold text-sm">Omba Papo ya Hiari</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {topUps.length > 0 && (
                  <>
                    <Text className="font-bold text-slate-800 mb-2">Rekodi za Papo ya Hiari</Text>
                    {topUps.map((t: any) => (
                      <View key={t.id} className="bg-white p-4 rounded-2xl mb-3 border border-slate-200">
                        <View className="flex-row justify-between items-center">
                          <Text className="font-bold text-slate-900">
                            TZS {Number(t.principalAmount || 0).toLocaleString()}
                          </Text>
                          <View className="bg-amber-100 px-2.5 py-1 rounded-lg">
                            <Text className="text-xs font-bold text-amber-800">{t.status}</Text>
                          </View>
                        </View>
                        {t.dueDate && (
                          <Text className="text-xs text-slate-500 mt-1">
                            Mwisho wa kurejesha: {new Date(t.dueDate).toLocaleDateString('sw-TZ')}
                          </Text>
                        )}
                        {isLeader && t.status === 'PENDING' && (
                          <TouchableOpacity
                            onPress={() => handleApproveTopUp(t.id)}
                            className="bg-emerald-600 py-2 rounded-xl items-center mt-3"
                          >
                            <Text className="text-white font-bold text-xs">Idhinisha Papo ya Hiari</Text>
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
            <View className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-4">
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-xs font-bold text-slate-500 uppercase">Ukomo Wako wa Mkopo</Text>
                <Text className="text-xs font-bold text-emerald-700">
                  Faida Yako ya Riba: TZS {Number(loansData?.myInterestProfit || 0).toLocaleString()}
                </Text>
              </View>
              <Text className="text-2xl font-bold text-teal-800">
                TZS {Number(loansData?.effectiveMaxLoan || 0).toLocaleString()}
              </Text>
              <Text className="text-xs text-slate-500 mt-1">
                Thamani ya Hisa Zako: TZS {Number(loansData?.shareValueTotal || 0).toLocaleString()}
                {Number(loansData?.groupMaxCap || 0) > 0
                  ? ` • Kikomo cha Kikundi: TZS ${Number(loansData.groupMaxCap).toLocaleString()}`
                  : ''}
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
                  Maombi ya Udhamini Yanayokusubiri ({guarantorRequests.length})
                </Text>
                {guarantorRequests.map((reqLoan: any) => (
                  <View key={reqLoan.id} className="bg-white p-3.5 rounded-xl mb-2 border border-amber-200">
                    <Text className="font-bold text-slate-900">{reqLoan.user?.fullName}</Text>
                    <Text className="text-xs text-slate-600 mt-0.5">
                      Anaomba mkopo wa TZS {Number(reqLoan.principalAmount || 0).toLocaleString()} na amekuchagua kuwa mdhamini wake.
                    </Text>
                    <View className="flex-row gap-2 mt-3">
                      <TouchableOpacity
                        onPress={() => handleGuarantorRespond(reqLoan.id, 'ACCEPT')}
                        className="flex-1 bg-emerald-600 py-2 rounded-lg items-center"
                      >
                        <Text className="text-white font-bold text-xs">Kubali Udhamini</Text>
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

            <Text className="font-bold text-slate-800 mb-2">Orodha ya Mikopo ya Kikundi</Text>
            {allLoans.length === 0 ? (
              <View className="bg-white p-6 rounded-2xl items-center">
                <Text className="text-slate-500 text-xs">Hakuna maombi ya mikopo kwa sasa.</Text>
              </View>
            ) : (
              allLoans.map((l: any) => (
                <View key={l.id} className="bg-white p-4 rounded-2xl mb-3 border border-slate-200">
                  <View className="flex-row justify-between items-start">
                    <View>
                      <Text className="font-bold text-slate-900">{l.user?.fullName}</Text>
                      <Text className="text-xs text-slate-500">
                        Mdhamini: {l.guarantor?.fullName || 'Hakuna'} ({l.guarantorStatus})
                      </Text>
                    </View>
                    <View className="bg-slate-100 px-2.5 py-1 rounded-lg">
                      <Text className="text-xs font-bold text-slate-700">{l.status}</Text>
                    </View>
                  </View>

                  <View className="flex-row justify-between mt-3 pt-2 border-t border-slate-100">
                    <Text className="text-xs text-slate-600">
                      Mkopo: <Text className="font-bold text-slate-900">TZS {Number(l.principalAmount || 0).toLocaleString()}</Text>
                    </Text>
                    <Text className="text-xs text-slate-600">
                      Jumla + Riba: <Text className="font-bold text-teal-800">TZS {Number(l.totalRepayable || 0).toLocaleString()}</Text>
                    </Text>
                  </View>

                  {isLeader && l.status === 'PENDING' && (
                    <TouchableOpacity
                      onPress={() => handleApproveLoan(l.id)}
                      className="bg-teal-700 py-2.5 rounded-xl items-center mt-3"
                    >
                      <Text className="text-white font-bold text-xs">
                        Idhinisha Mkopo ({(l.approvals || []).length} kura)
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </>
        )}
        <View className="h-10" />
      </ScrollView>

      <Modal visible={showTopUpModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-900">Omba Papo ya Hiari</Text>
              <TouchableOpacity onPress={() => setShowTopUpModal(false)}>
                <Ionicons name="close-circle" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text className="text-xs text-slate-500 mb-2">
              Kiwango: TZS {Number(papoData?.minTopUpPapoCap || 0).toLocaleString()} - TZS{' '}
              {Number(papoData?.maxTopUpPapoCap || 0).toLocaleString()} (Muda: Majuma {papoData?.topUpPapoWeeks || 4})
            </Text>
            <TextInput
              className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 mb-4 text-base font-bold text-slate-900"
              placeholder="Weka kiasi (TZS)"
              keyboardType="numeric"
              value={topUpAmount}
              onChangeText={(t) => setTopUpAmount(t.replace(/[^0-9]/g, ''))}
            />
            <TouchableOpacity
              onPress={handleRequestTopUp}
              disabled={submitting}
              className="bg-teal-700 p-4 rounded-xl items-center"
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Tuma Ombi</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showLoanModal} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 max-h-[85%]">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-900">Omba Mkopo Mkubwa</Text>
              <TouchableOpacity onPress={() => setShowLoanModal(false)}>
                <Ionicons name="close-circle" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="text-xs font-bold text-slate-700 mb-1">
                Kiasi cha Mkopo (Ukomo: TZS {Number(loansData?.effectiveMaxLoan || 0).toLocaleString()})
              </Text>
              <TextInput
                className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 mb-3 text-base font-bold text-slate-900"
                placeholder="Weka kiasi cha mkopo"
                keyboardType="numeric"
                value={loanAmount}
                onChangeText={(t) => setLoanAmount(t.replace(/[^0-9]/g, ''))}
              />

              <Text className="text-xs font-bold text-slate-700 mb-1">
                Muda wa Kurejesha (Miezi - Ukomo: {loansData?.maxRepaymentMonths || 3})
              </Text>
              <TextInput
                className="bg-slate-50 border border-slate-300 rounded-xl p-3.5 mb-3 text-base font-bold text-slate-900"
                keyboardType="numeric"
                value={loanMonths}
                onChangeText={(t) => setLoanMonths(t.replace(/[^0-9]/g, ''))}
              />

              <View className="bg-teal-50 p-3.5 rounded-xl border border-teal-200 mb-4">
                <Text className="text-xs text-teal-900">
                  Riba Kiotomatiki ({loansData?.interestRate || 10}%):{' '}
                  <Text className="font-bold">TZS {calculatedLoanInterest.toLocaleString()}</Text>
                </Text>
                <Text className="text-xs text-teal-900 mt-1">
                  Jumla ya Kurejesha:{' '}
                  <Text className="font-bold">
                    TZS {((Number(loanAmount) || 0) + calculatedLoanInterest).toLocaleString()}
                  </Text>
                </Text>
              </View>

              {loansData?.requireGuarantor && (
                <>
                  <Text className="text-xs font-bold text-slate-700 mb-2">Chagua Mwanachama Mdhamini:</Text>
                  {potentialGuarantors.length === 0 ? (
                    <Text className="text-xs text-rose-600 mb-3">
                      Hakuna wanachama wengine bado. Ongeza wanachama kwanza kwenye tab ya Wanachama.
                    </Text>
                  ) : (
                    <View className="mb-4">
                      {potentialGuarantors.map((g: any) => (
                        <TouchableOpacity
                          key={g.id}
                          onPress={() => setSelectedGuarantorId(g.id)}
                          className={`p-3 rounded-xl mb-2 border flex-row justify-between items-center ${
                            selectedGuarantorId === g.id
                              ? 'bg-teal-50 border-teal-600'
                              : 'bg-slate-50 border-slate-200'
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
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity
                onPress={handleApplyLoan}
                disabled={submitting}
                className="bg-teal-700 p-4 rounded-xl items-center mb-4"
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold">Tuma Ombi la Mkopo</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
