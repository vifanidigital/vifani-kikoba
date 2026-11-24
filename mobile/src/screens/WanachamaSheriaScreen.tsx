import { AddMemberForm, MemberStatusForm } from '../components/OfficeMemberForms';
import { FormTextInput, FormScrollView } from '../components/KeyboardForm';
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,

  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Switch } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useTabData } from '../api/useTabData';
import GroupAnnouncementEditor from '../components/GroupAnnouncementEditor';
import TopTabs from '../components/TopTabs';
import TabDataNotice from '../components/TabDataNotice';
import { parseOffice } from '../api/tabResponses';

const LEADER_ROLES = ['CHAIRPERSON', 'SECRETARY', 'TREASURER'];

export default function WanachamaSheriaScreen() {
  const insets = useSafeAreaInsets();
  const { role, user, group: activeGroup } = useAuth();
  const { isDark } = useTheme();


  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'MEMBERS' | 'RULES' | 'CONSTITUTION'>('MEMBERS');

  const [searchQuery, setSearchQuery] = useState('');
  const [contactMember, setContactMember] = useState<any>(null);
  const [auditedUserId, setAuditedUserId] = useState<string | null>(null);
  const auditVersion = useRef(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditData, setAuditData] = useState<any>(null);

  const [isEditingConstitution, setIsEditingConstitution] = useState(false);
  const [constitutionDraft, setConstitutionDraft] = useState('');

  const [isEditingRules, setIsEditingRules] = useState(false);
  const [rulesForm, setRulesForm] = useState<any>({});

  const scope = `${activeGroup?.id}_${user?.id}_${role}`;
  const panel = useTabData('/group/settings', scope, parseOffice);

  const viewerRole = panel.data?.viewerRole ?? role;
  const isChairperson = viewerRole === 'CHAIRPERSON';
  const isLeader = LEADER_ROLES.includes(String(viewerRole || ''));
  const group: any = panel.data?.group;
  const directory = panel.data?.directory ?? [];
  const loadOffice = panel.reload;

  const handleCallMember = (phone: string, name: string) => {
    if (!phone) return Alert.alert('Samahani', 'Mwanachama huyu hana namba ya simu.');
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Hitilafu', `Imeshindikana kufungua kipiga simu kwa ${name}.`);
    });
  };

  const handleSmsMember = (phone: string, name: string) => {
    if (!phone) return Alert.alert('Samahani', 'Mwanachama huyu hana namba ya simu.');
    Linking.openURL(`sms:${phone}`).catch(() => {
      Alert.alert('Hitilafu', `Imeshindikana kufungua sehemu ya ujumbe kwa ${name}.`);
    });
  };

  const handleWhatsAppMember = (phone: string, name: string) => {
    if (!phone) return Alert.alert('Samahani', 'Mwanachama huyu hana namba ya simu.');
    const digits = phone.replace(/[^0-9]/g, '');
    const intlPhone = digits.startsWith('0') ? `255${digits.slice(1)}` : digits;
    const msg = encodeURIComponent(`Habari ${name}, nakusalimu kutoka kwenye kikundi chetu cha ${group?.name || 'Vifani Jamii'}.`);
    Linking.openURL(`https://wa.me/${intlPhone}?text=${msg}`).catch(() => {
      Alert.alert('WhatsApp Haipatikani', 'Hakikisha WhatsApp imewekwa kwenye simu yako.');
    });
  };

  const handleInspectMember = async (targetUserId: string) => {
    if (!isLeader) return;
    const version = ++auditVersion.current;
    setAuditData(null);
    if (auditedUserId === targetUserId) {
      setAuditedUserId(null);
      setAuditLoading(false);
      return;
    }
    setAuditedUserId(targetUserId);
    setAuditLoading(true);
    try {
      const res = await apiClient.get(`/group/member-audit/${targetUserId}`);
      if (version === auditVersion.current) setAuditData(res.data || null);
    } catch (error: any) {
      if (version !== auditVersion.current) return;
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuvuta taarifa.');
      setAuditedUserId(null);
    } finally {
      if (version === auditVersion.current) setAuditLoading(false);
    }
  };
  const handleUseConstitutionTemplate = () => {
    const gName = group?.name || 'KIKUNDI CHETU';
    const template =
      `KATIBA NA KANUNI ZA ${gName.toUpperCase()}\n\n` +
      `IBARA YA 1: JINA NA MADHUMUNI\n` +
      `Kikundi hiki kitajulikana kama ${gName}, kikiwa na lengo la kukuza uchumi wa wanachama kupitia uwekaji akiba wa hisa, mfuko wa jamii na mikopo yenye masharti nafuu.\n\n` +
      `IBARA YA 2: HISA NA MICHANGO YA KIKAO\n` +
      `Thamani ya hisa moja ni TZS ${Number(group?.shareValue || 5000).toLocaleString()}. Kila mwanachama atanunua kati ya hisa ${group?.minSharesPerMeeting || 1} hadi ${group?.maxSharesPerMeeting || 10} kila kikao pamoja na mchango wa Mfuko wa Jamii.\n\n` +
      `IBARA YA 3: MFUKO WA JAMII\n` +
      `Mfuko wa jamii utatumika kusaidia wanachama wakati wa misiba, maradhi makubwa au sherehe rasmi kama ilivyokubaliwa kikaoni.\n\n` +
      `IBARA YA 4: MIKOPO NA RIBA\n` +
      `Mwanachama atakopa hadi mara ${group?.loanLimitMultiplier || 3} ya thamani ya hisa zake kwa riba ya ${group?.interestRate || 10}% ndani ya miezi ${group?.maxRepaymentMonths || 3}.\n\n` +
      `IBARA YA 5: NIDHAMU NA FAINI\n` +
      `Mwanachama atakayechelewa kikao, kutofika bila taarifa au kuchelewesha marejesho atalipa faini kulingana na sheria za kikundi.\n\n` +
      `IBARA YA 6: KUVUNJA KIKOBA (GAWIO)\n` +
      `Mwisho wa mzunguko, hisa, Jamii, riba ya mkopo iliyolipwa kwa wakati hurudi kwa mwenyewe. Papo ya lazima ni deni la kurejesha siku ya kufunga na hubaki mali ya mwenyewe. Kila mwanachama hupata nusu ya riba za Papo alizolipa. Nusu nyingine, riba zilizocheleweshwa na faini zilizolipwa huingia kwenye mfuko wa pamoja. Salio lake baada ya matumizi hugawanywa sawa kwa wanachama hai.`;

    setConstitutionDraft(template);
    setIsEditingConstitution(true);
  };

  const handlePickConstitutionDoc = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/plain',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          '*/*',
        ],
        copyToCacheDirectory: true });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      const fileName = asset.name || 'Katiba';

      if (fileName.toLowerCase().endsWith('.txt')) {
        const content = await new File(asset.uri).text();
        setConstitutionDraft(content);
        setIsEditingConstitution(true);
        Alert.alert('Faili Limepakiwa', `Maandishi kutoka "${fileName}" yamepakiwa. Hakiki kisha bonyeza Hifadhi Katiba.`);
      } else {
        setIsEditingConstitution(true);
        Alert.alert(
          'Faili Limechaguliwa',
          `Umechagua faili "${fileName}". Nakili (Copy) maandishi kutoka kwenye faili lako la Word na uyabandike (Paste) hapa chini, kisha ubonyeze Hifadhi Katiba.`
        );
      }
    } catch {
      Alert.alert('Hitilafu', 'Imeshindikana kusoma faili ulilochagua.');
    }
  };

  const handleShareConstitutionPdf = async () => {
    try {
      const safeGroupName = String(group?.name || 'KIKOBA')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const textBody = String(group?.constitution || 'Katiba bado haijaandikwa.')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');

      const html = `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8" /></head>
          <body style="font-family: sans-serif; padding: 28px; color: #1e293b; line-height: 1.6;">
            <div style="text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 18px;">
              <h1 style="color: #0f766e; margin: 0; font-size: 20px;">${safeGroupName}</h1>
              <p style="margin: 4px 0 0; font-size: 12px; color: #475569; font-weight: bold;">KATIBA NA KANUNI ZA KIKUNDI</p>
            </div>
            <div style="font-size: 13px; text-align: justify;">${textBody}</div>
            <div style="margin-top: 24px; padding: 12px; background: #f1f5f9; border-radius: 8px; font-size: 11px;">
              <strong>Muhtasari wa Masharti ya Fedha:</strong><br/>
              • Thamani ya Hisa: TZS ${Number(group?.shareValue || 0).toLocaleString()} (Hisa ${group?.minSharesPerMeeting}-${group?.maxSharesPerMeeting} kwa kikao)<br/>
              • Mfuko wa Jamii: TZS ${Number(group?.socialFundMin || 0).toLocaleString()} - TZS ${Number(group?.socialFundMax || 0).toLocaleString()}<br/>
              • Riba ya Papo: ${group?.papoMeetingInterest || 0}% | Riba ya Mkopo Mkubwa: ${group?.interestRate || 10}% (Miezi ${group?.maxRepaymentMonths})
            </div>
            <p style="margin-top: 20px; font-size: 10px; color: #64748b; text-align: center;">
              Imetolewa kupitia Mfumo wa Vifani Jamii • ${new Date().toLocaleDateString('sw-TZ')}
            </p>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Katiba ya ${group?.name || 'Kikundi'}` });
      } else {
        await Print.printAsync({ html });
      }
    } catch (err: any) {
      console.log('PDF Error:', err?.message);
      Alert.alert('Hitilafu ya PDF', err?.message || 'Imeshindikana kutengeneza PDF ya Katiba.');
    }
  };
  const handleSaveConstitution = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put('/group/constitution', { constitution: constitutionDraft });
      Alert.alert('Imefanikiwa', res.data?.message);
      setIsEditingConstitution(false);
      loadOffice();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuhifadhi Katiba.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRules = async () => {
    setSaving(true);
    try {
      const res = await apiClient.put('/group/settings', rulesForm);
      Alert.alert('Imefanikiwa', res.data?.message);
      setIsEditingRules(false);
      loadOffice();
    } catch (error: any) {
      Alert.alert('Hitilafu', error.response?.data?.error || 'Imeshindikana kuhifadhi sheria.');
    } finally {
      setSaving(false);
    }
  };

  const getRoleLabel = (r: string) => {
    if (r === 'CHAIRPERSON') return 'Mwenyekiti';
    if (r === 'SECRETARY') return 'Katibu';
    if (r === 'TREASURER') return 'Mweka Hazina';
    return 'Mwanachama';
  };

  const getDayName = (d: number) => {
    const days = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
    return days[d] || 'Alhamisi';
  };

  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputClass = isDark
    ? 'bg-slate-800 border-slate-700 text-white'
    : 'bg-slate-50 border-slate-300 text-slate-900';

  const filteredDirectory = directory.filter(
    (m) =>
      String(m.fullName || '').toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
      String(m.phone || '').includes(searchQuery.trim())
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className={`flex-1 ${bgClass}`}>
      <View
        style={{ paddingTop: Math.max(insets.top + 10, 44) }}
        className="bg-teal-700 pb-5 px-6 rounded-b-3xl shadow-md"
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-1">
            <Text className="text-2xl font-extrabold text-white">Ofisi & Sheria</Text>
            <Text className="text-teal-100 text-xs mt-1">
              Wanachama, Mawasiliano, Sheria za Kikoba & Katiba
            </Text>
          </View>
          {panel.loading && (
            <View className="flex-row items-center gap-1.5 bg-teal-900/70 px-3 py-1.5 rounded-full">
              <ActivityIndicator size="small" color="#5eead4" />
              <Text className="text-teal-100 text-[10px] font-bold">Inasasisha...</Text>
            </View>
          )}
        </View>

        <TopTabs selected={activeSection} onSelect={setActiveSection} tabs={[{ id: 'MEMBERS', label: 'Wanachama' }, { id: 'RULES', label: 'Sheria na Faini' }, { id: 'CONSTITUTION', label: 'Katiba na PDF' }]} />
      </View>

      <FormScrollView
        keyboardDismissMode="on-drag"
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
          {(panel.data?.subscriptionAccess === 'EXPIRED' || panel.data?.subscriptionAccess === 'SUSPENDED') && (
            <Text className="mb-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-900">Kikundi kinaweza kusoma taarifa. Wasiliana na msimamizi kuhusu huduma.</Text>
          )}
          <TabDataNotice loading={panel.loading} error={panel.error} hasData={panel.data != null} retry={panel.reload} />
          {isChairperson && group && <GroupAnnouncementEditor key={scope} group={group} reload={loadOffice} />}
          {panel.data != null && <>
          {activeSection === 'MEMBERS' && (
            <>
              {isChairperson && <AddMemberForm reload={loadOffice} />}
              <View className="bg-slate-900 p-4 rounded-2xl mb-4 border border-slate-800 shadow-sm">
                <Text className="text-teal-300 text-xs font-extrabold uppercase mb-1.5">
                  Ratiba ya Vikao vya Kikundi
                </Text>
                <Text className="text-white text-xs">
                  Siku: <Text className="font-bold">{getDayName(Number(group?.meetingDayOfWeek ?? 4))}</Text> • Saa:{' '}
                  <Text className="font-bold">{group?.meetingTime || '16:00'}</Text>
                </Text>
                {Boolean(group?.meetingVenue) && (
                  <Text className="text-slate-300 text-xs mt-0.5">
                    Mahali: <Text className="font-bold">{group?.meetingVenue}</Text>
                  </Text>
                )}
                <View className="mt-3 pt-2.5 border-t border-slate-800">
                  <Text className="text-teal-300 text-[11px] font-bold uppercase mb-1">Safu ya Uongozi:</Text>
                  {directory
                    .filter((m) => LEADER_ROLES.includes(m.role))
                    .map((ld) => (
                      <Text key={ld.memberId} className="text-slate-200 text-xs py-0.5">
                        • {getRoleLabel(ld.role)}: <Text className="font-bold">{ld.fullName}</Text> ({ld.phone})
                      </Text>
                    ))}
                </View>
              </View>

              <View className={`flex-row items-center px-3.5 py-2.5 rounded-xl border mb-3 ${cardClass}`}>
                <Ionicons name="search" size={16} color="#64748b" />
                <FormTextInput
                  placeholder="Tafuta mwanachama kwa jina au namba..."
                  placeholderTextColor="#94a3b8"
                  className={`flex-1 ml-2 text-xs font-semibold ${textMain}`}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              <View className="flex-row items-center gap-1.5 mb-2.5">
                <Ionicons name="lock-closed" size={14} color="#0f766e" />
                <Text className={`text-[11px] font-bold ${textSub}`}>
                  {isLeader
                    ? 'Gusa jina kukagua taarifa za siri, au bonyeza "Mawasiliano"'
                    : 'Usiri umelindwa • Bonyeza "Mawasiliano" kupiga simu au kutuma ujumbe'}
                </Text>
              </View>
              {filteredDirectory.map((m) => {
                const isAuditing = auditedUserId === m.userId;
                return (
                  <View key={m.memberId} className={`p-4 rounded-2xl border mb-2.5 ${cardClass}`}>
                    <View className="flex-row justify-between items-center">
                      <TouchableOpacity
                        disabled={!isLeader}
                        onPress={() => handleInspectMember(m.userId)}
                        className="flex-1 pr-2"
                      >
                        <View className="flex-row items-center gap-2 flex-wrap">
                          <Text className={`font-extrabold text-sm ${textMain}`}>{m.fullName}</Text>
                          {!m.isActive && <Text className="rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">Si hai</Text>}
                          <View className="bg-teal-600/15 px-2 py-0.5 rounded-md">
                            <Text className="text-[10px] font-bold text-teal-700">{getRoleLabel(m.role)}</Text>
                          </View>
                        </View>
                        <Text className={`text-xs mt-1 font-semibold ${textSub}`}>
                          Simu: <Text className="text-teal-600 font-bold">{m.phone}</Text> • Alijiunga:{' '}
                          {new Date(m.joinedAt).toLocaleDateString('sw-TZ')}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => setContactMember(m)}
                        className="bg-teal-700 px-3.5 py-2.5 rounded-xl flex-row items-center gap-1.5 shadow-sm"
                      >
                        <Ionicons name="chatbubbles-outline" size={16} color="#ffffff" />
                        <Text className="text-white font-bold text-xs">Mawasiliano</Text>
                      </TouchableOpacity>
                    </View>

                    {!m.isActive && m.suspensionReason ? <Text className={'mt-2 text-xs ' + textSub}>{m.suspensionReason}</Text> : null}
                    {isChairperson && m.userId !== user?.id && m.role !== 'CHAIRPERSON' && <MemberStatusForm member={m} reload={loadOffice} />}
                    {isLeader && isAuditing && (
                      <View className="mt-3 pt-3 border-t border-slate-200/30 bg-teal-600/10 p-3 rounded-xl">
                        {auditLoading ? (
                          <ActivityIndicator size="small" color="#0f766e" />
                        ) : auditData ? (
                          <>
                            <Text className="text-[11px] font-extrabold text-teal-800 uppercase mb-1.5">
                              Taarifa za Siri za {m.fullName} (Ukaguzi)
                            </Text>
                            {typeof auditData.netPersonalClaims === 'number' && (
                              <View className="mb-2">
                                <Text className={'text-xs ' + textSub}>Michango na stahiki binafsi: TZS {Number(auditData.personalClaims).toLocaleString()}</Text>
                                <Text className={'text-xs ' + textSub}>Jumla ya madeni: TZS {Number(auditData.totalDebt).toLocaleString()}</Text>
                                <Text className={'text-xs font-bold ' + textMain}>
                                  {auditData.netPersonalClaims > 0 ? 'Kikundi kinadaiwa na mwanachama' : auditData.netPersonalClaims < 0 ? 'Mwanachama anadaiwa na kikundi' : 'Salio ni sifuri'} · TZS {Math.abs(auditData.netPersonalClaims).toLocaleString()}
                                </Text>
                                <Text className={'text-xs ' + textSub}>Makadirio kabla ya gawio la pamoja.</Text>
                              </View>
                            )}
                            <View className="flex-row justify-between py-0.5">
                              <Text className={`text-xs ${textSub}`}>Hisa ({auditData.sharesCount}):</Text>
                              <Text className={`text-xs font-bold ${textMain}`}>
                                TZS {Number(auditData.sharesValue || 0).toLocaleString()}
                              </Text>
                            </View>
                            <View className="flex-row justify-between py-0.5">
                              <Text className={`text-xs ${textSub}`}>Mfuko wa Jamii:</Text>
                              <Text className={`text-xs font-bold ${textMain}`}>
                                TZS {Number(auditData.socialFundValue || 0).toLocaleString()}
                              </Text>
                            </View>
                            <View className="flex-row justify-between py-0.5">
                              <Text className={`text-xs ${textSub}`}>Papo ya Lazima:</Text>
                              <Text className={`text-xs font-bold ${textMain}`}>
                                TZS {Number(auditData.papoMandatory || 0).toLocaleString()}
                              </Text>
                            </View>
                            <View className="flex-row justify-between py-0.5">
                              <Text className={`text-xs ${textSub}`}>Deni la Mkopo Mkubwa:</Text>
                              <Text className="text-xs font-bold text-amber-600">
                                TZS {Number(auditData.loanDebt || 0).toLocaleString()}
                              </Text>
                            </View>
                            <View className="flex-row justify-between py-0.5">
                              <Text className={`text-xs ${textSub}`}>Deni la Papo Hiari:</Text>
                              <Text className="text-xs font-bold text-amber-600">
                                TZS {Number(auditData.papoTopUpDebt || 0).toLocaleString()}
                              </Text>
                            </View>
                            <View className="flex-row justify-between py-0.5">
                              <Text className={`text-xs ${textSub}`}>Faini Zinazodaiwa:</Text>
                              <Text className="text-xs font-bold text-rose-600">
                                TZS {Number(auditData.unpaidFines || 0).toLocaleString()}
                              </Text>
                            </View>
                          </>
                        ) : null}
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}
          {activeSection === 'RULES' && (
            <>
              <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
                <View className="flex-row justify-between items-center mb-3">
                  <Text className="text-xs font-extrabold text-teal-600 uppercase">
                    Sheria Kuu za Fedha za Kikundi
                  </Text>
                  {isChairperson && (
                    <TouchableOpacity
                      onPress={() => {
                        setRulesForm(group || {});
                        setIsEditingRules(!isEditingRules);
                      }}
                      className="bg-teal-700 px-3 py-1.5 rounded-lg"
                    >
                      <Text className="text-white font-bold text-[11px]">
                        {isEditingRules ? 'Ghairi' : 'Hariri Sheria Zote'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {!isEditingRules ? (
                  <>
                    <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Jina la Kikundi:</Text>
                      <Text className={`text-xs font-bold ${textMain}`}>{group?.name}</Text>
                    </View>
                    <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Thamani ya Hisa Moja:</Text>
                      <Text className={`text-xs font-bold ${textMain}`}>
                        TZS {Number(group?.shareValue || 0).toLocaleString()}
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Hisa kwa Kikao (Chini - Juu):</Text>
                      <Text className={`text-xs font-bold ${textMain}`}>
                        Hisa {group?.minSharesPerMeeting} - {group?.maxSharesPerMeeting}
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Mfuko wa Jamii kwa Kikao:</Text>
                      <Text className={`text-xs font-bold ${textMain}`}>
                        TZS {Number(group?.socialFundMin || 0).toLocaleString()} - {Number(group?.socialFundMax || 0).toLocaleString()}
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Papo ya Lazima & Riba ya Kikao:</Text>
                      <Text className={`text-xs font-bold ${textMain}`}>
                        {group?.hasPapo
                          ? `Imewashwa (TZS ${Number(group?.mandatoryPapoAmount || 0).toLocaleString()} • ${group?.papoMeetingInterest || 0}%)`
                          : 'Imezimwa'}
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Papo ya Hiari (Top-Up):</Text>
                      <Text className={`text-xs font-bold ${textMain}`}>
                        {group?.allowTopUpPapo
                          ? `TZS ${Number(group?.minTopUpPapoCap || 0).toLocaleString()} - ${Number(group?.maxTopUpPapoCap || 0).toLocaleString()} (Majuma ${group?.topUpPapoWeeks})`
                          : 'Imezimwa'}
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Riba ya Mkopo Mkubwa & Muda:</Text>
                      <Text className={`text-xs font-bold ${textMain}`}>
                        {group?.interestRate || 10}% (Miezi {group?.maxRepaymentMonths})
                      </Text>
                    </View>
                    <View className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                      <Text className={`text-xs ${textSub}`}>Kiwango cha Mkopo (Mara ya Hisa):</Text>
                      <Text className={`text-xs font-bold ${textMain}`}>
                        Mara {group?.loanLimitMultiplier || 3} (Ukomo: TZS {Number(group?.maxBigLoanCap || 0).toLocaleString()})
                      </Text>
                    </View>
                    <View className="flex-row justify-between pt-1.5">
                      <Text className={`text-xs ${textSub}`}>Mdhamini Kwenye Mkopo:</Text>
                      <Text className={`text-xs font-bold ${textMain}`}>
                        {group?.requireGuarantor ? 'Ni Lazima' : 'Si Lazima'}
                      </Text>
                    </View>
                  </>
                ) : (
                  <View className="space-y-2.5">
                    <Text className={`text-xs font-bold ${textSub}`}>Jina la Kikundi:</Text>
                    <FormTextInput
                      className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                      value={String(rulesForm.name || '')}
                      onChangeText={(t) => setRulesForm({ ...rulesForm, name: t })}
                    />

                    <Text className={`text-xs font-bold ${textSub}`}>Mahali pa Kikao & Saa:</Text>
                    <View className="flex-row gap-2">
                      <FormTextInput
                        placeholder="Mahali"
                        className={`flex-1 border rounded-xl p-2.5 text-xs ${inputClass}`}
                        value={String(rulesForm.meetingVenue || '')}
                        onChangeText={(t) => setRulesForm({ ...rulesForm, meetingVenue: t })}
                      />
                      <FormTextInput
                        placeholder="Saa (16:00)"
                        className={`w-28 border rounded-xl p-2.5 text-xs ${inputClass}`}
                        value={String(rulesForm.meetingTime || '')}
                        onChangeText={(t) => setRulesForm({ ...rulesForm, meetingTime: t })}
                      />
                    </View>

                    <Text className={`text-xs font-bold ${textSub}`}>Thamani ya Hisa Moja (TZS):</Text>
                    <FormTextInput
                      keyboardType="numeric"
                      className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                      value={String(rulesForm.shareValue ?? '')}
                      onChangeText={(t) => setRulesForm({ ...rulesForm, shareValue: t.replace(/[^0-9]/g, '') })}
                    />

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Hisa Chini:</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.minSharesPerMeeting ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, minSharesPerMeeting: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Hisa Juu:</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.maxSharesPerMeeting ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, maxSharesPerMeeting: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                    </View>

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Jamii Chini (TZS):</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.socialFundMin ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, socialFundMin: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Jamii Juu (TZS):</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.socialFundMax ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, socialFundMax: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                    </View>
                    <View className="flex-row justify-between items-center py-1">
                      <Text className={`text-xs font-bold ${textMain}`}>Washa Mfuko wa Papo (Papo ya Lazima)?</Text>
                      <Switch
                        value={Boolean(rulesForm.hasPapo)}
                        onValueChange={(v) => setRulesForm({ ...rulesForm, hasPapo: v })}
                      />
                    </View>

                    {Boolean(rulesForm.hasPapo) && (
                      <View>
                        <Text className={`text-xs font-bold mb-1 ${textSub}`}>Kiasi cha Papo ya Lazima (TZS):</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.mandatoryPapoAmount ?? '')}
                          onChangeText={(t) =>
                            setRulesForm({ ...rulesForm, mandatoryPapoAmount: t.replace(/[^0-9]/g, '') })
                          }
                        />
                      </View>
                    )}

                    <View className="flex-row justify-between items-center py-1">
                      <Text className={`text-xs font-bold ${textMain}`}>Ruhusu Papo ya Hiari (Top-Up)?</Text>
                      <Switch
                        value={Boolean(rulesForm.allowTopUpPapo)}
                        onValueChange={(v) => setRulesForm({ ...rulesForm, allowTopUpPapo: v })}
                      />
                    </View>

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Riba ya Papo (%):</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.papoMeetingInterest ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, papoMeetingInterest: t.replace(/[^0-9.]/g, '') })}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Majuma Papo Hiari:</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.topUpPapoWeeks ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, topUpPapoWeeks: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                    </View>

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Papo Hiari Chini:</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.minTopUpPapoCap ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, minTopUpPapoCap: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Papo Hiari Juu:</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.maxTopUpPapoCap ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, maxTopUpPapoCap: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                    </View>

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Riba Mkopo (%):</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.interestRate ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, interestRate: t.replace(/[^0-9.]/g, '') })}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Miezi ya Mkopo:</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.maxRepaymentMonths ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, maxRepaymentMonths: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                    </View>

                    <View className="flex-row gap-2">
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Mara ya Hisa (Mkopo):</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.loanLimitMultiplier ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, loanLimitMultiplier: t.replace(/[^0-9.]/g, '') })}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className={`text-xs font-bold ${textSub}`}>Ukomo Mkopo (TZS):</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`border rounded-xl p-2.5 text-xs font-bold ${inputClass}`}
                          value={String(rulesForm.maxBigLoanCap ?? '')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, maxBigLoanCap: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                    </View>

                    <View className="flex-row justify-between items-center py-1">
                      <Text className={`text-xs font-bold ${textMain}`}>Lazima Mdhamini Kwenye Mkopo?</Text>
                      <Switch
                        value={Boolean(rulesForm.requireGuarantor)}
                        onValueChange={(v) => setRulesForm({ ...rulesForm, requireGuarantor: v })}
                      />
                    </View>

                    <Text className="text-xs font-extrabold text-rose-600 uppercase pt-2">
                      Hariri Kiasi cha Faini Zote (TZS):
                    </Text>
                    {[
                      { key: 'latePenalty', label: '1. Kuchelewa Kikaoni' },
                      { key: 'absentPenalty', label: '2. Kutofika Kikaoni' },
                      { key: 'noSharePenalty', label: '3. Kutonunua Hisa' },
                      { key: 'noSocialFundPenalty', label: '4. Kutotoa Mfuko wa Jamii' },
                      { key: 'noPapoInterestPenalty', label: '5. Kutotoa Riba ya Papo' },
                      { key: 'lateTopUpPenalty', label: '6. Kuchelewesha Papo Hiari' },
                      { key: 'lateLoanInterestPenalty', label: '7. Kuchelewesha Riba Mkopo' },
                      { key: 'disciplinePenalty', label: '8. Utovu wa Nidhamu' },
                      { key: 'otherPenalty', label: '9. Faini Nyinginezo' },
                    ].map((fn) => (
                      <View key={fn.key} className="flex-row justify-between items-center py-1">
                        <Text className={`text-xs flex-1 ${textSub}`}>{fn.label}:</Text>
                        <FormTextInput
                          keyboardType="numeric"
                          className={`w-32 border rounded-xl p-2 text-xs font-bold text-right ${inputClass}`}
                          value={String(rulesForm[fn.key] ?? '0')}
                          onChangeText={(t) => setRulesForm({ ...rulesForm, [fn.key]: t.replace(/[^0-9]/g, '') })}
                        />
                      </View>
                    ))}

                    <TouchableOpacity
                      onPress={handleSaveRules}
                      disabled={saving}
                      className="bg-teal-700 p-3.5 rounded-xl items-center mt-3"
                    >
                      {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-xs">Hifadhi Sheria Zote</Text>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <View className={`p-4 rounded-2xl border mb-4 ${cardClass}`}>
                <Text className="text-xs font-extrabold text-rose-600 uppercase mb-2.5">
                  Orodha ya Faini Zote za Kikundi
                </Text>
                {[
                  { label: '1. Kuchelewa Kikaoni', val: group?.latePenalty },
                  { label: '2. Kutofika Kikaoni', val: group?.absentPenalty },
                  { label: '3. Kutonunua Hisa', val: group?.noSharePenalty },
                  { label: '4. Kutotoa Mfuko wa Jamii', val: group?.noSocialFundPenalty },
                  { label: '5. Kutotoa Riba ya Papo', val: group?.noPapoInterestPenalty },
                  { label: '6. Kuchelewesha Papo ya Hiari', val: group?.lateTopUpPenalty },
                  { label: '7. Kuchelewesha Riba ya Mkopo', val: group?.lateLoanInterestPenalty },
                  { label: '8. Utovu wa Nidhamu', val: group?.disciplinePenalty },
                  { label: '9. Faini Nyinginezo', val: group?.otherPenalty },
                ].map((item, idx) => (
                  <View key={idx} className="flex-row justify-between py-1.5 border-b border-slate-200/20">
                    <Text className={`text-xs ${textSub}`}>{item.label}:</Text>
                    <Text className="text-xs font-bold text-rose-600">
                      TZS {Number(item.val || 0).toLocaleString()}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {activeSection === 'CONSTITUTION' && (
            <View className={`p-4 rounded-2xl border mb-6 ${cardClass}`}>
              <View className="flex-row justify-between items-center mb-3">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="book" size={18} color="#0f766e" />
                  <Text className={`font-extrabold text-sm ${textMain}`}>Katiba ya Kikoba</Text>
                </View>
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    onPress={handleShareConstitutionPdf}
                    className="bg-indigo-600 px-3 py-1.5 rounded-xl flex-row items-center gap-1"
                  >
                    <Ionicons name="share-social-outline" size={14} color="#fff" />
                    <Text className="text-white font-bold text-xs">PDF</Text>
                  </TouchableOpacity>
                  {isChairperson && (
                    <TouchableOpacity
                      onPress={() => {
                        if (!isEditingConstitution) setConstitutionDraft(group?.constitution || '');
                        setIsEditingConstitution(!isEditingConstitution);
                      }}
                      className="bg-teal-700 px-3 py-1.5 rounded-xl"
                    >
                      <Text className="text-white font-bold text-xs">
                        {isEditingConstitution ? 'Ghairi' : 'Hariri'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {isChairperson && (
                <View className="flex-row gap-2 mb-3">
                  <TouchableOpacity
                    onPress={handlePickConstitutionDoc}
                    className="flex-1 bg-teal-600/15 border border-teal-600/30 p-3 rounded-xl flex-row items-center justify-center gap-1.5"
                  >
                    <Ionicons name="cloud-upload-outline" size={16} color="#0f766e" />
                    <Text className="text-teal-800 font-bold text-[11px]">Pakia Faili</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleUseConstitutionTemplate}
                    className="flex-1 bg-amber-500/15 border border-amber-500/30 p-3 rounded-xl flex-row items-center justify-center gap-1.5"
                  >
                    <Ionicons name="sparkles-outline" size={16} color="#b45309" />
                    <Text className="text-amber-900 font-bold text-[11px]">Kiolezo cha Katiba</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isEditingConstitution ? (
                <>
                  <FormTextInput
                    multiline
                    numberOfLines={12}
                    textAlignVertical="top"
                    placeholder="Andika au bandika (Paste) Katiba ya kikoba hapa..."
                    placeholderTextColor="#94a3b8"
                    className={`border rounded-xl p-3.5 text-xs min-h-[220px] leading-5 ${inputClass}`}
                    value={constitutionDraft}
                    onChangeText={setConstitutionDraft}
                  />
                  <TouchableOpacity
                    onPress={handleSaveConstitution}
                    disabled={saving}
                    className="bg-teal-700 p-3.5 rounded-xl items-center mt-3"
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text className="text-white font-bold text-xs">Hifadhi Katiba ya Kikoba</Text>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <View className="pt-1">
                  {group?.constitution ? (
                    <Text className={`text-xs leading-5 ${textMain}`}>{group.constitution}</Text>
                  ) : (
                    <View className="py-8 items-center">
                      <Ionicons name="document-text-outline" size={32} color="#94a3b8" />
                      <Text className={`text-xs mt-2 text-center ${textSub}`}>
                        Katiba bado haijaandikwa.{' '}
                        {isChairperson
                          ? 'Bonyeza "Kiolezo cha Katiba", "Pakia Faili" au "Hariri" kuweka Katiba.'
                          : 'Mwenyekiti akishaweka Katiba itaonekana hapa.'}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
          <View className="h-10" />
          </>}
        </View>
      </FormScrollView>

      {Boolean(contactMember) && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: 24,
            zIndex: 999 }}
        >
          <View className="bg-white w-full rounded-3xl p-6 shadow-xl">
            <View className="flex-row justify-between items-center mb-3">
              <View className="bg-teal-600/15 px-3 py-1 rounded-full">
                <Text className="text-teal-800 font-bold text-xs">
                  {getRoleLabel(contactMember?.role || '')}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setContactMember(null)}>
                <Ionicons name="close-circle" size={26} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text className="text-lg font-extrabold text-slate-900">{contactMember?.fullName}</Text>
            <Text className="text-sm font-bold text-teal-700 mt-0.5 mb-5">{contactMember?.phone}</Text>

            <View className="flex-row gap-2.5 mb-2.5">
              <TouchableOpacity
                onPress={() => {
                  const m = contactMember;
                  setContactMember(null);
                  handleCallMember(m.phone, m.fullName);
                }}
                className="flex-1 bg-emerald-600 py-3.5 rounded-2xl flex-row items-center justify-center gap-1.5"
              >
                <Ionicons name="call" size={17} color="#fff" />
                <Text className="text-white font-bold text-xs">Piga Simu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  const m = contactMember;
                  setContactMember(null);
                  handleSmsMember(m.phone, m.fullName);
                }}
                className="flex-1 bg-indigo-600 py-3.5 rounded-2xl flex-row items-center justify-center gap-1.5"
              >
                <Ionicons name="chatbubble-ellipses" size={17} color="#fff" />
                <Text className="text-white font-bold text-xs">SMS</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => {
                const m = contactMember;
                setContactMember(null);
                handleWhatsAppMember(m.phone, m.fullName);
              }}
              className="bg-teal-700 py-3.5 rounded-2xl flex-row items-center justify-center gap-2"
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text className="text-white font-bold text-xs">Tuma Ujumbe WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
