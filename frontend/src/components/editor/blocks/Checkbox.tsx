/** Stylised checkbox — fills with the accent and shows a drawn check when on. */
import React from "react";
import { Pressable, View } from "react-native";

import { CheckIcon } from "@/components/icons";
import { glow, palette } from "@/theme/tokens";

export function Checkbox({
  checked,
  onToggle,
  disabled,
  accent = palette.purple,
}: {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  accent?: string;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <View
        style={[
          {
            width: 22,
            height: 22,
            borderRadius: 7,
            borderWidth: 1.6,
            borderColor: checked ? accent : palette.hair,
            backgroundColor: checked ? accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          },
          checked ? glow(accent, 8) : null,
        ]}
      >
        {checked ? <CheckIcon size={14} color="#0A0A0C" strokeWidth={3} /> : null}
      </View>
    </Pressable>
  );
}
