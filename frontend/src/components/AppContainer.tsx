/**
 * The dark canvas every screen sits on: a solid near-black base with two
 * large, soft, *static* radial washes — purple/blue for boards ("grid"),
 * blue/cyan for item detail ("aurora").
 *
 * Deliberately static. The old system (drifting SVG dot-grid + cursor glow +
 * animated aurora bands) sat fixed to the viewport while content scrolled
 * past it, which read as broken; its overscanned absolute layers also caused
 * horizontal overflow on web, misaligning whole screens. A soft wash carries
 * the same identity with none of that:
 * - overflow: "hidden" → can never widen the page or skew layout
 * - no Reanimated loops → nothing to crash or drain battery on Android
 * - no window listeners → zero interference with scroll/drag
 * Depth and "life" now come from the surfaces (cards, focus glows), not the
 * wallpaper — resting backdrop stays matte.
 */
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/theme/tokens";

interface Props {
  children: React.ReactNode;
  /** Skip the top safe-area pad when a screen renders its own header row. */
  edgeToEdge?: boolean;
  /** "grid" (default) board backdrop; "aurora" cooler item-detail backdrop. */
  variant?: "grid" | "aurora";
}

/** Two washes per variant: [top-left tint, bottom-right tint]. */
const WASHES: Record<
  NonNullable<Props["variant"]>,
  { a: string; b: string; opacityA: number; opacityB: number }
> = {
  grid: { a: palette.purple, b: palette.blue, opacityA: 0.1, opacityB: 0.07 },
  aurora: { a: palette.blue, b: palette.cyan, opacityA: 0.1, opacityB: 0.08 },
};

export function AppContainer({ children, edgeToEdge = false, variant = "grid" }: Props) {
  const insets = useSafeAreaInsets();
  const wash = WASHES[variant];

  return (
    <View className="flex-1 bg-ink-void" style={styles.root}>
      <View
        pointerEvents="none"
        style={styles.backdrop}
        testID={`app-backdrop-${variant}`}
      >
        <Svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <RadialGradient id={`wash-a-${variant}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={wash.a} stopOpacity={wash.opacityA} />
              <Stop offset="100%" stopColor={wash.a} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`wash-b-${variant}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={wash.b} stopOpacity={wash.opacityB} />
              <Stop offset="100%" stopColor={wash.b} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={palette.void} />
          {/* Large soft tints anchored to opposite corners; percentages keep
              them proportional at every screen size with zero layout math. */}
          <Circle cx="18%" cy="6%" r="55%" fill={`url(#wash-a-${variant})`} />
          <Circle cx="88%" cy="96%" r="60%" fill={`url(#wash-b-${variant})`} />
        </Svg>
      </View>

      <View
        className="flex-1"
        style={{
          paddingTop: edgeToEdge ? 0 : insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: palette.void, flex: 1 },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
});
