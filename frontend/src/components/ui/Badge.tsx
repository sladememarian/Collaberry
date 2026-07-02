/**
 * The glowing context pill. Purple = Work, Blue = University, Gray = Personal.
 * A small filled dot carries the neon; the label stays readable on dark.
 */
import React from "react";
import { Text, View } from "react-native";

import { contextAccent, glow, type WorkspaceContext } from "@/theme/tokens";

export function ContextBadge({
  context,
  compact = false,
}: {
  context: WorkspaceContext;
  compact?: boolean;
}) {
  const a = contextAccent[context];
  return (
    <View
      className="flex-row items-center gap-1.5 self-start rounded-pill border px-2 py-0.5"
      style={{ borderColor: `${a.color}55`, backgroundColor: `${a.color}14` }}
    >
      <View
        style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: a.color }, glow(a.glow, 6)]}
      />
      {!compact && (
        <Text className="text-meta uppercase" style={{ color: a.color }}>
          {a.label}
        </Text>
      )}
    </View>
  );
}

/** Generic tag chip for free-form labels on a card. */
export function TagChip({ label }: { label: string }) {
  return (
    <View className="self-start rounded-sm bg-ink-raised px-2 py-0.5">
      <Text className="text-meta text-text-low">#{label}</Text>
    </View>
  );
}
