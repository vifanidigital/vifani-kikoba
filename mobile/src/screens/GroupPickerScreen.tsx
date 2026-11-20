import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';

export default function GroupPickerScreen() {
  const { user, memberships, switchGroup, signOut } = useAuth();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const handleSelectGroup = async (groupId: string) => {
    setSwitchingId(groupId);
    try {
      await switchGroup(groupId);
    } catch (error) {
      Alert.alert('Hitilafu', 'Imeshindikana kufungua kikoba hiki. Jaribu tena.');
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <ScrollView contentContainerClassName="flex-grow bg-slate-50 px-6 pt-16 pb-10 justify-between">
      <View>
        <View className="flex-row justify-between items-center mb-6">
          <View>
            <Text className="text-2xl font-bold text-slate-900">Chagua Kikoba</Text>
            <Text className="text-sm text-slate-500 mt-1">
              Habari {user?.fullName}, una uanachama kwenye vikoba {memberships.length}
            </Text>
          </View>
          <TouchableOpacity onPress={signOut} className="bg-red-100 px-3.5 py-2 rounded-xl">
            <Text className="text-red-600 font-bold text-xs">Toka</Text>
          </TouchableOpacity>
        </View>

        {memberships.map((item) => {
          const isLoading = switchingId === item.groupId;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => handleSelectGroup(item.groupId)}
              disabled={switchingId !== null}
              className="bg-white p-5 rounded-2xl border border-slate-200 mb-3.5 flex-row items-center justify-between shadow-sm"
            >
              <View className="flex-row items-center flex-1">
                <View className="w-12 h-12 bg-teal-100 rounded-xl items-center justify-center mr-3.5">
                  <Ionicons name="people" size={24} color="#0f766e" />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-slate-900">{item.group.name}</Text>
                  <Text className="text-xs text-teal-700 font-semibold mt-0.5">
                    Cheo: {item.role} • Hisa: TZS {item.group.shareValue.toLocaleString()}
                  </Text>
                </View>
              </View>

              {isLoading ? (
                <ActivityIndicator color="#0f766e" />
              ) : (
                <Ionicons name="chevron-forward" size={22} color="#64748b" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}
