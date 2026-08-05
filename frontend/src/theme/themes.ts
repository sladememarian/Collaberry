/**
 * The two themes, as raw channel triplets.
 *
 * Why "R G B" strings and not hex: both NativeWind's web output and the raw
 * `palette` object read from the same source here. On web the values land in CSS
 * custom properties, so a Tailwind class like `bg-ink-void` compiles to
 * `rgb(var(--ink-void) / <alpha>)` and keeps working with opacity modifiers
 * (`bg-ink-void/60`). Hex in a var() would break that.
 *
 * Dark is the default and the original design: pitch-black canvas, neon purple
 * and electric blue. Light mirrors it structurally rather than merely inverting —
 * per the brief, black becomes white and purple becomes pink, while blue stays
 * blue so the two themes still read as the same product.
 */

export type ThemeName = "dark" | "light";

/** Every themeable color, as "R G B". Keys mirror tailwind.config.js. */
export interface ThemeTokens {
  "ink-void": string;
  "ink-base": string;
  "ink-surface": string;
  "ink-raised": string;
  "ink-border": string;
  "ink-hair": string;

  "text-hi": string;
  "text-mid": string;
  "text-low": string;
  "text-faint": string;

  "brand-purple": string;
  "brand-purple-soft": string;
  "brand-purple-deep": string;
  "brand-blue": string;
  "brand-blue-soft": string;
  "brand-cyan": string;

  "ctx-work": string;
  "ctx-university": string;
  "ctx-personal": string;

  "state-success": string;
  "state-warn": string;
  "state-danger": string;

  "berry-raspberry": string;
  "berry-blueberry": string;
  "berry-blackberry": string;

  /**
   * The kanban canvas. Deliberately its own token rather than reusing
   * `ink-void`: the board wants a true black behind the lanes so the lane
   * panels read as lifted surfaces, while the rest of the app keeps the
   * slightly-blue void that stops large areas looking like a dead pixel field.
   */
  "board-canvas": string;
}

export const DARK: ThemeTokens = {
  "ink-void": "10 10 12",
  "ink-base": "14 14 18",
  "ink-surface": "18 18 22",
  "ink-raised": "23 23 30",
  "ink-border": "35 35 45",
  "ink-hair": "44 44 56",

  "text-hi": "243 244 246",
  "text-mid": "180 183 194",
  "text-low": "122 126 140",
  "text-faint": "76 79 92",

  "brand-purple": "168 85 247",
  "brand-purple-soft": "192 132 252",
  "brand-purple-deep": "124 58 237",
  "brand-blue": "59 130 246",
  "brand-blue-soft": "96 165 250",
  "brand-cyan": "34 211 238",

  "ctx-work": "168 85 247",
  "ctx-university": "59 130 246",
  "ctx-personal": "139 143 158",

  "state-success": "52 211 153",
  "state-warn": "251 191 36",
  "state-danger": "248 113 113",

  "berry-raspberry": "232 92 154",
  "berry-blueberry": "91 123 245",
  "berry-blackberry": "75 46 107",

  // Pure black behind the lanes.
  "board-canvas": "0 0 0",
};

export const LIGHT: ThemeTokens = {
  // The background stack inverts: void becomes the brightest paper, and each
  // "raised" step goes *down* in luminance so elevation still reads.
  "ink-void": "255 255 255",
  "ink-base": "250 250 252",
  "ink-surface": "244 244 247",
  "ink-raised": "237 237 242",
  "ink-border": "214 214 224",
  "ink-hair": "196 196 208",

  "text-hi": "17 17 22",
  "text-mid": "68 70 82",
  "text-low": "110 113 128",
  "text-faint": "154 157 170",

  // Purple becomes pink, per the brief. Deepened a touch from the dark values
  // so they still hold contrast against white rather than glowing off it.
  "brand-purple": "219 39 119",
  "brand-purple-soft": "236 72 153",
  "brand-purple-deep": "157 23 77",
  // Blue stays blue, darkened for legibility on light surfaces.
  "brand-blue": "37 99 235",
  "brand-blue-soft": "59 130 246",
  "brand-cyan": "8 145 178",

  "ctx-work": "219 39 119",
  "ctx-university": "37 99 235",
  "ctx-personal": "107 114 128",

  "state-success": "5 150 105",
  "state-warn": "180 122 8",
  "state-danger": "220 38 38",

  "berry-raspberry": "219 39 119",
  "berry-blueberry": "67 87 200",
  "berry-blackberry": "126 78 168",

  // The light-theme board canvas is a soft paper, not glaring white.
  "board-canvas": "248 248 251",
};

export const THEMES: Record<ThemeName, ThemeTokens> = { dark: DARK, light: LIGHT };

/** "10 10 12" → "#0a0a0c", for the APIs that need a concrete color string. */
export function toHex(triplet: string): string {
  const [r, g, b] = triplet.split(" ").map((n) => Number(n));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** "10 10 12" + 0.5 → "rgba(10, 10, 12, 0.5)". */
export function toRgba(triplet: string, alpha: number): string {
  const [r, g, b] = triplet.split(" ");
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
