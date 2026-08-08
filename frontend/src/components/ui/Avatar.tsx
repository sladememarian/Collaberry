/** Initials avatar with a deterministic purple/blue tint per user. */
import React from "react";
import { Text, View } from "react-native";

import { alpha, palette } from "@/theme/tokens";

const TINTS = [palette.purple, palette.blue, palette.cyan, palette.purpleSoft, palette.blueSoft];

function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

export function Avatar({
  name,
  id,
  size = 30,
}: {
  name?: string | null;
  id?: string | null;
  size?: number;
}) {
  const label = (name ?? "").trim() || (id ?? "").trim() || "?";
  const color = tintFor(id?.trim() || label);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: alpha(color, 0.13),
        borderWidth: 1,
        borderColor: alpha(color, 0.4),
      }}
      className="items-center justify-center"
    >
      <Text style={{ color, fontSize: size * 0.36, fontWeight: "700" }}>{initials(label)}</Text>
    </View>
  );
}

/** Overlapping stack of avatars for the presence bar. */
export function AvatarStack({
  people,
  max = 4,
  size = 28,
}: {
  people: { user_id: string; display_name: string }[];
  max?: number;
  size?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <View className="flex-row items-center">
      {shown.map((p, i) => (
        <View key={p.user_id} style={{ marginLeft: i === 0 ? 0 : -size * 0.34 }}>
          <Avatar name={p.display_name} id={p.user_id} size={size} />
        </View>
      ))}
      {extra > 0 && (
        <View
          style={{ width: size, height: size, borderRadius: size / 2, marginLeft: -size * 0.34 }}
          className="items-center justify-center border border-ink-border bg-ink-raised"
        >
          <Text className="text-meta text-text-mid">+{extra}</Text>
        </View>
      )}
    </View>
  );
}
