import HistoricalEvents from './HistoricalEvents';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import { FormTextInput } from './KeyboardForm';

type Schedule = { startDate: string | null; weekday: number; dates: string[] };
type Member = {
  userId: string;
  fullName: string;
  isActive?: boolean;
  record: { sharesCount: number; amountPaid: number; socialFundPaid: number } | null;
};
type Session = { members: Member[]; hasPapo: boolean };
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
  const [limit, setLimit] = useState(8);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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
    const { data } = await apiClient.put<Schedule>('/shares/historical-meetings/start', { startDate: start.trim() });
    setSchedule(data);
    setPicked('');
    setSession(null);
    setMemberId(null);
    setLimit(8);
    await refresh();
  });

  const chooseDate = (date: string) => void request(async () => {
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
      await apiClient.post('/shares/historical-meetings/' + picked, { targetUserId: memberId, ...amounts });
      setSession(previous => previous && ({
        ...previous,
        members: previous.members.map(member => member.userId === memberId ? {
          ...member,
          record: { sharesCount: amounts.sharesCount, amountPaid: amounts.amountPaid, socialFundPaid: amounts.socialFundPaid },
        } : member),
      }));
      setMemberId(null);
      setDraft(empty);
      setMessage('Rekodi imehifadhiwa kwa tarehe ' + picked + '.');
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
          <Text className={'text-sm ' + textColor}>Tarehe mliyoanza mzunguko (YYYY-MM-DD)</Text>
          <FormTextInput accessibilityLabel="Tarehe ya kuanza mzunguko" placeholder="2026-01-08" placeholderTextColor="#64748b" keyboardType="numbers-and-punctuation" autoCorrect={false} maxLength={10} value={start} editable={!loading} onChangeText={setStart} className={'my-2 rounded-xl border border-slate-400 p-3 ' + textColor} />
          <Pressable accessibilityRole="button" onPress={saveStart} disabled={loading} className="self-start rounded-xl bg-teal-800 px-4 py-3"><Text className="font-bold text-white">Fungua Ratiba ya Nyuma</Text></Pressable>
          {loading && <ActivityIndicator className="mt-3" color="#0f766e" />}
          {error ? <Text accessibilityRole="alert" className="mt-3 text-rose-600">{error}</Text> : null}
          {message ? <Text accessibilityRole="alert" className="mt-3 text-teal-600">{message}</Text> : null}
          {schedule?.startDate && (
            <View className="mt-4">
              <Text className={'mb-2 font-bold ' + textColor}>Vikao vya {days[schedule.weekday]} kuanzia {schedule.startDate}</Text>
              {schedule.dates.length === 0 && <Text className={textColor}>Hakuna tarehe ya kikao cha nyuma kwenye kipindi hiki.</Text>}
              <View className="flex-row flex-wrap gap-2">
                {schedule.dates.slice(0, limit).map(date => (
                  <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected: date === picked }} disabled={loading} onPress={() => chooseDate(date)} className={date === picked ? 'rounded-lg bg-teal-800 p-2' : 'rounded-lg border border-slate-400 p-2'}>
                    <Text className={date === picked ? 'font-bold text-white' : textColor}>{date}</Text>
                  </Pressable>
                ))}
              </View>
              {limit < schedule.dates.length && <Pressable accessibilityRole="button" onPress={() => setLimit(limit + 8)} className="self-start py-3"><Text className={textColor}>Onyesha tarehe zaidi</Text></Pressable>}
            </View>
          )}
          {session && (
            <View className="mt-4">
              <Text className={'mb-2 font-bold ' + textColor}>Kikao cha {picked}</Text>
              <HistoricalEvents key={picked} date={picked} members={session.members} hasPapo={session.hasPapo} refresh={refresh} />
              {session.members.map(member => (
                <View key={member.userId} className="mb-2 rounded-xl border border-slate-400 p-3">
                  <Text className={'font-bold ' + textColor}>{member.fullName}{member.isActive === false ? ' (si hai)' : ''}</Text>
                  {member.record ? (
                    <Text className={'mt-1 text-sm ' + textColor}>Imehifadhiwa · Hisa {member.record.sharesCount} · Hisa TZS {member.record.amountPaid.toLocaleString()} · Jamii TZS {member.record.socialFundPaid.toLocaleString()}</Text>
                  ) : memberId === member.userId ? (
                    <>
                      {fields.filter(([key]) => key !== 'papoInterestPaid' || session.hasPapo).map(([key, label]) => (
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
