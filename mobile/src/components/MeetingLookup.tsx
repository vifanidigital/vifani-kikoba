import { byMemberName } from '../utils/byMemberName';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/client';
import { useTheme } from '../context/ThemeContext';
import HistoricalMeetings from './HistoricalMeetings';
import { FormTextInput } from './KeyboardForm';

type Meeting = {
  date: string; week: number | null; hasRecords: boolean; membersRecorded: number;
  shares: number; social: number; papoInterest: number; papoRepaid: number; papoIssued: number;
  loanIssued: number; loanPrincipalRepaid: number; loanInterestRepaid: number; paidFines: number; unpaidFines: number; expenses: number; canEdit?: boolean;
  memberEntries: { id: string; fullName: string; sharesCount: number; amountPaid: number; socialFundPaid: number }[];
};
const fields = [
  ['shares', 'Hisa'], ['social', 'Jamii'], ['papoInterest', 'Riba ya Papo'], ['papoIssued', 'Papo iliyotolewa'],
  ['papoRepaid', 'Mtaji wa Papo uliorejeshwa'], ['loanIssued', 'Mikopo mikubwa iliyotolewa'],
  ['loanPrincipalRepaid', 'Mtaji wa mkopo uliorejeshwa'], ['loanInterestRepaid', 'Riba ya mikopo iliyolipwa'],
  ['paidFines', 'Faini zilizolipwa'], ['unpaidFines', 'Faini zilizorekodiwa kama deni'], ['expenses', 'Matumizi'],
] as const;
const money = (amount: number) => 'TZS ' + amount.toLocaleString('en-TZ');

export default function MeetingLookup({ refresh }: { refresh: () => Promise<void> }) {
  const { isDark } = useTheme();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'date' | 'week'>('date');
  const [query, setQuery] = useState('');
  const [meeting, setMeeting] = useState<Meeting>();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const color = isDark ? 'text-white' : 'text-slate-900';
  const search = async () => {
    if (loading) return;
    setEditing(false); setMeeting(undefined); setError('');
    if (mode === 'date' ? !/^[0-9]{8}$/.test(query) : !/^[1-9][0-9]{0,2}$/.test(query)) {
      setError(mode === 'date' ? 'Andika tarakimu nane, mfano 20261119.' : 'Andika namba ya juma, mfano 4.');
      return;
    }
    setLoading(true);
    try {
      const value = mode === 'date' ? query.slice(0, 4) + '-' + query.slice(4, 6) + '-' + query.slice(6) : query;
      const { data } = await apiClient.get<Meeting>('/shares/meeting-lookup', { params: { [mode]: value } });
      setMeeting(data);
    } catch (cause) {
      const detail = isAxiosError(cause) ? cause.response?.data?.error : undefined;
      setError(typeof detail === 'string' ? detail : 'Imeshindikana kupata kikao. Jaribu tena.');
    } finally { setLoading(false); }
  };
  return <View className={'mb-4 rounded-2xl p-4 ' + (isDark ? 'bg-slate-900' : 'bg-white')}>
    <View className="flex-row items-center justify-between gap-2">
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} className="min-h-11 flex-1 flex-row items-center gap-2">
        <View className="rounded-xl bg-teal-100 p-2"><Ionicons name="search-outline" size={19} color="#115e59" /></View>
        <Text className={'flex-1 text-base font-extrabold ' + color}>Tafuta kikao</Text>
      </Pressable>
      {open && <Pressable accessibilityRole="button" onPress={() => { setOpen(false); setEditing(false); }} className="min-h-11 flex-row items-center gap-1 rounded-xl border border-slate-400 px-3 py-2">
        <Ionicons name="close-outline" size={17} color={isDark ? '#e2e8f0' : '#334155'} />
        <Text className={color}>Funga</Text>
      </Pressable>}
    </View>
    {open && <>
      <View className="my-2 flex-row gap-2">
        {(['date', 'week'] as const).map(option => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: option === mode }} disabled={loading}
          onPress={() => { setEditing(false); setMode(option); setQuery(''); setMeeting(undefined); setError(''); }} className={option === mode ? 'rounded-lg bg-teal-700 p-2' : 'rounded-lg border border-slate-400 p-2'}>
          <Text className={option === mode ? 'text-white' : color}>{option === 'date' ? 'Tarehe' : 'Namba ya juma'}</Text>
        </Pressable>)}
      </View>
      <FormTextInput accessibilityLabel={mode === 'date' ? 'Tarehe ya kikao' : 'Namba ya juma'}
        placeholder={mode === 'date' ? 'Mwaka, mwezi, siku (mf. 20261119)' : 'Mfano: 4'}
        placeholderTextColor="#64748b" keyboardType="number-pad" value={query} editable={!loading}
        onChangeText={value => setQuery(value.replace(/[^0-9]/g, '').slice(0, mode === 'date' ? 8 : 3))}
        className={'rounded-lg border border-slate-400 p-3 ' + color} />
      <Pressable accessibilityRole="button" disabled={loading} onPress={() => void search()} className="mt-2 self-start rounded-lg bg-teal-700 p-3">
        <Text className="font-bold text-white">{loading ? 'Inatafuta...' : 'Tafuta kikao'}</Text>
      </Pressable>
      {error ? <Text accessibilityRole="alert" className="mt-2 text-rose-600">{error}</Text> : null}
      {meeting && <View className="mt-3">
        <Text className={'font-bold ' + color}>{meeting.date}{meeting.week !== null ? ' · Juma la ' + meeting.week : ''}</Text>
        {!meeting.hasRecords ? <Text className={color}>Hakuna rekodi zilizohifadhiwa kwa tarehe hii.</Text> : <>
          <Text className={'mb-2 ' + color}>Walio na rekodi ya hisa au Jamii: {meeting.membersRecorded}</Text>
          {fields.map(([key, label]) => <Text key={key} className={'py-1 ' + color}>{label}: {money(meeting[key])}</Text>)}
          {byMemberName(meeting.memberEntries, member => member.fullName).map((entry, index) => <Text key={entry.id + '-' + index} className={'mt-2 font-bold ' + color}>
            {entry.fullName} · Hisa {entry.sharesCount} ({money(entry.amountPaid)}) · Jamii {money(entry.socialFundPaid)}
          </Text>)}
        </>}
        {meeting.canEdit && <Pressable accessibilityRole="button" accessibilityState={{ expanded: editing }}
          onPress={() => setEditing(value => !value)} className="my-3 self-start flex-row items-center gap-2 rounded-xl bg-teal-800 px-4 py-3">
          <Ionicons name={editing ? 'close-outline' : 'create-outline'} size={18} color="white" />
          <Text className="font-bold text-white">{editing ? 'Funga uhariri' : 'Hariri kikao hiki'}</Text>
        </Pressable>}
        {meeting.canEdit && editing && <HistoricalMeetings key={meeting.date} date={meeting.date} refresh={async () => {
          try {
            const { data } = await apiClient.get<Meeting>('/shares/meeting-lookup', { params: { date: meeting.date } });
            setMeeting(current => current?.date === data.date ? data : current);
          } catch {
            setError('Marekebisho yamehifadhiwa. Tafuta kikao tena ili kusasisha muhtasari.');
          }
          await refresh();
        }} />}
      </View>}
    </>}
  </View>;
}
