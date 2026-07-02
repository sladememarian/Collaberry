/**
 * The premium dark backdrop every screen sits on. A pitch-black canvas with two
 * faint, blurred color orbs (purple top-left, blue bottom-right) that give the
 * "cyber" depth without stealing contrast from content. Respects safe areas.
 */
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { palette } from "@/theme/tokens";

interface Props {
  children: React.ReactNode;
  /** Skip the top safe-area pad when a screen renders its own header row. */
  edgeToEdge?: boolean;
}

export function AppContainer({ children, edgeToEdge = false }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-ink-void" style={styles.root}>
      {/* Ambient light — purely decorative, pointerEvents off so it never blocks touches. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.orb, styles.orbPurple]} />
        <View style={[styles.orb, styles.orbBlue]} />
        {Platform.OS !== "web" && (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        )}
      </View>

      <View
        className="flex-1"
        style={{
          paddingTop: edgeToEdge ? 0 : insets.top,
          paddingBottom: insets.bottom,
        }}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: palette.void },
  orb: {
    position: "absolute",
    width: 340,
    height: 340,
    borderRadius: 999,
    opacity: 0.22,
  },
  orbPurple: {
    top: -120,
    left: -100,
    backgroundColor: palette.purpleDeep,
  },
  orbBlue: {
    bottom: -140,
    right: -110,
    backgroundColor: palette.blue,
    opacity: 0.16,
  },
});
