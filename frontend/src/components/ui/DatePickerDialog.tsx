/**
 * A hand-built month-grid calendar in a centered modal (same shell as
 * ConfirmDialog — Alert.alert is a no-op on react-native-web, so every
 * cross-platform dialog in this app goes through RN's Modal primitive).
 * Today's cell always gets a distinct ring so a user can orient at a glance;
 * the currently selected date (if any) gets a filled highlight.
 */
import React, { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { ChevronRightIcon } from "@/components/icons";
import { glow, palette } from "@/theme/tokens";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function toIso(y: number, m: number, d: number): string {
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

export function DatePickerDialog({
  open,
  value,
  onSelect,
  onClear,
  onClose,
}: {
  open: boolean;
  /** ISO "YYYY-MM-DD" (or a full ISO datetime — only the date part is read). */
  value?: string | null;
  onSelect: (iso: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const today = new Date();
  const selected = value ? new Date(value) : null;
  const [cursor, setCursor] = useState(() => {
    const base = selected ?? today;
    return { y: base.getFullYear(), m: base.getMonth() };
  });

  // Re-anchor the visible month to the selected/current date each time the
  // dialog opens, so it never reopens on whatever month it was last closed on.
  React.useEffect(() => {
    if (!open) return;
    const base = selected ?? today;
    setCursor({ y: base.getFullYear(), m: base.getMonth() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const first = new Date(cursor.y, cursor.m, 1);
  const leadingBlanks = first.getDay();
  const total = daysInMonth(cursor.y, cursor.m);
  const cells: (number | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];

  const monthLabel = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const goMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-center bg-black/60 px-6" onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={glow(palette.purple, 20)}
          className="w-full max-w-sm rounded-xl border border-ink-border bg-ink-base p-5"
          testID="date-picker-dialog"
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Pressable
              onPress={() => goMonth(-1)}
              hitSlop={8}
              testID="date-picker-prev-month"
              className="h-8 w-8 items-center justify-center rounded-full bg-ink-raised"
              style={{ transform: [{ rotate: "180deg" }] }}
            >
              <ChevronRightIcon size={16} color={palette.textMid} />
            </Pressable>
            <Text className="text-body font-semibold text-text-hi">{monthLabel}</Text>
            <Pressable
              onPress={() => goMonth(1)}
              hitSlop={8}
              testID="date-picker-next-month"
              className="h-8 w-8 items-center justify-center rounded-full bg-ink-raised"
            >
              <ChevronRightIcon size={16} color={palette.textMid} />
            </Pressable>
          </View>

          <View className="flex-row">
            {WEEKDAY_LABELS.map((w, i) => (
              <View key={i} className="flex-1 items-center py-1">
                <Text className="text-meta uppercase text-text-faint">{w}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((day, idx) => {
              if (day === null) return <View key={idx} style={{ width: `${100 / 7}%` }} className="aspect-square" />;
              const isToday =
                day === today.getDate() && cursor.m === today.getMonth() && cursor.y === today.getFullYear();
              const isSelected =
                selected != null &&
                day === selected.getDate() &&
                cursor.m === selected.getMonth() &&
                cursor.y === selected.getFullYear();
              return (
                <View key={idx} style={{ width: `${100 / 7}%` }} className="aspect-square p-0.5">
                  <Pressable
                    onPress={() => onSelect(toIso(cursor.y, cursor.m, day))}
                    testID={`date-picker-day-${toIso(cursor.y, cursor.m, day)}`}
                    className="flex-1 items-center justify-center rounded-md"
                    style={{
                      backgroundColor: isSelected ? "rgba(168,85,247,0.25)" : "transparent",
                      borderWidth: isToday ? 1.5 : 0,
                      borderColor: palette.purpleSoft,
                    }}
                  >
                    <Text
                      className="text-sub"
                      style={{
                        color: isSelected ? palette.purpleSoft : isToday ? palette.textHi : palette.textMid,
                        fontWeight: isSelected || isToday ? "700" : "400",
                      }}
                    >
                      {day}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View className="mt-4 flex-row justify-between">
            {onClear ? (
              <Pressable
                onPress={onClear}
                testID="date-picker-clear"
                className="rounded-md border border-ink-border bg-ink-raised px-4 py-2.5"
              >
                <Text className="text-body font-semibold text-text-mid">Clear</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={onClose}
              className="rounded-md border border-ink-border bg-ink-raised px-4 py-2.5"
            >
              <Text className="text-body font-semibold text-text-hi">Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
