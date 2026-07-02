import { Redirect, Stack } from "expo-router";
import React from "react";

import { useAuth } from "@/context/AuthContext";

export default function AuthLayout() {
  const { token, booting } = useAuth();
  if (!booting && token) return <Redirect href="/(app)" />;
  return <Stack screenOptions={{ headerShown: false, animation: "fade" }} />;
}
