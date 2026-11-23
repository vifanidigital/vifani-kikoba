import type { ErrorBoundaryProps } from 'expo-router';
import { useRouter } from 'expo-router';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TabErrorBoundary({ retry }: ErrorBoundaryProps) {
  const router = useRouter();
  return (
    <SafeAreaView className="flex-1 justify-center bg-slate-100 px-6">
      <Text className="text-lg font-bold text-slate-900">Ukurasa umeshindwa kufunguka</Text>
      <View className="mt-4 flex-row flex-wrap gap-3">
        <TouchableOpacity accessibilityRole="button" onPress={retry} className="rounded-xl bg-teal-700 p-3">
          <Text className="font-bold text-white">Jaribu tena</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={() => router.replace('/')} className="p-3">
          <Text className="font-bold text-teal-800">Rudi Nyumbani</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
