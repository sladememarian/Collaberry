/**
 * A raised surface with a sub-pixel border and optional neon rim glow. This is
 * the workhorse container — boards, cards, sheets and list rows all build on it.
 */
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, Pressable, View, type ViewProps } from "react-native";

import { glow, palette } from "@/theme/tokens";

interface Props extends ViewProps {
  children: React.ReactNode;
  /** Adds a colored outer glow — use sparingly for focus / active states. */
  glowColor?: string;
  /** Frosted glass instead of a flat surface (native only; web falls back). */
  frosted?: boolean;
  onPress?: () => void;
  className?: string;
}

export function GlassCard({
  children,
  glowColor,
  frosted = false,
  onPress,
  className = "",
  style,
  ...rest
}: Props) {
  const body = (
    <View
      className={`rounded-lg border border-ink-border bg-ink-surface/90 ${className}`}
      style={[glowColor ? glow(glowColor, 18) : null, style]}
      {...rest}
    >
      {frosted && Platform.OS !== "web" ? (
        <BlurView intensity={24} tint="dark" className="rounded-lg overflow-hidden">
          {children}
        </BlurView>
      ) : (
        children
      )}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.995 : 1 }] })}
      accessibilityRole="button"
    >
      {body}
    </Pressable>
  );
}

export const hairline = palette.border;
