import { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/client';
import { FormTextInput } from './KeyboardForm';

export default function MemberPinReset({ userId, name }: { userId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!/^\d{4,6}$/.test(pin) || busy) return;
    setBusy(true);
    try {
      const { data } = await apiClient.post<{ code: string; expiresAt: string }>(
        '/members/' + encodeURIComponent(userId) + '/pin-reset', { chairPin: pin },
      );
      setOpen(false);
      Alert.alert('Kodi ya muda ya ' + name, data.code + '\n\nMpe mwanachama faraghani. Kodi inatumika mara moja ndani ya dakika 15 kwenye sehemu ya Nimesahau PIN.');
    } catch (error) {
      const detail = isAxiosError(error) ? error.response?.data?.error : undefined;
      Alert.alert('Imeshindikana', typeof detail === 'string' ? detail : 'Jaribu tena.');
    } finally {
      setPin('');
      setBusy(false);
    }
  };
  return <View className="mt-2">
    <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => { setOpen(!open); setPin(''); }} className="self-start rounded-lg bg-indigo-700 px-3 py-2">
      <Text className="font-bold text-white">{open ? 'Ghairi' : 'Rejesha PIN'}</Text>
    </TouchableOpacity>
    {open && <View className="mt-2">
      <Text className="text-sm text-slate-500">Thibitisha kwa PIN yako ya mwenyekiti ili kutoa kodi ya muda kwa {name}.</Text>
      <FormTextInput accessibilityLabel="PIN ya mwenyekiti" value={pin} maxLength={6}
        onChangeText={text => setPin(text.replace(/[^0-9]/g, ''))} keyboardType="number-pad" secureTextEntry
        editable={!busy} className="my-2 rounded-lg border border-slate-400 bg-white p-3 text-slate-900" placeholder="PIN yako ya mwenyekiti" />
      <TouchableOpacity accessibilityRole="button" disabled={busy || pin.length < 4} onPress={() => void submit()} className={'self-start rounded-lg bg-teal-700 px-3 py-2 ' + (busy || pin.length < 4 ? 'opacity-50' : '')}>
        <Text className="font-bold text-white">{busy ? 'Inaandaa kodi...' : 'Tengeneza kodi ya muda'}</Text>
      </TouchableOpacity>
    </View>}
  </View>;
}
