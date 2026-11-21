import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
} from "react-native";
import { contentTaps, contentTouchPoint } from "../lib/contentTaps";
import { useContentStar } from "./useContentStar";
export function ContentTap({
  kind,
  id,
  onOpen,
  children,
  starDisabled = false,
  expand = true,
  ...props
}: Omit<PressableProps, "onPress" | "children"> & {
  kind: "poll" | "reel";
  id: string;
  onOpen?: () => void;
  children: React.ReactNode;
  starDisabled?: boolean;
  expand?: boolean;
}) {
  const { set: setStar } = useContentStar(kind, id),
    [reduced, setReduced] = useState(false);
  const [animation] = useState(() => new Animated.Value(0)),
    [error, setError] = useState(""),
    mounted = useRef(true),
    moved = useRef(false),
    origin = useRef({ x: 0, y: 0 });
  const handlers = useRef({ setStar, onOpen, starDisabled, reduced });
  useEffect(() => {
    handlers.current = { setStar, onOpen, starDisabled, reduced };
  }, [setStar, onOpen, starDisabled, reduced]);
  const controller = useRef<ReturnType<typeof contentTaps> | null>(null);
  useEffect(() => {
    controller.current = contentTaps(
      () => handlers.current.onOpen?.(),
      () => {
        if (handlers.current.starDisabled) {
          if (mounted.current)
            setError(
              "This preview or sample is read-only. Star a published item instead.",
            );
          return;
        }
        setError("");
        animation.stopAnimation();
        animation.setValue(1);
        Animated.timing(animation, {
          toValue: 0,
          duration: handlers.current.reduced ? 500 : 850,
          useNativeDriver: true,
        }).start();
        void handlers.current.setStar(true).catch((e) => {
          if (mounted.current)
            setError(
              e instanceof Error
                ? e.message
                : "Could not save Star. Try again.",
            );
        });
      },
    );
    return () => controller.current?.cancel();
  }, [id, kind, animation]);
  useEffect(() => {
    mounted.current = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted.current) setReduced(value);
      })
      .catch(() => {});
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      mounted.current = false;
      controller.current?.cancel();
      animation.stopAnimation();
      listener.remove();
    };
  }, [animation]);

  return (
    <View style={expand ? { flex: 1 } : undefined}>
      <Pressable
        {...props}
        accessibilityHint="Tap to open. Double tap to add a Star."
        onPressIn={(e) => {
          moved.current = false;
          origin.current = contentTouchPoint(e.nativeEvent) ?? { x: 0, y: 0 };
          controller.current?.begin(origin.current.x, origin.current.y);
        }}
        onTouchMove={(e) => {
          const point = contentTouchPoint(e.nativeEvent);
          // Missing top-level coordinates must not look like a jump to (0,0).
          if (
            point &&
            Math.hypot(point.x - origin.current.x, point.y - origin.current.y) >
              18
          ) {
            moved.current = true;
            controller.current?.cancel();
          }
        }}
        onTouchCancel={() => {
          moved.current = true;
          controller.current?.cancel();
        }}
        onLongPress={() => {
          moved.current = true;
          controller.current?.cancel();
        }}
        onPress={(e) => {
          const point = contentTouchPoint(e.nativeEvent) ?? origin.current;
          if (!moved.current) controller.current?.tap(point.x, point.y);
        }}
      >
        {children}
        <Animated.View
          pointerEvents="none"
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFill,
            {
              alignItems: "center",
              justifyContent: "center",
              opacity: animation,
              transform: [
                {
                  scale: reduced
                    ? 1
                    : animation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1.25, 1],
                      }),
                },
              ],
            },
          ]}
        >
          <Text
            style={{
              fontSize: 64,
              color: "#CEFF66",
              textShadowColor: "#111",
              textShadowRadius: 3,
            }}
          >
            ★
          </Text>
        </Animated.View>
      </Pressable>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={{
            position: "absolute",
            bottom: 8,
            alignSelf: "center",
            backgroundColor: "#111",
            color: "#fff",
            padding: 6,
            borderRadius: 6,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
