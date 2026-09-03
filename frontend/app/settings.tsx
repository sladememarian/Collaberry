/**
 * Server address settings — reachable WITHOUT signing in (it lives outside the
 * (app) auth group on purpose: if the phone is pointed at a dead host, login
 * is impossible, so this screen is the way out of that trap).
 *
 * Lets the user re-point the app at any backend at runtime: edit the URL, test
 * reachability, save. Persists via AsyncStorage (client.ts) and applies
 * immediately — no rebuild, no restart.
 */
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  DEFAULT_API_BASE,
  deriveWsUrl,
  getApiBase,
  getWsBase,
  normalizeServerUrl,
  probeServer,
  setServerOverride,
} from "@/api/client";
import { AppContainer } from "@/components/AppContainer";
import { ArrowLeftIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { GlassCard } from "@/components/ui/GlassCard";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/theme/tokens";

const PRESETS: { label: string; url: string }[] = [
  { label: "Build default", url: DEFAULT_API_BASE },
  { label: "Android emulator", url: "http://10.0.2.2:8080" },
  { label: "This machine", url: "http://localhost:8080" },
];

type ProbeState =
  | { kind: "idle" }
  | { kind: "testing" }
  | { kind: "ok"; detail: string }
  | { kind: "fail"; detail: string }
  | { kind: "saved"; detail: string };

export default function ServerSettingsScreen() {
  const router = useRouter();
  const [apiUrl, setApiUrl] = useState(getApiBase());
  const [wsUrl, setWsUrl] = useState(getWsBase());
  const [wsTouched, setWsTouched] = useState(false);
  const [probe, setProbe] = useState<ProbeState>({ kind: "idle" });
  const [saving, setSaving] = useState(false);

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  // Keep the WS URL in lockstep with the API URL until the user edits it by hand.
  const onApiChange = useCallback(
    (value: string) => {
      setApiUrl(value);
      setProbe({ kind: "idle" });
      if (!wsTouched) setWsUrl(deriveWsUrl(normalizeServerUrl(value)));
    },
    [wsTouched],
  );

  const applyPreset = useCallback((url: string) => {
    setApiUrl(url);
    setWsUrl(deriveWsUrl(url));
    setWsTouched(false);
    setProbe({ kind: "idle" });
  }, []);

  const onTest = useCallback(async () => {
    setProbe({ kind: "testing" });
    const result = await probeServer(apiUrl);
    setProbe(result.ok ? { kind: "ok", detail: result.detail } : { kind: "fail", detail: result.detail });
  }, [apiUrl]);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      const normalized = normalizeServerUrl(apiUrl);
      await setServerOverride(normalized, wsTouched ? wsUrl : null);
      setApiUrl(getApiBase());
      setWsUrl(getWsBase());
      setProbe({ kind: "saved", detail: `Saved — the app now talks to ${getApiBase()}` });
    } finally {
      setSaving(false);
    }
  }, [apiUrl, wsUrl, wsTouched]);

  const onReset = useCallback(async () => {
    await setServerOverride(null);
    setApiUrl(getApiBase());
    setWsUrl(getWsBase());
    setWsTouched(false);
    setProbe({ kind: "saved", detail: `Back to the build default: ${getApiBase()}` });
  }, []);

  const statusColor = useMemo(() => {
    switch (probe.kind) {
      case "ok":
      case "saved":
        return palette.success;
      case "fail":
        return palette.danger;
      default:
        return palette.textLow;
    }
  }, [probe.kind]);

  return (
    <AppContainer>
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-1">
        <Pressable
          onPress={goBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="h-11 w-11 items-center justify-center rounded-full bg-ink-raised"
        >
          <ArrowLeftIcon size={20} color={palette.textMid} />
        </Pressable>
        <View>
          <Text className="text-h2 font-bold text-text-hi">Server settings</Text>
          <Text className="text-sub text-text-low">Where this app sends its requests</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}>
        <GlassCard className="p-4">
          <Text className="mb-1 text-meta uppercase text-text-low">Active server</Text>
          <Text className="text-body text-text-hi" testID="settings-active-url">
            {getApiBase()}
          </Text>
        </GlassCard>

        <GlassCard className="gap-4 p-4">
          <TextField
            label="API address"
            value={apiUrl}
            onChangeText={onApiChange}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="http://192.168.1.50:8080"
            testID="settings-api-input"
            hint="Where the backend gateway listens. Include the port if it isn't 80/443."
          />
          <TextField
            label="Realtime address (advanced)"
            value={wsUrl}
            onChangeText={(v) => {
              setWsTouched(true);
              setWsUrl(v);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="ws://192.168.1.50:8080"
            testID="settings-ws-input"
            hint="Follows the API address automatically — only change it if your WebSocket host differs."
          />

          <View>
            <Text className="mb-2 text-sub font-medium text-text-mid">Quick fill</Text>
            <View className="flex-row flex-wrap gap-2">
              {PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  onPress={() => applyPreset(p.url)}
                  accessibilityRole="button"
                  className="min-h-11 justify-center rounded-full border border-ink-border bg-ink-raised px-4 py-2"
                >
                  <Text className="text-sub text-text-mid">{p.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {probe.kind !== "idle" ? (
            <Text className="text-sub" style={{ color: statusColor }} testID="settings-status">
              {probe.kind === "testing" ? "Checking the server…" : probe.detail}
            </Text>
          ) : null}

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button
                label={probe.kind === "testing" ? "Checking…" : "Test connection"}
                variant="subtle"
                loading={probe.kind === "testing"}
                onPress={onTest}
                full
              />
            </View>
            <View className="flex-1">
              <Button label="Save & use" loading={saving} onPress={onSave} full />
            </View>
          </View>
          <Button label="Reset to build default" variant="ghost" onPress={onReset} full />
        </GlassCard>

        <Text className="px-1 text-sub leading-5 text-text-low">
          Changes apply to every request from now on — you don't need to reinstall or
          rebuild the app. If sign-in stops working after a change, come back here and
          reset to the build default.
        </Text>
      </ScrollView>
    </AppContainer>
  );
}
