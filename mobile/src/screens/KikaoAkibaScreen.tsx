import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { getCachedData, setCachedData } from '../utils/cache';

export default function KikaoAkibaScreen() {
  const insets = useSafeAreaInsets();
  const { user, role } = useAuth();
  const { isDark } = useTheme();
  const isLeader = role === 'CHAIRPERSON' || role === 'SECRETARY' || role === 'TREASURER';

  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [cycleInfo, setCycleInfo] = useState<any>(null);
  const [rules, setRules] = useState<any>(null);
  const [myHistory, setMyHistory] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);

  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [showFinesBox, setShowFinesBox] = useState<boolean>(false);

  const [sharesCount, setSharesCount] = useState<string>('1');
  const [socialFundPaid, setSocialFundPaid] = useState<string>('0');
  const [papoInterestPaid, setPapoInterestPaid] = useState<string>('0');
  const [selectedFineKeys, setSelectedFineKeys] = useState<string[]>([]);
  const [markFinesPaid, setMarkFinesPaid] = useState<boolean>(true);

    const loadSession = async () => {
    const cacheKey = `session_${user?.id || 'u'}_${role || 'M'}`;

    const cached = await getCachedData<any>(cacheKey);
    if (cached) {
      setCycleInfo(cached.cycleInfo || null);
      setRules(cached.rules || null);
      setMyHistory(cached.myHistory || null);
      setMembers(Array.isArray(cached.members) ? cached.members : []);
    }

    setSyncing(true);
    try {
      const res = await apiClient.get('/shares/session-data');
      const fresh = {
        cycleInfo: res.data?.cycleInfo || null,
        rules: res.data?.rules || null,
        myHistory: res.data?.myHistory || null,
        members: Array.isArray(res.data?.members) ? res.data.members : [],
      };
      setCycleInfo(fresh.cycleInfo);
      setRules(fresh.rules);
      setMyHistory(fresh.myHistory);
      setMembers(fresh.members);
      await setCachedData(cacheKey, fresh);
    } catch (error: any) {
      console.log('Inatumia cache ya kikao:', error?.message);
    } finally {
      setSyncing(false);
      setRefreshing(false);
    }
  };


  useFocusEffect(
    useCallback(() => {
      loadSession();
    }, [])
  );
  const handleSelectMemberCard = (member: any) => {
    if (expandedMemberId === member.userId) {
      setExpandedMemberId(null);
      return;
    }
    setExpandedMemberId(member.userId);
    if (member.recordedToday && member.todayRecord) {
      const tr = member.todayRecord;
      setSharesCount(String(tr.sharesCount));
      setSocialFundPaid(String(tr.socialFundPaid));
      setPapoInterestPaid(String(tr.papoInterestPaid));
      setSelectedFineKeys(Array.isArray(tr.fineKeys) ? tr.fineKeys : []);
      setMarkFinesPaid(Boolean(tr.markFinesPaid));
      setShowFinesBox((tr.fineKeys || []).length > 0);
    } else {
      setShowFinesBox(false);
      setSelectedFineKeys([]);
      setMarkFinesPaid(true);
      setSharesCount(String(rules?.minSharesPerMeeting || 1));
      setSocialFundPaid(String(rules?.socialFundMin || 0));
      setPapoInterestPaid(String(member.totalPapoInterestDue || 0));
    }
  };

  const toggleFineSelection = (key: string, member: any) => {
    const isRemoving = selectedFineKeys.includes(key);
    const nextKeys = isRemoving
      ? selectedFineKeys.filter((k) => k !== key)
      : [...selectedFineKeys, key];

    setSelectedFineKeys(nextKeys);

    if (key === 'NO_SHARE') {
      setSharesCount(isRemoving ? String(rules?.minSharesPerMeeting || 1) : '0');
    }
    if (key === 'NO_SOCIAL') {
      setSocialFundPaid(isRemoving ? String(rules?.socialFundMin || 0) : '0');
    }
    if (key === 'NO_PAPO_INT') {
      setPapoInterestPaid(isRemoving ? String(member.totalPapoInterestDue || 0) : '0');
    }
  };

  const fineCatalog: any[] = Array.isArray(rules?.fineCatalog) ? rules.fineCatalog : [];
  const autoFinesTotal = selectedFineKeys.reduce((sum, key) => {
    const found = fineCatalog.find((f) => f.key === key);
    return sum + Number(found?.amount || 0);
  }, 0);

  const isNoShareLocked = selectedFineKeys.includes('NO_SHARE');
  const isNoSocialLocked = selectedFineKeys.includes('NO_SOCIAL');
  const isNoPapoLocked = selectedFineKeys.includes('NO_PAPO_INT');

  const shareValue = Number(rules?.shareValue || 5000);
  const minShares = Number(rules?.minSharesPerMeeting || 1);
  const maxShares = Number(rules?.maxSharesPerMeeting || 10);
  const numericShares = isNoShareLocked ? 0 : Number(sharesCount || 0);
  const isSharesBelowMin = !isNoShareLocked && numericShares < minShares;
  const isSharesExceeding = !isNoShareLocked && numericShares > maxShares;
  const isSharesInvalid = isSharesBelowMin || isSharesExceeding;
  const autoSharesTotal = numericShares * shareValue;

  const minSocial = Number(rules?.socialFundMin || 0);
  const maxSocial = Number(rules?.socialFundMax || 0);
  const effectiveSocial = isNoSocialLocked ? 0 : Number(socialFundPaid || 0);
  const isSocialBelowMin = !isNoSocialLocked && minSocial > 0 && effectiveSocial < minSocial;
  const isSocialExceedingMax = !isNoSocialLocked && maxSocial > 0 && effectiveSocial > maxSocial;
  const isSocialInvalid = isSocialBelowMin || isSocialExceedingMax;

  const effectivePapo = isNoPapoLocked ? 0 : Number(papoInterestPaid || 0);
  const grandSessionTotal =
    autoSharesTotal + effectiveSocial + effectivePapo + (markFinesPaid ? autoFinesTotal : 0);
  const handleRecordMeeting = async (targetUserId: string) => {
    if (isSharesInvalid) {
      return Alert.alert(
        'Kiwango cha Hisa Si Sahihi',
        `Hisa lazima ziwe kati ya ${minShares} na ${maxShares} (au chagua faini ya kutonunua hisa).`
      );
    }
    if (isSocialInvalid) {
      return Alert.alert(
        'Kiwango cha Jamii Si Sahihi',
        `Mfuko wa jamii lazima uwe kati ya TZS ${minSocial.toLocaleString()} na TZS ${maxSocial.toLocaleString()} (au chagua faini ya kutotoa mfuko wa jamii).`
      );
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/shares/record-meeting', {
        targetUserId,
        sharesCount: numericShares,
        socialFundPaid: effectiveSocial,
        papoInterestPaid: effectivePapo,
        selectedFineKeys,
        markFinesPaid,
      });
      Alert.alert('Imefanikiwa', res.data?.message);
      setExpandedMemberId(null);
      loadSession();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kurekodi muamala.');
    } finally {
      setSubmitting(false);
    }
  };

  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';
  const disabledInputClass = isDark
    ? 'bg-slate-800/60 border-slate-700 text-slate-400'
    : 'bg-slate-200/80 border-slate-300 text-slate-600';

  const completedCount = members.filter((m) => m.recordedToday).length;
  const todayTotals = members.reduce(
    (acc, m) => {
      if (m.recordedToday && m.todayRecord) {
        acc.shares += Number(m.todayRecord.amountPaid || 0);
        acc.social += Number(m.todayRecord.socialFundPaid || 0);
        acc.papo += Number(m.todayRecord.papoInterestPaid || 0);
        acc.fines += Number(m.todayRecord.finesPaidAmount || 0);
      }
      return acc;
    },
    { shares: 0, social: 0, papo: 0, fines: 0 }
  );
  const todayGrandCollected = todayTotals.shares + todayTotals.social + todayTotals.papo + todayTotals.fines;

  const mySharesList = Array.isArray(myHistory?.shares) ? myHistory.shares : [];
  const myFinesList = Array.isArray(myHistory?.fines) ? myHistory.fines : [];
  const myTotalSharesCount = mySharesList.reduce((s: number, r: any) => s + Number(r.sharesCount || 0), 0);
  const myTotalSharesValue = mySharesList.reduce((s: number, r: any) => s + Number(r.amountPaid || 0), 0);
  const myTotalSocial = mySharesList.reduce((s: number, r: any) => s + Number(r.socialFundPaid || 0), 0);
  const myTotalFines = myFinesList.reduce((s: number, f: any) => s + Number(f.amount || 0), 0);
  return (
    <View className={`flex-1 ${bgClass}`}>
      <View
        style={{ paddingTop: Math.max(insets.top + 10, 44) }}
        className="bg-teal-700 pb-5 px-6 rounded-b-3xl"
      >
        <Text className="text-2xl font-bold text-white">Kikao & Akiba</Text>
        <Text className="text-teal-100 text-xs mt-1">
          {isLeader
            ? `Gusa mwanachama kurekodi au kurekebisha (${completedCount}/${members.length} tayari)`
            : `Daftari binafsi la miamala ya ${user?.fullName}`}
        </Text>
                {syncing && (
          <View className="flex-row items-center gap-1.5 mt-2 bg-teal-900/60 self-start px-3 py-1 rounded-full">
            <ActivityIndicator size="small" color="#5eead4" />
            <Text className="text-teal-100 text-[10px] font-bold">Inasasisha daftari...</Text>
          </View>
        )}

      </View>

      <ScrollView
        className="flex-1 px-5 pt-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadSession(); }} />}
      >
        {cycleInfo && (
          <View className="bg-slate-900 p-4 rounded-2xl mb-4 border border-slate-800 flex-row justify-between items-center">
            <View>
              <Text className="text-teal-300 text-[11px] font-bold uppercase">
                Tarehe: {new Date(cycleInfo.todayDate).toLocaleDateString('sw-TZ')}
              </Text>
              <Text className="text-white font-extrabold text-sm mt-0.5">
                Juma la {cycleInfo.currentWeek} kati ya Majuma {cycleInfo.totalWeeks}
              </Text>
            </View>
            <View className="bg-teal-800/80 px-3 py-1.5 rounded-xl items-center">
              <Text className="text-teal-100 text-[10px]">Majuma Mbele</Text>
              <Text className="text-white font-extrabold text-sm">{cycleInfo.remainingWeeks}</Text>
            </View>
          </View>
        )}

        {isLeader && (
          <View className="mb-5">
            <Text className={`text-xs font-extrabold uppercase mb-2.5 ${textSub}`}>
              Wanachama Kikaoni ({completedCount} Tayari • {members.length - completedCount} Bado)
            </Text>

            {members.map((m) => {
              const isOpen = expandedMemberId === m.userId;
              const isDone = Boolean(m.recordedToday);

              return (
                <View
                  key={m.userId}
                  className={`rounded-2xl border mb-2.5 overflow-hidden ${
                    isDone
                      ? isDark
                        ? 'bg-emerald-950/50 border-emerald-700'
                        : 'bg-emerald-50 border-emerald-400'
                      : cardClass
                  }`}
                >
                  <TouchableOpacity
                    onPress={() => handleSelectMemberCard(m)}
                    activeOpacity={0.8}
                    className="p-4 flex-row justify-between items-center"
                  >
                    <View className="flex-row items-center gap-3 flex-1">
                      <View
                        className={`w-9 h-9 rounded-full items-center justify-center ${
                          isDone ? 'bg-emerald-600' : 'bg-teal-700/15'
                        }`}
                      >
                        <Ionicons
                          name={isDone ? 'checkmark' : 'person'}
                          size={18}
                          color={isDone ? '#ffffff' : '#0f766e'}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className={`font-bold text-sm ${textMain}`}>{m.fullName}</Text>
                        <Text className={`text-[11px] ${isDone ? 'text-emerald-700 font-bold' : textSub}`}>
                          {isDone
                            ? '✓ Tayari Leo • Gusa kubadilisha/kuedit'
                            : rules?.hasPapo
                            ? `Riba ya Papo Leo: TZS ${Number(m.totalPapoInterestDue || 0).toLocaleString()}`
                            : 'Gusa kujaza taarifa za kikao'}
                        </Text>
                      </View>
                    </View>
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={isDone ? '#059669' : '#64748b'}
                    />
                  </TouchableOpacity>

                  {isOpen && (
                    <View className="px-4 pb-4 pt-3 border-t border-slate-200/30">
                      <View className="flex-row gap-2.5 mb-3">
                        <View className="flex-1">
                          <Text className={`text-xs font-bold mb-1 ${textMain}`}>
                            Hisa ({minShares}-{maxShares}) {isNoShareLocked ? '🔒' : ''}
                          </Text>
                          <TextInput
                            editable={!isNoShareLocked}
                            className={`border rounded-xl p-2.5 font-bold ${
                              isNoShareLocked
                                ? disabledInputClass
                                : isSharesInvalid
                                ? 'bg-rose-50 border-rose-500 text-rose-900'
                                : isDark
                                ? 'bg-slate-800 border-slate-700 text-white'
                                : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                            keyboardType="numeric"
                            value={isNoShareLocked ? '0' : sharesCount}
                            onChangeText={(t) => setSharesCount(t.replace(/[^0-9]/g, ''))}
                          />
                          {isSharesInvalid && (
                            <Text className="text-[10px] font-bold text-rose-600 mt-1">
                              {isSharesBelowMin ? `Chini ya kiwango (Min: ${minShares})` : `Imezidi ukomo (Max: ${maxShares})`}
                            </Text>
                          )}
                        </View>
                        <View className="flex-1">
                          <Text className={`text-xs font-bold mb-1 ${textSub}`}>
                            Thamani (Auto)
                          </Text>
                          <TextInput
                            editable={false}
                            className={`border rounded-xl p-2.5 font-bold ${disabledInputClass}`}
                            value={`TZS ${autoSharesTotal.toLocaleString()}`}
                          />
                        </View>
                      </View>

                      <View className="flex-row gap-2.5 mb-3">
                        <View className="flex-1">
                          <Text className={`text-xs font-bold mb-1 ${textMain}`}>
                            Jamii ({minSocial.toLocaleString()}-{maxSocial.toLocaleString()}) {isNoSocialLocked ? '🔒' : ''}
                          </Text>
                          <TextInput
                            editable={!isNoSocialLocked}
                            className={`border rounded-xl p-2.5 font-bold ${
                              isNoSocialLocked
                                ? disabledInputClass
                                : isSocialInvalid
                                ? 'bg-rose-50 border-rose-500 text-rose-900'
                                : isDark
                                ? 'bg-slate-800 border-slate-700 text-white'
                                : 'bg-slate-50 border-slate-300 text-slate-900'
                            }`}
                            keyboardType="numeric"
                            value={isNoSocialLocked ? '0' : socialFundPaid}
                            onChangeText={(t) => setSocialFundPaid(t.replace(/[^0-9]/g, ''))}
                          />
                          {isSocialInvalid && (
                            <Text className="text-[10px] font-bold text-rose-600 mt-1">
                              {isSocialBelowMin
                                ? `Chini ya kiwango (Min: ${minSocial.toLocaleString()})`
                                : `Imezidi ukomo (Max: ${maxSocial.toLocaleString()})`}
                            </Text>
                          )}
                        </View>

                        {rules?.hasPapo && (
                          <View className="flex-1">
                            <Text className={`text-xs font-bold mb-1 ${textSub}`}>
                              Riba ya Papo (Auto) 🔒
                            </Text>
                            <TextInput
                              editable={false}
                              className={`border rounded-xl p-2.5 font-bold ${disabledInputClass}`}
                              value={
                                isNoPapoLocked
                                  ? 'TZS 0'
                                  : `TZS ${Number(papoInterestPaid || 0).toLocaleString()}`
                              }
                            />
                          </View>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={() => setShowFinesBox(!showFinesBox)}
                        className={`p-3 rounded-xl border mb-2.5 flex-row justify-between items-center ${
                          selectedFineKeys.length > 0
                            ? 'bg-rose-50 border-rose-300'
                            : isDark
                            ? 'bg-slate-800 border-slate-700'
                            : 'bg-slate-100 border-slate-300'
                        }`}
                      >
                        <View className="flex-row items-center gap-2">
                          <Ionicons name="alert-circle-outline" size={18} color="#be123c" />
                          <Text className={`text-xs font-bold ${selectedFineKeys.length > 0 ? 'text-rose-900' : textMain}`}>
                            {selectedFineKeys.length > 0
                              ? `Faini (${selectedFineKeys.length}) • TZS ${autoFinesTotal.toLocaleString()}`
                              : 'Weka Faini Kama Amekosea (Gusa)'}
                          </Text>
                        </View>
                        <Ionicons name={showFinesBox ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
                      </TouchableOpacity>

                      {showFinesBox && (
                        <View className="p-3 rounded-xl border border-rose-200 bg-rose-50/40 mb-3">
                          <View className="flex-row flex-wrap gap-1.5 mb-2.5">
                            {fineCatalog.map((f) => {
                              const isSelected = selectedFineKeys.includes(f.key);
                              const isZero = Number(f.amount || 0) <= 0;
                              return (
                                <TouchableOpacity
                                  key={f.key}
                                  disabled={isZero}
                                  onPress={() => toggleFineSelection(f.key, m)}
                                  className={`px-2.5 py-1.5 rounded-lg border flex-row items-center gap-1 ${
                                    isZero
                                      ? 'opacity-40 bg-slate-200 border-slate-300'
                                      : isSelected
                                      ? 'bg-rose-700 border-rose-700'
                                      : 'bg-white border-rose-200'
                                  }`}
                                >
                                  <Ionicons
                                    name={isSelected ? 'checkbox' : 'square-outline'}
                                    size={14}
                                    color={isSelected ? '#ffffff' : '#be123c'}
                                  />
                                  <Text
                                    className={`text-[11px] font-bold ${
                                      isSelected ? 'text-white' : 'text-rose-950'
                                    }`}
                                  >
                                    {f.label} ({Number(f.amount || 0).toLocaleString()})
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>

                          <TextInput
                            editable={false}
                            className={`border rounded-xl p-2.5 font-extrabold text-xs text-rose-700 ${disabledInputClass}`}
                            value={`Jumla ya Faini (Auto): TZS ${autoFinesTotal.toLocaleString()}`}
                          />

                          {selectedFineKeys.length > 0 && (
                            <View className="flex-row justify-between items-center mt-2">
                              <Text className={`text-xs font-bold ${textMain}`}>Amelipa faini papo hapo?</Text>
                              <Switch value={markFinesPaid} onValueChange={setMarkFinesPaid} />
                            </View>
                          )}
                        </View>
                      )}

                      <View className="bg-teal-600/15 p-3 rounded-xl mb-3 flex-row justify-between items-center">
                        <Text className="text-xs font-bold text-teal-800">Jumla ya Mwanachama Huyu:</Text>
                        <Text className="text-sm font-extrabold text-teal-800">
                          TZS {grandSessionTotal.toLocaleString()}
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => handleRecordMeeting(m.userId)}
                        disabled={submitting || isSharesInvalid || isSocialInvalid}
                        className={`p-3.5 rounded-xl items-center ${
                          isSharesInvalid || isSocialInvalid ? 'bg-slate-400' : 'bg-teal-700'
                        }`}
                      >
                        {submitting ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text className="text-white font-bold text-xs">
                            {isDone ? `Sasisha Taarifa za ${m.fullName}` : `Hifadhi Taarifa za ${m.fullName}`}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            <View className="bg-slate-900 p-4 rounded-2xl mt-2 border border-slate-800">
              <Text className="text-teal-300 text-xs font-extrabold uppercase mb-2">
                Muhtasari wa Makusanyo ya Kikao cha Leo
              </Text>
              <View className="flex-row justify-between py-1">
                <Text className="text-slate-400 text-xs">Hisa Zilizokusanywa:</Text>
                <Text className="text-white font-bold text-xs">TZS {todayTotals.shares.toLocaleString()}</Text>
              </View>
              <View className="flex-row justify-between py-1">
                <Text className="text-slate-400 text-xs">Mfuko wa Jamii:</Text>
                <Text className="text-white font-bold text-xs">TZS {todayTotals.social.toLocaleString()}</Text>
              </View>
              <View className="flex-row justify-between py-1">
                <Text className="text-slate-400 text-xs">Riba za Papo Zilizokusanywa:</Text>
                <Text className="text-white font-bold text-xs">TZS {todayTotals.papo.toLocaleString()}</Text>
              </View>
              <View className="flex-row justify-between py-1">
                <Text className="text-slate-400 text-xs">Faini Zilizolipwa Leo:</Text>
                <Text className="text-white font-bold text-xs">TZS {todayTotals.fines.toLocaleString()}</Text>
              </View>
              <View className="flex-row justify-between pt-2 mt-1 border-t border-slate-700">
                <Text className="text-emerald-400 font-extrabold text-xs">JUMLA KUU ILIYOKUSANYWA LEO:</Text>
                <Text className="text-emerald-400 font-extrabold text-sm">
                  TZS {todayGrandCollected.toLocaleString()}
                </Text>
              </View>
            </View>
          </View>
        )}
        <Text className={`text-xs font-extrabold uppercase mb-2 ${textSub}`}>
          Kumbukumbu Zangu Binafsi ({user?.fullName})
        </Text>

        {(() => {
          const myPapoTxs = Array.isArray(myHistory?.papoInterestTxs) ? myHistory.papoInterestTxs : [];
          const totalPapoPaid = myPapoTxs.reduce((s: number, tx: any) => s + Number(tx.amount || 0), 0);

          const dateKeys = new Set<string>();
          mySharesList.forEach((s: any) => dateKeys.add(new Date(s.meetingDate).toISOString().slice(0, 10)));
          myPapoTxs.forEach((tx: any) => dateKeys.add(new Date(tx.createdAt).toISOString().slice(0, 10)));
          myFinesList.forEach((f: any) => dateKeys.add(new Date(f.createdAt).toISOString().slice(0, 10)));

          const sortedDates = Array.from(dateKeys).sort((a, b) => (a < b ? 1 : -1));

          return (
            <>
              <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Jumla ya Hisa Zangu ({myTotalSharesCount}):</Text>
                  <Text className={`text-xs font-extrabold ${textMain}`}>
                    TZS {myTotalSharesValue.toLocaleString()}
                  </Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Jumla ya Mfuko Wangu wa Jamii:</Text>
                  <Text className={`text-xs font-extrabold ${textMain}`}>
                    TZS {myTotalSocial.toLocaleString()}
                  </Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Jumla ya Riba ya Papo Uliyotoa:</Text>
                  <Text className="text-xs font-extrabold text-emerald-600">
                    TZS {totalPapoPaid.toLocaleString()}
                  </Text>
                </View>
                <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                  <Text className={`text-xs ${textSub}`}>Salio Langu la Papo ya Lazima:</Text>
                  <Text className="text-xs font-extrabold text-teal-600">
                    TZS {Number(myHistory?.papoMandatoryBalance || 0).toLocaleString()}
                  </Text>
                </View>
                <View className="flex-row justify-between pt-1.5">
                  <Text className={`text-xs ${textSub}`}>Jumla ya Faini Zangu:</Text>
                  <Text className="text-xs font-extrabold text-rose-600">
                    TZS {myTotalFines.toLocaleString()}
                  </Text>
                </View>
              </View>

              <Text className={`text-xs font-bold mb-2 ${textMain}`}>
                Historia ya Vikao Vyangu ({sortedDates.length} Mikutano)
              </Text>

              {sortedDates.length === 0 ? (
                <View className={`p-5 rounded-2xl border items-center mb-6 ${cardClass}`}>
                  <Text className={`text-xs ${textSub}`}>Huna rekodi ya kikao chochote bado.</Text>
                </View>
              ) : (
                sortedDates.map((dKey) => {
                  const dayShares = mySharesList.filter(
                    (s: any) => new Date(s.meetingDate).toISOString().slice(0, 10) === dKey
                  );
                  const dayPapo = myPapoTxs.filter(
                    (tx: any) => new Date(tx.createdAt).toISOString().slice(0, 10) === dKey
                  );
                  const dayFines = myFinesList.filter(
                    (f: any) => new Date(f.createdAt).toISOString().slice(0, 10) === dKey
                  );

                  const sCount = dayShares.reduce((sum: number, s: any) => sum + Number(s.sharesCount || 0), 0);
                  const sAmt = dayShares.reduce((sum: number, s: any) => sum + Number(s.amountPaid || 0), 0);
                  const socAmt = dayShares.reduce((sum: number, s: any) => sum + Number(s.socialFundPaid || 0), 0);
                  const papoAmt = dayPapo.reduce((sum: number, tx: any) => sum + Number(tx.amount || 0), 0);
                  const finesAmt = dayFines.reduce((sum: number, f: any) => sum + Number(f.amount || 0), 0);

                  return (
                    <View key={dKey} className={`p-4 rounded-2xl border mb-3 ${cardClass}`}>
                      <View className="flex-row justify-between items-center pb-2 mb-2 border-b border-slate-200/20">
                        <View className="flex-row items-center gap-1.5">
                          <Ionicons name="calendar-outline" size={15} color="#0f766e" />
                          <Text className={`font-extrabold text-xs ${textMain}`}>
                            Kikao cha {new Date(dKey).toLocaleDateString('sw-TZ')}
                          </Text>
                        </View>
                        <View className="bg-teal-600/15 px-2.5 py-0.5 rounded-lg">
                          <Text className="text-teal-700 font-bold text-[11px]">Hisa {sCount}</Text>
                        </View>
                      </View>

                      <View className="flex-row justify-between py-1">
                        <Text className={`text-xs ${textSub}`}>Hisa ({sCount}):</Text>
                        <Text className={`text-xs font-bold ${textMain}`}>TZS {sAmt.toLocaleString()}</Text>
                      </View>
                      <View className="flex-row justify-between py-1">
                        <Text className={`text-xs ${textSub}`}>Mfuko wa Jamii:</Text>
                        <Text className={`text-xs font-bold ${textMain}`}>TZS {socAmt.toLocaleString()}</Text>
                      </View>
                      <View className="flex-row justify-between py-1">
                        <Text className={`text-xs ${textSub}`}>Riba ya Papo:</Text>
                        <Text className="text-xs font-bold text-emerald-600">TZS {papoAmt.toLocaleString()}</Text>
                      </View>

                      {dayFines.length > 0 && (
                        <View className="mt-2 pt-2 border-t border-rose-200/40 bg-rose-500/10 p-2.5 rounded-xl">
                          <Text className="text-[11px] font-bold text-rose-600 mb-1">
                            Faini za Siku Hii (TZS {finesAmt.toLocaleString()}):
                          </Text>
                          {dayFines.map((df: any) => (
                            <Text key={df.id} className="text-[11px] text-rose-700">
                              • {df.reason} — TZS {Number(df.amount || 0).toLocaleString()} ({df.isPaid ? 'Imelipwa' : 'Inadaiwa'})
                            </Text>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </>
          );
        })()}

        <View className="h-10" />
      </ScrollView>
    </View>
  );
}
