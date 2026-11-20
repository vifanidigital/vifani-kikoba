import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

const DAY_NAMES_SW: Record<string, string> = {
  MONDAY: 'Jumatatu',
  TUESDAY: 'Jumanne',
  WEDNESDAY: 'Jumatano',
  THURSDAY: 'Alhamisi',
  FRIDAY: 'Ijumaa',
  SATURDAY: 'Jumamosi',
  SUNDAY: 'Jumapili',
};

export default function DashboardScreen() {
  const { user, group: activeGroup, role: activeRole, memberships, switchGroup } = useAuth();
  const isLeader =
    activeRole === 'CHAIRPERSON' || activeRole === 'SECRETARY' || activeRole === 'TREASURER';
  const isChair = activeRole === 'CHAIRPERSON';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetData, setSheetData] = useState<any>(null);

  const loadDashboard = async () => {
    try {
      const res = await apiClient.get('/papo/leader-meeting-sheet');
      setSheetData(res.data || null);
    } catch (error: any) {
      console.log('Hitilafu kuvuta Dashboard:', error?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadDashboard();
    }, [activeGroup?.id])
  );

  const handleApproveOverdueFine = async (loanId: string, memberName: string) => {
    try {
      const res = await apiClient.post(`/loans/approve-overdue-fine/${loanId}`);
      Alert.alert('Faini Imeidhinishwa', res.data?.message || `Faini kwa ${memberName} imethibitishwa.`);
      loadDashboard();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuidhinisha faini.');
    }
  };

  const getRoleTitle = (r?: string) => {
    if (r === 'CHAIRPERSON') return 'Mwenyekiti';
    if (r === 'SECRETARY') return 'Katibu';
    if (r === 'TREASURER') return 'Mweka Hazina';
    return 'Mwanachama';
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-100">
        <ActivityIndicator size="large" color="#0f766e" />
        <Text className="text-slate-600 mt-3">Inapakia muhtasari wa kikundi...</Text>
      </View>
    );
  }

  const summary = sheetData?.groupSummary || {};
  const schedule = sheetData?.meetingSchedule || {};
  const topUpDueList = Array.isArray(sheetData?.topUpDueTodayList) ? sheetData.topUpDueTodayList : [];
  const bigLoanDueList = Array.isArray(sheetData?.bigLoanInterestDueList) ? sheetData.bigLoanInterestDueList : [];
  const unpaidFinesList = Array.isArray(sheetData?.unpaidFinesMembersList) ? sheetData.unpaidFinesMembersList : [];

  return (
    <View className="flex-1 bg-slate-100">
      {/* Kichwa cha Kikundi & Mhusika */}
      <View className="bg-teal-700 pt-14 pb-7 px-6 rounded-b-3xl shadow-md">
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-2">
            <Text className="text-teal-200 text-xs uppercase font-bold tracking-wider">Kikoba Chako</Text>
            <Text className="text-2xl font-bold text-white mt-0.5">{activeGroup?.name || 'Vifani Kikoba'}</Text>
          </View>
          {Array.isArray(memberships) && memberships.length > 1 && (
            <TouchableOpacity
              onPress={() => {
                const next = memberships.find((m: any) => m.groupId !== activeGroup?.id);
                if (next && switchGroup) switchGroup(next.groupId);
              }}
              className="bg-teal-800 px-3 py-2 rounded-xl border border-teal-500 flex-row items-center gap-1"
            >
              <Ionicons name="swap-horizontal" size={16} color="#fff" />
              <Text className="text-white text-xs font-bold">Badili</Text>
            </TouchableOpacity>
          )}
        </View>

        <View className="flex-row items-center justify-between mt-4 bg-teal-800/60 p-3 rounded-2xl">
          <View>
            <Text className="text-white font-bold text-base">{user?.fullName}</Text>
            <Text className="text-teal-200 text-xs">{user?.phone}</Text>
          </View>
          <View className="bg-amber-400 px-3 py-1 rounded-full">
            <Text className="text-slate-900 font-bold text-xs">{getRoleTitle(activeRole || undefined)}</Text>

          </View>
        </View>
      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadDashboard();
            }}
          />
        }
      >
        {/* Ratiba ya Kikao Kijacho */}
        <View className="bg-white p-4 rounded-2xl border border-slate-200 mb-4 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3 flex-1">
            <View className="bg-teal-50 p-2.5 rounded-xl">
              <Ionicons name="calendar" size={22} color="#0f766e" />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold text-slate-500 uppercase">Ratiba ya Kikao Kijacho</Text>
              <Text className="font-bold text-slate-900 text-sm mt-0.5">
                {DAY_NAMES_SW[schedule.meetingDay] || 'Alhamisi'} • Saa {schedule.meetingTime || '16:00'}
              </Text>
              {schedule.nextMeetingDate && (
                <Text className="text-xs text-teal-700 font-semibold">
                  Tarehe: {new Date(schedule.nextMeetingDate).toLocaleDateString('sw-TZ')} ({schedule.meetingVenue})
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* MUHTASARI MKUU WA KIKUNDI (Kwa Mwenyekiti na Viongozi) */}
        <Text className="text-sm font-bold text-slate-800 mb-2">Muhtasari wa Fedha za Kikundi</Text>
        <View className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm mb-5">
          <View className="flex-row justify-between py-2 border-b border-slate-100">
            <Text className="text-slate-600 text-xs">Jumla ya Hisa ({Number(summary.totalSharesCount || 0)} hisa):</Text>
            <Text className="font-bold text-slate-900 text-xs">
              TZS {Number(summary.totalSharesValue || 0).toLocaleString()}
            </Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-slate-100">
            <Text className="text-slate-600 text-xs">Mfuko wa Jamii:</Text>
            <Text className="font-bold text-slate-900 text-xs">
              TZS {Number(summary.totalSocialFund || 0).toLocaleString()}
            </Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-slate-100">
            <Text className="text-slate-600 text-xs">Mfuko wa Papo (Mtaji):</Text>
            <Text className="font-bold text-slate-900 text-xs">
              TZS {Number(summary.totalPapoMandatory || 0).toLocaleString()}
            </Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-slate-100">
            <Text className="text-slate-600 text-xs">Mikopo Mikubwa Iliyotolewa (Deni Nje):</Text>
            <Text className="font-bold text-indigo-800 text-xs">
              TZS {Number(summary.totalLoansIssued || 0).toLocaleString()} (Deni: TZS{' '}
              {Number(summary.totalLoansOutstanding || 0).toLocaleString()})
            </Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-slate-100">
            <Text className="text-slate-600 text-xs">Faini Zilizolipwa:</Text>
            <Text className="font-bold text-emerald-700 text-xs">
              TZS {Number(summary.totalFinesPaid || 0).toLocaleString()}
            </Text>
          </View>
          <View className="flex-row justify-between pt-2">
            <Text className="text-slate-700 font-bold text-xs">Faini Ambazo Hazijalipwa:</Text>
            <Text className="font-bold text-rose-700 text-xs">
              TZS {Number(summary.totalFinesUnpaid || 0).toLocaleString()}
            </Text>
          </View>
        </View>

        {/* ORODHA YA KIKAO CHA LEO KWA VIPENGELE (Kwa Mwenyekiti na Viongozi) */}
        {isLeader && (
          <>
            {/* Kipengele 1: Wanaotakiwa kurejesha Papo ya Hiari */}
            <Text className="text-sm font-bold text-slate-800 mb-2">
              1. Wanaorejesha Papo ya Hiari Siku ya Kikao ({topUpDueList.length})
            </Text>
            {topUpDueList.length === 0 ? (
              <View className="bg-white p-3.5 rounded-2xl border border-slate-200 mb-4">
                <Text className="text-xs text-slate-500">Hakuna mwenye rejesho la Papo ya hiari kikao hiki.</Text>
              </View>
            ) : (
              topUpDueList.map((item: any) => (
                <View key={item.id} className="bg-white p-3.5 rounded-2xl border border-amber-200 mb-2.5">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-bold text-slate-900">{item.fullName}</Text>
                    <Text className="font-bold text-amber-800">
                      TZS {Number(item.amountDue || 0).toLocaleString()}
                    </Text>
                  </View>
                  <Text className="text-xs text-slate-500 mt-0.5">
                    Tarehe ya kikao: {new Date(item.dueDate).toLocaleDateString('sw-TZ')}{' '}
                    {item.isOverdue ? '• IMEPITILIZA MUDA' : ''}
                  </Text>
                </View>
              ))
            )}

            {/* Kipengele 2: Wanaotakiwa kurejesha Riba ya Mkopo Mkubwa */}
            <Text className="text-sm font-bold text-slate-800 mt-2 mb-2">
              2. Wanaorejesha Riba ya Mikopo Mikubwa ({bigLoanDueList.length})
            </Text>
            {bigLoanDueList.length === 0 ? (
              <View className="bg-white p-3.5 rounded-2xl border border-slate-200 mb-4">
                <Text className="text-xs text-slate-500">Hakuna mwenye riba ya mkopo mkubwa kikao hiki.</Text>
              </View>
            ) : (
              bigLoanDueList.map((item: any) => (
                <View key={item.loanId} className="bg-white p-3.5 rounded-2xl border border-indigo-200 mb-2.5">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-bold text-slate-900">{item.fullName}</Text>
                    <Text className="font-bold text-indigo-800">
                      Riba: TZS {Number(item.monthlyInterest || 0).toLocaleString()}
                    </Text>
                  </View>
                  <Text className="text-xs text-slate-500 mt-0.5">
                    Mkopo: TZS {Number(item.principalAmount || 0).toLocaleString()} • Siku ya Kikao:{' '}
                    {new Date(item.dueDate).toLocaleDateString('sw-TZ')}
                  </Text>
                  {isChair && item.isOverdue && (
                    <TouchableOpacity
                      onPress={() => handleApproveOverdueFine(item.loanId, item.fullName)}
                      className="bg-rose-700 py-2 rounded-xl items-center mt-2.5"
                    >
                      <Text className="text-white font-bold text-xs">
                        Idhinisha Faini ya Kuchelewesha Riba (Mwenyekiti)
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {/* Kipengele 3: Wenye Faini Ambazo Hazijalipwa (Mwishoni mpaka walipe) */}
            <Text className="text-sm font-bold text-rose-800 mt-2 mb-2">
              3. Wenye Faini Ambazo Hazijalipwa ({unpaidFinesList.length})
            </Text>
            {unpaidFinesList.length === 0 ? (
              <View className="bg-white p-3.5 rounded-2xl border border-slate-200 mb-6">
                <Text className="text-xs text-slate-500">Hakuna mwanachama mwenye deni la faini kwa sasa.</Text>
              </View>
            ) : (
              unpaidFinesList.map((item: any) => (
                <View key={item.userId} className="bg-rose-50 p-3.5 rounded-2xl border border-rose-200 mb-2.5">
                  <View className="flex-row justify-between items-center">
                    <Text className="font-bold text-rose-950">{item.fullName}</Text>
                    <Text className="font-bold text-rose-700">
                      TZS {Number(item.totalUnpaid || 0).toLocaleString()}
                    </Text>
                  </View>
                  {(item.reasons || []).map((r: string, idx: number) => (
                    <Text key={idx} className="text-xs text-rose-800 mt-0.5">
                      • {r}
                    </Text>
                  ))}
                </View>
              ))
            )}
          </>
        )}

        <View className="h-10" />
      </ScrollView>
    </View>
  );
}
