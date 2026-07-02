import { Redirect, Stack } from "expo-router";
import React from "react";

import { useAuth } from "@/context/AuthContext";
import { palette } from "@/theme/tokens";

export default function AppLayout() {
  const { token, booting } = useAuth();
  if (!booting && !token) return <Redirect href="/(auth)/login" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.void },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="board/[id]" />
      <Stack.Screen name="item/[id]" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}
