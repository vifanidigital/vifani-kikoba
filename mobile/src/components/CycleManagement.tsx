import { useEffect, useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { isAxiosError } from 'axios';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { apiClient } from '../api/client';

type Member = {
  userId: string; fullName: string; myPapoMandatoryDebt: number;
  myPapoMandatory: number; payoutAfterPapoRepayment: number; otherDeductions: number; netPayout: number; balanceToCollect: number;
};
type Archive = { id: string; startedAt: string; closedAt: string };
type Report = Archive & {
  groupName: string;
  result: { membersPayout: Member[]; distributableProfitPool: number; totalExpenses: number };
};

const money = (amount: number) => 'TZS ' + amount.toLocaleString('en-TZ');
const date = (value: string) => new Date(value).toLocaleDateString('sw-TZ', { timeZone: 'Africa/Dar_es_Salaam' });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

export default function CycleManagement({ canClose, closedAt, preview, reload }: {
  canClose: boolean;
  closedAt?: string | null;
  preview?: { token: string; members: Member[] } | null;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [archives, setArchives] = useState<Archive[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.get<{ archives: Archive[] }>('/transparency/cycles').then(({ data }) => {
      if (active) { setArchives(data.archives); setError(''); }
    }).catch(() => { if (active) setError('Imeshindikana kupakia kumbukumbu za mizunguko.'); });
    return () => { active = false; };
  }, [closedAt]);

  const manage = (action: 'close' | 'restart') => {
    Alert.alert(
      action === 'close' ? 'Funga mzunguko huu?' : 'Anzisha mzunguko mpya?',
      action === 'close'
        ? 'Thibitisha kuwa Papo ya lazima na salio jingine vimerejeshwa, na mgao wa kila mwanachama umetolewa. Ripoti itahifadhiwa.'
        : 'Taarifa za fedha za mzunguko uliofungwa zitabaki kwenye kumbukumbu. Mzunguko mpya utaanza na daftari jipya.',
      [
        { text: 'Ghairi', style: 'cancel' },
        { text: 'Thibitisha', onPress: async () => {
          setBusy(true);
          try {
            const { data } = await apiClient.post('/transparency/cycles/' + action, { confirmed: true, token: preview?.token });
            await reload();
            setExpanded(false);
            Alert.alert('Imefanikiwa', data.message);
          } catch (cause) {
            const message = isAxiosError(cause) ? cause.response?.data?.error : undefined;
            Alert.alert('Hitilafu', typeof message === 'string' ? message : 'Ombi halikufanikiwa.');
            await reload();
          } finally { setBusy(false); }
        } },
      ],
    );
  };

  const exportPdf = async (id: string) => {
    setBusy(true);
    try {
      const { data } = await apiClient.get<Report>('/transparency/cycles/' + encodeURIComponent(id));
      const rows = data.result.membersPayout.map(member =>
        '<tr><td>' + escapeHtml(member.fullName) + '</td><td>' + money(member.myPapoMandatoryDebt) +
        '</td><td>' + money(member.payoutAfterPapoRepayment) + '</td><td>' + money(member.otherDeductions) +
        '</td><td>' + money(member.balanceToCollect) + '</td><td>' + money(member.netPayout) + '</td></tr>',
      ).join('');
      const html = '<!doctype html><html lang="sw"><meta charset="utf-8"><style>body{font:13px sans-serif;padding:24px;color:#173b35}table{border-collapse:collapse;width:100%}th,td{border:1px solid #a1b8b0;padding:7px;text-align:left}tr{break-inside:avoid}thead{display:table-header-group}</style>' +
        '<h1>Ripoti ya kufunga Kikoba</h1><h2>' + escapeHtml(data.groupName) + '</h2><p>' +
        date(data.startedAt) + ' hadi ' + date(data.closedAt) + '</p><p>Faida ya kugawa: ' +
        money(data.result.distributableProfitPool) + ' | Matumizi: ' + money(data.result.totalExpenses) +
        '</p><p>Papo ya lazima imethibitishwa kurejeshwa na kubaki kwa mwenyewe. Mgawo halisi unaonyesha kiasi baada ya makato.</p>' +
        '<table><thead><tr><th>Mwanachama</th><th>Papo ya kurejesha</th><th>Fedha za kutoa baada ya marejesho</th><th>Makato mengine</th><th>Salio jingine la kulipa</th><th>Mgawo halisi</th></tr></thead><tbody>' + rows + '</tbody></table></html>';
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable');
      const file = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: 'Pakua au shiriki ripoti ya Kikoba' });
    } catch {
      Alert.alert('Hitilafu', 'Imeshindikana kutengeneza au kushiriki PDF.');
    } finally { setBusy(false); }
  };

  return (
    <View className="mb-4 rounded-2xl border border-teal-700 bg-teal-950 p-4">
      <Text className="font-bold text-white">Usimamizi wa Mzunguko</Text>
      {closedAt ? <Text className="mt-2 text-teal-100">Mzunguko umefungwa tarehe {date(closedAt)}.</Text> : null}
      {canClose && closedAt ? (
        <TouchableOpacity disabled={busy} onPress={() => manage('restart')} className="mt-3 self-start rounded-xl bg-teal-700 px-4 py-3">
          <Text className="font-bold text-white">Anzisha mzunguko mpya</Text>
        </TouchableOpacity>
      ) : canClose && preview ? (
        <>
          <TouchableOpacity disabled={busy} onPress={() => setExpanded(value => !value)} className="mt-3 self-start rounded-xl bg-teal-700 px-4 py-3">
            <Text className="font-bold text-white">{expanded ? 'Ficha orodha ya mgawo' : 'Hakiki mgawo na funga mzunguko'}</Text>
          </TouchableOpacity>
          {expanded && (
            <>
              {preview.members.map(member => (
                <View key={member.userId} className="mt-2 border-t border-teal-800 pt-2">
                  <Text className="font-bold text-white">{member.fullName}</Text>
                  <Text className="text-teal-100">Papo ya kurejesha {money(member.myPapoMandatoryDebt)} · Fedha za kutoa baada ya marejesho {money(member.payoutAfterPapoRepayment)} · Mgawo halisi {money(member.netPayout)}</Text>
                  {member.balanceToCollect > 0 ? <Text className="text-teal-100">Salio jingine la kulipa {money(member.balanceToCollect)}</Text> : null}
                </View>
              ))}
              <TouchableOpacity disabled={busy} onPress={() => manage('close')} className="mt-3 self-start rounded-xl bg-rose-800 px-4 py-3">
                <Text className="font-bold text-white">Thibitisha na funga mzunguko</Text>
              </TouchableOpacity>
            </>
          )}
        </>
      ) : null}
      <Text className="mt-4 font-bold text-white">Ripoti za mizunguko</Text>
      {error ? <Text className="mt-2 text-teal-100">{error}</Text> : null}
      {!error && archives.length === 0 ? <Text className="mt-2 text-teal-100">Hakuna mzunguko uliofungwa.</Text> : null}
      {archives.map(archive => (
        <TouchableOpacity key={archive.id} disabled={busy} onPress={() => void exportPdf(archive.id)} className="mt-2 rounded-xl border border-teal-700 p-3">
          <Text className="font-bold text-white">PDF · {date(archive.startedAt)} hadi {date(archive.closedAt)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
