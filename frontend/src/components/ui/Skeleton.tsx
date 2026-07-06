/**
 * Loading placeholder with a shimmering highlight sweep (ui-ux-motion skill §4:
 * "elegant, infinite-loop linear gradient shimmer that matches our card shapes"
 * over a static spinner). The sweep is a translucent band translated across the
 * block on the UI thread via reanimated — GPU transform + opacity only, so it
 * holds frame rate even with a whole board of skeletons.
 */
import React, { useEffect } from "react";
import { View, type ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: {
  width?: number | `${number}%` | "100%";
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [progress]);

  const sweep = useAnimatedStyle(() => ({
    // Slide a soft highlight band from left to right across the block.
    transform: [{ translateX: `${-100 + progress.value * 200}%` }],
    opacity: 0.35 + (1 - Math.abs(progress.value - 0.5) * 2) * 0.35,
  }));

  return (
    <View
      style={[{ width, height, borderRadius: radius, backgroundColor: "#16161C", overflow: "hidden" }, style]}
    >
      <Animated.View
        style={[
          { position: "absolute", top: 0, bottom: 0, width: "60%", backgroundColor: "#25252F" },
          sweep,
        ]}
      />
    </View>
  );
}
