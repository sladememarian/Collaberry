/**
 * Holds the session. On boot we rehydrate the token from AsyncStorage and confirm
 * it's still valid with a /me call; if the server says no, we quietly sign out.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { authApi } from "@/api/endpoints";
import { setAuthToken } from "@/api/client";
import type { UserPublic } from "@/types";

const TOKEN_KEY = "collaberry.token";
const USER_KEY = "collaberry.user";

interface AuthState {
  user: UserPublic | null;
  token: string | null;
  booting: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);

  const persist = useCallback(async (t: string | null, u: UserPublic | null) => {
    setAuthToken(t);
    setToken(t);
    setUser(u);
    if (t && u) {
      await AsyncStorage.setItem(TOKEN_KEY, t);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(u));
    } else {
      await AsyncStorage.removeItem(TOKEN_KEY);
      await AsyncStorage.removeItem(USER_KEY);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem(TOKEN_KEY);
        const u = await AsyncStorage.getItem(USER_KEY);
        if (t && u) {
          setAuthToken(t);
          setToken(t);
          setUser(JSON.parse(u));
          // Best-effort revalidation; keep the cached session if the network is flaky.
          try {
            const fresh = await authApi.me();
            setUser(fresh);
          } catch (e) {
            // A hard 401 means the token is dead — drop it. Everything else, keep going.
            if ((e as { status?: number })?.status === 401) await persist(null, null);
          }
        }
      } finally {
        setBooting(false);
      }
    })();
  }, [persist]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await authApi.login(email.trim(), password);
      await persist(res.access_token, res.user);
    },
    [persist],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await authApi.register(email.trim(), password, displayName.trim());
      await persist(res.access_token, res.user);
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    await persist(null, null);
  }, [persist]);

  const value = useMemo<AuthState>(
    () => ({ user, token, booting, signIn, signUp, signOut }),
    [user, token, booting, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
