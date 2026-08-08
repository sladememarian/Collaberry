import "react-native-gesture-handler";
import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider, useTheme } from "@/theme/ThemeContext";
import { palette } from "@/theme/tokens";

/**
 * ThemeProvider is the outermost wrapper so the shell below it can subscribe.
 * It used to sit inside, which left the root view and the navigator's screen
 * background reading `palette.void` from a render that never happened again —
 * two full-viewport layers stranded on the dark value under the light theme.
 */
export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootShell />
    </ThemeProvider>
  );
}

function RootShell() {
  const { theme } = useTheme();
  // Read after subscribing, so the switch re-resolves both of these. They can't
  // be Tailwind classes: react-native-web strips `var()` from the style prop,
  // and `contentStyle` is a navigator option rather than an element.
  const background = palette.void;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: background }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <AuthProvider>
            {/* Dark glyphs on light paper, light on the void. */}
            <StatusBar style={theme === "light" ? "dark" : "light"} />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: background },
                animation: "fade",
              }}
            />
          </AuthProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
