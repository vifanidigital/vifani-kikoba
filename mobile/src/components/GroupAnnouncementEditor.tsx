import { useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/client';
import { useTheme } from '../context/ThemeContext';

type AnnouncementFields = {
  announcement?: string | null;
  announcementPublishedAt?: string | null;
  announcementExpiresAt?: string | null;
};

export default function GroupAnnouncementEditor({ group, reload }: {
  group: AnnouncementFields;
  reload: () => Promise<void>;
}) {
  const { isDark } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [hours, setHours] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textColor = isDark ? 'text-white' : 'text-slate-900';
  const detailColor = isDark ? 'text-slate-300' : 'text-slate-600';
  const expires = group.announcementExpiresAt;

  const open = () => {
    setDraft(group.announcement ?? '');
    setHours(expires && new Date(expires).getTime() > Date.now() ? '' : '24');
    setError('');
    setEditing(true);
  };

  const submit = async (remove: boolean) => {
    if (saving) return;
    const durationHours = hours.trim() ? Number(hours) : undefined;
    if (!remove && (!draft.trim() || (durationHours !== undefined &&
      (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 2160)))) {
      setError('Andika tangazo na weka muda kati ya saa 1 na 2160.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (remove) {
        await apiClient.delete('/group/announcement');
      } else {
        await apiClient.put('/group/announcement', { text: draft.trim(), durationHours });
      }
      await reload();
      setEditing(false);
    } catch (cause) {
      const message = isAxiosError(cause) ? cause.response?.data?.error : null;
      setError(typeof message === 'string' ? message : 'Imeshindikana kusasisha tangazo. Jaribu tena.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className={'mb-4 rounded-2xl p-4 ' + (isDark ? 'bg-slate-900' : 'bg-white')}>
      <Text className={'text-base font-bold ' + textColor}>Tangazo la Kikundi</Text>
      {group.announcement ? (
        <>
          <Text className={'mt-2 ' + textColor}>{group.announcement}</Text>
          <Text className={'mt-2 text-xs ' + detailColor}>
            {group.announcementPublishedAt ? 'Lilichapishwa ' + new Date(group.announcementPublishedAt).toLocaleString('sw-TZ') : 'Tangazo la awali'}
          </Text>
          <Text className={'mt-1 text-xs ' + detailColor}>
            {expires ? 'Mwisho wa kuonekana ' + new Date(expires).toLocaleString('sw-TZ') : 'Muda wa mwisho haujawekwa'}
          </Text>
        </>
      ) : <Text className={'mt-2 ' + detailColor}>Hakuna tangazo.</Text>}
      {editing ? (
        <>
          <Text className={'mb-1 mt-3 font-bold ' + textColor}>Ujumbe</Text>
          <TextInput
            accessibilityLabel="Ujumbe wa tangazo"
            multiline
            maxLength={1000}
            editable={!saving}
            value={draft}
            onChangeText={setDraft}
            className={'min-h-24 rounded-xl border border-slate-400 p-3 ' + textColor}
          />
          <Text className={'mb-1 mt-3 font-bold ' + textColor}>Muda wa kuonekana kwa saa</Text>
          <TextInput
            accessibilityLabel="Muda wa kuonekana kwa saa"
            keyboardType="number-pad"
            editable={!saving}
            maxLength={4}
            value={hours}
            onChangeText={setHours}
            className={'rounded-xl border border-slate-400 p-3 ' + textColor}
          />
          <Text className={'mt-1 text-xs ' + detailColor}>
            Muda mpya unaanza unapohifadhi. Kwa tangazo linaloonekana sasa, acha wazi ili kubaki na muda wake wa mwisho.
          </Text>
        </>
      ) : null}
      {error ? <Text accessibilityRole="alert" className="mt-2 text-red-600">{error}</Text> : null}
      <View className="mt-3 flex-row flex-wrap gap-2">
        <TouchableOpacity disabled={saving} onPress={editing ? () => void submit(false) : open} className="rounded-xl bg-teal-700 px-4 py-3">
          <Text className="font-bold text-white">{saving ? 'Inahifadhi…' : editing ? 'Hifadhi tangazo' : group.announcement ? 'Hariri tangazo' : 'Weka tangazo'}</Text>
        </TouchableOpacity>
        {editing ? (
          <TouchableOpacity disabled={saving} onPress={() => { setError(''); setEditing(false); }} className="px-3 py-3">
            <Text className={textColor}>Ghairi</Text>
          </TouchableOpacity>
        ) : group.announcement ? (
          <TouchableOpacity
            disabled={saving}
            onPress={() => Alert.alert('Futa tangazo?', 'Wanachama hawataliona tena.', [
              { text: 'Ghairi', style: 'cancel' },
              { text: 'Futa', style: 'destructive', onPress: () => void submit(true) },
            ])}
            className="px-3 py-3"
          >
            <Text className="font-bold text-red-600">Futa tangazo</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}
