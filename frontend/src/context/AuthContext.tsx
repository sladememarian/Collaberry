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
import { loadServerOverride, setAuthToken } from "@/api/client";
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
  /**
   * Apply a profile edit. Takes the whole re-signed session rather than just
   * the new user, because `display_name` lives in the JWT claims — keeping the
   * old token would leave the rename invisible to presence-service, which
   * labels live cursors from the token and not from a database read.
   */
  applySession: (token: string, user: UserPublic) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * A session is only a session if both halves arrived.
 *
 * `request<TokenResponse>` is a cast, not a check, so a 200 carrying anything
 * else flows straight through to `persist(undefined, undefined)` — which clears
 * storage, leaves the shell signed out, and sends the user back to the login
 * screen with nothing to explain why. That is exactly how the Daytona preview
 * interstitial (200 + HTML) presented itself: a dead Sign in button. The client
 * now rejects non-JSON bodies; this catches the rest of the shape.
 */
function requireSession(res: { access_token?: string; user?: UserPublic }) {
  if (!res?.access_token || !res?.user) {
    throw new Error("The server didn't return a session. Check the server address and try again.");
  }
  return { token: res.access_token, user: res.user };
}

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
        // Apply any saved on-device server override before the first request —
        // the /me revalidation below must hit the right backend.
        await loadServerOverride();
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
      const { token: t, user: u } = requireSession(await authApi.login(email.trim(), password));
      await persist(t, u);
    },
    [persist],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      const { token: t, user: u } = requireSession(
        await authApi.register(email.trim(), password, displayName.trim()),
      );
      await persist(t, u);
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    await persist(null, null);
  }, [persist]);

  const applySession = useCallback(
    async (t: string, u: UserPublic) => {
      await persist(t, u);
    },
    [persist],
  );

  const value = useMemo<AuthState>(
    () => ({ user, token, booting, signIn, signUp, signOut, applySession }),
    [user, token, booting, signIn, signUp, signOut, applySession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
