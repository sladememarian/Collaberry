/** Labeled input with a focus ring that lights up purple. */
import React, { useState } from "react";
import { Text, TextInput, View, type TextInputProps } from "react-native";

import { palette } from "@/theme/tokens";

interface Props extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string | null;
  leading?: React.ReactNode;
}

export function TextField({ label, hint, error, leading, style, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const ring = error ? palette.danger : focused ? palette.purple : palette.border;

  return (
    <View className="w-full">
      {label ? <Text className="mb-1.5 text-sub font-medium text-text-mid">{label}</Text> : null}
      <View
        className="h-12 flex-row items-center gap-2 rounded-md bg-ink-raised px-3.5"
        style={{ borderWidth: 1, borderColor: ring }}
      >
        {leading}
        <TextInput
          placeholderTextColor={palette.textFaint}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 text-body text-text-hi"
          style={[{ paddingVertical: 0 }, style]}
          {...rest}
        />
      </View>
      {error ? (
        <Text className="mt-1 text-sub text-state-danger">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-sub text-text-low">{hint}</Text>
      ) : null}
    </View>
  );
}
