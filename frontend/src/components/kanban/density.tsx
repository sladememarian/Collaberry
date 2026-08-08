/**
 * Card density — how much detail each kanban card shows. A board-level context
 * so the setting reaches every TaskCard without threading a prop through the
 * DraggableBoard → Column → Card chain.
 *
 * - compact:     title + a thin meta row. Maximum cards per screen.
 * - comfortable: the default — badges, progress, tags, assignees, due.
 * - expanded:    comfortable + a description preview.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { alpha, palette } from "@/theme/tokens";

export type Density = "compact" | "comfortable" | "expanded";

export const DENSITIES: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "expanded", label: "Expanded" },
];

export const DENSITY_STORAGE_KEY = "collaberry.cardDensity";

export function isDensity(v: unknown): v is Density {
  return v === "compact" || v === "comfortable" || v === "expanded";
}

const DensityContext = createContext<Density>("comfortable");

export function DensityProvider({
  value,
  children,
}: {
  value: Density;
  children: React.ReactNode;
}) {
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity(): Density {
  return useContext(DensityContext);
}

/**
 * Board-level density state, persisted across sessions. Starts at "comfortable"
 * and hydrates the saved choice on mount (a flicker-free default while loading).
 */
export function usePersistedDensity(): [Density, (next: Density) => void] {
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(DENSITY_STORAGE_KEY);
        if (isDensity(saved)) setDensity(saved);
      } catch {
        // A missing/corrupt preference just means the default — never fatal.
      }
    })();
  }, []);

  const update = useCallback((next: Density) => {
    setDensity(next);
    AsyncStorage.setItem(DENSITY_STORAGE_KEY, next).catch(() => {
      // Non-persisted is acceptable; the choice still applies this session.
    });
  }, []);

  return [density, update];
}

/** Compact segmented control for switching density, matching the Sort control. */
export function DensityControl({
  value,
  onChange,
}: {
  value: Density;
  onChange: (next: Density) => void;
}) {
  return (
    <View className="flex-row items-center gap-2" testID="density-control">
      <Text className="text-meta uppercase text-text-low">Cards</Text>
      <View className="flex-row gap-1.5">
        {DENSITIES.map((d) => {
          const on = d.value === value;
          return (
            <Pressable
              key={d.value}
              onPress={() => onChange(d.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${d.label} cards`}
              testID={`density-${d.value}`}
              className="rounded-md border px-2.5 py-1"
              style={{
                borderColor: on ? palette.purple : palette.border,
                backgroundColor: on ? alpha(palette.purple, 0.1) : "transparent",
              }}
            >
              <Text
                className="text-meta font-medium"
                style={{ color: on ? palette.purpleSoft : palette.textMid }}
              >
                {d.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
