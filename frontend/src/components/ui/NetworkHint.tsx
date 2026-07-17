/**
 * Surfaces a clear, human-readable banner when the app is almost certainly
 * talking to the wrong host — the classic "works on my laptop, dead on my
 * phone" failure mode.
 */
import React from "react";
import { Platform, Text, View } from "react-native";

import { apiUsesLoopback, getApiBase } from "@/api/client";
import { palette } from "@/theme/tokens";

export function NetworkHint() {
  // Web + iOS simulator are fine with localhost. Emulator gets rewritten to
  // 10.0.2.2 automatically. Only a physical Android device still on loopback
  // needs a loud warning.
  if (Platform.OS !== "android" || !apiUsesLoopback()) return null;

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
        This app is pointed at {getApiBase()} — on a real phone that means "the
        phone itself", not your server. Use "Server settings" below to point it
        at the right address.
      </Text>
    </View>
  );
}
