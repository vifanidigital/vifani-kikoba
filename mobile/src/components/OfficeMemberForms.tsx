import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { isAxiosError } from 'axios';
import { apiClient } from '../api/client';
import { FormTextInput } from './KeyboardForm';
import { useTheme } from '../context/ThemeContext';

function errorMessage(error: unknown) {
  const detail = isAxiosError(error) ? error.response?.data?.error : undefined;
  return typeof detail === 'string' ? detail : 'Ombi halikufanikiwa. Jaribu tena.';
}

export function AddMemberForm({ reload }: { reload: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { isDark } = useTheme();
  const textClass = isDark ? 'text-white' : 'text-slate-900';
  const field = 'my-1 rounded-xl border border-slate-400 p-3 ' + textClass;

  const submit = async () => {
    if (saving) return;
    if (fullName.trim().length < 2 || !phone.trim() || (pin && !/^[0-9]{4,6}$/.test(pin))) {
      setError('Weka jina, namba ya simu na PIN halali ikiwa ni akaunti mpya.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await apiClient.post('/members/add', { fullName: fullName.trim(), phone: phone.trim(), pin: pin || undefined });
      setFullName(''); setPhone(''); setPin(''); setOpen(false);
      Alert.alert('Wanachama', response.data.message);
      await reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mb-4">
      {!open ? (
        <Pressable accessibilityRole="button" onPress={() => setOpen(true)} className="self-start rounded-xl bg-teal-800 px-4 py-3">
          <Text className="font-bold text-white">Ongeza Mwanachama</Text>
        </Pressable>
      ) : (
        <>
          <Text className={'mb-2 font-bold ' + textClass}>Ongeza Mwanachama</Text>
          <FormTextInput accessibilityLabel="Jina kamili" placeholder="Jina kamili" placeholderTextColor="#64748b" className={field} value={fullName} onChangeText={setFullName} maxLength={120} />
          <FormTextInput accessibilityLabel="Namba ya simu" placeholder="Namba ya simu" placeholderTextColor="#64748b" className={field} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <FormTextInput accessibilityLabel="PIN ya awali" placeholder="PIN ya awali kwa akaunti mpya" placeholderTextColor="#64748b" className={field} value={pin} onChangeText={setPin} secureTextEntry maxLength={6} keyboardType="number-pad" />
          <Text className={'mb-2 text-xs ' + textClass}>Kwa mwenye akaunti tayari, acha PIN wazi. Atatumia PIN yake ya sasa.</Text>
          {error ? <Text accessibilityRole="alert" className="mb-2 text-rose-600">{error}</Text> : null}
          <View className="flex-row gap-3">
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void submit()} className="rounded-xl bg-teal-800 px-4 py-3">
              <Text className="font-bold text-white">{saving ? 'Inahifadhi…' : 'Hifadhi Mwanachama'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => { setPin(''); setOpen(false); setError(''); }} className="p-3"><Text className={textClass}>Ghairi</Text></Pressable>
          </View>
        </>
      )}
    </View>
  );
}

export function MemberStatusForm({ member, reload }: {
  member: { userId: string; fullName: string; isActive: boolean };
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { isDark } = useTheme();
  const textClass = isDark ? 'text-white' : 'text-slate-900';

  const submit = async (active: boolean) => {
    if (saving) return;
    if (!active && !reason.trim()) {
      setError('Andika sababu ya kusimamisha mwanachama.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await apiClient.patch('/members/' + encodeURIComponent(member.userId) + '/status', { active, reason: reason.trim() });
      setOpen(false); setReason('');
      Alert.alert('Uanachama', response.data.message);
      await reload();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="mt-3">
      {open && member.isActive ? (
        <>
          <FormTextInput accessibilityLabel="Sababu ya kusimamisha" placeholder="Sababu ya kusimamisha" placeholderTextColor="#64748b" multiline maxLength={240} value={reason} onChangeText={setReason} className={'mb-2 rounded-xl border border-slate-400 p-3 ' + textClass} />
          <View className="flex-row gap-3">
            <Pressable accessibilityRole="button" onPress={() => void submit(false)} disabled={saving} className="rounded-xl bg-rose-800 px-3 py-2"><Text className="font-bold text-white">Thibitisha kusimamisha</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { setOpen(false); setError(''); }} disabled={saving} className="p-2"><Text className={textClass}>Ghairi</Text></Pressable>
          </View>
        </>
      ) : (
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => member.isActive ? setOpen(true) : void submit(true)} className="self-start rounded-xl border border-teal-600 px-3 py-2">
          <Text className={textClass}>{member.isActive ? 'Simamisha uanachama' : 'Rejesha uanachama'}</Text>
        </Pressable>
      )}
      {error ? <Text accessibilityRole="alert" className="mt-2 text-rose-600">{error}</Text> : null}
    </View>
  );
}
