/**
 * Notification state, hoisted to a provider.
 *
 * The unread count is rendered in two places at once (the rail badge and the
 * panel header), and the panel is mounted/unmounted as it opens. If each read
 * its own copy the badge would go stale the moment you marked something read
 * inside the panel — so the list lives here, above both.
 *
 * Polling, not a socket: notification-service has no WebSocket, and the count
 * being a minute out of date costs nothing. `refresh()` is exposed so the panel
 * can pull immediately on open instead of waiting for the next tick.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

import { notificationApi } from "@/api/endpoints";
import { useAuth } from "@/context/AuthContext";
import type { AppNotification } from "@/types";

const POLL_MS = 60_000;

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationState | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { token, booting } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards a refresh landing after sign-out and repopulating a signed-out inbox.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const refresh = useCallback(async () => {
    if (!tokenRef.current) return;
    setLoading(true);
    try {
      const rows = await notificationApi.list();
      if (!tokenRef.current) return;
      setNotifications(rows);
      setError(null);
    } catch {
      // A failed poll is not worth a visible error — the badge simply doesn't
      // update. Only surface it if we have nothing at all to show.
      setError((prev) => prev ?? "Couldn't load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (booting) return;
    if (!token) {
      setNotifications([]);
      setError(null);
      return;
    }
    refresh();
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [token, booting, refresh]);

  // Coming back from the background is the moment a stale badge is most likely
  // and most visible, so pull once on foreground rather than waiting a minute.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active" && tokenRef.current) refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const markRead = useCallback(async (id: string) => {
    // Optimistic: the badge should drop the instant it's tapped. On failure we
    // put the row back rather than leaving a phantom-read notification.
    let previous: AppNotification[] = [];
    setNotifications((prev) => {
      previous = prev;
      return prev.map((n) => (n.id === id ? { ...n, read: true } : n));
    });
    try {
      await notificationApi.markRead(id);
    } catch {
      setNotifications(previous);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    // There's no bulk endpoint, so this is a fan-out of single marks. Failures
    // are absorbed per-row: marking 9 of 10 read is better than an all-or-nothing
    // rollback that undoes the ones that worked.
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    const results = await Promise.allSettled(
      unread.map((n) => notificationApi.markRead(n.id)),
    );
    const failed = new Set(
      unread.filter((_, i) => results[i].status === "rejected").map((n) => n.id),
    );
    if (failed.size > 0) {
      setNotifications((prev) => prev.map((n) => (failed.has(n.id) ? { ...n, read: false } : n)));
    }
  }, [notifications]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  );

  const value = useMemo<NotificationState>(
    () => ({ notifications, unreadCount, loading, error, refresh, markRead, markAllRead }),
    [notifications, unreadCount, loading, error, refresh, markRead, markAllRead],
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationState {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationProvider>");
  return ctx;
}
