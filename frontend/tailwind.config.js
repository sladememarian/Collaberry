/** @type {import('tailwindcss').Config} */
// Collaberry design tokens live here so utility classes and the theme object in
// src/theme/tokens.ts stay in lockstep. Deep Futuristic Cyber-Minimalism:
// pitch-black canvas, slate surfaces, neon purple + electric blue accents.
//
// Every color resolves through a CSS custom property rather than a literal hex,
// so the light/dark switch is a single var swap on :root (see ThemeContext) and
// no component has to know which theme is active. The `rgb(var(--x) / <alpha>)`
// form is what keeps opacity modifiers (`bg-ink-void/60`) working — a hex inside
// var() would break them. Default values live in global.css `:root`, and
// src/theme/themes.ts is the source both sides are generated from.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  // NativeWind's web runtime calls setColorScheme on boot, which throws under
  // the default 'media' strategy ("Cannot manually set color scheme, as dark
  // mode is type 'media'"). The 'class' strategy permits that call. Our own
  // theming goes through the CSS vars above rather than `dark:` variants, so
  // this stays purely about silencing that error.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          // background stack, darkest to lifted surfaces
          void: v("ink-void"),
          base: v("ink-base"),
          surface: v("ink-surface"),
          raised: v("ink-raised"),
          border: v("ink-border"),
          hair: v("ink-hair"),
        },
        text: {
          hi: v("text-hi"),
          mid: v("text-mid"),
          low: v("text-low"),
          faint: v("text-faint"),
        },
        brand: {
          purple: v("brand-purple"),
          "purple-soft": v("brand-purple-soft"),
          "purple-deep": v("brand-purple-deep"),
          blue: v("brand-blue"),
          "blue-soft": v("brand-blue-soft"),
          cyan: v("brand-cyan"),
        },
        ctx: {
          // context badge colors: work / university / personal
          work: v("ctx-work"),
          university: v("ctx-university"),
          personal: v("ctx-personal"),
        },
        state: {
          success: v("state-success"),
          warn: v("state-warn"),
          danger: v("state-danger"),
        },
        berry: {
          // berry accents — mirrors palette.raspberry / blueberry / blackberry
          raspberry: v("berry-raspberry"),
          blueberry: v("berry-blueberry"),
          blackberry: v("berry-blackberry"),
        },
        // The kanban canvas: true black in dark, soft paper in light.
        board: { canvas: v("board-canvas") },
      },
      borderRadius: {
        xs: "6px",
        sm: "10px",
        md: "14px",
        lg: "20px",
        xl: "28px",
        pill: "999px",
      },
      spacing: {
        "4.5": "18px",
        "13": "52px",
        "18": "72px",
      },
      fontSize: {
        display: ["34px", { lineHeight: "40px", letterSpacing: "-0.5px" }],
        h1: ["26px", { lineHeight: "32px", letterSpacing: "-0.3px" }],
        h2: ["20px", { lineHeight: "26px", letterSpacing: "-0.2px" }],
        h3: ["17px", { lineHeight: "23px" }],
        body: ["15px", { lineHeight: "22px" }],
        sub: ["13px", { lineHeight: "18px" }],
        meta: ["11px", { lineHeight: "14px", letterSpacing: "0.4px" }],
      },
    },
  },
  plugins: [],
};
