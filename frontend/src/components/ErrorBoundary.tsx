import React from "react";
import { Pressable, Text, View } from "react-native";

import { palette } from "@/theme/tokens";

interface State {
  error: Error | null;
}

/**
 * Last line of defence on Android. A single uncaught render error used to take
 * the whole process down; now the user sees a quiet recovery screen instead of
 * a hard close.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep a breadcrumb in metro / logcat without killing the process.
    console.error("[Collaberry] render crash", error, info?.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.void,
          alignItems: "center",
          justifyContent: "center",
          padding: 28,
        }}
      >
        <Text style={{ color: palette.textHi, fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
          Something tripped up
        </Text>
        <Text
          style={{
            color: palette.textLow,
            fontSize: 14,
            textAlign: "center",
            lineHeight: 20,
            marginBottom: 20,
            maxWidth: 360,
          }}
        >
          The screen hit an unexpected error. You can try again without reinstalling
          the app.
        </Text>
        <Text
          numberOfLines={4}
          style={{
            color: palette.textFaint,
            fontSize: 11,
            textAlign: "center",
            marginBottom: 24,
            maxWidth: 360,
          }}
        >
          {this.state.error.message}
        </Text>
        <Pressable
          onPress={this.reset}
          style={{
            backgroundColor: palette.purple,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
