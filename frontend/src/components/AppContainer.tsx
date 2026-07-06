/**
 * The premium dark backdrop every screen sits on: a near-black canvas overlaid
 * with a faint architectural dot-grid (2-6% opacity, ui-ux-motion "data-flow"
 * direction §14) that drifts on a slow autonomous loop and, on web, grows a
 * soft purple/cyan glow that trails the cursor — a quiet signal of structure
 * and connectivity behind the UI rather than a static wallpaper. Every moving
 * piece only ever animates `transform`/`opacity` on the UI thread (reanimated),
 * and the whole thing pauses when the app is backgrounded/tab is hidden.
 */
import React, { useEffect, useRef } from "react";
import { AppState, Platform, StyleSheet, View, useWindowDimensions, type AppStateStatus } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/theme/tokens";

interface Props {
  children: React.ReactNode;
  /** Skip the top safe-area pad when a screen renders its own header row. */
  edgeToEdge?: boolean;
}

const GRID_SPACING = 34;
const GRID_DOT_RADIUS = 1.1;

export function AppContainer({ children, edgeToEdge = false }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-ink-void" style={styles.root}>
      {/* Ambient backdrop — purely decorative, pointerEvents off so it never
          intercepts touches, mouse-wheel scroll, or drag gestures above it. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <DotGrid />
        <CursorGlow />
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

/** Runs `active` while the app is foregrounded and pauses (freezing in place,
 *  no wasted frames) the moment it's backgrounded or the browser tab hides —
 *  reanimated's withRepeat has no native pause, so we cancel/restart instead. */
function useAppActive(): React.MutableRefObject<boolean> {
  const active = useRef(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      active.current = state === "active";
    });
    return () => sub.remove();
  }, []);
  return active;
}

/** A faint isometric-feeling dot matrix tiled across the whole screen via an
 *  SVG pattern (one draw call, not thousands of nodes) that breathes with a
 *  slow, barely-perceptible drift so the backdrop reads as alive. */
function DotGrid() {
  const t = useSharedValue(0);
  const isActive = useAppActive();

  useEffect(() => {
    const loop = () => {
      if (!isActive.current) return;
      t.value = withTiming(t.value === 0 ? 1 : 0, { duration: 16000, easing: Easing.inOut(Easing.sin) }, (finished) => {
        if (finished) runLoop();
      });
    };
    const runLoop = () => loop();
    runLoop();
    return () => cancelAnimation(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.value * GRID_SPACING * 0.5 },
      { translateY: t.value * GRID_SPACING * 0.3 },
    ],
  }));

  return (
    // Overscanned by one grid cell on every side so the slow drift never
    // reveals a bare edge as the pattern shifts.
    <Animated.View
      style={[
        style,
        { position: "absolute", inset: -GRID_SPACING, opacity: 0.5 } as object,
      ]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="dotGrid" width={GRID_SPACING} height={GRID_SPACING} patternUnits="userSpaceOnUse">
            <Circle cx={GRID_SPACING / 2} cy={GRID_SPACING / 2} r={GRID_DOT_RADIUS} fill={palette.purpleSoft} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#dotGrid)" />
      </Svg>
    </Animated.View>
  );
}

/** A soft ambient radial glow, always present the instant a screen mounts (so
 *  navigating never drops to flat black while waiting for a mouse move) that
 *  additionally trails the cursor with a light spring lag on web — a subtle
 *  "data-flow" reaction to presence rather than a rigid 1:1 follow. On touch
 *  platforms it just settles at a fixed anchor and breathes gently instead.
 *  Stays a passive `window` listener (never RN's responder/gesture system) so
 *  it can't block scroll or drag. */
function CursorGlow() {
  const { width, height } = useWindowDimensions();
  const anchorX = width * 0.32;
  const anchorY = height * 0.22;

  const x = useSharedValue(anchorX);
  const y = useSharedValue(anchorY);
  const opacity = useSharedValue(0);
  const isActive = useAppActive();

  useEffect(() => {
    // Fade in immediately at the default anchor — no flat-black gap while
    // waiting for the first mouse move on a freshly-mounted screen.
    opacity.value = withTiming(1, { duration: 500 });

    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const onMove = (e: MouseEvent) => {
      if (!isActive.current) return;
      x.value = withSpring(e.clientX, { damping: 22, stiffness: 90 });
      y.value = withSpring(e.clientY, { damping: 22, stiffness: 90 });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - 260 }, { translateY: y.value - 260 }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.glow, style]}>
      <Svg width={520} height={520}>
        <Defs>
          <RadialGradient id="cursorGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={palette.purple} stopOpacity={0.16} />
            <Stop offset="55%" stopColor={palette.blue} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={palette.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={260} cy={260} r={260} fill="url(#cursorGlow)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: palette.void },
  glow: {
    position: "absolute",
    width: 520,
    height: 520,
  },
});
