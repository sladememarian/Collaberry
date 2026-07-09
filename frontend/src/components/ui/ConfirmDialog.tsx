/**
 * A cross-platform "are you sure?" dialog. React Native's `Alert.alert` is a
 * no-op on react-native-web — so a delete confirm wired through Alert simply
 * never appears in the browser (the `npm run web` target). This is a real
 * centered modal built on the same `Modal` primitive the Sheet uses, so it
 * renders identically on web, iOS, and Android.
 *
 * Controlled: the parent owns `open` and both button handlers, mirroring how
 * `Sheet` is used elsewhere. The destructive action gets the danger styling;
 * the cancel action stays quiet.
 */
import React from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { glow, palette } from "@/theme/tokens";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const accent = destructive ? palette.danger : palette.purple;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      {/* Tapping the dimmed backdrop cancels, matching platform dialog behavior. */}
      <Pressable className="flex-1 items-center justify-center bg-black/60 px-6" onPress={onCancel}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={glow(accent, 20)}
          className="w-full max-w-sm rounded-xl border border-ink-border bg-ink-base p-5"
        >
          <Text className="text-h2 font-semibold text-text-hi">{title}</Text>
          {message ? (
            <Text className="mt-2 text-body text-text-mid">{message}</Text>
          ) : null}

          <View className="mt-5 flex-row justify-end gap-2.5">
            <Pressable
              onPress={onCancel}
              accessibilityRole="button"
              className="rounded-md border border-ink-border bg-ink-raised px-4 py-2.5"
            >
              <Text className="text-body font-semibold text-text-hi">{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              accessibilityRole="button"
              style={{ backgroundColor: destructive ? "rgba(248,113,113,0.14)" : "rgba(168,85,247,0.14)", borderColor: `${accent}66` }}
              className="rounded-md border px-4 py-2.5"
            >
              <Text className="text-body font-semibold" style={{ color: accent }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
