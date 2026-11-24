import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/client';
import { FormTextInput } from './KeyboardForm';

const types = [
  ['LOAN_OUT', 'Toa mkopo mkubwa'], ['LOAN_IN', 'Rejesha mkopo mkubwa'],
  ['PAPO_OUT', 'Toa Papo ya hiari'], ['PAPO_IN', 'Rejesha Papo ya hiari'], ['PAPO_INTEREST', 'Riba ya Papo'],
  ['FINE_PAID', 'Lipa faini iliyopo'], ['EXPENSE', 'Matumizi ya kikao'],
] as const;
type Kind = typeof types[number][0];
type Debt = { id: string; userId: string; principalAmount?: number; amount?: number; reason?: string; balance?: number; first?: number; second?: number; secondRequired?: boolean };
type Data = { loans: Debt[]; papo: Debt[]; fines: Debt[]; events: { id: string; userId: string; type: string; amount: number; notes?: string }[] };
const labels: Record<string, string> = {
  LOAN_DISBURSEMENT: 'Mkopo uliotolewa', LOAN_REPAYMENT: 'Marejesho ya mtaji wa mkopo', LOAN_INTEREST_REPAYMENT: 'Riba ya mkopo',
  PAPO_TOPUP_DISBURSEMENT: 'Papo iliyotolewa', PAPO_TOPUP_REPAYMENT: 'Marejesho ya mtaji wa Papo',
  PAPO_TOPUP_INTEREST_REPAYMENT: 'Riba ya marejesho ya Papo', PAPO_INTEREST: 'Riba ya Papo', HISTORICAL_EXPENSE: 'Matumizi', HISTORICAL_FINE: 'Malipo ya faini',
};

export default function HistoricalEvents({ date, members, hasPapo, refresh }: {
  date: string;
  members: { userId: string; fullName: string }[];
  hasPapo: boolean;
  refresh: () => Promise<void>;
}) {
  const path = '/shares/historical-meetings/' + date + '/events';
  const [data, setData] = useState<Data>();
  const [kind, setKind] = useState<Kind>();
  const [userId, setUserId] = useState('');
  const [debtId, setDebtId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [title, setTitle] = useState('');
  const [includeSecond, setIncludeSecond] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    apiClient.get<Data>(path).then(res => { if (active) setData(res.data); })
      .catch(() => { if (active) setMessage('Imeshindwa kupakia matukio ya kikao. Fungua tarehe tena.'); });
    return () => { active = false; };
  }, [path]);
  const pool = kind === 'LOAN_IN' ? data?.loans : kind === 'PAPO_IN' ? data?.papo : kind === 'FINE_PAID' ? data?.fines : undefined;
  const debts = pool?.filter(row => row.userId === userId);
  const selected = debts?.find(row => row.id === debtId);
  const numeric = Number(amount.replace(',', '.'));
  const save = async () => {
    if (!kind || !userId || !reference.trim() || !amount.trim() || !Number.isFinite(numeric) || numeric < 0 || (pool && !debtId)) return;
    setBusy(true);
    setMessage('');
    try {
      await apiClient.post(path, { kind, userId, debtId, amount: numeric, reference, title, includeSecond });
      setAmount(''); setReference(''); setDebtId(''); setTitle(''); setIncludeSecond(false);
      const { data: fresh } = await apiClient.get<Data>(path);
      setData(fresh);
      setMessage('Tukio limehifadhiwa kwa tarehe ' + date + '.');
      await refresh();
    } catch (error) {
      const detail = isAxiosError(error) ? error.response?.data?.error : undefined;
      setMessage(typeof detail === 'string' ? detail : 'Ombi halijakamilika. Hakiki orodha ya matukio.');
    } finally { setBusy(false); }
  };
  const chip = (key: string, label: string, chosen: boolean, onPress: () => void) => (
    <Pressable accessibilityRole="button" disabled={busy} key={key} onPress={onPress} className={chosen ? 'rounded-lg bg-teal-700 p-2' : 'rounded-lg border border-slate-500 p-2'}>
      <Text className="text-white">{label}</Text>
    </Pressable>
  );
  const input = 'rounded-lg bg-white p-3 text-slate-900';
  return <View className="my-3 rounded-xl bg-slate-900 p-3">
    <Text className="mb-2 font-bold text-white">Matukio ya kikao</Text>
    <View className="flex-row flex-wrap gap-2">{types.filter(([type]) => hasPapo || !type.startsWith('PAPO')).map(([type, label]) =>
      chip(type, label, type === kind, () => { setKind(type); setDebtId(''); setAmount(''); setIncludeSecond(false); }),
    )}</View>
    {kind && <View className="mt-3 gap-2">
      <Text className="text-white">Chagua mwanachama</Text>
      <View className="flex-row flex-wrap gap-2">{members.map(member =>
        chip(member.userId, member.fullName, member.userId === userId, () => { setUserId(member.userId); setDebtId(''); }),
      )}</View>
      {userId && debts && <View className="flex-row flex-wrap gap-2">
        {debts.length === 0 && <Text className="text-white">Hakuna deni linaloweza kuchaguliwa tarehe hii.</Text>}
        {debts.map(row => chip(row.id, (row.reason ?? 'Mtaji') + ' TZS ' + Number(row.amount ?? row.principalAmount ?? 0).toLocaleString(),
          row.id === debtId, () => { setDebtId(row.id); if (row.amount !== undefined) setAmount(String(row.amount)); }))}
      </View>}
      {selected?.balance !== undefined && <Text className="text-white">Salio kabla ya malipo: TZS {selected.balance.toLocaleString()}</Text>}
      {kind === 'LOAN_IN' && selected && <Text className="text-white">Riba ya kwanza TZS {selected.first ?? 0} · Riba ya pili TZS {selected.second ?? 0} {selected.secondRequired ? '(lazima)' : '(hiari)'}</Text>}
      {kind === 'LOAN_IN' && !selected?.secondRequired && chip('optional', includeSecond ? 'Ondoa riba ya pili ya hiari' : 'Jumuisha riba ya pili ya hiari', includeSecond, () => setIncludeSecond(!includeSecond))}
      <FormTextInput accessibilityLabel="Kiasi" placeholder={kind === 'LOAN_IN' ? 'Mtaji uliorejeshwa (0 ikiwa ni riba pekee)' : 'Kiasi (TZS)'} className={input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} editable={!busy} />
      {kind === 'EXPENSE' && <FormTextInput accessibilityLabel="Maelezo ya matumizi" placeholder="Maelezo ya matumizi" value={title} className={input} onChangeText={setTitle} editable={!busy} />}
      <FormTextInput accessibilityLabel="Rejea ya tukio" placeholder="Rejea ya daftari, mfano K45/1" value={reference} className={input} onChangeText={setReference} editable={!busy} />
      <Pressable accessibilityRole="button" disabled={busy || !userId || !reference.trim() || !amount.trim() || Boolean(pool && !debtId)} onPress={() => void save()} className="self-start rounded-lg bg-teal-700 p-3">
        <Text className="font-bold text-white">{busy ? 'Inahifadhi...' : 'Hifadhi tukio'}</Text>
      </Pressable>
    </View>}
    {message ? <Text accessibilityRole="alert" className="mt-2 text-white">{message}</Text> : null}
    {data?.events.map(row => <Text key={row.id} className="mt-2 text-slate-200">
      {members.find(member => member.userId === row.userId)?.fullName ?? 'Mwanachama'} · {labels[row.type] ?? row.type} · TZS {row.amount.toLocaleString()}{row.notes ? ' · ' + row.notes : ''}
    </Text>)}
  </View>;
}
