/**
 * "XdYh" estimation entry with a live human-readable preview underneath and a
 * help icon (hover tooltip on web, tap-to-open dialog on mobile).
 */
import React, { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";

import { QuestionIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { alpha, palette } from "@/theme/tokens";
import { formatEstimation, hoursToXdYh, parseEstimation } from "@/utils/estimation";

export const ESTIMATION_HELP_TEXT =
  'Write a number of days and/or hours, e.g. "2d3h" = 2 days and 3 hours, "1d" = 1 day, "3h" = 3 hours. ' +
  "d/h work uppercase or lowercase. One workday = 8 hours.";

export function EstimationInput({
  readOnly,
  value,
  onCommit,
}: {
  readOnly: boolean;
  value: number | null;
  onCommit: (hours: number | null) => void;
}) {
  const [text, setText] = useState(() => hoursToXdYh(value));
  const [helpOpen, setHelpOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const parsed = parseEstimation(text);
  const invalid = text.trim() !== "" && parsed === null;

  return (
    <View>
      <View className="mb-2 flex-row items-center gap-1.5">
        <Text className="text-meta uppercase text-text-low">Estimation</Text>
        <Pressable
          testID="estimation-help-icon"
          onPress={() => setHelpOpen(true)}
          onHoverIn={() => setHovering(true)}
          onHoverOut={() => setHovering(false)}
          hitSlop={6}
          style={{ position: "relative" }}
        >
          <QuestionIcon size={14} color={palette.textFaint} />
          {hovering ? (
            <View
              testID="estimation-help-tooltip"
              className="absolute left-0 top-5 z-10 w-56 rounded-md border border-ink-border bg-ink-base p-2.5"
              style={
                Platform.OS === "web"
                  ? ({ boxShadow: "0px 4px 16px rgba(0,0,0,0.4)" } as object)
                  : {
                      shadowColor: "#000",
                      shadowOpacity: 0.35,
                      shadowRadius: 10,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 8,
                    }
              }
            >
              <Text className="text-meta text-text-mid">{ESTIMATION_HELP_TEXT}</Text>
            </View>
          ) : null}
        </Pressable>
      </View>
      <TextInput
        editable={!readOnly}
        value={text}
        onChangeText={setText}
        onBlur={() => onCommit(parseEstimation(text))}
        placeholder="e.g. 2d3h"
        placeholderTextColor={palette.textFaint}
        testID="estimation-input"
        className="rounded-md border p-3 text-body text-text-mid"
        style={{
          borderColor: invalid ? palette.danger : palette.border,
          backgroundColor: alpha(palette.textHi, 0.04),
        }}
      />
      <Text testID="estimation-preview" className="mt-1.5 text-meta text-text-faint">
        {invalid ? "Doesn't look like a valid estimate" : formatEstimation(parsed) || " "}
      </Text>

      <ConfirmDialog
        open={helpOpen}
        title="How to write an estimate"
        message={ESTIMATION_HELP_TEXT}
        confirmLabel="Got it"
        cancelLabel="Close"
        onCancel={() => setHelpOpen(false)}
        onConfirm={() => setHelpOpen(false)}
      />
    </View>
  );
}
