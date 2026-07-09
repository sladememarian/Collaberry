/**
 * A tappable field that shows a formatted date (or a placeholder) and opens
 * the calendar dialog — replaces free-text date entry.
 */
import React from "react";
import { Pressable, Text } from "react-native";

import { CalendarIcon } from "@/components/icons";
import { palette } from "@/theme/tokens";

export function DateField({
  readOnly,
  value,
  onPress,
  testID,
}: {
  readOnly: boolean;
  value: string | null;
  onPress: () => void;
  testID: string;
}) {
  const label = value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
  return (
    <Pressable
      disabled={readOnly}
      onPress={onPress}
      testID={testID}
      className="flex-row items-center gap-2 rounded-md border border-ink-border bg-ink-surface/60 p-3"
      style={{ opacity: readOnly ? 0.6 : 1 }}
    >
      <CalendarIcon size={15} color={palette.textFaint} />
      <Text className="text-body" style={{ color: label ? palette.textMid : palette.textFaint }}>
        {label ?? "Set date"}
      </Text>
    </Pressable>
  );
}
