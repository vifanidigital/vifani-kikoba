import { byMemberName } from '../utils/byMemberName';
import HistoricalEvents from './HistoricalEvents';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { FormTextInput } from './KeyboardForm';

type ScheduleEntry = { date: string; filled: number; total: number; complete: boolean };
type Schedule = {
  startDate: string | null; startWeekday?: number | null; firstMeetingDate?: string | null;
  weekday: number; dates: string[]; sessions?: ScheduleEntry[];
};
function formatDateInput(value: string) {
  const digits = value.replace(/[^0-9]/g, '').slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-');
}
type Member = {
  userId: string;
  fullName: string;
  isActive?: boolean;
  record: { id: string; sharesCount: number; amountPaid: number; socialFundPaid: number; papoInterestPaid: number } | null;
};
type Fine = { id: string; userId: string; reason: string; amount: number; isPaid: boolean };
type Session = { members: Member[]; hasPapo: boolean; fines?: Fine[] };
const days = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
const fields = [
  ['sharesCount', 'Idadi ya hisa'],
  ['amountPaid', 'Fedha halisi za hisa (TZS)'],
  ['socialFundPaid', 'Jamii iliyolipwa (TZS)'],
  ['papoInterestPaid', 'Riba ya Papo iliyolipwa (TZS)'],
  ['paidFine', 'Faini iliyolipwa (TZS)'],
  ['unpaidFine', 'Faini iliyobaki (TZS)'],
] as const;
const empty = { sharesCount: '', amountPaid: '', socialFundPaid: '', papoInterestPaid: '', paidFine: '', unpaidFine: '' };

function errorText(error: unknown) {
  const detail: unknown = isAxiosError(error) ? error.response?.data?.error : undefined;
  if (typeof detail === 'string') return detail;
  if (isAxiosError(error) && error.response?.status === 404) return 'Seva bado haina huduma hii. Backend inahitaji kusasishwa.';
  return 'Ombi halikufanikiwa. Jaribu tena.';
}

export default function HistoricalMeetings({ refresh }: { refresh: () => Promise<void> }) {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [start, setStart] = useState('');
  const [picked, setPicked] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [draft, setDraft] = useState(empty);
  const [fineDraft, setFineDraft] = useState<(Omit<Fine, 'amount'> & { amount: string }) | null>(null);
  const [limit, setLimit] = useState(8);
  const [showCompleted, setShowCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const entries = schedule?.sessions ?? (schedule?.dates ?? []).map(date => ({ date, total: 0, filled: 0, complete: false }));
  const pending = entries.filter(entry => !entry.complete);
  const visible = showCompleted ? entries : pending;
  const textColor = isDark ? 'text-white' : 'text-slate-900';

  const request = async (work: () => Promise<void>) => {
    if (loading) return;
    setLoading(true);
    setError('');
    setMessage('');
    try { await work(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  };

  const openPanel = () => {
    setOpen(true);
    void request(async () => {
      const { data } = await apiClient.get<Schedule>('/shares/historical-meetings');
      setSchedule(data);
      setStart(data.startDate ?? '');
    });
  };

  const saveStart = () => void request(async () => {
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(start)) { setError('Andika tarakimu nane za tarehe, mfano 20261101.'); return; }
    const { data } = await apiClient.put<Schedule>('/shares/historical-meetings/start', { startDate: start.trim() });
    setSchedule(data);
    setPicked('');
    setSession(null);
    setMemberId(null);
    setLimit(8);
    setShowCompleted(false);
    await refresh();
  });

  const chooseDate = (date: string) => void request(async () => {
    setFineDraft(null);
    setPicked(date);
    setSession(null);
    setMemberId(null);
    const { data } = await apiClient.get<Session>('/shares/historical-meetings/' + date);
    setSession(data);
  });

  const saveRecord = () => {
    if (!memberId || !picked || loading) return;
    if (!Object.values(draft).some(value => value.trim())) {
      setError('Ingiza kiasi kutoka kwenye daftari. Andika 0 ikiwa hakukuwa na mchango.');
      return;
    }
    const amounts = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, Number(value.trim() || 0)]));
    if (!Object.values(amounts).every(value => Number.isFinite(value) && value >= 0) || !Number.isInteger(amounts.sharesCount)) {
      setError('Ingiza kiasi kisicho hasi na idadi kamili ya hisa.');
      return;
    }
    void request(async () => {
      const record = session?.members.find(member => member.userId === memberId)?.record;
      const path = '/shares/historical-meetings/' + picked;
      if (record) {
        const { sharesCount, amountPaid, socialFundPaid, papoInterestPaid } = amounts;
        await apiClient.put(path + '/record', { recordId: record.id, targetUserId: memberId, sharesCount, amountPaid, socialFundPaid, papoInterestPaid });
      } else {
        await apiClient.post(path, { targetUserId: memberId, ...amounts });
      }
      const { data: updated } = await apiClient.get<Session>(path);
      setSession(updated);
      setMemberId(null);
      setDraft(empty);
      setMessage('Rekodi imehifadhiwa kwa tarehe ' + picked + '.');
      try {
        const { data } = await apiClient.get<Schedule>('/shares/historical-meetings');
        setSchedule(data);
      } catch {
        setMessage('Rekodi imehifadhiwa. Fungua ratiba tena kusasisha idadi ya vikao.');
      }
    });
  };

  return (
    <View className={'mb-4 rounded-2xl p-4 ' + (isDark ? 'bg-slate-900' : 'bg-white')}>
      {!open ? (
        <Pressable accessibilityRole="button" onPress={openPanel} className="self-start rounded-xl bg-teal-800 px-4 py-3">
          <Text className="font-bold text-white">Omba Kujaza Taarifa za Nyuma</Text>
        </Pressable>
      ) : (
        <>
          <View className="mb-2 flex-row items-center justify-between gap-2">
            <Text className={'font-bold ' + textColor}>Vikao vya Nyuma</Text>
            <Pressable accessibilityRole="button" disabled={loading} onPress={() => setOpen(false)} className="p-2"><Text className={textColor}>Funga</Text></Pressable>
          </View>
          <Text className={'text-sm ' + textColor}>Tarehe mliyoanza mzunguko (mwaka, mwezi, siku)</Text>
          <Text className={'mt-1 text-xs ' + textColor}>Taarifa zitajazwa kwenye mzunguko ulio wazi.</Text>
          <FormTextInput accessibilityLabel="Tarehe ya kuanza mzunguko" placeholder="2026-01-08" placeholderTextColor="#64748b" keyboardType="number-pad" autoCorrect={false} maxLength={10} value={start} editable={!loading} onChangeText={value => setStart(formatDateInput(value))} className={'my-2 rounded-xl border border-slate-400 p-3 ' + textColor} />
          <Pressable accessibilityRole="button" onPress={saveStart} disabled={loading} className="self-start rounded-xl bg-teal-800 px-4 py-3"><Text className="font-bold text-white">Fungua Ratiba ya Nyuma</Text></Pressable>
          {loading && <ActivityIndicator className="mt-3" color="#0f766e" />}
          {error ? <Text accessibilityRole="alert" className="mt-3 text-rose-600">{error}</Text> : null}
          {message ? <Text accessibilityRole="alert" className="mt-3 text-teal-600">{message}</Text> : null}
          {schedule?.startDate && (
            <View className="mt-4">
              <Text className={'mb-2 font-bold ' + textColor}>
                Siku ya kikao: {days[schedule.weekday] ?? 'Haijawekwa'} · Majuma {entries.length} · Yaliyobaki {pending.length}
              </Text>
              {schedule.startWeekday != null && (
                <Text className={'mb-2 ' + textColor}>
                  {schedule.startWeekday === schedule.weekday ? 'Tarehe uliyoingiza inalingana na siku ya kikao.' :
                    'Tarehe uliyoingiza ilikuwa ' + days[schedule.startWeekday] + '.' + (schedule.firstMeetingDate ? ' Kikao cha kwanza kinacholingana ni ' + schedule.firstMeetingDate + '.' : '')}
                </Text>
              )}
              {!entries.length && <Text className={textColor}>Hakuna kikao kilichopita kwenye kipindi hiki.</Text>}
              {!!entries.length && !pending.length && !showCompleted && <Text className={textColor}>Vikao vyote vimejazwa.</Text>}
              {entries.some(entry => entry.complete) && (
                <Pressable accessibilityRole="button" onPress={() => { setShowCompleted(!showCompleted); setLimit(8); }} className="self-start py-2">
                  <Text className={textColor}>{showCompleted ? 'Onyesha vilivyobaki pekee' : 'Onyesha pia vikao vilivyojazwa'}</Text>
                </Pressable>
              )}
              <View className="flex-row flex-wrap gap-2">
                {visible.slice(0, limit).map(entry => (
                  <Pressable key={entry.date} accessibilityRole="button" accessibilityState={{ selected: entry.date === picked }} disabled={loading}
                    onPress={() => chooseDate(entry.date)} className={entry.date === picked ? 'rounded-lg bg-teal-800 p-2' : 'rounded-lg border border-slate-400 p-2'}>
                    <Text className={entry.date === picked ? 'font-bold text-white' : textColor}>
                      {entry.date}{entry.total ? ' · ' + entry.filled + '/' + entry.total : ''}{entry.complete ? ' · Kimejazwa' : ''}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {limit < visible.length && <Pressable accessibilityRole="button" onPress={() => setLimit(limit + 8)} className="self-start py-3"><Text className={textColor}>Onyesha tarehe zaidi</Text></Pressable>}

            </View>
          )}
          {session && (
            <View className="mt-4">
              <Text className={'mb-2 font-bold ' + textColor}>Kikao cha {picked}</Text>
              <HistoricalEvents key={picked} date={picked} members={session.members} hasPapo={session.hasPapo} refresh={refresh} />
              {byMemberName(session.members, member => member.fullName).map(member => (
                <View key={member.userId} className="mb-2 rounded-xl border border-slate-400 p-3">
                  <Text className={'font-bold ' + textColor}>{member.fullName}{member.isActive === false ? ' (si hai)' : ''}</Text>
                  {memberId !== member.userId && member.record ? (
                    <View>
                    <Text className={'mt-1 text-sm ' + textColor}>Imehifadhiwa · Hisa {member.record.sharesCount} · Hisa TZS {member.record.amountPaid.toLocaleString()} · Jamii TZS {member.record.socialFundPaid.toLocaleString()}</Text>
                    <Pressable accessibilityRole="button" disabled={loading} className="self-start rounded-lg bg-teal-800 px-3 py-2 mt-2" onPress={() => {
                      const row = member.record!;
                      setMemberId(member.userId);
                      setDraft({ ...empty, sharesCount: String(row.sharesCount), amountPaid: String(row.amountPaid), socialFundPaid: String(row.socialFundPaid), papoInterestPaid: String(row.papoInterestPaid ?? 0) });
                    }}><Text className="font-bold text-white">Hariri rekodi</Text></Pressable>
                    </View>
                  ) : memberId === member.userId ? (
                    <>
                      {fields.filter(([key]) => (key !== 'papoInterestPaid' || session.hasPapo) && (!member.record || (key !== 'paidFine' && key !== 'unpaidFine'))).map(([key, label]) => (
                        <View key={key} className="mt-2">
                          <Text className={'text-xs ' + textColor}>{label}</Text>
                          <FormTextInput accessibilityLabel={label} keyboardType="decimal-pad" value={draft[key]} editable={!loading} onChangeText={value => setDraft(previous => ({ ...previous, [key]: value }))} className={'rounded-lg border border-slate-400 p-2 ' + textColor} />
                        </View>
                      ))}
                      <Pressable accessibilityRole="button" onPress={saveRecord} disabled={loading} className="mt-3 self-start rounded-xl bg-teal-800 px-4 py-3"><Text className="font-bold text-white">Hifadhi Rekodi</Text></Pressable>
                    </>
                  ) : (
                    <Pressable accessibilityRole="button" disabled={loading} onPress={() => { setMemberId(member.userId); setDraft(empty); setError(''); }} className="self-start py-2"><Text className={textColor}>Jaza Rekodi</Text></Pressable>
                  )}
                  {session.fines?.filter(fine => fine.userId === member.userId).map(fine => (
                    <View key={fine.id} className="mt-3 border-t border-slate-400 pt-2">
                      <Text className={textColor}>{fine.reason} · TZS {fine.amount.toLocaleString()} · {fine.isPaid ? 'Imelipwa' : 'Haijalipwa'}</Text>
                      <Pressable disabled={loading} onPress={() => setFineDraft({ ...fine, amount: String(fine.amount) })} className="py-2">
                        <Text className={textColor}>Hariri faini</Text>
                      </Pressable>
                    </View>
                  ))}
                  {fineDraft?.userId === member.userId ? <>
                    <FormTextInput accessibilityLabel="Sababu ya faini" placeholder="Sababu ya faini" value={fineDraft.reason} onChangeText={reason => setFineDraft({ ...fineDraft, reason })} className={'rounded-lg border border-slate-400 p-2 ' + textColor} />
                    <FormTextInput accessibilityLabel="Kiasi cha faini" placeholder="Kiasi cha faini" value={fineDraft.amount} keyboardType="decimal-pad" onChangeText={amount => setFineDraft({ ...fineDraft, amount })} className={'rounded-lg border border-slate-400 p-2 ' + textColor} />
                    <Pressable onPress={() => setFineDraft({ ...fineDraft, isPaid: !fineDraft.isPaid })} className="py-2"><Text className={textColor}>{fineDraft.isPaid ? 'Imelipwa' : 'Haijalipwa'} · Badili hali</Text></Pressable>
                    <View className="flex-row gap-3">
                      <Pressable disabled={loading} className="self-start rounded-lg bg-teal-800 px-3 py-2" onPress={() => void request(async () => {
                        const path = '/shares/historical-meetings/' + picked;
                        const { id, userId, reason, amount, isPaid } = fineDraft;
                        const payload = { reason, amount: Number(amount.replace(',', '.')), isPaid };
                        const response = id ? await apiClient.put(path + '/fines/' + id, payload) : await apiClient.post(path + '/fines', { ...payload, userId });
                        setFineDraft(null);
                        setMessage(response.data.message);
                        setSession((await apiClient.get<Session>(path)).data);
                      })}><Text className="font-bold text-white">Hifadhi faini</Text></Pressable>
                      <Pressable disabled={loading} onPress={() => setFineDraft(null)} className="p-2"><Text className={textColor}>Ghairi</Text></Pressable>
                    </View>
                  </> : <Pressable disabled={loading} onPress={() => setFineDraft({ id: '', userId: member.userId, reason: '', amount: '', isPaid: false })} className="mt-2 self-start rounded-lg border border-slate-400 p-2">
                    <Text className={'font-bold ' + textColor}>Ongeza faini</Text>
                  </Pressable>}
                </View>
              ))}
              {session.members.length === 0 && <Text className={textColor}>Hakuna wanachama hai wa kuingiziwa rekodi.</Text>}
            </View>
          )}
        </>
      )}
    </View>
  );
}
