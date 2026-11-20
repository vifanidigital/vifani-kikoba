import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';

export interface Group {
  id: string;
  name: string;
  shareValue: number;
  interestRate: number;
  subscriptionStatus: string;
  contributionFreq?: string;
  socialFundAmount?: number;
  latePenalty?: number;
  hasPapo?: boolean;
  mandatoryPapoAmount?: number;
}


export interface Membership {
  id: string;
  role: string;
  groupId: string;
  group: Group;
}

export interface User {
  id: string;
  fullName: string;
  phone: string;
}

interface AuthContextType {
  user: User | null;
  group: Group | null;
  role: string | null;
  memberships: Membership[];
  token: string | null;
  loading: boolean;
  needsGroupSelection: boolean;
  signIn: (
    token: string,
    user: User,
    activeGroup: Group,
    activeRole: string,
    memberships: Membership[],
    forcePicker?: boolean
  ) => Promise<void>;
  switchGroup: (targetGroupId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsGroupSelection, setNeedsGroupSelection] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      try {
        const [savedToken, savedUser, savedGroup, savedRole, savedMemberships] = await Promise.all([
          AsyncStorage.getItem('vifani_token'),
          AsyncStorage.getItem('vifani_user'),
          AsyncStorage.getItem('vifani_group'),
          AsyncStorage.getItem('vifani_role'),
          AsyncStorage.getItem('vifani_memberships'),
        ]);

        if (savedToken && savedUser && savedGroup) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
          setGroup(JSON.parse(savedGroup));
          setRole(savedRole);
          if (savedMemberships) setMemberships(JSON.parse(savedMemberships));
        }
      } finally {
        setLoading(false);
      }
    };
    loadSession();
  }, []);

  const signIn = async (
    newToken: string,
    newUser: User,
    activeGroup: Group,
    activeRole: string,
    userMemberships: Membership[],
    forcePicker = false
  ) => {
    await AsyncStorage.multiSet([
      ['vifani_token', newToken],
      ['vifani_user', JSON.stringify(newUser)],
      ['vifani_group', JSON.stringify(activeGroup)],
      ['vifani_role', activeRole],
      ['vifani_memberships', JSON.stringify(userMemberships)],
    ]);

    setToken(newToken);
    setUser(newUser);
    setGroup(activeGroup);
    setRole(activeRole);
    setMemberships(userMemberships);
    setNeedsGroupSelection(forcePicker && userMemberships.length > 1);
  };

  const switchGroup = async (targetGroupId: string) => {
    const res = await apiClient.post('/auth/switch-group', { targetGroupId });
    const { token: newToken, activeGroup, activeRole } = res.data;

    await AsyncStorage.multiSet([
      ['vifani_token', newToken],
      ['vifani_group', JSON.stringify(activeGroup)],
      ['vifani_role', activeRole],
    ]);

    setToken(newToken);
    setGroup(activeGroup);
    setRole(activeRole);
    setNeedsGroupSelection(false);
  };

  const signOut = async () => {
    await AsyncStorage.multiRemove([
      'vifani_token',
      'vifani_user',
      'vifani_group',
      'vifani_role',
      'vifani_memberships',
    ]);
    setToken(null);
    setUser(null);
    setGroup(null);
    setRole(null);
    setMemberships([]);
    setNeedsGroupSelection(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        group,
        role,
        memberships,
        token,
        loading,
        needsGroupSelection,
        signIn,
        switchGroup,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
