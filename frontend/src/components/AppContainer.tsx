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
import Svg, { Circle, Defs, LinearGradient, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/theme/tokens";

interface Props {
  children: React.ReactNode;
  /** Skip the top safe-area pad when a screen renders its own header row. */
  edgeToEdge?: boolean;
  /** "grid" (default) is the board's purple dot-grid + cursor glow; "aurora"
   *  is a cooler, slower drifting backdrop used on the item detail screen. */
  variant?: "grid" | "aurora";
}

const GRID_SPACING = 34;
const GRID_DOT_RADIUS = 1.1;

export function AppContainer({ children, edgeToEdge = false, variant = "grid" }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-ink-void" style={styles.root}>
      {/* Ambient backdrop — purely decorative, pointerEvents off so it never
          intercepts touches, mouse-wheel scroll, or drag gestures above it. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`app-backdrop-${variant}`}>
        {variant === "aurora" ? (
          <AuroraWaves />
        ) : (
          <>
            <DotGrid />
            <CursorGlow />
          </>
        )}
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
  // Starts fully present at a fixed anchor so a freshly-navigated screen never
  // shows a flat-black gap while waiting for the first mouse move.
  const opacity = useSharedValue(1);
  const isActive = useAppActive();

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    // Coalesce the high-frequency mousemove stream down to one spring retarget
    // per animation frame. On web reanimated runs on the JS thread, so updating
    // a spring on every raw mousemove competes with drag gestures and causes
    // jank; a single rAF-batched update per frame is smooth and far cheaper.
    let raf = 0;
    let lastX = anchorX;
    let lastY = anchorY;
    const flush = () => {
      raf = 0;
      x.value = withSpring(lastX, { damping: 26, stiffness: 80 });
      y.value = withSpring(lastY, { damping: 26, stiffness: 80 });
    };
    const onMove = (e: MouseEvent) => {
      if (!isActive.current) return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!raf) raf = requestAnimationFrame(flush);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
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

// Cooler, distinct from the board's purple — blue/teal/cyan, calmer/editorial.
const AURORA_BANDS = [
  { top: "4%", height: 260, from: palette.blue, to: palette.cyan, duration: 15000, drift: 26 },
  { top: "34%", height: 320, from: palette.cyan, to: palette.blueSoft, duration: 19000, drift: -32 },
  { top: "62%", height: 280, from: palette.blueSoft, to: palette.blue, duration: 17000, drift: 22 },
];

/** Slow drifting translucent gradient bands — the item screen's distinct
 *  backdrop. Each band drifts vertically on its own damped, staggered loop
 *  (offset start delay + different duration) so they never move in lockstep,
 *  reading as a calm aurora rather than a mechanical repeat. */
function AuroraWaves() {
  const isActive = useAppActive();
  return (
    <View style={StyleSheet.absoluteFill}>
      {AURORA_BANDS.map((band, i) => (
        <AuroraBand key={i} band={band} isActive={isActive} delay={i * 900} />
      ))}
    </View>
  );
}

function AuroraBand({
  band,
  isActive,
  delay,
}: {
  band: (typeof AURORA_BANDS)[number];
  isActive: React.MutableRefObject<boolean>;
  delay: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const loop = () => {
        if (!isActive.current) return;
        t.value = withTiming(
          t.value === 0 ? 1 : 0,
          { duration: band.duration, easing: Easing.inOut(Easing.sin) },
          (finished) => {
            if (finished) loop();
          },
        );
      };
      loop();
    }, delay);
    return () => {
      clearTimeout(timeout);
      cancelAnimation(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: t.value * band.drift }],
  }));

  const gradId = `aurora-${band.from}-${band.to}`.replace(/[^a-zA-Z0-9]/g, "");

  return (
    <Animated.View
      style={[
        style,
        { position: "absolute", top: band.top, left: 0, right: 0, height: band.height, opacity: 0.16 } as object,
      ]}
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={band.from} stopOpacity={0.5} />
            <Stop offset="55%" stopColor={band.to} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={band.from} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${gradId})`} />
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
