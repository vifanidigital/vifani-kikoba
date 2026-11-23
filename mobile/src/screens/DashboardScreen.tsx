import { useUserPreference } from '../utils/useUserPreference';
import { router, useFocusEffect } from 'expo-router';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Animated,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getCachedData, setCachedData } from '../utils/cache';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user, group: activeGroup, role: activeRole } = useAuth();
  const { isDark } = useTheme();

  const isLeader = activeRole === 'CHAIRPERSON' || activeRole === 'SECRETARY' || activeRole === 'TREASURER';

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const requestVersion = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [groupSettings, setGroupSettings] = useState<any>(null);

  const [hideBalances, setHideBalances] = useUserPreference(user?.id, 'hide_balances', false);
  const [showMeetingReminder] = useUserPreference(user?.id, 'meeting_alerts', true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showTodaySummary, setShowTodaySummary] = useState(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const [announcementDismissed, setAnnouncementDismissed] = useState<boolean>(true);
  const [expiredAnnouncement, setExpiredAnnouncement] = useState<string | null>(null);
  const announcementRevision = groupSettings?.announcementUpdatedAt ?? announcement;
  const announcementDeadline = groupSettings?.announcementExpiresAt;

  useEffect(() => {
    if (!announcement || !announcementDeadline) return;
    let timer: ReturnType<typeof setTimeout>;
    const expire = () => {
      const remaining = new Date(announcementDeadline).getTime() - Date.now();
      if (!Number.isFinite(remaining)) return;
      if (remaining <= 0) setExpiredAnnouncement(announcementRevision);
      else timer = setTimeout(expire, Math.min(remaining, 2_147_000_000));
    };
    timer = setTimeout(expire, 0);
    return () => clearTimeout(timer);
  }, [announcement, announcementDeadline, announcementRevision]);

  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(18));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const formatMoney = (amount: number | string | undefined) => {
    if (hideBalances) return 'TZS ••••••';
    return `TZS ${Number(amount || 0).toLocaleString()}`;
  };
  const meetingDay = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'][groupSettings?.meetingDayOfWeek];
  const groupId = activeGroup?.id;
  const userId = user?.id;
  const loadDashboard = useCallback(async () => {
    const version = ++requestVersion.current;
    setSyncing(true);
    setSyncError(false);
    const gId = groupId || 'default';
    const cacheKey = `dashboard_${gId}_${userId || 'u'}`;

    const cached = await getCachedData<any>(cacheKey);
    if (version !== requestVersion.current) return;
    if (cached) {
      if (cached.summary) setSummary(cached.summary);
      if (cached.feed) setFeed(cached.feed);
      if (cached.groupSettings) setGroupSettings(cached.groupSettings);
      if (cached.announcement !== undefined) setAnnouncement(cached.announcement);
    }

    try {
      const [sumRes, feedRes, setRes] = await Promise.all([
        apiClient.get('/shares/summary'),
        apiClient.get('/loans/dashboard-feed'),
        apiClient.get('/group/settings'),
      ]);
      if (version !== requestVersion.current) return;

      const freshSummary = sumRes.data || {};
      const freshFeed = feedRes.data || {};
      const freshGroup = setRes.data?.group || null;
      const latestAnn = String(freshGroup?.announcement || '').trim();
      const revision = freshGroup?.announcementUpdatedAt ?? latestAnn;

      setSummary(freshSummary);
      setFeed(freshFeed);
      setGroupSettings(freshGroup);
      setAnnouncement(latestAnn);

      if (latestAnn && groupId && userId) {
        const storageKey = `dismissed_ann_${groupId}_${userId}`;
        const dismissedText = await AsyncStorage.getItem(storageKey);
        if (version !== requestVersion.current) return;
        setAnnouncementDismissed(dismissedText === revision);
      } else {
        setAnnouncementDismissed(true);
      }

      await setCachedData(cacheKey, {
        summary: freshSummary,
        feed: freshFeed,
        groupSettings: freshGroup,
        announcement: latestAnn,
      });
    } catch {
      if (version === requestVersion.current) setSyncError(true);
    } finally {
      if (version === requestVersion.current) {
        setSyncing(false);
        setRefreshing(false);
      }
    }
  }, [groupId, userId]);

  useFocusEffect(useCallback(() => {
    void loadDashboard();
  }, [loadDashboard]));

  const toggleBreakdown = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowBreakdown(!showBreakdown);
  };

  const toggleTodaySummary = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowTodaySummary(!showTodaySummary);
  };

  const handleDismissAnnouncement = async () => {
    if (activeGroup?.id && user?.id && announcement) {
      const storageKey = `dismissed_ann_${activeGroup.id}_${user.id}`;
      await AsyncStorage.setItem(storageKey, announcementRevision);
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setAnnouncementDismissed(true);
  };
  const handleGuarantorRespond = async (loanId: string, decision: 'ACCEPT' | 'REJECT') => {
    try {
      const res = await apiClient.post(`/loans/guarantor-respond/${loanId}`, { decision });
      Alert.alert('Taarifa', res.data?.message);
      loadDashboard();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kujibu udhamini.');
    }
  };

  const handleLeaderApprove = async (loanId: string) => {
    try {
      const res = await apiClient.post(`/loans/approve/${loanId}`);
      Alert.alert('Imeidhinishwa', res.data?.message);
      loadDashboard();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuidhinisha mkopo.');
    }
  };

  const handleAcknowledgeAnnouncement = async (loanId: string) => {
    try {
      await apiClient.post(`/loans/acknowledge/${loanId}`);
      loadDashboard();
    } catch {
      Alert.alert('Hitilafu', 'Imeshindikana kurekodi itikio lako.');
    }
  };

  const getRoleTitle = (r?: string) => {
    if (r === 'CHAIRPERSON') return 'Mwenyekiti';
    if (r === 'SECRETARY') return 'Katibu';
    if (r === 'TREASURER') return 'Mweka Hazina';
    return 'Mwanachama';
  };

  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';

  const guarantorRequests = Array.isArray(feed?.guarantorRequests) ? feed.guarantorRequests : [];
  const leaderPendingLoans = Array.isArray(feed?.leaderPendingLoans) ? feed.leaderPendingLoans : [];
  const unreadAnnouncements = Array.isArray(feed?.unreadAnnouncements) ? feed.unreadAnnouncements : [];
  const myActiveLoans = Array.isArray(feed?.myActiveLoans) ? feed.myActiveLoans : [];

  const b = summary?.breakdown || {};
  const breakdownGrandTotal =
    Number(b.totalSharesValue || 0) +
    Number(b.totalPapoMandatory || 0) +
    Number(b.totalSocialFund || 0) +
    Number(b.memberShareableLoanProfit || 0) +
    Number(b.groupRetainedLoanProfit || 0) +
    Number(b.unclassifiedLoanInterest || 0) +
    Number(b.papoInterestCollected || 0) +
    Number(b.totalPaidFines || 0);

  const ts = summary?.todaySummary || {};

  const mySharesVal = Number(summary?.mySharesValue || 0);
  const multiplier = Number(groupSettings?.loanLimitMultiplier || 3);
  const maxCap = Number(groupSettings?.maxBigLoanCap || 0);
  const rawEligibleLoan = mySharesVal * multiplier;
  const estimatedLoanLimit = maxCap > 0 ? Math.min(rawEligibleLoan, maxCap) : rawEligibleLoan;
  return (
    <View className={`flex-1 ${bgClass}`}>
      <View
        style={{ paddingTop: Math.max(insets.top + 12, 46) }}
        className="bg-teal-700 pb-8 px-6 rounded-b-3xl shadow-md"
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-3">
            <Text className="text-teal-200 text-xs font-bold uppercase tracking-wider">
              {groupSettings?.name || activeGroup?.name || 'Vifani Jamii'}
            </Text>
            <Text className="text-white text-2xl font-extrabold mt-0.5" numberOfLines={1}>
              Habari, {user?.fullName?.split(' ')[0]}
            </Text>
            <View className="flex-row items-center gap-2 mt-1.5 flex-wrap">
              <View className="bg-teal-900/80 px-3 py-1 rounded-full">
                <Text className="text-teal-100 font-bold text-[11px]">
                  {getRoleTitle(activeRole || undefined)}
                </Text>
              </View>

              {showMeetingReminder && meetingDay && (
                <View className="bg-teal-800/80 px-2.5 py-1 rounded-full flex-row items-center gap-1">
                  <Ionicons name="time-outline" size={12} color="#99f6e4" />
                  <Text className="text-teal-100 font-semibold text-[10px]">
                    Kikao: {meetingDay}{groupSettings.meetingTime ? ' • ' + groupSettings.meetingTime : ''}
                  </Text>
                </View>
              )}

              {syncing && (
                <View className="flex-row items-center gap-1 bg-teal-950/60 px-2.5 py-1 rounded-full">
                  <ActivityIndicator size="small" color="#5eead4" />
                  <Text className="text-teal-200 text-[10px] font-bold">Inasasisha...</Text>
                </View>
              )}
            </View>
          </View>

          <TouchableOpacity
            onPress={() => router.push('/settings')}
            className="bg-teal-800/90 p-3 rounded-2xl border border-teal-600/50"
          >
            <Ionicons name="settings-outline" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      {syncError && (
        <TouchableOpacity onPress={loadDashboard} className="bg-amber-100 px-4 py-2">
          <Text className="text-sm text-amber-900">Imeshindikana kusasisha taarifa za dashibodi. Bonyeza kujaribu tena.</Text>
        </TouchableOpacity>
      )}
      <ScrollView
        className="flex-1 px-5 -mt-5"
        showsVerticalScrollIndicator={false}
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
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {Boolean(announcement) && !announcementDismissed && expiredAnnouncement !== announcementRevision && (
            <View className="bg-amber-50 border border-amber-300 p-4 rounded-2xl mb-4 shadow-sm">
              <View className="flex-row items-start gap-2.5">
                <Ionicons name="megaphone" size={20} color="#b45309" />
                <View className="flex-1">
                  <Text className="font-extrabold text-amber-950 text-xs uppercase">Tangazo la Kikundi</Text>
                  <Text className="text-slate-800 text-xs mt-1 leading-4">{announcement}</Text>
                  {groupSettings?.announcementPublishedAt && (
                    <Text className="mt-1 text-xs text-slate-600">Lilichapishwa {new Date(groupSettings.announcementPublishedAt).toLocaleString('sw-TZ')}</Text>
                  )}
                </View>
              </View>
              <TouchableOpacity
                onPress={handleDismissAnnouncement}
                className="bg-amber-600 self-end px-4 py-1.5 rounded-xl mt-2.5"
              >
                <Text className="text-white font-bold text-xs">Nimesoma</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* KADI KUU YA MFUKO WA KIKOBA */}
          <View className="bg-slate-900 p-5 rounded-3xl shadow-lg mb-4 border border-slate-800">
            <View className="flex-row justify-between items-center">
              <Text className="text-slate-400 text-xs font-bold uppercase">Jumla ya Mfuko wa Kikoba</Text>
              <TouchableOpacity
                onPress={() => setHideBalances(!hideBalances)}
                className="flex-row items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-full"
              >
                <Ionicons name={hideBalances ? 'eye-off-outline' : 'eye-outline'} size={15} color="#2dd4bf" />
                <Text className="text-teal-300 text-[10px] font-bold">
                  {hideBalances ? 'Onyesha' : 'Ficha'}
                </Text>
              </TouchableOpacity>
            </View>

            <Text className="text-white text-3xl font-extrabold mt-1.5">
              {formatMoney(summary?.totalGroupBalance)}
            </Text>

            <View className="flex-row justify-between mt-4 pt-3 border-t border-slate-800">
              <View>
                <Text className="text-slate-400 text-[11px]">Pesa Mkononi / Benki</Text>
                <Text className="text-emerald-400 font-bold text-sm mt-0.5">
                  {formatMoney(summary?.cashInHand)}
                </Text>
              </View>
              <View className="items-end">
                <Text className="text-slate-400 text-[11px]">Mikopo Iliyoko Nje</Text>
                <Text className="text-amber-400 font-bold text-sm mt-0.5">
                  {formatMoney(summary?.totalLoansOut)}
                </Text>
              </View>
            </View>
          </View>
          {/* KADI YA HISA ZANGU NA MADENI YANGU */}
          <View className="flex-row gap-3 mb-4">
            <View className={`flex-1 p-4 rounded-2xl border ${cardClass}`}>
              <View className="bg-teal-500/15 self-start p-2 rounded-xl mb-2">
                <Ionicons name="layers" size={20} color="#0f766e" />
              </View>
              <Text className={`text-[11px] ${textSub}`}>Hisa Zako ({Number(summary?.mySharesCount || 0)})</Text>
              <Text className={`text-sm font-extrabold mt-0.5 ${textMain}`}>
                {formatMoney(summary?.mySharesValue)}
              </Text>
              <View className="mt-2 pt-2 border-t border-slate-200/20 space-y-1">
                <View>
                  <Text className={`text-[10px] ${textSub}`}>Mfuko wa Jamii Wako:</Text>
                  <Text className="text-xs font-bold text-teal-600">
                    {formatMoney(summary?.mySocialFundValue)}
                  </Text>
                </View>
                <View className="pt-1">
                  <Text className={`text-[10px] ${textSub}`}>Ukomo Wako wa Mkopo:</Text>
                  <Text className="text-xs font-bold text-emerald-600">
                    {formatMoney(estimatedLoanLimit)}
                  </Text>
                </View>
              </View>
            </View>

            <View className={`flex-1 p-4 rounded-2xl border ${cardClass}`}>
              <View className="bg-amber-500/15 self-start p-2 rounded-xl mb-2">
                <Ionicons name="wallet" size={20} color="#d97706" />
              </View>
              <Text className={`text-[11px] ${textSub}`}>Deni la Mkopo Mkubwa</Text>
              <Text className={`text-sm font-extrabold mt-0.5 ${textMain}`}>
                {formatMoney(summary?.myLoansDebt)}
              </Text>
              <View className="mt-2 pt-2 border-t border-slate-200/20 space-y-1">
                <View>
                  <Text className={`text-[10px] ${textSub}`}>Deni la Papo Hiari:</Text>
                  <Text className="text-xs font-bold text-amber-600">
                    {formatMoney(summary?.myPapoTopUpDebt)}
                  </Text>
                </View>
                <View className="pt-1">
                  <Text className={`text-[10px] ${textSub}`}>Deni la Faini (Hazijalipwa):</Text>
                  <Text className="text-xs font-bold text-rose-600">
                    {formatMoney(summary?.myUnpaidFinesDebt)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* MCHANGANUO WA MFUKO WA KIKUNDI */}
          <View className={`rounded-2xl border mb-4 overflow-hidden ${cardClass}`}>
            <TouchableOpacity
              onPress={toggleBreakdown}
              activeOpacity={0.8}
              className="p-4 flex-row justify-between items-center"
            >
              <View className="flex-row items-center gap-2.5">
                <View className="bg-teal-600/15 p-2 rounded-xl">
                  <Ionicons name="pie-chart" size={19} color="#0f766e" />
                </View>
                <View>
                  <Text className={`font-extrabold text-sm ${textMain}`}>
                    Mchanganuo wa Mfuko wa Kikundi
                  </Text>
                  <Text className={`text-[11px] ${textSub}`}>
                    {showBreakdown ? 'Gusa kufunga maelezo' : 'Gusa kuona Hisa, Papo, Jamii, Riba & Jumla'}
                  </Text>
                </View>
              </View>
              <Ionicons
                name={showBreakdown ? 'chevron-up-circle' : 'chevron-down-circle'}
                size={22}
                color="#0f766e"
              />
            </TouchableOpacity>

            {showBreakdown && (
              <View className="px-4 pb-4 pt-2 border-t border-slate-200/30">
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>1. Jumla ya Hisa Zote:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(b.totalSharesValue)}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>2. Mfuko wa Papo (Mtaji):</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(b.totalPapoMandatory)}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>3. Mfuko wa Jamii:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(b.totalSocialFund)}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>4. Faida ya Mkopo (Ya Wanachama):</Text>
                  <Text className="text-xs font-bold text-emerald-600">{formatMoney(b.memberShareableLoanProfit)}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>5. Riba Zilizocheleweshwa (Za Kikundi):</Text>
                  <Text className="text-xs font-bold text-amber-600">{formatMoney(b.groupRetainedLoanProfit)}</Text>
                </View>
                {Number(b.unclassifiedLoanInterest) > 0 && (
                  <View className="flex-row justify-between py-1.5">
                    <Text className={'text-xs ' + textSub}>Riba ambayo muda wake haujathibitishwa</Text>
                    <Text className={'text-xs ' + textMain}>{formatMoney(b.unclassifiedLoanInterest)}</Text>
                  </View>
                )}
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>6. Faida ya Riba za Papo:</Text>
                  <Text className="text-xs font-bold text-teal-600">{formatMoney(b.papoInterestCollected)}</Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>7. Faini Zilizolipwa:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(b.totalPaidFines)}</Text>
                </View>

                <View className="flex-row justify-between items-center bg-teal-600/15 p-3 rounded-xl mt-2.5">
                  <Text className="text-xs font-extrabold text-teal-800">JUMLA KUU YA MFUKO:</Text>
                  <Text className="text-sm font-extrabold text-teal-800">{formatMoney(breakdownGrandTotal)}</Text>
                </View>

                {Number(b.totalUnpaidFines || 0) > 0 && (
                  <View className="flex-row justify-between pt-2 px-1">
                    <Text className="text-[11px] text-rose-600 font-semibold">Faini Zinazodaiwa Nje:</Text>
                    <Text className="text-[11px] font-bold text-rose-600">{formatMoney(b.totalUnpaidFines)}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          {/* MUHTASARI WA KIKAO CHA LEO */}
          <View className={`rounded-2xl border mb-4 overflow-hidden ${cardClass}`}>
            <TouchableOpacity
              onPress={toggleTodaySummary}
              activeOpacity={0.8}
              className="p-4 flex-row justify-between items-center"
            >
              <View className="flex-row items-center gap-2.5">
                <View className="bg-emerald-600/15 p-2 rounded-xl">
                  <Ionicons name="calendar" size={19} color="#059669" />
                </View>
                <View>
                  <Text className={`font-extrabold text-sm ${textMain}`}>
                    Muhtasari wa Kikao cha Leo
                  </Text>
                  <Text className={`text-[11px] ${textSub}`}>
                    {showTodaySummary ? 'Gusa kufunga maelezo' : 'Gusa kuona makusanyo, mikopo & matumizi ya leo'}
                  </Text>
                </View>
              </View>
              <Ionicons
                name={showTodaySummary ? 'chevron-up-circle' : 'chevron-down-circle'}
                size={22}
                color="#059669"
              />
            </TouchableOpacity>

            {showTodaySummary && (
              <View className="px-4 pb-4 pt-2 border-t border-slate-200/30">
                <View className="flex-row justify-between py-1 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Hisa Zilizokusanywa:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(ts.sharesCollected)}</Text>
                </View>
                <View className="flex-row justify-between py-1 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Riba za Papo Zilizokusanywa:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(ts.papoCollected)}</Text>
                </View>
                <View className="flex-row justify-between py-1 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Mfuko wa Jamii Leo:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(ts.socialCollected)}</Text>
                </View>
                <View className="flex-row justify-between py-1 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Papo ya Hiari Iliyorejeshwa:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(ts.topUpRepaid)}</Text>
                </View>
                <View className="flex-row justify-between py-1 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Riba ya Mikopo Mikubwa Leo:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(ts.loanInterestRepaid)}</Text>
                </View>
                <View className="flex-row justify-between py-1 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Mikopo Mikubwa Iliyorejeshwa:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>{formatMoney(ts.loanPrincipalRepaid)}</Text>
                </View>
                <View className="flex-row justify-between py-1 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Faini Zilizolipwa / Zinazodaiwa Leo:</Text>
                  <Text className={`text-xs font-bold ${textMain}`}>
                    {formatMoney(ts.paidFines)} /{' '}
                    <Text className="text-rose-600">{formatMoney(ts.unpaidFines)}</Text>
                  </Text>
                </View>
                <View className="flex-row justify-between py-1 border-b border-slate-200/20 mt-1">
                  <Text className={`text-xs ${textSub}`}>Mkopo Mkubwa Uliotoka Leo:</Text>
                  <Text className="text-xs font-bold text-amber-600">- {formatMoney(ts.loansLentToday)}</Text>
                </View>
                <View className="flex-row justify-between py-1 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Papo ya Hiari Iliyotoka Leo:</Text>
                  <Text className="text-xs font-bold text-amber-600">- {formatMoney(ts.papoLentToday)}</Text>
                </View>
                <View className="flex-row justify-between py-1 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Matumizi Yaliyotoka Leo:</Text>
                  <Text className="text-xs font-bold text-rose-600">- {formatMoney(ts.expensesToday)}</Text>
                </View>

                <View className="flex-row justify-between items-center bg-emerald-600/15 p-3 rounded-xl mt-2.5">
                  <Text className="text-xs font-extrabold text-emerald-800">PESA MKONONI LEO:</Text>
                  <Text className="text-sm font-extrabold text-emerald-800">{formatMoney(ts.cashInHandToday)}</Text>
                </View>
              </View>
            )}
          </View>

          <TouchableOpacity
            onPress={() => router.push('/transparency')}
            activeOpacity={0.85}
            className="bg-teal-700 p-4 rounded-2xl mb-4 flex-row justify-between items-center shadow-sm"
          >
            <View className="flex-row items-center gap-3">
              <View className="bg-teal-800 p-2.5 rounded-xl">
                <Ionicons name="analytics" size={20} color="#5eead4" />
              </View>
              <View>
                <Text className="text-white font-extrabold text-sm">Mgawo Wangu & Uwazi</Text>
                <Text className="text-teal-100 text-[11px]">Angalia mgawo wako, matumizi & risiti WhatsApp</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ffffff" />
          </TouchableOpacity>
          {Array.isArray(feed?.guarantorRepaidNotices) && feed.guarantorRepaidNotices.length > 0 && (
            <View className="bg-emerald-50 border border-emerald-300 p-4 rounded-2xl mb-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="checkmark-circle" size={20} color="#059669" />
                <Text className="font-extrabold text-emerald-950 text-sm">
                  Taarifa ya Marejesho ya Udhamini
                </Text>
              </View>
              {feed.guarantorRepaidNotices.map((notice: any) => (
                <View key={notice.id} className="bg-white p-3.5 rounded-xl border border-emerald-200 mb-2">
                  <Text className="text-xs text-slate-800">
                    Mwanachama <Text className="font-bold">{notice.user?.fullName}</Text> uliyemdhamini mkopo wa{' '}
                    <Text className="font-bold">TZS {Number(notice.principalAmount || 0).toLocaleString()}</Text> amekamilisha kurejesha mkopo wote!
                  </Text>
                  <TouchableOpacity
                    onPress={async () => {
                      await apiClient.post(`/loans/dismiss-guarantor-notice/${notice.id}`);
                      loadDashboard();
                    }}
                    className="bg-emerald-600 self-end px-4 py-1.5 rounded-xl mt-2"
                  >
                    <Text className="text-white font-bold text-xs">Nimesoma</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {guarantorRequests.length > 0 && (
            <View className="bg-amber-50 border border-amber-300 p-4 rounded-2xl mb-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="hand-left" size={20} color="#b45309" />
                <Text className="font-extrabold text-amber-950 text-sm">
                  Ombi la Udhamini Linakusubiri ({guarantorRequests.length})
                </Text>
              </View>
              {guarantorRequests.map((req: any) => (
                <View key={req.id} className="bg-white p-3.5 rounded-xl border border-amber-200 mb-2">
                  <Text className="font-bold text-slate-900">{req.user?.fullName}</Text>
                  <Text className="text-xs text-slate-600 mt-0.5">
                    Anaomba mkopo wa <Text className="font-bold">TZS {Number(req.principalAmount || 0).toLocaleString()}</Text> na amekuchagua kuwa mdhamini wake.
                  </Text>
                  <View className="flex-row gap-2 mt-3">
                    <TouchableOpacity
                      onPress={() => handleGuarantorRespond(req.id, 'ACCEPT')}
                      className="flex-1 bg-emerald-600 py-2.5 rounded-xl items-center"
                    >
                      <Text className="text-white font-bold text-xs">Idhinisha Udhamini</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleGuarantorRespond(req.id, 'REJECT')}
                      className="flex-1 bg-rose-600 py-2.5 rounded-xl items-center"
                    >
                      <Text className="text-white font-bold text-xs">Kataa</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {isLeader && leaderPendingLoans.length > 0 && (
            <View className="bg-teal-50 border border-teal-300 p-4 rounded-2xl mb-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="checkmark-done-circle" size={20} color="#0f766e" />
                <Text className="font-extrabold text-teal-950 text-sm">
                  Mikopo Inayosubiri Idhini ya Uongozi ({leaderPendingLoans.length})
                </Text>
              </View>
              {leaderPendingLoans.map((l: any) => (
                <View key={l.id} className="bg-white p-3.5 rounded-xl border border-teal-200 mb-2">
                  <Text className="font-bold text-slate-900">{l.user?.fullName}</Text>
                  <Text className="text-xs text-slate-600 mt-0.5">
                    Kiasi: <Text className="font-bold">TZS {Number(l.principalAmount || 0).toLocaleString()}</Text> • Mdhamini: {l.guarantor?.fullName || 'N/A'} (Amekubali)
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleLeaderApprove(l.id)}
                    className="bg-teal-700 py-2.5 rounded-xl items-center mt-3"
                  >
                    <Text className="text-white font-bold text-xs">Idhinisha & Toa Mkopo</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {unreadAnnouncements.length > 0 && (
            <View className="mb-4">
              <Text className={`text-xs font-bold uppercase mb-2 ${textSub}`}>
                Taarifa za Mikopo Iliyotolewa Kikaoni
              </Text>
              {unreadAnnouncements.map((item: any) => (
                <View key={item.id} className="bg-indigo-50 border border-indigo-200 p-4 rounded-2xl mb-2.5">
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1 pr-2">
                      <Text className="font-extrabold text-indigo-950 text-sm">
                        Mkopo Umetolewa: {item.user?.fullName}
                      </Text>
                      <Text className="text-xs text-indigo-900 mt-1">
                        Kiasi: <Text className="font-bold">TZS {Number(item.principalAmount || 0).toLocaleString()}</Text> • Mdhamini: <Text className="font-bold">{item.guarantor?.fullName || 'Hakuna'}</Text>
                      </Text>
                      {item.disbursedAt && (
                        <Text className="text-[11px] text-indigo-700 mt-0.5">
                          Tarehe aliyopokea: {new Date(item.disbursedAt).toLocaleDateString('sw-TZ')}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleAcknowledgeAnnouncement(item.id)}
                      className="bg-indigo-700 px-3.5 py-2 rounded-xl"
                    >
                      <Text className="text-white font-bold text-xs">Nimeona</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {myActiveLoans.length > 0 && (
            <View className="mb-4">
              <Text className={`text-xs font-bold uppercase mb-2 ${textSub}`}>
                Kumbukumbu ya Deni Langu Hai
              </Text>
              {myActiveLoans.map((ml: any) => {
                const remaining = Math.max(0, Number(ml.totalRepayable || 0) - Number(ml.amountPaid || 0));
                return (
                  <View key={ml.id} className={`p-4 rounded-2xl border mb-2.5 ${cardClass}`}>
                    <View className="flex-row justify-between items-center">
                      <Text className={`font-extrabold text-sm ${textMain}`}>
                        Mkopo: TZS {Number(ml.principalAmount || 0).toLocaleString()}
                      </Text>
                      <View className="bg-amber-100 px-2.5 py-1 rounded-lg">
                        <Text className="text-amber-800 font-bold text-[11px]">Baki: TZS {remaining.toLocaleString()}</Text>
                      </View>
                    </View>
                    <Text className={`text-xs mt-1.5 ${textSub}`}>
                      Mdhamini Wako: <Text className="font-bold">{ml.guarantor?.fullName || 'Hakuna'}</Text>
                    </Text>
                    {ml.disbursedAt && (
                      <Text className={`text-xs mt-0.5 ${textSub}`}>
                        Tarehe Uliyopokea: {new Date(ml.disbursedAt).toLocaleDateString('sw-TZ')}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          <View className="h-10" />
        </Animated.View>
      </ScrollView>
    </View>
  );
}
