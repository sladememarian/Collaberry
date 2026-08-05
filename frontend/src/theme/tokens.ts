/**
 * The single source of truth for Collaberry's look. Tailwind (tailwind.config.js)
 * mirrors these for className usage; this object is for the handful of places that
 * need raw values — SVG fills, gradients, blur tints, shadow colors.
 *
 * Theme: Deep Futuristic Cyber-Minimalism.
 *
 * The values below reflect the active theme. On web they read from CSS custom
 * properties set by ThemeContext; on native they read from THEMES[currentTheme].
 */

import { Platform, type ViewStyle } from "react-native";

import { toHex, DARK, LIGHT, type ThemeName, type ThemeTokens } from "./themes";

// On native, track the current theme so palette.* reads resolve correctly.
// Web doesn't use this — it reads from CSS vars set by ThemeContext, which is
// what lets a Tailwind class and a raw palette read agree on the same color.
let _currentNativeTheme: ThemeName = "dark";

export function _setNativeTheme(name: ThemeName) {
  _currentNativeTheme = name;
}

function _resolve(key: keyof ThemeTokens): string {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const triplet = getComputedStyle(document.documentElement)
      .getPropertyValue(`--${key}`)
      .trim();
    // Falls back to DARK if the var isn't set yet (very first paint, or a test
    // renderer with no real stylesheet attached).
    return triplet || DARK[key];
  }
  return (_currentNativeTheme === "light" ? LIGHT : DARK)[key];
}

export const palette = {
  get void() {
    return toHex(_resolve("ink-void"));
  },
  get base() {
    return toHex(_resolve("ink-base"));
  },
  get surface() {
    return toHex(_resolve("ink-surface"));
  },
  get raised() {
    return toHex(_resolve("ink-raised"));
  },
  get border() {
    return toHex(_resolve("ink-border"));
  },
  get hair() {
    return toHex(_resolve("ink-hair"));
  },

  get textHi() {
    return toHex(_resolve("text-hi"));
  },
  get textMid() {
    return toHex(_resolve("text-mid"));
  },
  get textLow() {
    return toHex(_resolve("text-low"));
  },
  get textFaint() {
    return toHex(_resolve("text-faint"));
  },

  get purple() {
    return toHex(_resolve("brand-purple"));
  },
  get purpleSoft() {
    return toHex(_resolve("brand-purple-soft"));
  },
  get purpleDeep() {
    return toHex(_resolve("brand-purple-deep"));
  },
  get blue() {
    return toHex(_resolve("brand-blue"));
  },
  get blueSoft() {
    return toHex(_resolve("brand-blue-soft"));
  },
  get cyan() {
    return toHex(_resolve("brand-cyan"));
  },

  get success() {
    return toHex(_resolve("state-success"));
  },
  get warn() {
    return toHex(_resolve("state-warn"));
  },
  get danger() {
    return toHex(_resolve("state-danger"));
  },

  get raspberry() {
    return toHex(_resolve("berry-raspberry"));
  },
  get blueberry() {
    return toHex(_resolve("berry-blueberry"));
  },
  get blackberry() {
    return toHex(_resolve("berry-blackberry"));
  },

  get boardCanvas() {
    return toHex(_resolve("board-canvas"));
  },
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export type WorkspaceContext = "personal" | "university" | "work";

/**
 * Context accent — drives the glowing badges on cards.
 *
 * Resolved per-access so theme switches repaint the badges on native, where
 * there are no CSS vars. On web, palette.* reads from the vars ThemeContext
 * sets, so this stays reactive there too.
 */
export const contextAccent: Record<
  WorkspaceContext,
  { color: string; glow: string; label: string }
> = {
  get work() {
    return { color: palette.purple, glow: "rgba(168,85,247,0.45)", label: "Work" };
  },
  get university() {
    return { color: palette.blue, glow: "rgba(59,130,246,0.45)", label: "University" };
  },
  get personal() {
    return { color: "#8B8F9E", glow: "rgba(139,143,158,0.35)", label: "Personal" };
  },
};

/** Bakes a fixed opacity into a hex color; passes rgba/rgb strings through. */
function withOpacity(color: string, opacity: number): string {
  if (color.startsWith("rgb")) return color;
  const hex = color.replace("#", "");
  const n = parseInt(hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex, 16);
  if (Number.isNaN(n)) return color;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Soft neon glow for elevated / focused surfaces.
 *
 * IMPORTANT for Android stability:
 * - Web can use CSS `boxShadow`.
 * - Native Android/iOS get classic shadow* / elevation props.
 * Animated CSS boxShadow strings have crashed production Android builds when
 * fed through Reanimated, so never animate this helper on native.
 */
export const glow = (color: string = palette.purple, radiusPx = 24): ViewStyle => {
  if (Platform.OS === "web") {
    return {
      boxShadow: `0px 0px ${radiusPx}px ${withOpacity(color, 0.55)}`,
    } as ViewStyle;
  }
  return {
    shadowColor: color,
    shadowOpacity: 0.45,
    shadowRadius: Math.max(6, radiusPx / 2),
    shadowOffset: { width: 0, height: 0 },
    elevation: Math.min(18, Math.max(6, Math.round(radiusPx / 2))),
  };
};

/** Grouped type ramp for programmatic use (mirrors tailwind fontSize). */
export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700" as const, letterSpacing: -0.5 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: "700" as const, letterSpacing: -0.3 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: "600" as const },
  h3: { fontSize: 17, lineHeight: 23, fontWeight: "600" as const },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
  sub: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  meta: { fontSize: 11, lineHeight: 14, fontWeight: "600" as const, letterSpacing: 0.4 },
} as const;
