import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";

import { AppContainer } from "@/components/AppContainer";
import { BrandMark } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useAuth } from "@/context/AuthContext";
import { ApiError } from "@/api/client";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
      router.replace("/(app)");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't sign in. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mx-auto w-full max-w-md px-6">
            <View className="mb-9 items-center">
              <BrandMark size={48} />
              <Text className="mt-4 text-display text-text-hi">Collaberry</Text>
              <Text className="mt-1 text-body text-text-low">
                Where solo focus meets a team in sync.
              </Text>
            </View>

            <View className="gap-4">
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="you@work.com"
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="••••••••"
                error={error}
                onSubmitEditing={submit}
              />
              <Button label="Sign in" onPress={submit} loading={busy} full />
            </View>

            <View className="mt-6 flex-row justify-center gap-1.5">
              <Text className="text-body text-text-low">New here?</Text>
              <Link href="/(auth)/register" className="text-body font-semibold text-brand-purple-soft">
                Create an account
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppContainer>
  );
}
