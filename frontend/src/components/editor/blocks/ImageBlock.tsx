/**
 * Image block — a sleek card that shows a skeleton while the remote image loads,
 * then cross-fades to the picture. Falls back to a broken-image note on error.
 */
import React, { useState } from "react";
import { Animated, Image, Text, View } from "react-native";

import { ImageIcon } from "@/components/icons";
import { Skeleton } from "@/components/ui/Skeleton";
import { palette } from "@/theme/tokens";

export function ImageBlock({ url, caption }: { url?: string | null; caption?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fade = React.useRef(new Animated.Value(0)).current;

  const onLoad = () => {
    setLoaded(true);
    Animated.timing(fade, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  };

  return (
    <View className="my-1.5 overflow-hidden rounded-md border border-ink-border bg-ink-surface">
      <View style={{ aspectRatio: 16 / 9, width: "100%" }}>
        {!loaded && !failed ? (
          <Skeleton width="100%" height={9999} radius={0} style={{ position: "absolute", inset: 0 } as object} />
        ) : null}

        {url && !failed ? (
          <Animated.View style={{ opacity: fade, flex: 1 }}>
            <Image
              source={{ uri: url }}
              resizeMode="cover"
              onLoad={onLoad}
              onError={() => setFailed(true)}
              style={{ width: "100%", height: "100%" }}
            />
          </Animated.View>
        ) : null}

        {failed || !url ? (
          <View className="flex-1 items-center justify-center gap-2">
            <ImageIcon size={26} color={palette.textFaint} />
            <Text className="text-sub text-text-faint">
              {url ? "Couldn't load image" : "No image URL yet"}
            </Text>
          </View>
        ) : null}
      </View>
      {caption ? (
        <Text className="px-3 py-2 text-sub text-text-low" numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
