/**
 * The premium dark backdrop every screen sits on: a near-black canvas overlaid
 * with a faint drifting dot-grid (grid variant) or slow aurora bands (aurora
 * variant), and on web a soft purple/cyan glow that trails the cursor — a quiet
 * signal of structure and connectivity rather than a static wallpaper.
 *
 * Layout safety (the reason this was once ripped out):
 * - The whole backdrop lives inside an `overflow: "hidden"` absolute fill, so
 *   the overscanned/animated layers can NEVER widen the document or push a
 *   phantom horizontal scrollbar that misaligns screens. This is load-bearing —
 *   see e2e-web/backdrop.spec.ts. Do not remove the clip.
 *
 * Android stability:
 * - No CSS `inset` shorthand (unreliable on native) — explicit top/right/…
 * - No recursive withTiming callbacks re-entering JS from a worklet (a hard
 *   crash source on production Android). We use withRepeat.
 * - Cursor tracking is web-only.
 *
 * Accessibility:
 * - All motion pauses when the app is backgrounded, and is dropped entirely
 *   when the OS "reduce motion" setting is on (the gradients stay, still).
 */
import React, { useEffect, useRef } from "react";
import {
  AppState,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
  type AppStateStatus,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReducedMotion } from "@/hooks/useReducedMotion";
import { palette } from "@/theme/tokens";

interface Props {
  children: React.ReactNode;
  /** Skip the top safe-area pad when a screen renders its own header row. */
  edgeToEdge?: boolean;
  /**
   * Backdrop behind the screen:
   * - "grid" (default): drifting dot-grid + cursor glow (Home, auth).
   * - "aurora": slow drifting gradient bands (item detail).
   * - "plain": solid void, no ambient motion — used on the tasks/kanban board
   *   where the lanes are the focus and the ambient reads as noise behind them.
   */
  variant?: "grid" | "aurora" | "plain";
}

const GRID_SPACING = 34;
const GRID_DOT_RADIUS = 1.1;

export function AppContainer({ children, edgeToEdge = false, variant = "grid" }: Props) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  return (
    <View className="flex-1 bg-ink-void" style={styles.root}>
      {/* Ambient backdrop — decorative, pointerEvents off so it never intercepts
          touch/scroll/drag, and clipped so it can't affect page layout. The
          "plain" variant renders nothing (solid void from styles.root). */}
      {variant !== "plain" ? (
        <View pointerEvents="none" style={styles.backdrop} testID={`app-backdrop-${variant}`}>
          {variant === "aurora" ? (
            <AuroraWaves reduceMotion={reduceMotion} />
          ) : (
            <>
              <DotGrid reduceMotion={reduceMotion} />
              <CursorGlow reduceMotion={reduceMotion} />
            </>
          )}
        </View>
      ) : null}

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

/** A faint dot matrix that breathes with a slow, barely-perceptible drift. */
function DotGrid({ reduceMotion }: { reduceMotion: boolean }) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.value * GRID_SPACING * 0.5 },
      { translateY: t.value * GRID_SPACING * 0.3 },
    ],
  }));

  return (
    <Animated.View
      testID="backdrop-dotgrid"
      style={[
        style,
        {
          // Overscanned by a cell on every side so the drift never reveals a
          // bare edge. The parent clip keeps this overscan from affecting layout.
          position: "absolute",
          top: -GRID_SPACING,
          right: -GRID_SPACING,
          bottom: -GRID_SPACING,
          left: -GRID_SPACING,
          opacity: 0.5,
        },
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

/** A soft ambient glow that trails the cursor on web (fixed anchor on native). */
function CursorGlow({ reduceMotion }: { reduceMotion: boolean }) {
  const { width, height } = useWindowDimensions();
  const anchorX = width * 0.32;
  const anchorY = height * 0.22;

  const x = useSharedValue(anchorX);
  const y = useSharedValue(anchorY);
  const isActive = useAppActive();

  useEffect(() => {
    // Web-only cursor tracking; native keeps the glow at a fixed anchor. When
    // reduce-motion is on, we don't chase the cursor at all.
    if (reduceMotion || Platform.OS !== "web" || typeof window === "undefined") return;

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
  }, [anchorX, anchorY, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value - 260 }, { translateY: y.value - 260 }],
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

const AURORA_BANDS = [
  { top: "4%", height: 260, from: palette.blue, to: palette.cyan, duration: 15000, drift: 26 },
  { top: "34%", height: 320, from: palette.cyan, to: palette.blueSoft, duration: 19000, drift: -32 },
  { top: "62%", height: 280, from: palette.blueSoft, to: palette.blue, duration: 17000, drift: 22 },
];

function AuroraWaves({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <View style={StyleSheet.absoluteFill}>
      {AURORA_BANDS.map((band, i) => (
        <AuroraBand key={i} band={band} delay={i * 900} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

function AuroraBand({
  band,
  delay,
  reduceMotion,
}: {
  band: (typeof AURORA_BANDS)[number];
  delay: number;
  reduceMotion: boolean;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    const timeout = setTimeout(() => {
      t.value = withRepeat(
        withTiming(1, { duration: band.duration, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      );
    }, delay);
    return () => {
      clearTimeout(timeout);
      cancelAnimation(t);
    };
  }, [band.duration, delay, t, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: t.value * band.drift }],
  }));

  const gradId = `aurora-${band.from}-${band.to}`.replace(/[^a-zA-Z0-9]/g, "");

  return (
    <Animated.View
      style={[
        style,
        {
          position: "absolute",
          top: band.top as unknown as number,
          left: 0,
          right: 0,
          height: band.height,
          opacity: 0.16,
        },
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
  root: { backgroundColor: palette.void, flex: 1 },
  // The clip that makes all the animated overscan layout-safe. Load-bearing.
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 520,
    height: 520,
  },
});
