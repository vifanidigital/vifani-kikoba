import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/client';
import type { PapoInterestDebt, PapoInterestPaymentRequest } from '../api/tabResponses';
import { useTheme } from '../context/ThemeContext';
import { meetingDateKey } from '../utils/meetingDate';
import { FormTextInput } from './KeyboardForm';

type Draft = { id: string; value: string; action: 'report' | 'decline' };
const money = (value: number) => 'TZS ' + value.toLocaleString('en-TZ');

export default function PapoInterestDebts({ debts, requests, interestTotal, totalDebt, reload }: {
  debts: PapoInterestDebt[];
  requests: PapoInterestPaymentRequest[];
  interestTotal?: number;
  totalDebt?: number;
  reload: () => Promise<unknown>;
}) {
  const { isDark } = useTheme();
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const text = isDark ? 'text-white' : 'text-slate-900';
  const button = 'mt-2 self-start rounded-lg bg-teal-800 px-3 py-2';

  const submit = async (id: string, path: 'report' | 'review', body: object) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await apiClient.post('/papo/interest-debts/' + id + '/' + path, body);
      setDraft(undefined);
      setMessage(data.message);
      await reload();
    } catch (cause) {
      const detail = isAxiosError(cause) ? cause.response?.data?.error : undefined;
      setError(typeof detail === 'string' ? detail : 'Taarifa haikuhifadhiwa. Jaribu tena.');
    } finally {
      setBusy(false);
    }
  };

  if (interestTotal === undefined && !debts.length && !requests.length) return null;
  return (
    <View className={'mb-4 rounded-2xl border border-slate-400 p-4 ' + (isDark ? 'bg-slate-900' : 'bg-white')}>
      <Text className={'text-base font-extrabold ' + text}>Madeni ya riba ya Papo</Text>
      <Text className={'mt-1 font-bold ' + text}>Riba ya Papo inayodaiwa: {money(interestTotal ?? 0)}</Text>
      {totalDebt !== undefined && <Text className={text}>Jumla ya madeni yako: {money(totalDebt)}</Text>}
      {!debts.length && <Text className={'mt-2 ' + text}>Huna deni la riba ya Papo linalosubiri malipo au uthibitisho.</Text>}
      {message ? <Text accessibilityRole="alert" className={'mt-2 font-bold ' + text}>{message}</Text> : null}
      {error ? <Text accessibilityRole="alert" className="mt-2 text-rose-600">{error}</Text> : null}
      {debts.map(debt => (
        <View key={debt.id} className="mt-3 border-t border-slate-400 pt-3">
          <Text className={'font-bold ' + text}>Kikao cha {debt.meetingDate} · {money(debt.amount)}</Text>
          <Text className={text}>{debt.pending ? 'Malipo ya ' + debt.paidDate + ' yanasubiri uthibitisho.' : 'Deni hili linahitaji kulipwa.'}</Text>
          {debt.feedback ? <Text className={text}>Maoni ya kiongozi: {debt.feedback}</Text> : null}
          {!debt.pending && (draft?.id === debt.id && draft.action === 'report' ? (
            <>
              <Text className={'mt-2 ' + text}>Tarehe uliyolipa (YYYY-MM-DD)</Text>
              <FormTextInput accessibilityLabel="Tarehe uliyolipa deni" value={draft.value} editable={!busy} maxLength={10}
                onChangeText={value => setDraft({ ...draft, value })} className={'mt-1 rounded-lg border border-slate-400 p-2 ' + text} />
              <Pressable accessibilityRole="button" disabled={busy} className={button}
                onPress={() => void submit(debt.id, 'report', { paidDate: draft.value.trim() })}>
                <Text className="font-bold text-white">Tuma taarifa ya malipo</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setDraft(undefined)} className="self-start p-2">
                <Text className={text}>Ghairi</Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" disabled={busy} className={button}
              onPress={() => setDraft({ id: debt.id, action: 'report', value: meetingDateKey(new Date().toISOString()) })}>
              <Text className="font-bold text-white">Nimelipa</Text>
            </Pressable>
          ))}
        </View>
      ))}
      {requests.length > 0 && <Text className={'mt-5 font-extrabold ' + text}>Malipo yanayosubiri uhakiki</Text>}
      {requests.map(request => (
        <View key={request.id} className="mt-3 border-t border-slate-400 pt-3">
          <Text className={'font-bold ' + text}>{request.fullName} · {money(request.amount)}</Text>
          <Text className={text}>Kikao cha {request.meetingDate} · Alilipa {request.paidDate}</Text>
          <Pressable accessibilityRole="button" disabled={busy} className={button} onPress={() => Alert.alert(
            'Thibitisha malipo',
            'Hakiki kuwa umepokea ' + money(request.amount) + ' kutoka kwa ' + request.fullName + '.',
            [{ text: 'Ghairi', style: 'cancel' }, {
              text: 'Thibitisha', onPress: () => void submit(request.id, 'review', { requestId: request.requestId, decision: 'confirm' }),
            }],
          )}><Text className="font-bold text-white">Thibitisha malipo</Text></Pressable>
          {draft?.id === request.id && draft.action === 'decline' ? (
            <>
              <FormTextInput accessibilityLabel="Sababu ya kurudisha taarifa" placeholder="Sababu ya kurudisha taarifa" value={draft.value}
                editable={!busy} maxLength={300} onChangeText={value => setDraft({ ...draft, value })}
                className={'mt-2 rounded-lg border border-slate-400 p-2 ' + text} />
              <Pressable accessibilityRole="button" disabled={busy} className={button} onPress={() => void submit(
                request.id, 'review', { requestId: request.requestId, decision: 'decline', reason: draft.value },
              )}><Text className="font-bold text-white">Tuma sababu</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => setDraft(undefined)} className="self-start p-2">
                <Text className={text}>Ghairi</Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityRole="button" disabled={busy} onPress={() => setDraft({ id: request.id, action: 'decline', value: '' })} className="self-start p-2">
              <Text className={text}>Rudisha taarifa</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}
