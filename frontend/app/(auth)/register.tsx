import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { AppContainer } from "@/components/AppContainer";
import { ArrowLeftIcon, BrandMark } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/api/client";
import { palette } from "@/theme/tokens";

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("What should we call you?");
    if (password.length < 8) return setError("Password needs at least 8 characters.");
    setBusy(true);
    try {
      await signUp(email, password, name);
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create your account. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppContainer>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mx-auto w-full max-w-md px-6">
            <Link href="/(auth)/login" className="mb-6 flex-row items-center gap-1">
              <ArrowLeftIcon size={20} color={palette.textMid} />
            </Link>

            <View className="mb-8">
              <BrandMark size={40} />
              <Text className="mt-4 text-h1 text-text-hi">Create your account</Text>
              <Text className="mt-1 text-body text-text-low">
                One space for personal, university, and work.
              </Text>
            </View>

            <View className="gap-4">
              <TextField label="Display name" value={name} onChangeText={setName} placeholder="Amirpouyan" />
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@work.com"
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="At least 8 characters"
                error={error}
                onSubmitEditing={submit}
              />
              <Button label="Create account" onPress={submit} loading={busy} full />
            </View>

            <View className="mt-6 flex-row justify-center gap-1.5">
              <Text className="text-body text-text-low">Already have one?</Text>
              <Link href="/(auth)/login" className="text-body font-semibold text-brand-purple-soft">
                Sign in
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppContainer>
  );
}
