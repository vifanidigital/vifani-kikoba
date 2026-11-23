import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

export default function TabDataNotice({ loading, error, hasData, retry }: {
  loading: boolean;
  error: string | null;
  hasData: boolean;
  retry: () => void;
}) {
  if (error) {
    return (
      <View className="my-3 rounded-xl bg-amber-100 p-4">
        <Text className="text-sm text-amber-900">{error}</Text>
        {hasData && <Text className="mt-1 text-xs text-amber-900">Unaona taarifa za mwisho zilizohifadhiwa.</Text>}
        <TouchableOpacity accessibilityRole="button" onPress={retry} className="mt-2 self-start py-2">
          <Text className="font-bold text-teal-800">Jaribu tena</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!hasData && loading) {
    return (
      <View className="items-center py-8" accessibilityRole="progressbar">
        <ActivityIndicator color="#0f766e" />
        <Text className="mt-2 text-teal-600">Inapakia taarifa…</Text>
      </View>
    );
  }
  return null;
}
