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

/**
 * A token as a concrete color string for the `style` prop, SVG fills, and shadows.
 *
 * Deliberately concrete rather than a live `rgb(var(--token))`: react-native-web
 * runs every color in the `style` prop through its own normalizer, which does
 * not understand `var()` and silently DROPS the declaration — a tinted lane
 * track loses its background and border outright rather than following the
 * theme. So a raw read is a snapshot, and the component holding it has to
 * re-render for the theme switch to reach it. `AppContainer` remounts its
 * children on the switch so that happens without every caller opting in.
 */
function _color(key: keyof ThemeTokens): string {
  return toHex(_resolve(key));
}

export const palette = {
  get void() {
    return _color("ink-void");
  },
  get base() {
    return _color("ink-base");
  },
  get surface() {
    return _color("ink-surface");
  },
  get raised() {
    return _color("ink-raised");
  },
  get border() {
    return _color("ink-border");
  },
  get hair() {
    return _color("ink-hair");
  },

  get textHi() {
    return _color("text-hi");
  },
  get textMid() {
    return _color("text-mid");
  },
  get textLow() {
    return _color("text-low");
  },
  get textFaint() {
    return _color("text-faint");
  },

  get purple() {
    return _color("brand-purple");
  },
  get purpleSoft() {
    return _color("brand-purple-soft");
  },
  get purpleDeep() {
    return _color("brand-purple-deep");
  },
  get blue() {
    return _color("brand-blue");
  },
  get blueSoft() {
    return _color("brand-blue-soft");
  },
  get cyan() {
    return _color("brand-cyan");
  },

  get ctxWork() {
    return _color("ctx-work");
  },
  get ctxUniversity() {
    return _color("ctx-university");
  },
  get ctxPersonal() {
    return _color("ctx-personal");
  },

  get success() {
    return _color("state-success");
  },
  get warn() {
    return _color("state-warn");
  },
  get danger() {
    return _color("state-danger");
  },

  get raspberry() {
    return _color("berry-raspberry");
  },
  get blueberry() {
    return _color("berry-blueberry");
  },
  get blackberry() {
    return _color("berry-blackberry");
  },

  get boardCanvas() {
    return _color("board-canvas");
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
    return { color: palette.purple, glow: alpha(palette.purple, 0.45), label: "Work" };
  },
  get university() {
    return { color: palette.blue, glow: alpha(palette.blue, 0.45), label: "University" };
  },
  get personal() {
    return { color: palette.ctxPersonal, glow: alpha(palette.ctxPersonal, 0.35), label: "Personal" };
  },
};

/**
 * Bakes a fixed opacity into a color, handling both forms a token can take:
 * the web's live `rgb(var(--x))` and native's resolved hex.
 *
 * Exported because a translucent tint is the one case a Tailwind class can't
 * cover: `bg-brand-purple/10` works in JSX, but inline styles and SVG fills need
 * a concrete string. Deriving it from `palette.*` rather than writing
 * `rgba(168,85,247,0.1)` by hand is what keeps a tint following the theme — a
 * literal stays purple when the light theme turns the brand pink, which is
 * exactly the class of bug that leaves dark colors stranded on a white page.
 */
export function alpha(color: string, opacity: number): string {
  // The web form of a token: `rgb(var(--brand-purple))`. Inject the alpha into
  // the same functional notation so the value stays a live var reference and
  // keeps following theme switches. Doing this by regex rather than string
  // concatenation keeps an already-alpha'd var from gaining a second slash.
  const varMatch = color.match(/^rgba?\(\s*(var\(--[a-z0-9-]+\))\s*(?:\/[^)]*)?\)$/i);
  if (varMatch) return `rgb(${varMatch[1]} / ${opacity})`;
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
      boxShadow: `0px 0px ${radiusPx}px ${alpha(color, 0.55)}`,
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
