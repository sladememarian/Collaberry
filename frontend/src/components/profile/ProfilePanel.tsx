/**
 * Profile panel — edit your name, change your password, switch the theme.
 *
 * Reuses DraggableDialog so it behaves like the card editor: floats, drags by
 * the title bar, dismisses on backdrop press or Escape. One interaction grammar
 * for every panel in the app.
 *
 * The theme picker applies immediately on tap rather than on save. It's a
 * preview you can see behind the panel, and making it wait for a save button
 * would hide the only feedback that matters.
 */
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { authApi } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { CheckIcon, MoonIcon, SunIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { DraggableDialog } from "@/components/ui/DraggableDialog";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/theme/ThemeContext";
import type { ThemeName } from "@/theme/themes";
import { palette } from "@/theme/tokens";

export function ProfilePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, applySession } = useAuth();
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState(user?.display_name ?? "");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed from the live user each time the panel opens, so an abandoned edit
  // from last time doesn't reappear as if it had been saved.
  //
  // Keyed on `open` alone, deliberately. A successful save calls applySession,
  // which swaps in a new user object — depending on `user` here would re-run the
  // re-seed on our own save and clear the "Profile updated." line the moment it
  // appeared. Read the current name through a ref so opening still shows the
  // live value rather than a stale closure.
  const liveName = useRef(user?.display_name ?? "");
  liveName.current = user?.display_name ?? "";

  useEffect(() => {
    if (!open) return;
    setName(liveName.current);
    setCurrentPw("");
    setNewPw("");
    setError(null);
    setSaved(false);
  }, [open]);

  const nameChanged = name.trim() !== (user?.display_name ?? "").trim();
  const wantsNewPassword = newPw.length > 0;
  const dirty = (nameChanged && name.trim().length > 0) || wantsNewPassword;

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await authApi.updateProfile({
        ...(nameChanged && name.trim() ? { display_name: name.trim() } : {}),
        ...(wantsNewPassword ? { current_password: currentPw, new_password: newPw } : {}),
      });
      // Swap in the re-signed token, not just the user: display_name is a claim,
      // and presence-service labels live cursors from the token.
      await applySession(res.access_token, res.user);
      setCurrentPw("");
      setNewPw("");
      setSaved(true);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Couldn't save your profile. Check your connection.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DraggableDialog
      open={open}
      onClose={onClose}
      title="Your profile"
      maxWidth={480}
      testID="profile-panel"
      footer={
        <>
          <Button label="Done" variant="ghost" onPress={onClose} />
          <Button
            label={saved && !dirty ? "Saved" : "Save changes"}
            onPress={save}
            loading={saving}
            disabled={!dirty}
          />
        </>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View className="mb-5 flex-row items-center gap-3">
          <Avatar name={name || user?.display_name} id={user?.id} size={48} />
          <View className="flex-1">
            <Text className="text-body font-semibold text-text-hi" numberOfLines={1}>
              {name || user?.display_name || "You"}
            </Text>
            <Text className="text-sub text-text-low" numberOfLines={1}>
              {user?.email}
            </Text>
          </View>
        </View>

        <TextField
          label="Display name"
          value={name}
          onChangeText={(t) => {
            setName(t);
            setSaved(false);
          }}
          placeholder="How your teammates see you"
          autoCapitalize="words"
          testID="profile-name"
        />

        <Text className="mb-2 mt-6 text-sub font-semibold uppercase tracking-wide text-text-low">
          Appearance
        </Text>
        <View className="flex-row gap-2.5">
          <ThemeOption
            name="dark"
            label="Dark"
            active={theme === "dark"}
            onPress={() => setTheme("dark")}
          />
          <ThemeOption
            name="light"
            label="Light"
            active={theme === "light"}
            onPress={() => setTheme("light")}
          />
        </View>

        <Text className="mb-2 mt-6 text-sub font-semibold uppercase tracking-wide text-text-low">
          Change password
        </Text>
        <View className="gap-3">
          <TextField
            label="Current password"
            value={currentPw}
            onChangeText={setCurrentPw}
            placeholder="Required to set a new one"
            secureTextEntry
            autoComplete="current-password"
            testID="profile-current-password"
          />
          <TextField
            label="New password"
            value={newPw}
            onChangeText={(t) => {
              setNewPw(t);
              setSaved(false);
            }}
            placeholder="At least 8 characters"
            secureTextEntry
            autoComplete="new-password"
            error={
              wantsNewPassword && newPw.length < 8 ? "Use at least 8 characters." : null
            }
            testID="profile-new-password"
          />
        </View>

        {error ? (
          <Text className="mt-4 text-sub text-state-danger" testID="profile-error">
            {error}
          </Text>
        ) : null}
        {saved && !dirty ? (
          <Text className="mt-4 text-sub text-state-success" testID="profile-saved">
            Profile updated.
          </Text>
        ) : null}
      </ScrollView>
    </DraggableDialog>
  );
}

function ThemeOption({
  name,
  label,
  active,
  onPress,
}: {
  name: ThemeName;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  // The dark swatch is the app's void; the light one is paper. The rim uses the
  // theme's own accent (purple in dark, pink in light) so each chip previews the
  // palette it switches to rather than the one currently active.
  const swatch = name === "dark" ? "#0a0a0c" : "#ffffff";
  const accent = name === "dark" ? "#a855f7" : "#db2777";

  return (
    <Button
      label={label}
      variant={active ? "solid" : "subtle"}
      onPress={onPress}
      className="flex-1"
      leading={
        <View className="flex-row items-center gap-1.5">
          {name === "dark" ? (
            <MoonIcon size={16} color={active ? "#fff" : palette.textMid} />
          ) : (
            <SunIcon size={16} color={active ? "#fff" : palette.textMid} />
          )}
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              backgroundColor: swatch,
              borderWidth: 1,
              borderColor: accent,
            }}
          />
          {active ? <CheckIcon size={13} color="#fff" /> : null}
        </View>
      }
    />
  );
}
