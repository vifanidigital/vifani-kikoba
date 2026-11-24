import { FormTextInput, FormScrollView } from '../components/KeyboardForm';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,

  Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function GroupPickerScreen() {
  const insets = useSafeAreaInsets();
  const { user, memberships, switchGroup, signOut } = useAuth();
  const { isDark } = useTheme();

  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [fadeAnim] = useState(() => new Animated.Value(0));
  const [slideAnim] = useState(() => new Animated.Value(15));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleSelectGroup = async (groupId: string) => {
    setSwitchingId(groupId);
    try {
      await switchGroup(groupId);
    } catch {
      Alert.alert('Hitilafu', 'Imeshindikana kufungua kikundi hiki. Jaribu tena.');
    } finally {
      setSwitchingId(null);
    }
  };

  const getRoleLabel = (role?: string) => {
    if (role === 'CHAIRPERSON') return 'Mwenyekiti';
    if (role === 'SECRETARY') return 'Katibu';
    if (role === 'TREASURER') return 'Mweka Hazina';
    return 'Mwanachama';
  };

  const safeMemberships = Array.isArray(memberships) ? memberships : [];
  const filteredGroups = safeMemberships.filter((item: any) =>
    String(item?.group?.name || '')
      .toLowerCase()
      .includes(searchQuery.trim().toLowerCase())
  );

  const bgClass = isDark ? 'bg-slate-950' : 'bg-slate-100';
  const cardClass = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textMain = isDark ? 'text-white' : 'text-slate-900';
  const textSub = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <View className={`flex-1 ${bgClass}`}>
      <View
        style={{ paddingTop: Math.max(insets.top + 14, 52) }}
        className="bg-teal-700 pb-6 px-6 rounded-b-3xl shadow-md"
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-3">
            <Text className="text-teal-200 text-xs font-bold uppercase tracking-wider">
              Vifani Jamii
            </Text>
            <Text className="text-2xl font-extrabold text-white mt-0.5">Chagua Kikundi</Text>
            <Text className="text-xs text-teal-100 mt-1">
              Habari {user?.fullName || 'Mwanachama'}, una uanachama kwenye vikundi {safeMemberships.length}
            </Text>
          </View>

          <TouchableOpacity
            onPress={signOut}
            className="bg-rose-600/90 px-3.5 py-2 rounded-xl flex-row items-center gap-1"
          >
            <Ionicons name="log-out-outline" size={16} color="#ffffff" />
            <Text className="text-white font-bold text-xs">Toka</Text>
          </TouchableOpacity>
        </View>

      </View>

      <FormScrollView
        className="flex-1 px-5 pt-5"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom + 24, 40) }}
        showsVerticalScrollIndicator={false}
      >
        {safeMemberships.length > 3 && (
          <View className="flex-row items-center bg-teal-800/80 rounded-xl px-3.5 py-2.5 mb-4 border border-teal-600/50">
            <Ionicons name="search-outline" size={18} color="#99f6e4" />
            <FormTextInput
              className="flex-1 ml-2 text-white text-xs font-semibold"
              placeholder="Tafuta jina la kikundi..."
              placeholderTextColor="#99f6e4"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color="#99f6e4" />
              </TouchableOpacity>
            )}
          </View>
        )}
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
          {filteredGroups.length === 0 ? (
            <View className={`p-8 rounded-2xl border items-center mt-4 ${cardClass}`}>
              <Ionicons name="folder-open-outline" size={40} color="#64748b" />
              <Text className={`font-bold text-sm mt-3 ${textMain}`}>Hakuna Kikundi Kilichopatikana</Text>
              <Text className={`text-xs text-center mt-1 ${textSub}`}>
                {searchQuery
                  ? 'Badilisha neno la utafutaji ujaribu tena.'
                  : 'Bado hujaunganishwa na kikundi chochote.'}
              </Text>
            </View>
          ) : (
            filteredGroups.map((item: any) => {
              const isLoading = switchingId === item.groupId;
              const shareVal = Number(item?.group?.shareValue || 0);
              return (
                <TouchableOpacity
                  key={item.id || item.groupId}
                  onPress={() => handleSelectGroup(item.groupId)}
                  disabled={switchingId !== null}
                  activeOpacity={0.85}
                  className={`p-4 rounded-2xl border mb-3.5 flex-row items-center justify-between shadow-sm ${cardClass}`}
                >
                  <View className="flex-row items-center flex-1 pr-2">
                    <View className="w-12 h-12 bg-teal-600/15 rounded-2xl items-center justify-center mr-3.5">
                      <Ionicons name="people" size={24} color="#0f766e" />
                    </View>
                    <View className="flex-1">
                      <Text className={`text-base font-extrabold ${textMain}`} numberOfLines={1}>
                        {item?.group?.name || 'Kikundi'}
                      </Text>
                      <View className="flex-row items-center gap-2 mt-1 flex-wrap">
                        <View className="bg-teal-600/15 px-2 py-0.5 rounded-md">
                          <Text className="text-[11px] text-teal-700 font-bold">
                            {getRoleLabel(item?.role)}
                          </Text>
                        </View>
                        {shareVal > 0 && (
                          <Text className={`text-xs font-semibold ${textSub}`}>
                            • Hisa: TZS {shareVal.toLocaleString()}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {isLoading ? (
                    <ActivityIndicator color="#0f766e" />
                  ) : (
                    <Ionicons name="chevron-forward-circle" size={24} color="#0f766e" />
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </Animated.View>
      </FormScrollView>
    </View>
  );
}
