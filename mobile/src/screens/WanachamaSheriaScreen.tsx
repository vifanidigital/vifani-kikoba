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
  Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';

const DAYS_OF_WEEK = [
  { key: 'MONDAY', label: 'Jumatatu' },
  { key: 'TUESDAY', label: 'Jumanne' },
  { key: 'WEDNESDAY', label: 'Jumatano' },
  { key: 'THURSDAY', label: 'Alhamisi' },
  { key: 'FRIDAY', label: 'Ijumaa' },
  { key: 'SATURDAY', label: 'Jumamosi' },
  { key: 'SUNDAY', label: 'Jumapili' },
];

export default function WanachamaSheriaScreen() {
  const { user, group, role, signOut } = useAuth();
  const isChair = role === 'CHAIRPERSON';
  const isLeader = role === 'CHAIRPERSON' || role === 'SECRETARY' || role === 'TREASURER';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [terminations, setTerminations] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);

  const [openSection, setOpenSection] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState('MEMBER');

  const [announcementText, setAnnouncementText] = useState('');

  const [editMember, setEditMember] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('MEMBER');
  const [terminateReason, setTerminateReason] = useState('');

  const toggleSection = (key: string) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const loadData = async () => {
    try {
      const [memRes, setRes] = await Promise.all([
        apiClient.get('/members'),
        apiClient.get('/group/settings'),
      ]);
      setMembers(Array.isArray(memRes.data?.members) ? memRes.data.members : []);
      setTerminations(Array.isArray(memRes.data?.terminations) ? memRes.data.terminations : []);
      const g = setRes.data?.group || null;
      setSettings(g);
      setAnnouncementText(g?.announcement || '');
    } catch (error: any) {
      console.log('Hitilafu kupakia Ofisi:', error?.message);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await apiClient.put('/group/settings', settings);
      Alert.alert('Imefanikiwa', res.data?.message || 'Sheria zimehifadhiwa!');
      setOpenSection(null);
      loadData();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuhifadhi.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishAnnouncement = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put('/group/announcement', { announcement: announcementText });
      Alert.alert('Imefanikiwa', res.data?.message);
      setOpenSection(null);
      loadData();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuchapisha tangazo.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (newName.trim().length < 2 || newPhone.trim().length < 10) {
      return Alert.alert('Angalia Taarifa', 'Weka jina kamili na namba sahihi ya simu.');
    }
    setSaving(true);
    try {
      const res = await apiClient.post('/members/add', {
        fullName: newName.trim(),
        phone: newPhone.trim(),
        role: newRole,
      });
      Alert.alert('Imefanikiwa', res.data?.message);
      setNewName('');
      setNewPhone('');
      setNewRole('MEMBER');
      setOpenSection(null);
      loadData();
    } catch (error: any) {
      Alert.alert('Imeshindikana', error.response?.data?.error || 'Hitilafu imetokea.');
    } finally {
      setSaving(false);
    }
  };

  const openEditMemberModal = (m: any) => {
    if (!isChair) return;
    setEditMember(m);
    setEditName(m.fullName);
    setEditPhone(m.phone);
    setEditRole(m.role);
    setTerminateReason('');
  };

  const handleUpdateMember = async () => {
    if (!editMember) return;
    setSaving(true);
    try {
      const res = await apiClient.put(`/members/update/${editMember.userId}`, {
        fullName: editName.trim(),
        phone: editPhone.trim(),
        role: editRole,
      });
      Alert.alert('Imesasishwa', res.data?.message);
      setEditMember(null);
      loadData();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kurekebisha.');
    } finally {
      setSaving(false);
    }
  };

  const handleInitiateTermination = async () => {
    if (!editMember || terminateReason.trim().length < 3) {
      return Alert.alert('Weka Sababu', 'Andika sababu ya kusitisha uanachama wake.');
    }
    setSaving(true);
    try {
      const res = await apiClient.post('/members/initiate-termination', {
        targetUserId: editMember.userId,
        reason: terminateReason.trim(),
      });
      Alert.alert('Kura Imeanzishwa', res.data?.message);
      setEditMember(null);
      loadData();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuanzisha kura.');
    } finally {
      setSaving(false);
    }
  };

  const handleVoteTermination = async (terminationId: string, approveRemove: boolean) => {
    try {
      const res = await apiClient.post(`/members/vote-termination/${terminationId}`, { approveRemove });
      Alert.alert('Kura Imepokelewa', res.data?.message);
      loadData();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kupiga kura.');
    }
  };

  const getRoleLabel = (r: string) => {
    if (r === 'CHAIRPERSON') return 'Mwenyekiti';
    if (r === 'SECRETARY') return 'Katibu';
    if (r === 'TREASURER') return 'Mweka Hazina';
    return 'Mwanachama';
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-100">
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-100">
      <View className="bg-teal-700 pt-14 pb-6 px-6 rounded-b-3xl">
        <Text className="text-2xl font-bold text-white">
          {isChair ? 'Ofisi ya Mwenyekiti' : isLeader ? `Ofisi ya ${getRoleLabel(role || '')}` : 'Wanachama & Katiba'}
        </Text>
        <Text className="text-teal-100 text-xs mt-1">
          {group?.name} • {user?.fullName} ({getRoleLabel(role || 'MEMBER')})
        </Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-4">
        {Boolean(settings?.announcement) && (
          <View className="bg-amber-50 border border-amber-300 p-4 rounded-2xl mb-4 flex-row gap-3 items-start">
            <Ionicons name="megaphone" size={22} color="#b45309" />
            <View className="flex-1">
              <Text className="font-bold text-amber-900 text-xs uppercase">Tangazo la Kikoba</Text>
              <Text className="text-slate-800 text-sm mt-0.5">{settings.announcement}</Text>
            </View>
          </View>
        )}

        {terminations.length > 0 && (
          <View className="bg-rose-50 border border-rose-300 p-4 rounded-2xl mb-4">
            <Text className="font-bold text-rose-900 text-sm mb-2">
              Kura ya Kusitisha Uanachama (Inahitaji Nusu / 50%)
            </Text>
            {terminations.map((t) => (
              <View key={t.id} className="bg-white p-3.5 rounded-xl border border-rose-200 mb-2">
                <Text className="font-bold text-slate-900">{t.targetName}</Text>
                <Text className="text-xs text-slate-600 mt-0.5">Sababu: {t.reason}</Text>
                <Text className="text-xs font-bold text-rose-700 mt-1">
                  Kura za Ndiyo: {t.yesVotes} / {t.requiredVotes} zinazohitajika
                </Text>
                {t.targetUserId !== user?.id && !t.hasVoted && (
                  <View className="flex-row gap-2 mt-3">
                    <TouchableOpacity
                      onPress={() => handleVoteTermination(t.id, true)}
                      className="flex-1 bg-rose-700 py-2 rounded-lg items-center"
                    >
                      <Text className="text-white font-bold text-xs">Piga Kura: Asitishwe</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleVoteTermination(t.id, false)}
                      className="flex-1 bg-slate-600 py-2 rounded-lg items-center"
                    >
                      <Text className="text-white font-bold text-xs">Abaki</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {isLeader && (
          <View className="mb-4">
            <Text className="text-xs font-bold text-slate-500 uppercase mb-2">Majukumu ya Uongozi</Text>

            {/* Kitufe 1: Sajili Mwanachama Mpya */}
            <TouchableOpacity
              onPress={() => toggleSection('ADD_MEMBER')}
              className="bg-white p-4 rounded-2xl border border-slate-200 mb-2 flex-row justify-between items-center"
            >
              <View className="flex-row items-center gap-3">
                <Ionicons name="person-add" size={20} color="#0f766e" />
                <Text className="font-bold text-slate-800">Sajili Mwanachama Mpya</Text>
              </View>
              <Ionicons name={openSection === 'ADD_MEMBER' ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
            </TouchableOpacity>

            {openSection === 'ADD_MEMBER' && (
              <View className="bg-white p-4 rounded-2xl border border-teal-200 mb-3">
                <Text className="text-xs font-bold text-slate-700 mb-1">Jina Kamili</Text>
                <TextInput
                  className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-2 text-slate-900"
                  placeholder="Mfano: Juma Kassim"
                  value={newName}
                  onChangeText={setNewName}
                />
                <Text className="text-xs font-bold text-slate-700 mb-1">Namba ya Simu (07... au 2557...)</Text>
                <TextInput
                  className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 text-slate-900"
                  placeholder="0712345678"
                  keyboardType="numeric"
                  value={newPhone}
                  onChangeText={(t) => setNewPhone(t.replace(/[^0-9]/g, ''))}
                />
                {isChair && (
                  <View className="flex-row gap-2 mb-3">
                    {['MEMBER', 'SECRETARY', 'TREASURER'].map((r) => (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setNewRole(r)}
                        className={`flex-1 py-2 rounded-lg border items-center ${
                          newRole === r ? 'bg-teal-700 border-teal-700' : 'bg-slate-50 border-slate-300'
                        }`}
                      >
                        <Text className={`text-xs font-bold ${newRole === r ? 'text-white' : 'text-slate-700'}`}>
                          {getRoleLabel(r)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <TouchableOpacity onPress={handleAddMember} disabled={saving} className="bg-teal-700 p-3.5 rounded-xl items-center">
                  <Text className="text-white font-bold">Hifadhi Mwanachama</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Kitufe 2: Tangazo la Kikoba */}
            <TouchableOpacity
              onPress={() => toggleSection('ANNOUNCEMENT')}
              className="bg-white p-4 rounded-2xl border border-slate-200 mb-2 flex-row justify-between items-center"
            >
              <View className="flex-row items-center gap-3">
                <Ionicons name="megaphone-outline" size={20} color="#0f766e" />
                <Text className="font-bold text-slate-800">Toa Tangazo la Kikundi</Text>
              </View>
              <Ionicons name={openSection === 'ANNOUNCEMENT' ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
            </TouchableOpacity>

            {openSection === 'ANNOUNCEMENT' && (
              <View className="bg-white p-4 rounded-2xl border border-teal-200 mb-3">
                <TextInput
                  className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-3 text-slate-900"
                  placeholder="Andika tangazo kwa wanachama wote..."
                  multiline
                  value={announcementText}
                  onChangeText={setAnnouncementText}
                />
                <TouchableOpacity onPress={handlePublishAnnouncement} disabled={saving} className="bg-teal-700 p-3.5 rounded-xl items-center">
                  <Text className="text-white font-bold">Chapisha Tangazo</Text>
                </TouchableOpacity>
              </View>
            )}

            {isChair && settings && (
              <>
                {/* Kitufe 3: Siku ya Kikao, Muda na Eneo */}
                <TouchableOpacity
                  onPress={() => toggleSection('MEETING_SCHEDULE')}
                  className="bg-white p-4 rounded-2xl border border-slate-200 mb-2 flex-row justify-between items-center"
                >
                  <View className="flex-row items-center gap-3">
                    <Ionicons name="calendar-outline" size={20} color="#0f766e" />
                    <Text className="font-bold text-slate-800">Ratiba ya Kikao (Siku, Muda & Eneo)</Text>
                  </View>
                  <Ionicons name={openSection === 'MEETING_SCHEDULE' ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
                </TouchableOpacity>

                {openSection === 'MEETING_SCHEDULE' && (
                  <View className="bg-white p-4 rounded-2xl border border-teal-200 mb-3">
                    <Text className="text-xs font-bold text-slate-700 mb-2">Teua Siku ya Kikao Kila Wiki:</Text>
                    <View className="flex-row flex-wrap gap-1.5 mb-3">
                      {DAYS_OF_WEEK.map((day) => (
                        <TouchableOpacity
                          key={day.key}
                          onPress={() => setSettings({ ...settings, meetingDay: day.key })}
                          className={`px-3 py-1.5 rounded-lg border ${
                            settings.meetingDay === day.key
                              ? 'bg-teal-700 border-teal-700'
                              : 'bg-slate-50 border-slate-300'
                          }`}
                        >
                          <Text
                            className={`text-xs font-bold ${
                              settings.meetingDay === day.key ? 'text-white' : 'text-slate-700'
                            }`}
                          >
                            {day.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text className="text-xs font-bold text-slate-700 mb-1">Muda wa Kikao (mf. 16:00 au Saa 10 Jioni)</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      placeholder="16:00"
                      value={String(settings.meetingTime || '')}
                      onChangeText={(v) => setSettings({ ...settings, meetingTime: v })}
                    />

                    <Text className="text-xs font-bold text-slate-700 mb-1">Eneo la Kikao (Hiari / Optional)</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-3"
                      placeholder="Mfano: Ukumbi wa Kata / Kwa Mwenyekiti"
                      value={String(settings.meetingVenue || '')}
                      onChangeText={(v) => setSettings({ ...settings, meetingVenue: v })}
                    />

                    <TouchableOpacity onPress={handleSaveSettings} className="bg-teal-700 p-3.5 rounded-xl items-center">
                      <Text className="text-white font-bold">Hifadhi Ratiba ya Kikao</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Kitufe 4: Sheria za Hisa & Mfuko wa Jamii */}
                <TouchableOpacity
                  onPress={() => toggleSection('SHARES_RULES')}
                  className="bg-white p-4 rounded-2xl border border-slate-200 mb-2 flex-row justify-between items-center"
                >
                  <View className="flex-row items-center gap-3">
                    <Ionicons name="layers-outline" size={20} color="#0f766e" />
                    <Text className="font-bold text-slate-800">Sheria za Hisa & Mfuko wa Jamii</Text>
                  </View>
                  <Ionicons name={openSection === 'SHARES_RULES' ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
                </TouchableOpacity>

                {openSection === 'SHARES_RULES' && (
                  <View className="bg-white p-4 rounded-2xl border border-teal-200 mb-3">
                    <Text className="text-xs font-bold text-slate-700 mb-1">Thamani ya Hisa Moja (TZS)</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.shareValue)}
                      onChangeText={(v) => setSettings({ ...settings, shareValue: v.replace(/[^0-9]/g, '') })}
                    />
                    <Text className="text-xs font-bold text-slate-700 mb-1">Ukomo wa Idadi ya Hisa kwa Kikao</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.maxSharesPerMeeting)}
                      onChangeText={(v) => setSettings({ ...settings, maxSharesPerMeeting: v.replace(/[^0-9]/g, '') })}
                    />
                    <Text className="text-xs font-bold text-slate-700 mb-1">Mfuko wa Jamii (Kianzio / Chini - TZS)</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.socialFundMin)}
                      onChangeText={(v) => setSettings({ ...settings, socialFundMin: v.replace(/[^0-9]/g, '') })}
                    />
                    <Text className="text-xs font-bold text-slate-700 mb-1">Mfuko wa Jamii (Ukomo / Juu - TZS)</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-3"
                      keyboardType="numeric"
                      value={String(settings.socialFundMax)}
                      onChangeText={(v) => setSettings({ ...settings, socialFundMax: v.replace(/[^0-9]/g, '') })}
                    />
                    <TouchableOpacity onPress={handleSaveSettings} className="bg-teal-700 p-3.5 rounded-xl items-center">
                      <Text className="text-white font-bold">Hifadhi Sheria za Hisa & Jamii</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Kitufe 5: Sheria za Papo (Lazima & Hiari) */}
                <TouchableOpacity
                  onPress={() => toggleSection('PAPO_RULES')}
                  className="bg-white p-4 rounded-2xl border border-slate-200 mb-2 flex-row justify-between items-center"
                >
                  <View className="flex-row items-center gap-3">
                    <Ionicons name="flash-outline" size={20} color="#0f766e" />
                    <Text className="font-bold text-slate-800">Sheria za Papo (Lazima & Hiari)</Text>
                  </View>
                  <Ionicons name={openSection === 'PAPO_RULES' ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
                </TouchableOpacity>

                {openSection === 'PAPO_RULES' && (
                  <View className="bg-white p-4 rounded-2xl border border-teal-200 mb-3">
                    <Text className="text-xs font-bold text-slate-700 mb-1">Riba ya Papo Kila Kikao (%)</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.papoMeetingInterest)}
                      onChangeText={(v) => setSettings({ ...settings, papoMeetingInterest: v.replace(/[^0-9]/g, '') })}
                    />
                    <Text className="text-xs font-bold text-slate-700 mb-1">Kiwango cha Chini Papo ya Hiari (TZS)</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.minTopUpPapoCap)}
                      onChangeText={(v) => setSettings({ ...settings, minTopUpPapoCap: v.replace(/[^0-9]/g, '') })}
                    />
                    <Text className="text-xs font-bold text-slate-700 mb-1">Ukomo wa Juu Papo ya Hiari (TZS)</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.maxTopUpPapoCap)}
                      onChangeText={(v) => setSettings({ ...settings, maxTopUpPapoCap: v.replace(/[^0-9]/g, '') })}
                    />
                    <Text className="text-xs font-bold text-slate-700 mb-1">Muda wa Kurejesha Papo ya Hiari (Majuma)</Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-3"
                      keyboardType="numeric"
                      value={String(settings.topUpPapoWeeks)}
                      onChangeText={(v) => setSettings({ ...settings, topUpPapoWeeks: v.replace(/[^0-9]/g, '') })}
                    />
                    <TouchableOpacity onPress={handleSaveSettings} className="bg-teal-700 p-3.5 rounded-xl items-center">
                      <Text className="text-white font-bold">Hifadhi Sheria za Papo</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Kitufe 6: Sheria za Mkopo Mkubwa (Kipekee) */}
                <TouchableOpacity
                  onPress={() => toggleSection('BIG_LOAN_RULES')}
                  className="bg-white p-4 rounded-2xl border border-slate-200 mb-2 flex-row justify-between items-center"
                >
                  <View className="flex-row items-center gap-3">
                    <Ionicons name="cash-outline" size={20} color="#0f766e" />
                    <Text className="font-bold text-slate-800">Sheria za Mkopo Mkubwa</Text>
                  </View>
                  <Ionicons name={openSection === 'BIG_LOAN_RULES' ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
                </TouchableOpacity>

                {openSection === 'BIG_LOAN_RULES' && (
                  <View className="bg-white p-4 rounded-2xl border border-teal-200 mb-3">
                    <Text className="text-xs font-bold text-slate-700 mb-1">
                      Kiwango cha Mkopo (Mara Ngapi ya Hisa za Mwanachama, mf. 2 au 3)
                    </Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.loanLimitMultiplier)}
                      onChangeText={(v) => setSettings({ ...settings, loanLimitMultiplier: v.replace(/[^0-9]/g, '') })}
                    />

                    <Text className="text-xs font-bold text-slate-700 mb-1">
                      Kikomo cha Juu cha Mkopo Mkubwa (TZS - Weka 0 kama hakina ukomo)
                    </Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.maxBigLoanCap)}
                      onChangeText={(v) => setSettings({ ...settings, maxBigLoanCap: v.replace(/[^0-9]/g, '') })}
                    />

                    <Text className="text-xs font-bold text-slate-700 mb-1">
                      Muda wa Kurejesha Mkopo Mkubwa (Miezi Mingapi, mf. 3 au 6)
                    </Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.maxRepaymentMonths)}
                      onChangeText={(v) => setSettings({ ...settings, maxRepaymentMonths: v.replace(/[^0-9]/g, '') })}
                    />

                    <Text className="text-xs font-bold text-slate-700 mb-1">
                      Riba ya Mkopo Mkubwa Kila Mwezi Husika (%)
                    </Text>
                    <TextInput
                      className="bg-slate-50 border border-slate-300 rounded-xl p-2.5 mb-2"
                      keyboardType="numeric"
                      value={String(settings.interestRate)}
                      onChangeText={(v) => setSettings({ ...settings, interestRate: v.replace(/[^0-9]/g, '') })}
                    />

                    <View className="flex-row justify-between items-center py-2 mb-3">
                      <Text className="text-xs font-bold text-slate-700">Lazima Mkopaji Awe na Mdhamini</Text>
                      <Switch
                        value={Boolean(settings.requireGuarantor)}
                        onValueChange={(v) => setSettings({ ...settings, requireGuarantor: v })}
                      />
                    </View>

                    <TouchableOpacity onPress={handleSaveSettings} className="bg-teal-700 p-3.5 rounded-xl items-center">
                      <Text className="text-white font-bold">Hifadhi Sheria za Mkopo Mkubwa</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Kitufe 7: Viwango vya Faini Zote 9 */}
                <TouchableOpacity
                  onPress={() => toggleSection('FINES_RULES')}
                  className="bg-white p-4 rounded-2xl border border-slate-200 mb-2 flex-row justify-between items-center"
                >
                  <View className="flex-row items-center gap-3">
                    <Ionicons name="alert-circle-outline" size={20} color="#be123c" />
                    <Text className="font-bold text-slate-800">Viwango vya Faini Zote 9 (TZS)</Text>
                  </View>
                  <Ionicons name={openSection === 'FINES_RULES' ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
                </TouchableOpacity>

                {openSection === 'FINES_RULES' && (
                  <View className="bg-white p-4 rounded-2xl border border-rose-200 mb-3">
                    {[
                      { key: 'latePenalty', label: 'Faini ya Kuchelewa Kikaoni' },
                      { key: 'absentPenalty', label: 'Faini ya Kutofika Kikaoni' },
                      { key: 'noSharePenalty', label: 'Faini ya Kutonunua Hisa' },
                      { key: 'noSocialFundPenalty', label: 'Faini ya Kutonunua Jamii' },
                      { key: 'noPapoInterestPenalty', label: 'Faini ya Kutotoa Riba ya Papo' },
                      { key: 'lateTopUpPenalty', label: 'Faini ya Kuchelewesha Papo ya Hiari' },
                      { key: 'lateLoanInterestPenalty', label: 'Faini ya Kuchelewesha Riba ya Mkopo' },
                      { key: 'disciplinePenalty', label: 'Faini ya Utovu wa Nidhamu' },
                      { key: 'otherPenalty', label: 'Faini Nyinginezo' },
                    ].map((item) => (
                      <View key={item.key} className="mb-2">
                        <Text className="text-xs font-bold text-slate-700 mb-1">{item.label}</Text>
                        <TextInput
                          className="bg-slate-50 border border-slate-300 rounded-xl p-2.5"
                          keyboardType="numeric"
                          value={String(settings[item.key] || 0)}
                          onChangeText={(v) => setSettings({ ...settings, [item.key]: v.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                    ))}
                    <TouchableOpacity onPress={handleSaveSettings} className="bg-rose-700 p-3.5 rounded-xl items-center mt-2">
                      <Text className="text-white font-bold">Hifadhi Viwango vya Faini</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        <Text className="text-xs font-bold text-slate-500 uppercase mb-2">
          Wanachama Hai ({members.length}) {isChair ? '• Gusa Mwanachama Kumsimamia' : ''}
        </Text>
        {members.map((m) => (
          <TouchableOpacity
            key={m.userId}
            onPress={() => openEditMemberModal(m)}
            disabled={!isChair}
            className="bg-white p-4 rounded-2xl mb-2.5 border border-slate-200 flex-row justify-between items-center"
          >
            <View className="flex-1">
              <Text className="font-bold text-slate-900">{m.fullName}</Text>
              <Text className="text-xs text-slate-500">
                {m.phone} • {getRoleLabel(m.role)}
              </Text>
              <Text className="text-xs text-teal-700 font-semibold mt-1">
                Hisa: {m.totalSharesCount} (TZS {Number(m.totalSharesValue || 0).toLocaleString()})
              </Text>
            </View>
            {isChair && <Ionicons name="settings-outline" size={20} color="#0f766e" />}
          </TouchableOpacity>
        ))}

        <TouchableOpacity
          onPress={signOut}
          className="bg-slate-800 p-4 rounded-2xl items-center flex-row justify-center gap-2 mt-4 mb-10"
        >
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text className="text-white font-bold">Ondoka Kwenye Akaunti (Logout)</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={!!editMember} animationType="slide" transparent>
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl p-6">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-slate-900">Simamia Mwanachama</Text>
              <TouchableOpacity onPress={() => setEditMember(null)}>
                <Ionicons name="close-circle" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text className="text-xs font-bold text-slate-700 mb-1">Jina Kamili</Text>
            <TextInput
              className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-2"
              value={editName}
              onChangeText={setEditName}
            />
            <Text className="text-xs font-bold text-slate-700 mb-1">Namba ya Simu</Text>
            <TextInput
              className="bg-slate-50 border border-slate-300 rounded-xl p-3 mb-2"
              keyboardType="numeric"
              value={editPhone}
              onChangeText={(t) => setEditPhone(t.replace(/[^0-9]/g, ''))}
            />
            <Text className="text-xs font-bold text-slate-700 mb-1">Cheo Kwenye Kikundi</Text>
            <View className="flex-row gap-2 mb-3">
              {['MEMBER', 'SECRETARY', 'TREASURER'].map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => setEditRole(r)}
                  className={`flex-1 py-2 rounded-lg border items-center ${
                    editRole === r ? 'bg-teal-700 border-teal-700' : 'bg-slate-50 border-slate-300'
                  }`}
                >
                  <Text className={`text-xs font-bold ${editRole === r ? 'text-white' : 'text-slate-700'}`}>
                    {getRoleLabel(r)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity onPress={handleUpdateMember} className="bg-teal-700 p-3.5 rounded-xl items-center mb-4">
              <Text className="text-white font-bold">Hifadhi Mabadiliko ya Taarifa</Text>
            </TouchableOpacity>

            <View className="border-t border-slate-200 pt-4">
              <Text className="text-xs font-bold text-rose-800 mb-1">
                Anzisha Kura ya Kusitisha Uanachama (Nusu ya Kura Itathibitisha)
              </Text>
              <TextInput
                className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-2 text-slate-900"
                placeholder="Andika sababu ya kusitisha uanachama..."
                value={terminateReason}
                onChangeText={setTerminateReason}
              />
              <TouchableOpacity onPress={handleInitiateTermination} className="bg-rose-700 p-3.5 rounded-xl items-center">
                <Text className="text-white font-bold">Anzisha Kura ya Kumwondoa</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
