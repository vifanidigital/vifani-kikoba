import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient, SESSION_TOKEN_KEY } from '../api/client';

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
  updateUser: (updatedUser: User) => Promise<void>;
  chooseGroup: () => void;
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
          AsyncStorage.getItem(SESSION_TOKEN_KEY),
          AsyncStorage.getItem('vifani_user'),
          AsyncStorage.getItem('vifani_group'),
          AsyncStorage.getItem('vifani_role'),
          AsyncStorage.getItem('vifani_memberships'),
        ]);

        if (savedToken && savedUser && savedGroup) {
          const restoredUser: User = JSON.parse(savedUser);
          const restoredGroup: Group = JSON.parse(savedGroup);
          const restoredMemberships = savedMemberships ? JSON.parse(savedMemberships) : [];
          if (!restoredUser?.id || !restoredGroup?.id) return;
          setUser(restoredUser);
          setGroup(restoredGroup);
          setRole(savedRole);
          setMemberships(Array.isArray(restoredMemberships) ? restoredMemberships : []);
          setToken(savedToken);
        }
      } catch {
        // A failed session restore leaves the user at sign-in.
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
    if (!newToken || !newUser?.id || !activeGroup?.id || !activeRole || !Array.isArray(userMemberships)) {
      throw new Error('Majibu ya kuingia hayajakamilika.');
    }
    try {
      await AsyncStorage.multiSet([
        [SESSION_TOKEN_KEY, newToken],
        ['vifani_user', JSON.stringify(newUser)],
        ['vifani_group', JSON.stringify(activeGroup)],
        ['vifani_role', activeRole],
        ['vifani_memberships', JSON.stringify(userMemberships)],
      ]);
    } catch {
      throw new Error('Akaunti imethibitishwa, lakini simu imeshindwa kuhifadhi kipindi cha kuingia.');
    }

    setToken(newToken);
    setUser(newUser);
    setGroup(activeGroup);
    setRole(activeRole);
    setMemberships(userMemberships);
    setNeedsGroupSelection(forcePicker && userMemberships.length > 1);
  };

  const updateUser = async (updatedUser: User) => {
    await AsyncStorage.setItem('vifani_user', JSON.stringify(updatedUser));
    setUser(updatedUser);
  };

  const switchGroup = async (targetGroupId: string) => {
    if (targetGroupId === group?.id) {
      setNeedsGroupSelection(false);
      return;
    }
    const res = await apiClient.post('/auth/switch-group', { groupId: targetGroupId });
    const { token: newToken, activeGroup, activeRole } = res.data;
    if (!newToken || activeGroup?.id !== targetGroupId || !activeRole) {
      throw new Error('Majibu ya kubadili kikundi hayajakamilika.');
    }

    await AsyncStorage.multiSet([
      [SESSION_TOKEN_KEY, newToken],
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
      SESSION_TOKEN_KEY,
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
        updateUser,
        chooseGroup: () => setNeedsGroupSelection(memberships.length > 1),
        switchGroup,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
