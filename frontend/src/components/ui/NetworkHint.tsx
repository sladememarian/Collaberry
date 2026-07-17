/**
 * Surfaces a clear, human-readable banner when the app is almost certainly
 * talking to the wrong host — the classic "works on my laptop, dead on my
 * phone" failure mode.
 */
import React from "react";
import { Platform, Text, View } from "react-native";

import { API_BASE, API_USES_LOOPBACK } from "@/api/client";
import { palette } from "@/theme/tokens";

export function NetworkHint() {
  // Web + iOS simulator are fine with localhost. Emulator gets rewritten to
  // 10.0.2.2 automatically. Only a physical Android device still on loopback
  // needs a loud warning.
  if (Platform.OS !== "android" || !API_USES_LOOPBACK) return null;

  return (
    <View
      style={{
        marginHorizontal: 20,
        marginBottom: 12,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(251,191,36,0.45)",
        backgroundColor: "rgba(251,191,36,0.10)",
      }}
    >
      <Text style={{ color: palette.warn, fontSize: 13, fontWeight: "700", marginBottom: 4 }}>
        Phone can't reach this backend host
      </Text>
      <Text style={{ color: palette.textMid, fontSize: 12, lineHeight: 17 }}>
        This build is pointed at {API_BASE}. On a real phone that means "the
        phone itself", not your laptop. Rebuild with your PC's LAN IP, e.g.{"\n"}
        EXPO_PUBLIC_API_URL=http://192.168.x.x:8088
      </Text>
    </View>
  );
}
