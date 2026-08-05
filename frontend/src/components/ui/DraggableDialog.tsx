/**
 * A floating, draggable dialog — the YouTrack-style card editor shell.
 *
 * Why this exists rather than reusing Sheet: opening a card used to push a whole
 * route (`/item/[id]`), which tears the board off-screen and loses your scroll
 * position and lane context. A compact panel that floats over the board keeps
 * the work visible behind it, which is the entire point of the interaction.
 *
 * Behavior:
 * - Drag it by the title bar (grab cursor on web). The body is left alone so
 *   text selection and scrolling inside still work.
 * - Click the dimmed backdrop, press Escape, or hit the close button to dismiss.
 * - Position is clamped to the window on every move AND on resize, so the panel
 *   can never be dragged somewhere you can't reach it back from.
 *
 * Implementation notes:
 * - The offset lives in a shared value and is applied via `useAnimatedStyle`, so
 *   dragging never re-renders the (potentially heavy) dialog body.
 * - NativeWind drops `className` on a Reanimated `Animated.View`, so the panel
 *   is styled with inline styles. This is a known constraint, not a preference.
 * - `.runOnJS(true)` on the gesture matches DraggableBoard: the handlers touch
 *   React state and window metrics, which aren't worklet-safe.
 */
import React, { useCallback, useEffect, useRef } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { CloseIcon } from "@/components/icons";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { glow, palette, radius } from "@/theme/tokens";

/** Keep at least this much of the panel on-screen when clamping. */
const MIN_VISIBLE = 80;

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Right-aligned title-bar content — save state, type switcher, etc. */
  headerAccessory?: React.ReactNode;
  /** Footer actions, pinned below the scrollable body. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** Panel width cap. "Not so big", per the brief. */
  maxWidth?: number;
  accent?: string;
  testID?: string;
}

export function DraggableDialog({
  open,
  onClose,
  title,
  headerAccessory,
  footer,
  children,
  maxWidth = 560,
  accent = palette.purple,
  testID,
}: Props) {
  const { width: winW, height: winH } = useWindowDimensions();
  const reduceMotion = useReducedMotion();

  // Drag offset from the centered rest position.
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  // Entrance: a small scale/opacity pop so the panel reads as *arriving* over
  // the board rather than blinking into place.
  const appear = useSharedValue(0);

  const panelW = Math.min(maxWidth, winW - 32);
  const panelH = Math.min(winH * 0.82, winH - 48);

  // How far the panel may travel before part of it leaves the window. Derived
  // from the panel's centered rest position, so it's symmetric.
  const boundX = Math.max(0, (winW - panelW) / 2 + panelW - MIN_VISIBLE);
  const boundY = Math.max(0, (winH - panelH) / 2 + panelH - MIN_VISIBLE);

  const clamp = useCallback((v: number, limit: number) => {
    "worklet";
    return Math.min(limit, Math.max(-limit, v));
  }, []);

  // Reset position each time the dialog opens: a panel left in a far corner
  // from a previous session shouldn't be where the next one appears.
  useEffect(() => {
    if (!open) return;
    dx.value = 0;
    dy.value = 0;
    appear.value = reduceMotion ? 1 : withTiming(1, { duration: 180 });
    return () => {
      appear.value = 0;
    };
  }, [open, reduceMotion, dx, dy, appear]);

  // The window can shrink (rotate, resize, on-screen keyboard) while the panel
  // sits at an offset that was legal in the old bounds and isn't in the new
  // ones. Re-clamp so it can't end up stranded off-screen.
  useEffect(() => {
    dx.value = clamp(dx.value, boundX);
    dy.value = clamp(dy.value, boundY);
  }, [boundX, boundY, clamp, dx, dy]);

  // Escape to dismiss, web only — matches what people expect from a floating
  // panel in a browser. Bound while open so a background dialog can't eat it.
  useEffect(() => {
    if (!open || Platform.OS !== "web" || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const startX = useRef(0);
  const startY = useRef(0);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        // Matches DraggableBoard: these handlers read refs and window metrics,
        // which aren't safe to touch from a worklet.
        .runOnJS(true)
        .onStart(() => {
          startX.current = dx.value;
          startY.current = dy.value;
        })
        .onUpdate((e) => {
          dx.value = clamp(startX.current + e.translationX, boundX);
          dy.value = clamp(startY.current + e.translationY, boundY);
        })
        .onEnd(() => {
          // A gentle settle, so releasing mid-flick doesn't stop dead.
          if (reduceMotion) return;
          dx.value = withSpring(dx.value, { damping: 30, stiffness: 260 });
          dy.value = withSpring(dy.value, { damping: 30, stiffness: 260 });
        }),
    [boundX, boundY, clamp, dx, dy, reduceMotion],
  );

  const panelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx.value },
      { translateY: dy.value },
      { scale: 0.96 + appear.value * 0.04 },
    ],
    opacity: appear.value,
  }));

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop: dismisses on press, per the brief ("when user presses
          somewhere else of the screen that disapears"). */}
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel="Dismiss dialog"
        testID={testID ? `${testID}-backdrop` : "dialog-backdrop"}
      >
        <Animated.View
          // Inline styles, not className: NativeWind drops className on
          // Animated.View.
          style={[
            panelStyle,
            styles.panel,
            glow(accent, 28),
            { width: panelW, maxHeight: panelH },
          ]}
          testID={testID}
        >
          {/* Swallow presses so interacting with the panel never dismisses it. */}
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.panelInner}>
            <GestureDetector gesture={pan}>
              <View
                style={[
                  styles.titleBar,
                  // The affordance that says "this moves". Web-only property,
                  // ignored on native where you just drag it.
                  Platform.OS === "web" ? ({ cursor: "grab" } as object) : null,
                ]}
                testID={testID ? `${testID}-handle` : "dialog-handle"}
              >
                <View style={styles.grip}>
                  <View style={styles.gripDot} />
                  <View style={styles.gripDot} />
                  <View style={styles.gripDot} />
                </View>

                <Text numberOfLines={1} style={styles.title}>
                  {title}
                </Text>

                <View style={styles.headerRight}>
                  {headerAccessory}
                  <Pressable
                    onPress={onClose}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                    style={styles.closeBtn}
                  >
                    <CloseIcon size={18} color={palette.textMid} />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>

            <View style={styles.body}>{children}</View>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.62)",
    paddingHorizontal: 16,
  },
  panel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.base,
    overflow: "hidden",
  },
  panelInner: { flexShrink: 1 },
  titleBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    backgroundColor: palette.surface,
  },
  grip: { flexDirection: "row", gap: 3 },
  gripDot: {
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: palette.textFaint,
  },
  title: { flex: 1, fontSize: 15, fontWeight: "600", color: palette.textHi },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  closeBtn: {
    height: 28,
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: palette.raised,
  },
  body: { flexShrink: 1, paddingHorizontal: 16, paddingVertical: 14 },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: palette.border,
    backgroundColor: palette.surface,
  },
});
