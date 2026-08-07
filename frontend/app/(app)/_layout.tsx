/**
 * The authenticated shell. The nav rail and its panels live here rather than in
 * each screen, so they survive navigation — the rail's expanded state and an
 * open profile panel shouldn't reset because you opened a board.
 *
 * Search is the one destination the rail can't own: only the board screen has
 * anything to search, and it holds the item list. Screens publish a handler into
 * `ScreenActionsContext` and the rail shows the entry only while one is
 * registered, rather than rendering a permanently dead control.
 */
import { Redirect, Stack } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { View } from "react-native";

import { NavRail } from "@/components/nav/NavRail";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { ProfilePanel } from "@/components/profile/ProfilePanel";
import { useAuth } from "@/context/AuthContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { ScreenActionsContext } from "@/context/ScreenActions";
import { palette } from "@/theme/tokens";

export default function AppLayout() {
  const { token, booting } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [onSearch, setOnSearch] = useState<(() => void) | null>(null);

  // Wrapped in a setter-function so React doesn't mistake the handler itself
  // for a state updater and call it.
  const registerSearch = useCallback((fn: (() => void) | null) => {
    setOnSearch(() => fn);
  }, []);

  const actions = useMemo(() => ({ registerSearch }), [registerSearch]);

  if (!booting && !token) return <Redirect href="/(auth)/login" />;

  return (
    <NotificationProvider>
      <ScreenActionsContext.Provider value={actions}>
        <View style={{ flex: 1, flexDirection: "row", backgroundColor: palette.void }}>
          <NavRail
            onOpenProfile={() => setProfileOpen(true)}
            onOpenNotifications={() => setNotificationsOpen(true)}
            onOpenSearch={onSearch ?? undefined}
          />

          <View style={{ flex: 1 }}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: palette.void },
                animation: "slide_from_right",
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="board/[id]" />
              <Stack.Screen
                name="item/[id]"
                options={{ presentation: "modal", animation: "slide_from_bottom" }}
              />
            </Stack>
          </View>

          <ProfilePanel open={profileOpen} onClose={() => setProfileOpen(false)} />
          <NotificationsPanel
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
          />
        </View>
      </ScreenActionsContext.Provider>
    </NotificationProvider>
  );
}
