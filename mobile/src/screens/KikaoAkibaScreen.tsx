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

const FINE_CATEGORIES = [
  { key: 'LATE', label: 'Kuchelewa Kikaoni', field: 'fineLate' },
  { key: 'ABSENT', label: 'Kutofika Kikaoni', field: 'fineAbsent' },
  { key: 'NO_SHARES', label: 'Kutonunua Hisa', field: 'fineNoShares' },
  { key: 'NO_SOCIAL_FUND', label: 'Kutonunua Jamii', field: 'fineNoSocialFund' },
  { key: 'NO_PAPO_INTEREST', label: 'Kutotoa Riba ya Papo', field: 'fineNoPapoInterest' },
  { key: 'LATE_TOPUP_PAPO', label: 'Kuchelewesha Papo ya Hiari', field: 'fineLateTopUpPapo' },
  { key: 'LATE_BIG_LOAN', label: 'Kuchelewesha Riba/Mkopo Mkubwa', field: 'fineLateBigLoan' },
  { key: 'DISCIPLINE', label: 'Utovu wa Nidhamu', field: 'fineDiscipline' },
  { key: 'OTHER', label: 'Faini Nyinginezo', field: null },
];

export default function KikaoAkibaScreen() {
  const { role } = useAuth();
  const isLeader = role === 'CHAIRPERSON' || role === 'SECRETARY' || role === 'TREASURER';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [groupRules, setGroupRules] = useState<any>(null);
  const [myFines, setMyFines] = useState<any[]>([]);

  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [sharesCount, setSharesCount] = useState('1');
  const [socialFundPaid, setSocialFundPaid] = useState('0');
  const [papoInterestPaid, setPapoInterestPaid] = useState('0');
  const [bigLoanRepayment, setBigLoanRepayment] = useState('0');
  const [selectedFineIds, setSelectedFineIds] = useState<string[]>([]);

  const [addNewFine, setAddNewFine] = useState(false);
  const [fineCategory, setFineCategory] = useState('LATE');
  const [fineReason, setFineReason] = useState('Kuchelewa Kikaoni');
  const [fineAmount, setFineAmount] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [sessionRes, finesRes] = await Promise.all([
        apiClient.get('/shares/session-members'),
        apiClient.get('/shares/my-fines'),
      ]);

      setMembers(Array.isArray(sessionRes.data?.members) ? sessionRes.data.members : []);
      setGroupRules(sessionRes.data?.group || null);
      setMyFines(Array.isArray(finesRes.data?.fines) ? finesRes.data.fines : []);
    } catch (error: any) {
      console.log('Hitilafu kupakia Kikao & Akiba:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const openMemberModal = (member: any) => {
    if (!isLeader) return;
    setSelectedMember(member);
    setSharesCount(String(groupRules?.minSharesPerMeeting || 1));
    setSocialFundPaid(String(groupRules?.socialFundMin || 0));
    setPapoInterestPaid(String(member?.expectedPapoInterest || 0));
    setBigLoanRepayment('0');
    setSelectedFineIds([]);
    setAddNewFine(false);
    setFineCategory('LATE');
    setFineReason('Kuchelewa Kikaoni');
    setFineAmount(String(groupRules?.fineLate || 1000));
  };

  const handleSelectFineCategory = (cat: any) => {
    setFineCategory(cat.key);
    setFineReason(cat.label);
    if (cat.field && groupRules && groupRules[cat.field] !== undefined) {
      setFineAmount(String(groupRules[cat.field]));
    } else {
      setFineAmount('1000');
    }
  };

  const togglePayFine = (fineId: string) => {
    setSelectedFineIds((prev) =>
      prev.includes(fineId) ? prev.filter((id) => id !== fineId) : [...prev, fineId]
    );
  };

  const handleSaveSessionRecord = async () => {
    if (!selectedMember) return;
    setSubmitting(true);
    try {
      const payload: any = {
        targetUserId: selectedMember.userId,
        sharesCount: Number(sharesCount) || 0,
        socialFundPaid: Number(socialFundPaid) || 0,
        papoInterestPaid: Number(papoInterestPaid) || 0,
        bigLoanRepayment: Number(bigLoanRepayment) || 0,
        paidFineIds: selectedFineIds,
      };

      if (addNewFine && Number(fineAmount) > 0) {
        payload.newFine = {
          category: fineCategory,
          reason: fineReason.trim() || 'Adhabu ya Kikao',
          amount: Number(fineAmount),
        };
      }

      const res = await apiClient.post('/shares/record-session', payload);
      Alert.alert('Imefanikiwa', res.data?.message || 'Michango imehifadhiwa!');
      setSelectedMember(null);
      loadData();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuhifadhi taarifa.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-100">
        <ActivityIndicator size="large" color="#0f766e" />
        <Text className="text-slate-600 mt-3">Inapakia daftari la kikao...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-100">
      <View className="bg-teal-700 pt-14 pb-6 px-6 rounded-b-3xl">
        <Text className="text-2xl font-bold text-white">Kikao & Akiba</Text>
        <Text className="text-teal-100 text-xs mt-1">
          {isLeader
            ? 'Gusa jina la mwanachama kurekodi hisa, jamii, riba ya Papo na faini'
            : 'Fuatilia michango yako na rekodi za faini za vikao'}
        </Text>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} />}
      >
        {(myFines || []).filter((f) => !f.isPaid).length > 0 && (
          <View className="bg-rose-50 border border-rose-200 p-4 rounded-2xl mb-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="warning" size={20} color="#be123c" />
              <Text className="font-bold text-rose-900">Madeni & Faini Zako Ambazo Hazijalipwa</Text>
            </View>
            {(myFines || [])
              .filter((f) => !f.isPaid)
              .map((fine) => (
                <View key={fine.id} className="bg-white p-3 rounded-xl mb-2 border border-rose-100 flex-row justify-between items-center">
                  <View className="flex-1 pr-2">
                    <Text className="font-bold text-slate-800 text-sm">{fine.reason}</Text>
                    <Text className="text-xs text-slate-500 mt-0.5">
                      Tarehe: {new Date(fine.createdAt).toLocaleDateString('sw-TZ')}
                    </Text>
                  </View>
                  <Text className="font-bold text-rose-700">TZS {Number(fine.amount || 0).toLocaleString()}</Text>
                </View>
              ))}
          </View>
        )}

        <Text className="text-base font-bold text-slate-800 mb-3">
          Daftari la Wanachama ({(members || []).length})
        </Text>

        {(members || []).length === 0 ? (
          <View className="bg-white p-6 rounded-2xl items-center">
            <Text className="text-slate-500 text-center">Hakuna taarifa za wanachama zilizopatikana kwa sasa.</Text>
          </View>
        ) : (
          (members || []).map((m) => (
            <TouchableOpacity
              key={m.userId}
              onPress={() => openMemberModal(m)}
              disabled={!isLeader}
              className="bg-white p-4 rounded-2xl mb-3 border border-slate-200 shadow-sm"
            >
              <View className="flex-row justify-between items-center">
                <View className="flex-1">
                  <Text className="font-bold text-slate-900 text-base">{m.fullName}</Text>
                  <Text className="text-xs text-slate-500">{m.phone}</Text>
                </View>
                {isLeader && (
                  <View className="bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-200 flex-row items-center gap-1">
                    <Ionicons name="create-outline" size={16} color="#0f766e" />
                    <Text className="text-teal-800 font-bold text-xs">Rekodi</Text>
                  </View>
                )}
              </View>

              <View className="flex-row flex-wrap gap-2 mt-3">
                {Number(m.expectedPapoInterest || 0) > 0 && (
                  <View className="bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    <Text className="text-xs text-amber-800 font-semibold">
                      Riba Papo: TZS {Number(m.expectedPapoInterest).toLocaleString()}
                    </Text>
                  </View>
                )}
                {Number(m.totalBigLoanBalance || 0) > 0 && (
                  <View className="bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                    <Text className="text-xs text-indigo-800 font-semibold">
                      Deni Mkopo: TZS {Number(m.totalBigLoanBalance).toLocaleString()}
                    </Text>
                  </View>
                )}
                {Number(m.totalUnpaidFines || 0) > 0 && (
                  <View className="bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
                    <Text className="text-xs text-rose-800 font-semibold">
                      Faini Nyuma: TZS {Number(m.totalUnpaidFines).toLocaleString()}
                    </Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
        <View className="h-10" />
      </ScrollView>

      <Modal visible={!!selectedMember} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6 max-h-[90%]">
            <View className="flex-row justify-between items-center mb-4 border-b border-slate-100 pb-3">
              <View>
                <Text className="text-lg font-bold text-slate-900">{selectedMember?.fullName}</Text>
                <Text className="text-xs text-slate-500">Rekodi michango ya kikao cha leo</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedMember(null)}>
                <Ionicons name="close-circle" size={28} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text className="text-xs font-bold text-slate-700 mb-1">
                Idadi ya Hisa (1 Hisa = TZS {Number(groupRules?.shareValue || 5000).toLocaleString()})
              </Text>
              <TextInput
                className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 text-slate-900 font-bold"
                keyboardType="numeric"
                value={sharesCount}
                onChangeText={(t) => setSharesCount(t.replace(/[^0-9]/g, ''))}
              />

              <Text className="text-xs font-bold text-slate-700 mb-1">Mfuko wa Jamii (TZS)</Text>
              <TextInput
                className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 text-slate-900 font-bold"
                keyboardType="numeric"
                value={socialFundPaid}
                onChangeText={(t) => setSocialFundPaid(t.replace(/[^0-9]/g, ''))}
              />

              {groupRules?.hasPapo && (
                <>
                  <Text className="text-xs font-bold text-slate-700 mb-1">
                    Riba ya Papo Iliyolipwa Leo (Inayotakiwa: TZS {Number(selectedMember?.expectedPapoInterest || 0).toLocaleString()})
                  </Text>
                  <TextInput
                    className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 text-slate-900 font-bold"
                    keyboardType="numeric"
                    value={papoInterestPaid}
                    onChangeText={(t) => setPapoInterestPaid(t.replace(/[^0-9]/g, ''))}
                  />
                </>
              )}

              {Number(selectedMember?.totalBigLoanBalance || 0) > 0 && (
                <>
                  <Text className="text-xs font-bold text-indigo-800 mb-1">
                    Rejesho la Mkopo Mkubwa (Deni: TZS {Number(selectedMember?.totalBigLoanBalance).toLocaleString()})
                  </Text>
                  <TextInput
                    className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-3 text-indigo-900 font-bold"
                    keyboardType="numeric"
                    value={bigLoanRepayment}
                    onChangeText={(t) => setBigLoanRepayment(t.replace(/[^0-9]/g, ''))}
                  />
                </>
              )}

              {(selectedMember?.unpaidFines || []).length > 0 && (
                <View className="mb-4">
                  <Text className="text-xs font-bold text-rose-800 mb-2">Gusa Faini ya Nyuma Anayolipa Leo:</Text>
                  {(selectedMember?.unpaidFines || []).map((fine: any) => {
                    const isChecked = selectedFineIds.includes(fine.id);
                    return (
                      <TouchableOpacity
                        key={fine.id}
                        onPress={() => togglePayFine(fine.id)}
                        className={`p-3 rounded-xl mb-2 border flex-row justify-between items-center ${
                          isChecked ? 'bg-emerald-50 border-emerald-400' : 'bg-rose-50 border-rose-200'
                        }`}
                      >
                        <View className="flex-1">
                          <Text className="font-bold text-slate-800 text-xs">{fine.reason}</Text>
                          <Text className="text-[11px] text-slate-500">
                            {new Date(fine.createdAt).toLocaleDateString('sw-TZ')}
                          </Text>
                        </View>
                        <Text className="font-bold text-xs mr-2">TZS {Number(fine.amount).toLocaleString()}</Text>
                        <Ionicons
                          name={isChecked ? 'checkbox' : 'square-outline'}
                          size={22}
                          color={isChecked ? '#059669' : '#be123c'}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <TouchableOpacity
                onPress={() => setAddNewFine(!addNewFine)}
                className="flex-row items-center gap-2 py-2.5 px-3 bg-amber-50 border border-amber-200 rounded-xl mb-3"
              >
                <Ionicons name={addNewFine ? 'checkbox' : 'square-outline'} size={20} color="#b45309" />
                <Text className="font-bold text-amber-900 text-xs">Andika Faini / Adhabu Mpya ya Leo (Kama amekosea)</Text>
              </TouchableOpacity>

              {addNewFine && (
                <View className="bg-slate-50 p-3 rounded-2xl border border-slate-200 mb-4">
                  <Text className="text-xs font-bold text-slate-700 mb-2">Chagua Aina ya Kosa:</Text>
                  <View className="flex-row flex-wrap gap-1.5 mb-3">
                    {FINE_CATEGORIES.map((cat) => (
                      <TouchableOpacity
                        key={cat.key}
                        onPress={() => handleSelectFineCategory(cat)}
                        className={`px-2.5 py-1.5 rounded-lg border ${
                          fineCategory === cat.key
                            ? 'bg-rose-700 border-rose-700'
                            : 'bg-white border-slate-300'
                        }`}
                      >
                        <Text
                          className={`text-[11px] font-semibold ${
                            fineCategory === cat.key ? 'text-white' : 'text-slate-700'
                          }`}
                        >
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text className="text-xs font-bold text-slate-700 mb-1">Maelezo ya Kosa</Text>
                  <TextInput
                    className="bg-white border border-slate-300 rounded-xl p-2.5 mb-2 text-slate-900 text-xs"
                    value={fineReason}
                    onChangeText={setFineReason}
                  />

                  <Text className="text-xs font-bold text-slate-700 mb-1">Kiasi cha Faini (TZS)</Text>
                  <TextInput
                    className="bg-white border border-slate-300 rounded-xl p-2.5 text-slate-900 font-bold text-xs"
                    keyboardType="numeric"
                    value={fineAmount}
                    onChangeText={(t) => setFineAmount(t.replace(/[^0-9]/g, ''))}
                  />
                </View>
              )}

              <TouchableOpacity
                onPress={handleSaveSessionRecord}
                disabled={submitting}
                className="bg-teal-700 p-4 rounded-xl items-center mb-6"
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text className="text-white font-bold text-base">Hifadhi Taarifa za Kikao</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
