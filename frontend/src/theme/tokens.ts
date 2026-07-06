/**
 * The single source of truth for Collaberry's look. Tailwind (tailwind.config.js)
 * mirrors these for className usage; this object is for the handful of places that
 * need raw values — SVG fills, gradients, blur tints, shadow colors.
 *
 * Theme: Deep Futuristic Cyber-Minimalism.
 */

export const palette = {
  void: "#0A0A0C",
  base: "#0E0E12",
  surface: "#121216",
  raised: "#17171E",
  border: "#23232D",
  hair: "#2C2C38",

  textHi: "#F3F4F6",
  textMid: "#B4B7C2",
  textLow: "#7A7E8C",
  textFaint: "#4C4F5C",

  purple: "#A855F7",
  purpleSoft: "#C084FC",
  purpleDeep: "#7C3AED",
  blue: "#3B82F6",
  blueSoft: "#60A5FA",
  cyan: "#22D3EE",

  success: "#34D399",
  warn: "#FBBF24",
  danger: "#F87171",

  // Berry accents — the fruit behind the brand. Add-only garnish swatches that
  // sit harmoniously between the purple and blue neons. Use sparingly.
  raspberry: "#E85C9A",
  blueberry: "#5B7BF5",
  blackberry: "#4B2E6B",
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

/** Context accent — drives the glowing badges on cards. */
export const contextAccent: Record<
  WorkspaceContext,
  { color: string; glow: string; label: string }
> = {
  work: { color: palette.purple, glow: "rgba(168,85,247,0.45)", label: "Work" },
  university: { color: palette.blue, glow: "rgba(59,130,246,0.45)", label: "University" },
  personal: { color: "#8B8F9E", glow: "rgba(139,143,158,0.35)", label: "Personal" },
};

/** A soft neon glow for elevated / focused surfaces. Purple by default. */
export const glow = (color: string = palette.purple, radius = 24) => ({
  shadowColor: color,
  shadowOpacity: 0.55,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: 0 },
  elevation: 12,
});

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
