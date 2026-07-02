/** Boot gate — send people to the app or the sign-in screen once auth settles. */
import { Redirect } from "expo-router";
import React from "react";
import { ActivityIndicator, View } from "react-native";

import { AppContainer } from "@/components/AppContainer";
import { BrandMark } from "@/components/icons";
import { useAuth } from "@/context/AuthContext";
import { palette } from "@/theme/tokens";

export default function Index() {
  const { booting, token } = useAuth();

  if (booting) {
    return (
      <AppContainer>
        <View className="flex-1 items-center justify-center gap-5">
          <BrandMark size={54} />
          <ActivityIndicator color={palette.purple} />
        </View>
      </AppContainer>
    );
  }

  return <Redirect href={token ? "/(app)" : "/(auth)/login"} />;
}
