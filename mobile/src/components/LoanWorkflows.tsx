import { ReactNode, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/client';
import { FormTextInput } from './KeyboardForm';

const money = (amount: number) => 'TZS ' + amount.toLocaleString('en-TZ');
const date = (value: string) => new Date(value).toLocaleDateString('sw-TZ', { timeZone: 'Africa/Dar_es_Salaam' });
const decimal = (value: string) => Number(value.replace(',', '.'));
const inputStyle = 'my-2 rounded-xl border border-slate-400 bg-white p-3 text-slate-900';

export type Queue = {
  spun: boolean;
  next: string | null;
  positions: { id: string; name: string; number: number }[];
  swaps: { id: string; from: string; to: string; fromName?: string; toName?: string; status: string }[];
};

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} className={'my-1 self-start rounded-xl bg-teal-700 px-3 py-2 ' + (disabled ? 'opacity-50' : '')}>
    <Text className="font-bold text-white">{label}</Text>
  </TouchableOpacity>;
}

function useLoanAction(reload: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(operation: () => Promise<{ data: { message?: string } }>, done?: () => void) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data } = await operation();
      if (data.message) Alert.alert('Taarifa', data.message);
      done?.();
    } catch (cause) {
      const detail = isAxiosError(cause) ? cause.response?.data?.error : undefined;
      setError(typeof detail === 'string' ? detail : 'Ombi halikufanikiwa. Jaribu tena.');
    } finally {
      await reload();
      setBusy(false);
    }
  }
  return { busy, error, run };
}

export function LoanQueuePanel({ data, userId, chair, reload, error: loadError }: {
  data: Queue | null; userId?: string; chair: boolean; reload: () => Promise<void>; error: string | null;
}) {
  const { busy, error, run } = useLoanAction(reload);
  const [choose, setChoose] = useState(false);
  const labels: Record<string, string> = { PENDING: 'Linasubiri jibu', ACCEPTED: 'Limekubaliwa', REJECTED: 'Limekataliwa', CANCELLED: 'Limefungwa' };
  const hasPending = data?.swaps.some(row => row.status === 'PENDING');
  return <View className="mb-4 rounded-2xl bg-slate-900 p-4">
    <Text className="text-base font-bold text-white">Foleni ya mkopo mkubwa</Text>
    {loadError ? <><Text className="text-rose-200">{loadError}</Text><Action label="Pakia foleni tena" onPress={() => void reload()} /></> : null}
    {data?.spun === false && <>
      <Text className="text-slate-200">Spin hufanyika mara moja. Itapanga wanachama hai kutoka wa kwanza hadi wa mwisho.</Text>
      {chair && <Action label="Spin" disabled={busy} onPress={() => Alert.alert('Panga foleni?', 'Mpangilio huu utatumika kwa zamu za mkopo mkubwa.', [
        { text: 'Ghairi', style: 'cancel' }, { text: 'Spin', onPress: () => void run(() => apiClient.post('/loans/queue/spin')) },
      ])} />}
    </>}
    {data?.spun && <>
      {data.positions.map(member => <Text key={member.id} className={'py-1 ' + (member.id === data.next ? 'font-bold text-teal-300' : 'text-slate-200')}>
        {member.number}. {member.name}{member.id === data.next ? ' - zamu ya sasa' : ''}
      </Text>)}
      {data.positions.length > 1 && <Action label={choose ? 'Funga orodha ya kubadili' : 'Omba kubadili namba'} disabled={busy || hasPending} onPress={() => setChoose(value => !value)} />}
      {choose && !hasPending && data.positions.filter(row => row.id !== userId).map(row =>
        <Action key={row.id} label={'Omba kubadili na ' + row.name} disabled={busy} onPress={() => void run(
          () => apiClient.post('/loans/queue/swaps', { targetId: row.id }), () => setChoose(false),
        )} />,
      )}
      {data.swaps.map(swap => (
        <View key={swap.id} className="mt-2 border-t border-slate-700 pt-2">
          <Text className="text-slate-200">{swap.from === userId ? 'Kwa ' + (swap.toName ?? 'mwanachama') : 'Kutoka kwa ' + (swap.fromName ?? 'mwanachama')}: {labels[swap.status] ?? swap.status}</Text>
          {swap.status === 'PENDING' && swap.to === userId && <>
            <Action label="Kubali kubadili namba" disabled={busy} onPress={() => void run(() => apiClient.patch('/loans/queue/swaps/' + swap.id, { accept: true }))} />
            <Action label="Kataa ombi" disabled={busy} onPress={() => void run(() => apiClient.patch('/loans/queue/swaps/' + swap.id, { accept: false }))} />
          </>}
        </View>
      ))}
    </>}
    {error ? <Text accessibilityRole="alert" className="text-rose-200">{error}</Text> : null}
  </View>;
}

type Payment = { id: string; requestedAt: string; receivedAt?: string; principal: number; first: number; second: number; status: string; reason: string };
type Quote = { principalRemaining: number; firstInterest: number; secondInterest: number; secondRequired: boolean; secondDue: string; firstDue: string };
export function LoanPaymentPanel({ id, quote, latest, history, mine, chair, status, reload }: {
  id: string; quote: Quote; latest: Payment | null; history: Payment[]; mine: boolean; chair: boolean; status: string; reload: () => Promise<void>;
}) {
  const { busy, error, run } = useLoanAction(reload);
  const [showHistory, setShowHistory] = useState(false);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [includeSecond, setIncludeSecond] = useState(false);
  const [receivedOn, setReceivedOn] = useState<string | null>(null);
  const receiptDate = receivedOn ?? new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [reject, setReject] = useState(false);
  const [reason, setReason] = useState('');
  const values: Record<string, string> = { PENDING: 'Yanasubiri mwenyekiti', APPROVED: 'Yamethibitishwa', REJECTED: 'Yamekataliwa' };
  const principal = decimal(amount.trim());
  const total = Math.round((principal + quote.firstInterest + (quote.secondRequired || includeSecond ? quote.secondInterest : 0)) * 100) / 100;
  let request: ReactNode = null;
  if (mine && ['DISBURSED', 'OVERDUE'].includes(status)) {
    request = editing ? <>
      <Text className="text-slate-200">Weka 0 ikiwa unalipa riba pekee.</Text>
      <FormTextInput accessibilityLabel="Kiasi cha mtaji" className={inputStyle} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="Kiasi cha mtaji wa kurejesha" />
      <Action label="Tumia mtaji wote uliobaki" disabled={busy} onPress={() => setAmount(String(quote.principalRemaining))} />
      {!quote.secondRequired && quote.secondInterest > 0 && <Action label={includeSecond ? 'Ondoa riba ya pili ya hiari' : 'Jumuisha riba ya pili ya hiari'} disabled={busy} onPress={() => setIncludeSecond(value => !value)} />}
      <Text className="text-white">Jumla ya kuwasilisha: {money(Number.isFinite(total) ? total : 0)}</Text>
      <Action label="Tuma ombi la marejesho" disabled={busy || !amount.trim() || !Number.isFinite(total) || total <= 0 || principal > quote.principalRemaining || principal < 0}
        onPress={() => void run(() => apiClient.post('/loans/payments/' + id, { principal, includeSecond, expectedTotal: total }), () => setEditing(false))} />
      <Action label="Ghairi" disabled={busy} onPress={() => setEditing(false)} />
    </> : <Action label="Omba kulipa sehemu au deni lote" disabled={busy} onPress={() => setEditing(true)} />;
  }
  return <View className="mt-3 rounded-xl bg-slate-900 p-3">
    <Text className="text-white">Mtaji uliobaki: {money(quote.principalRemaining)}</Text>
    <Text className="text-slate-200">Riba ya kwanza inayodaiwa: {money(quote.firstInterest)} ({date(quote.firstDue)})</Text>
    <Text className="text-slate-200">Riba ya pili: {money(quote.secondInterest)} ({quote.secondRequired ? 'lazima' : 'hiari kabla ya'} {date(quote.secondDue)})</Text>
    {latest && <Text className="mt-2 text-white">Marejesho: {values[latest.status] ?? latest.status} - mtaji {money(latest.principal)}, riba {money(latest.first + latest.second)}{latest.reason ? ' - ' + latest.reason : ''}</Text>}
    {chair && latest?.status === 'PENDING' && <>
      <Text className="text-slate-200">Tarehe fedha zilipokelewa (YYYY-MM-DD)</Text>
      <FormTextInput accessibilityLabel="Tarehe ya kupokea fedha" className={inputStyle} value={receiptDate} maxLength={10} onChangeText={setReceivedOn} />
      <Action label="Thibitisha kupokea fedha" disabled={busy} onPress={() => Alert.alert('Thibitisha fedha ulizopokea', money(latest.principal + latest.first + latest.second), [
        { text: 'Ghairi', style: 'cancel' },
        { text: 'Thibitisha', onPress: () => void run(() => apiClient.patch('/loans/payments/' + id, { requestId: latest.id, accept: true, receivedOn: receiptDate }), () => setReceivedOn(null)) },
      ])} />
      {reject && <FormTextInput accessibilityLabel="Sababu ya kukataa marejesho" className={inputStyle} value={reason} maxLength={300} onChangeText={setReason} placeholder="Sababu ya kukataa" />}
      <Action label={reject ? 'Tuma sababu kwa mkopaji' : 'Kataa marejesho'} disabled={busy || (reject && reason.trim().length < 3)} onPress={() => {
        if (!reject) { setReject(true); return; }
        void run(() => apiClient.patch('/loans/payments/' + id, { requestId: latest.id, accept: false, reason }), () => { setReject(false); setReason(''); });
      }} />
    </>}
    {history.length > 0 && <Action label={showHistory ? 'Ficha historia ya marejesho' : 'Historia ya marejesho'} onPress={() => setShowHistory(value => !value)} />}
    {showHistory && [...history].reverse().map(payment => <Text key={payment.id} className="mt-1 text-slate-200">
      {date(payment.receivedAt ?? payment.requestedAt)} - {values[payment.status] ?? payment.status}: {money(payment.principal + payment.first + payment.second)}{payment.reason ? ' - ' + payment.reason : ''}
    </Text>)}
    {request}
    {error ? <Text accessibilityRole="alert" className="text-rose-200">{error}</Text> : null}
  </View>;
}

export function DeclineRequest({ path, reload }: { path: string; reload: () => Promise<void> }) {
  const { busy, error, run } = useLoanAction(reload);
  const [show, setShow] = useState(false);
  const [reason, setReason] = useState('');
  return <View className="mt-2">
    {show && <FormTextInput accessibilityLabel="Sababu ya kukataa ombi" className={inputStyle} value={reason} maxLength={300} onChangeText={setReason} placeholder="Sababu ya kukataa" />}
    <Action label={show ? 'Tuma sababu' : 'Kataa ombi'} disabled={busy || (show && reason.trim().length < 3)} onPress={() => {
      if (!show) { setShow(true); return; }
      void run(() => apiClient.post(path, { reason }), () => setShow(false));
    }} />
    {error ? <Text accessibilityRole="alert" className="text-rose-600">{error}</Text> : null}
  </View>;
}
