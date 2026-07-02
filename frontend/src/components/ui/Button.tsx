/**
 * Primary action button. The "solid" variant carries the purple→blue gradient
 * feel via a layered background + rim glow; "ghost" and "subtle" stay quiet.
 */
import React from "react";
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from "react-native";

import { glow, palette } from "@/theme/tokens";

type Variant = "solid" | "subtle" | "ghost" | "danger";

interface Props {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  leading?: React.ReactNode;
  full?: boolean;
  className?: string;
}

const bg: Record<Variant, string> = {
  solid: "bg-brand-purple",
  subtle: "bg-ink-raised border border-ink-border",
  ghost: "bg-transparent",
  danger: "bg-transparent border border-state-danger/50",
};

const fg: Record<Variant, string> = {
  solid: "text-white",
  subtle: "text-text-hi",
  ghost: "text-text-mid",
  danger: "text-state-danger",
};

export function Button({
  label,
  onPress,
  variant = "solid",
  loading = false,
  disabled = false,
  leading,
  full = false,
  className = "",
}: Props) {
  const isOff = disabled || loading;
  const glowStyle: ViewStyle | null = variant === "solid" && !isOff ? glow(palette.purple, 14) : null;

  return (
    <Pressable
      onPress={isOff ? undefined : onPress}
      disabled={isOff}
      accessibilityRole="button"
      style={({ pressed }) => [
        glowStyle,
        { opacity: isOff ? 0.5 : pressed ? 0.9 : 1, transform: [{ scale: pressed && !isOff ? 0.98 : 1 }] },
      ]}
      className={`${full ? "w-full" : ""} ${className}`}
    >
      <View
        className={`h-12 flex-row items-center justify-center gap-2 rounded-md px-5 ${bg[variant]}`}
      >
        {loading ? (
          <ActivityIndicator color={variant === "solid" ? "#fff" : palette.purple} />
        ) : (
          <>
            {leading}
            <Text className={`text-body font-semibold ${fg[variant]}`}>{label}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
}
