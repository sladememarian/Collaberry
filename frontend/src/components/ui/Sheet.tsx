/**
 * A bottom sheet built on the native Modal. Slides up over a dimmed backdrop,
 * caps its width on wide/desktop windows so it reads well on Windows web too.
 */
import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";

import { CloseIcon } from "@/components/icons";
import { palette } from "@/theme/tokens";

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/60" onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          {/* Stop propagation so taps inside the sheet don't dismiss it. */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="mx-auto w-full max-w-xl rounded-t-xl border-t border-ink-border bg-ink-base px-5 pb-8 pt-3"
          >
            <View className="mb-4 flex-row items-center justify-between">
              <View className="h-1 w-10 self-center rounded-full bg-ink-hair" style={{ position: "absolute", left: "50%", marginLeft: -20, top: -2 }} />
              <Text className="text-h2 font-semibold text-text-hi">{title}</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" className="h-8 w-8 items-center justify-center rounded-full bg-ink-raised">
                <CloseIcon size={18} color={palette.textMid} />
              </Pressable>
            </View>
            {children}
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
