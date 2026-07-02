/** @type {import('tailwindcss').Config} */
// Collaberry design tokens live here so utility classes and the theme object in
// src/theme/tokens.ts stay in lockstep. Deep Futuristic Cyber-Minimalism:
// pitch-black canvas, slate surfaces, neon purple + electric blue accents.
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: {
          // background stack, darkest to lifted surfaces
          void: "#0A0A0C",
          base: "#0E0E12",
          surface: "#121216",
          raised: "#17171E",
          border: "#23232D",
          hair: "#2C2C38",
        },
        text: {
          hi: "#F3F4F6",
          mid: "#B4B7C2",
          low: "#7A7E8C",
          faint: "#4C4F5C",
        },
        brand: {
          purple: "#A855F7",
          "purple-soft": "#C084FC",
          "purple-deep": "#7C3AED",
          blue: "#3B82F6",
          "blue-soft": "#60A5FA",
          cyan: "#22D3EE",
        },
        ctx: {
          // context badge colors: work / university / personal
          work: "#A855F7",
          university: "#3B82F6",
          personal: "#8B8F9E",
        },
        state: {
          success: "#34D399",
          warn: "#FBBF24",
          danger: "#F87171",
        },
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
