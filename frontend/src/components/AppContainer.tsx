/**
 * Premium dark backdrop. Pitch-black canvas with a faint drifting dot-grid and
 * (on web) a soft cursor-following glow. All motion is transform/opacity only.
 *
 * Android stability notes:
 * - No CSS `inset` shorthand (not reliable on native).
 * - No recursive withTiming callbacks that re-enter JS from a worklet — that
 *   pattern has been a hard-crash source on production Android builds. We use
 *   withRepeat instead.
 * - Cursor tracking is web-only.
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

import { palette } from "@/theme/tokens";

interface Props {
  children: React.ReactNode;
  /** Skip the top safe-area pad when a screen renders its own header row. */
  edgeToEdge?: boolean;
  /** "grid" (default) board backdrop; "aurora" cooler item-detail backdrop. */
  variant?: "grid" | "aurora";
}

const GRID_SPACING = 34;
const GRID_DOT_RADIUS = 1.1;

export function AppContainer({ children, edgeToEdge = false, variant = "grid" }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-ink-void" style={styles.root}>
      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        testID={`app-backdrop-${variant}`}
      >
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

function DotGrid() {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration: 16000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.value * GRID_SPACING * 0.5 },
      { translateY: t.value * GRID_SPACING * 0.3 },
    ],
  }));

  return (
    <Animated.View
      style={[
        style,
        {
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
          <Pattern
            id="dotGrid"
            width={GRID_SPACING}
            height={GRID_SPACING}
            patternUnits="userSpaceOnUse"
          >
            <Circle
              cx={GRID_SPACING / 2}
              cy={GRID_SPACING / 2}
              r={GRID_DOT_RADIUS}
              fill={palette.purpleSoft}
            />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#dotGrid)" />
      </Svg>
    </Animated.View>
  );
}

function CursorGlow() {
  const { width, height } = useWindowDimensions();
  const anchorX = width * 0.32;
  const anchorY = height * 0.22;

  const x = useSharedValue(anchorX);
  const y = useSharedValue(anchorY);
  const opacity = useSharedValue(1);
  const isActive = useAppActive();

  useEffect(() => {
    // Keep the glow present on native at a fixed anchor; only track the cursor on web.
    if (Platform.OS !== "web" || typeof window === "undefined") return;

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
  }, [anchorX, anchorY]);

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

const AURORA_BANDS = [
  { top: "4%", height: 260, from: palette.blue, to: palette.cyan, duration: 15000, drift: 26 },
  { top: "34%", height: 320, from: palette.cyan, to: palette.blueSoft, duration: 19000, drift: -32 },
  { top: "62%", height: 280, from: palette.blueSoft, to: palette.blue, duration: 17000, drift: 22 },
];

function AuroraWaves() {
  return (
    <View style={StyleSheet.absoluteFill}>
      {AURORA_BANDS.map((band, i) => (
        <AuroraBand key={i} band={band} delay={i * 900} />
      ))}
    </View>
  );
}

function AuroraBand({
  band,
  delay,
}: {
  band: (typeof AURORA_BANDS)[number];
  delay: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
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
  }, [band.duration, delay, t]);

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
  glow: {
    position: "absolute",
    width: 520,
    height: 520,
  },
});
