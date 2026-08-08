/** Friendly zero-state with an icon, a line of copy, and an optional CTA. */
import React from "react";
import { Text, View } from "react-native";

import { palette } from "@/theme/tokens";

import { Button } from "./Button";

export function EmptyState({
  icon,
  title,
  body,
  ctaLabel,
  onCta,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
}) {
  return (
    <View className="items-center justify-center px-8 py-16">
      {icon ? (
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-xl border border-ink-border bg-ink-surface">
          {icon}
        </View>
      ) : null}
      <Text className="text-h3 font-semibold text-text-hi">{title}</Text>
      {body ? (
        <Text className="mt-1.5 max-w-xs text-center text-body text-text-low">{body}</Text>
      ) : null}
      {ctaLabel && onCta ? (
        <View className="mt-5">
          <Button label={ctaLabel} onPress={onCta} />
        </View>
      ) : null}
    </View>
  );
}

/** Small live/offline pill for the board header. */
export function ConnectionDot({ connected }: { connected: boolean }) {
  const color = connected ? palette.success : palette.textLow;
  return (
    <View className="flex-row items-center gap-1.5">
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text className="text-meta uppercase" style={{ color }}>
        {connected ? "Live" : "Offline"}
      </Text>
    </View>
  );
}
