import { byMemberName } from '../utils/byMemberName';
import { useEffect, useState } from 'react';
import { Alert, Platform, Text, TouchableOpacity, View } from 'react-native';
import { isAxiosError } from 'axios';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { apiClient } from '../api/client';
import { cycleReportHtml, type CycleReport } from '../utils/cycleReport';

type Member = {
  userId: string; fullName: string; myPapoMandatoryDebt: number;
  myPapoMandatory: number; payoutAfterPapoRepayment: number; otherDeductions: number; netPayout: number; balanceToCollect: number;
};
type Archive = { id: string; startedAt: string; closedAt: string };
const money = (amount: number) => 'TZS ' + amount.toLocaleString('en-TZ');
const date = (value: string) => new Date(value).toLocaleDateString('sw-TZ', { timeZone: 'Africa/Dar_es_Salaam' });

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
    let html = '';
    try {
      const { data } = await apiClient.get<CycleReport>('/transparency/cycles/' + encodeURIComponent(id));
      html = cycleReportHtml(data);
      if (Platform.OS === 'web' || !(await Sharing.isAvailableAsync())) {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      const file = new File(uri);
      if (!file.exists || !file.size) throw new Error('Faili la PDF halikupatikana.');
      const named = new File(Paths.cache, 'Ripoti-Kikoba-' + data.closedAt.slice(0, 10) + '-' + file.name);
      let shareUri = uri;
      try {
        await file.move(named);
        shareUri = named.uri;
      } catch {
        // The original PDF can still be shared if renaming fails.
      }
      await Sharing.shareAsync(shareUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Shiriki ripoti ya mzunguko' });
    } catch (error) {
      if (!html) {
        const detail = isAxiosError(error) ? error.response?.data?.error : error instanceof Error ? error.message : undefined;
        Alert.alert('Ripoti haikupatikana', typeof detail === 'string' ? detail : 'Imeshindikana kupakia ripoti ya mzunguko. Jaribu tena.');
      } else {
        Alert.alert('PDF haikushirikiwa', 'Chagua Hifadhi kama PDF kwenye menyu ya uchapishaji.', [
          { text: 'Funga', style: 'cancel' },
          { text: 'Fungua uchapishaji', onPress: () => void Print.printAsync({ html }).catch(() =>
            Alert.alert('Hitilafu', 'Imeshindikana kufungua uchapishaji wa ripoti.')) },
        ]);
      }
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
              {byMemberName(preview.members, member => member.fullName).map(member => (
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
