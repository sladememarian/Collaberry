/**
 * Theme context: holds the active theme name and provides a setter.
 *
 * On web, changing the theme writes CSS custom properties to `:root` so
 * Tailwind classes pick up the new palette. On native, the change triggers a
 * re-render and the raw `palette` export reads from the current theme.
 *
 * The theme choice persists to AsyncStorage so it survives app restarts.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";

import type { ThemeName } from "./themes";
import { THEMES } from "./themes";
import { _setNativeTheme } from "./tokens";

const STORAGE_KEY = "collaberry:theme";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (name: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("dark");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "light" || stored === "dark") {
        setThemeState(stored);
        _applyTheme(stored);
      }
      setLoaded(true);
    });
  }, []);

  const setTheme = (name: ThemeName) => {
    setThemeState(name);
    AsyncStorage.setItem(STORAGE_KEY, name);
    _applyTheme(name);
  };

  // Block the first frame until the persisted theme loads, so the user never
  // sees a flash of the wrong theme on cold boot.
  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

function _applyTheme(name: ThemeName) {
  const tokens = THEMES[name];

  // Native: tell the palette resolver which theme is active.
  if (Platform.OS !== "web") {
    _setNativeTheme(name);
  }

  // Web: write CSS vars to :root so Tailwind picks them up.
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(`--${key}`, value);
    }
  }
}
